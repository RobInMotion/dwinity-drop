"""
Dwinity Payment Matcher
=======================
Polls Avalanche C-Chain for ERC-20 Transfer events to the receiver wallet
and matches them against pending invoices by exact amount (unique cent-tail).

Runs as a oneshot systemd timer every 30s.

Design notes:
- We read from a cursor per asset (last_block) persisted in the matcher_state
  table. On first run we start a bit in the past to pick up invoices that
  may have been paid during a cron gap.
- We use eth_getLogs with topic filter (Transfer + indexed to-address).
- Block windows are capped to 2000 to stay under public-RPC rate limits.
"""
import json
import os
import sqlite3
import sys
import time
import urllib.request
import urllib.error

DB_PATH = os.environ.get("IDENTITY_DB", "/var/lib/dwinity-identity/identity.db")
AVAX_RPC = os.environ.get("AVAX_RPC", "https://api.avax.network/ext/bc/C/rpc")
RECEIVER = os.environ.get("RECEIVER_WALLET", "0xf4D867b77fd877f75Ed31D6CaA63927B0713CA35").lower()

USDC = {
    "asset": "USDC",
    "contract": os.environ.get("USDC_CONTRACT", "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E").lower(),
    "decimals": 6,
    "tail_mod": 10_000,
}
DWIN = {
    "asset": "DWIN",
    "contract": os.environ.get("DWIN_CONTRACT", "0x13E906C1c0288B5224d145A256eC36f452D613ED").lower(),
    "decimals": 18,
    "tail_mod": 10_000,
}
DWIN_ENABLED = os.environ.get("DWIN_ENABLED", "false").lower() == "true"

TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"
MAX_BLOCKS_PER_QUERY = 2000
BACKFILL_BLOCKS = 2000  # ~1h at 2s blocks on AVAX; safe catch-up on first run


def rpc(method, params):
    body = json.dumps({"jsonrpc": "2.0", "id": 1, "method": method, "params": params}).encode()
    req = urllib.request.Request(AVAX_RPC, data=body, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=15) as r:
        data = json.loads(r.read())
    if "error" in data:
        raise RuntimeError(f"RPC error {method}: {data['error']}")
    return data["result"]


def topic_address(addr_lower: str) -> str:
    return "0x" + "00" * 12 + addr_lower[2:].lower()


def get_state(con, asset: str, default_block: int) -> int:
    row = con.execute("SELECT last_block FROM matcher_state WHERE asset = ?", (asset,)).fetchone()
    if row:
        return int(row[0])
    con.execute("INSERT INTO matcher_state (asset, last_block) VALUES (?, ?)", (asset, default_block))
    con.commit()
    return default_block


def set_state(con, asset: str, block: int):
    con.execute(
        "INSERT INTO matcher_state (asset, last_block) VALUES (?, ?) "
        "ON CONFLICT(asset) DO UPDATE SET last_block = excluded.last_block",
        (asset, block),
    )
    con.commit()


def scan_asset(con, cfg, latest_block: int):
    asset = cfg["asset"]
    last = get_state(con, asset, default_block=max(0, latest_block - BACKFILL_BLOCKS))
    if last >= latest_block:
        return 0
    from_block = last + 1
    to_block = min(latest_block, from_block + MAX_BLOCKS_PER_QUERY - 1)

    logs = rpc(
        "eth_getLogs",
        [{
            "fromBlock": hex(from_block),
            "toBlock": hex(to_block),
            "address": cfg["contract"],
            "topics": [TRANSFER_TOPIC, None, topic_address(RECEIVER)],
        }],
    )

    matched = 0
    for log in logs:
        try:
            amount = int(log["data"], 16)
            tx = log["transactionHash"]
        except Exception:
            continue

        tail = amount % cfg["tail_mod"]
        # find pending invoice with matching tail and matching total amount
        now_ts = int(time.time())
        rows = con.execute(
            "SELECT id, address, amount_atomic, duration_days FROM invoices "
            "WHERE asset = ? AND status = 'pending' AND amount_tail = ? AND expires_at > ?",
            (asset, tail, now_ts),
        ).fetchall()

        for r in rows:
            if str(amount) == r[2]:
                invoice_id = r[0]
                wallet = r[1]
                days = r[3]

                # Idempotent: skip if this tx is already recorded
                already = con.execute(
                    "SELECT id FROM invoices WHERE paid_tx = ?", (tx,)
                ).fetchone()
                if already:
                    continue

                con.execute(
                    "UPDATE invoices SET status='paid', paid_tx=?, paid_at=? WHERE id=?",
                    (tx, now_ts, invoice_id),
                )
                # Extend pro_until from max(now, current pro_until)
                row = con.execute(
                    "SELECT pro_until FROM wallets WHERE address = ?", (wallet,)
                ).fetchone()
                cur = int(row[0]) if row else 0
                base = max(now_ts, cur)
                new_pro_until = base + days * 86400

                paid_col = "total_paid_usdc" if asset == "USDC" else "total_paid_dwin"
                con.execute(
                    f"INSERT INTO wallets (address, created_at, pro_until, {paid_col}) "
                    f"VALUES (?, ?, ?, ?) "
                    f"ON CONFLICT(address) DO UPDATE SET pro_until=excluded.pro_until, "
                    f"{paid_col} = {paid_col} + ?",
                    (wallet, now_ts, new_pro_until, amount, amount),
                )
                con.commit()
                matched += 1
                print(f"MATCHED invoice={invoice_id} asset={asset} amount={amount} tx={tx} "
                      f"wallet={wallet} pro_until={new_pro_until}", flush=True)
                break

    set_state(con, asset, to_block)
    return matched


def main():
    con = sqlite3.connect(DB_PATH)
    try:
        latest = int(rpc("eth_blockNumber", []), 16)
        matched_total = 0
        matched_total += scan_asset(con, USDC, latest)
        if DWIN_ENABLED:
            matched_total += scan_asset(con, DWIN, latest)

        # Mark expired pending invoices
        now_ts = int(time.time())
        con.execute(
            "UPDATE invoices SET status='expired' "
            "WHERE status='pending' AND expires_at <= ?",
            (now_ts,),
        )
        con.commit()
        print(f"matcher: latest_block={latest} matched={matched_total}", flush=True)
    except urllib.error.URLError as e:
        print(f"matcher: RPC unreachable: {e}", file=sys.stderr, flush=True)
        sys.exit(1)
    except Exception as e:
        print(f"matcher: error: {e}", file=sys.stderr, flush=True)
        sys.exit(1)
    finally:
        con.close()


if __name__ == "__main__":
    main()
