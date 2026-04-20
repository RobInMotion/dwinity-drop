"""
Dwinity Identity API — shared across drop, tax, (later blockchain cloud).

- SIWE (EIP-4361) wallet login → session cookie.
- Pro-status registry per wallet address.
- Payment invoices (USDC + DWIN on Avalanche C-Chain) will be added in step 3.

Run: uvicorn app:app --host 127.0.0.1 --port 8083
"""
import os
import secrets
import sqlite3
import time
from contextlib import contextmanager
from typing import Optional
from fastapi import FastAPI, HTTPException, Response, Request, Cookie
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from siwe import SiweMessage, VerificationError

# ---------- Payment config ----------
# Avalanche C-Chain, native USDC (Circle deploy). DWIN prepared but disabled
# until DEX liquidity / a price oracle is available.
AVAX_RPC = os.environ.get("AVAX_RPC", "https://api.avax.network/ext/bc/C/rpc")
RECEIVER_WALLET = os.environ.get("RECEIVER_WALLET", "0xf4D867b77fd877f75Ed31D6CaA63927B0713CA35")
USDC_CONTRACT = os.environ.get("USDC_CONTRACT", "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E")
USDC_DECIMALS = 6
DWIN_CONTRACT = os.environ.get("DWIN_CONTRACT", "0x13E906C1c0288B5224d145A256eC36f452D613ED")
DWIN_DECIMALS = 18
DWIN_ENABLED = os.environ.get("DWIN_ENABLED", "false").lower() == "true"

# Prices in atomic units — overridable via env (for test pricing).
# Defaults are the production tariff: 7.50 USDC / 75 USDC.
PRICE_USDC_MONTH = int(os.environ.get("PRICE_USDC_MONTH_ATOMIC", "7500000"))
PRICE_USDC_YEAR  = int(os.environ.get("PRICE_USDC_YEAR_ATOMIC", "75000000"))
# DWIN has no public DEX price yet — fixed pricing via env.
# Default placeholder (not used while DWIN_ENABLED=false).
PRICE_DWIN_MONTH = int(os.environ.get("PRICE_DWIN_MONTH_ATOMIC", "1000000000000000000"))   # 1 DWIN
PRICE_DWIN_YEAR  = int(os.environ.get("PRICE_DWIN_YEAR_ATOMIC",  "10000000000000000000"))  # 10 DWIN
INVOICE_TTL_SEC  = 60 * 60     # invoices valid 1h
TAIL_MOD         = 10_000      # last 4 digits of amount = invoice tail

DB_PATH = os.environ.get("IDENTITY_DB", "/var/lib/dwinity-identity/identity.db")
COOKIE_NAME = os.environ.get("IDENTITY_COOKIE", "dwid_session")
COOKIE_DOMAIN = os.environ.get("IDENTITY_COOKIE_DOMAIN", "")  # leave empty for host-only
SESSION_TTL_DAYS = 30
NONCE_TTL_SEC = 300  # 5 min to sign after requesting challenge

# Configured via env; all apps that talk to this service go through their own nginx.
# We accept any origin that terminates on our own fleet. Explicit list = defense in depth.
ALLOWED_ORIGINS = [
    "https://drop.mkwt-strategy.tech",
    "https://tax.mkwt-strategy.tech",
    "https://app.tax.mkwt-strategy.tech",
]


@contextmanager
def db():
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    try:
        yield con
        con.commit()
    finally:
        con.close()


def init_db():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    with db() as con:
        con.executescript(
            """
            CREATE TABLE IF NOT EXISTS wallets (
                address TEXT PRIMARY KEY,
                created_at INTEGER NOT NULL,
                pro_until INTEGER NOT NULL DEFAULT 0,
                total_paid_usdc INTEGER NOT NULL DEFAULT 0,
                total_paid_dwin INTEGER NOT NULL DEFAULT 0
            );
            CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY,
                address TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                expires_at INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_sessions_address ON sessions(address);
            CREATE TABLE IF NOT EXISTS nonces (
                nonce TEXT PRIMARY KEY,
                created_at INTEGER NOT NULL,
                address TEXT
            );
            CREATE INDEX IF NOT EXISTS idx_nonces_created ON nonces(created_at);
            CREATE TABLE IF NOT EXISTS invoices (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                address TEXT NOT NULL,
                asset TEXT NOT NULL,
                amount_atomic TEXT NOT NULL,
                amount_tail INTEGER NOT NULL,
                duration_days INTEGER NOT NULL,
                status TEXT NOT NULL DEFAULT 'pending',
                paid_tx TEXT,
                paid_at INTEGER,
                created_at INTEGER NOT NULL,
                expires_at INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status, asset, amount_tail);
            CREATE INDEX IF NOT EXISTS idx_invoices_address ON invoices(address, created_at DESC);
            CREATE TABLE IF NOT EXISTS matcher_state (
                asset TEXT PRIMARY KEY,
                last_block INTEGER NOT NULL
            );
            """
        )


init_db()

app = FastAPI(title="Dwinity Identity API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


# ---------- helpers ----------

def now() -> int:
    return int(time.time())


def new_session_id() -> str:
    return secrets.token_urlsafe(32)


def new_nonce() -> str:
    # SIWE spec: at least 8 alphanumeric chars, we use 16 for safety
    return secrets.token_hex(16)


def sweep_expired():
    """Cheap cleanup on read paths. Keeps DB from growing unbounded."""
    with db() as con:
        n = now()
        con.execute("DELETE FROM sessions WHERE expires_at <= ?", (n,))
        con.execute("DELETE FROM nonces WHERE created_at + ? <= ?", (NONCE_TTL_SEC, n))


def get_session_address(session_id: Optional[str]) -> Optional[str]:
    if not session_id:
        return None
    with db() as con:
        row = con.execute(
            "SELECT address, expires_at FROM sessions WHERE id = ?", (session_id,)
        ).fetchone()
    if not row or row["expires_at"] <= now():
        return None
    return row["address"]


def upsert_wallet(address: str):
    with db() as con:
        con.execute(
            "INSERT OR IGNORE INTO wallets (address, created_at) VALUES (?, ?)",
            (address, now()),
        )


def pro_status_for(address: str) -> dict:
    with db() as con:
        row = con.execute(
            "SELECT pro_until FROM wallets WHERE address = ?", (address,)
        ).fetchone()
    pro_until = int(row["pro_until"]) if row else 0
    return {
        "pro": pro_until > now(),
        "pro_until": pro_until,
    }


# ---------- SIWE auth flow ----------

class ChallengeResponse(BaseModel):
    nonce: str
    issued_at: int
    ttl: int


class VerifyRequest(BaseModel):
    message: str = Field(..., description="SIWE message as signed by the wallet")
    signature: str = Field(..., pattern=r"^0x[0-9a-fA-F]+$")


class MeResponse(BaseModel):
    address: Optional[str]
    pro: bool
    pro_until: int


@app.get("/api/identity/health")
def health():
    return {"ok": True}


@app.get("/api/identity/siwe/challenge", response_model=ChallengeResponse)
def siwe_challenge():
    sweep_expired()
    nonce = new_nonce()
    t = now()
    with db() as con:
        con.execute("INSERT INTO nonces (nonce, created_at) VALUES (?, ?)", (nonce, t))
    return ChallengeResponse(nonce=nonce, issued_at=t, ttl=NONCE_TTL_SEC)


@app.post("/api/identity/siwe/verify", response_model=MeResponse)
def siwe_verify(req: VerifyRequest, response: Response, request: Request):
    # Parse SIWE message
    try:
        msg = SiweMessage.from_message(req.message)
    except Exception as e:
        detail = str(e) or type(e).__name__
        raise HTTPException(400, f"malformed SIWE message: {detail}")

    # Nonce must exist (and not be used yet)
    with db() as con:
        row = con.execute(
            "SELECT created_at FROM nonces WHERE nonce = ?", (msg.nonce,)
        ).fetchone()
    if not row:
        raise HTTPException(400, "unknown or already-used nonce")
    if row["created_at"] + NONCE_TTL_SEC < now():
        raise HTTPException(400, "nonce expired")

    # Domain check — accept requests terminated at any of our known frontends.
    host = request.headers.get("host", "").split(":")[0].lower()
    if host and msg.domain.lower() != host:
        # Still enforce that the domain is one we serve
        if msg.domain.lower().rstrip("/") not in {o.split("://", 1)[-1] for o in ALLOWED_ORIGINS}:
            raise HTTPException(400, f"domain mismatch: {msg.domain}")

    # Verify signature
    try:
        msg.verify(req.signature)
    except VerificationError as e:
        raise HTTPException(401, f"signature verification failed: {e}")
    except Exception as e:
        raise HTTPException(401, f"verification error: {e}")

    # Burn nonce (single-use)
    with db() as con:
        con.execute("DELETE FROM nonces WHERE nonce = ?", (msg.nonce,))

    addr = msg.address.lower() if hasattr(msg, "address") else str(msg.address).lower()
    upsert_wallet(addr)

    # Issue session
    sid = new_session_id()
    t = now()
    with db() as con:
        con.execute(
            "INSERT INTO sessions (id, address, created_at, expires_at) VALUES (?, ?, ?, ?)",
            (sid, addr, t, t + SESSION_TTL_DAYS * 86400),
        )

    cookie_kwargs = dict(
        key=COOKIE_NAME,
        value=sid,
        max_age=SESSION_TTL_DAYS * 86400,
        httponly=True,
        secure=True,
        samesite="lax",
        path="/",
    )
    if COOKIE_DOMAIN:
        cookie_kwargs["domain"] = COOKIE_DOMAIN
    response.set_cookie(**cookie_kwargs)

    status = pro_status_for(addr)
    return MeResponse(address=addr, pro=status["pro"], pro_until=status["pro_until"])


@app.get("/api/identity/me", response_model=MeResponse)
def me(session: Optional[str] = Cookie(default=None, alias=COOKIE_NAME)):
    addr = get_session_address(session)
    if not addr:
        return MeResponse(address=None, pro=False, pro_until=0)
    status = pro_status_for(addr)
    return MeResponse(address=addr, pro=status["pro"], pro_until=status["pro_until"])


@app.post("/api/identity/logout")
def logout(response: Response, session: Optional[str] = Cookie(default=None, alias=COOKIE_NAME)):
    if session:
        with db() as con:
            con.execute("DELETE FROM sessions WHERE id = ?", (session,))
    response.delete_cookie(key=COOKIE_NAME, path="/")
    return {"ok": True}


# ---------- Payment flow ----------

def require_session_address(session_id: Optional[str]) -> str:
    addr = get_session_address(session_id)
    if not addr:
        raise HTTPException(401, "not logged in")
    return addr


def atomic_to_human(atomic: int, decimals: int) -> str:
    """Format atomic amount as decimal string (e.g. 7500037 @ 6 → '7.500037')."""
    s = str(atomic).rjust(decimals + 1, "0")
    return s[:-decimals] + "." + s[-decimals:]


class QuoteResponse(BaseModel):
    usdc: dict
    dwin: dict
    receiver: str
    chain_id: int


@app.get("/api/identity/payment/quote", response_model=QuoteResponse)
def payment_quote():
    dwin_payload = {
        "enabled": DWIN_ENABLED,
        "contract": DWIN_CONTRACT,
        "decimals": DWIN_DECIMALS,
    }
    if DWIN_ENABLED:
        dwin_payload["monthly_atomic"] = PRICE_DWIN_MONTH
        dwin_payload["yearly_atomic"] = PRICE_DWIN_YEAR
        dwin_payload["monthly_display"] = atomic_to_human(PRICE_DWIN_MONTH, DWIN_DECIMALS).rstrip("0").rstrip(".") or "0"
        dwin_payload["yearly_display"] = atomic_to_human(PRICE_DWIN_YEAR, DWIN_DECIMALS).rstrip("0").rstrip(".") or "0"
    else:
        dwin_payload["note"] = "DWIN-Payment wird aktiviert, sobald öffentliche DEX-Liquidität verfügbar ist."

    return QuoteResponse(
        usdc={
            "enabled": True,
            "contract": USDC_CONTRACT,
            "decimals": USDC_DECIMALS,
            "monthly_atomic": PRICE_USDC_MONTH,
            "yearly_atomic": PRICE_USDC_YEAR,
            "monthly_display": atomic_to_human(PRICE_USDC_MONTH, USDC_DECIMALS),
            "yearly_display": atomic_to_human(PRICE_USDC_YEAR, USDC_DECIMALS),
        },
        dwin=dwin_payload,
        receiver=RECEIVER_WALLET,
        chain_id=43114,
    )


class InvoiceRequest(BaseModel):
    asset: str = Field(..., pattern=r"^(USDC|DWIN)$")
    plan: str = Field(..., pattern=r"^(monthly|yearly)$")


class InvoiceResponse(BaseModel):
    id: int
    asset: str
    contract: str
    decimals: int
    amount_atomic: str
    amount_display: str
    duration_days: int
    receiver: str
    chain_id: int
    status: str
    created_at: int
    expires_at: int
    paid_tx: Optional[str] = None


def invoice_to_response(row) -> InvoiceResponse:
    atomic = int(row["amount_atomic"])
    decimals = USDC_DECIMALS if row["asset"] == "USDC" else DWIN_DECIMALS
    contract = USDC_CONTRACT if row["asset"] == "USDC" else DWIN_CONTRACT
    return InvoiceResponse(
        id=row["id"],
        asset=row["asset"],
        contract=contract,
        decimals=decimals,
        amount_atomic=str(atomic),
        amount_display=atomic_to_human(atomic, decimals),
        duration_days=row["duration_days"],
        receiver=RECEIVER_WALLET,
        chain_id=43114,
        status=row["status"],
        created_at=row["created_at"],
        expires_at=row["expires_at"],
        paid_tx=row["paid_tx"],
    )


@app.post("/api/identity/payment/invoice", response_model=InvoiceResponse)
def create_invoice(
    req: InvoiceRequest,
    session: Optional[str] = Cookie(default=None, alias=COOKIE_NAME),
):
    addr = require_session_address(session)

    if req.asset == "DWIN" and not DWIN_ENABLED:
        raise HTTPException(400, "DWIN-Payment noch nicht aktiviert")

    duration_days = 30 if req.plan == "monthly" else 365

    if req.asset == "USDC":
        base = PRICE_USDC_MONTH if req.plan == "monthly" else PRICE_USDC_YEAR
    else:  # DWIN
        base = PRICE_DWIN_MONTH if req.plan == "monthly" else PRICE_DWIN_YEAR

    # Unique tail: a random 0–(TAIL_MOD-1) value that is not already
    # pending for the same asset. With 10k slots per asset, collisions are
    # extremely unlikely in practice; we still check.
    now_ts = now()
    with db() as con:
        pending_tails = {
            r["amount_tail"]
            for r in con.execute(
                "SELECT amount_tail FROM invoices "
                "WHERE asset = ? AND status = 'pending' AND expires_at > ?",
                (req.asset, now_ts),
            ).fetchall()
        }
        if len(pending_tails) >= TAIL_MOD:
            raise HTTPException(503, "Payment-Slots erschöpft, kurz warten")
        for _ in range(50):
            tail = secrets.randbelow(TAIL_MOD)
            if tail not in pending_tails:
                break
        else:
            raise HTTPException(503, "Tail-Generation fehlgeschlagen")

        amount = base + tail
        con.execute(
            "INSERT INTO invoices (address, asset, amount_atomic, amount_tail, "
            "duration_days, status, created_at, expires_at) "
            "VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)",
            (addr, req.asset, str(amount), tail, duration_days, now_ts, now_ts + INVOICE_TTL_SEC),
        )
        invoice_id = con.execute("SELECT last_insert_rowid() AS id").fetchone()["id"]
        row = con.execute("SELECT * FROM invoices WHERE id = ?", (invoice_id,)).fetchone()

    return invoice_to_response(row)


@app.get("/api/identity/payment/invoice/{invoice_id}", response_model=InvoiceResponse)
def get_invoice(
    invoice_id: int,
    session: Optional[str] = Cookie(default=None, alias=COOKIE_NAME),
):
    addr = require_session_address(session)
    with db() as con:
        row = con.execute(
            "SELECT * FROM invoices WHERE id = ? AND address = ?", (invoice_id, addr)
        ).fetchone()
    if not row:
        raise HTTPException(404, "invoice not found")
    # Flag expired pending invoices lazily
    if row["status"] == "pending" and row["expires_at"] <= now():
        with db() as con:
            con.execute("UPDATE invoices SET status='expired' WHERE id=?", (invoice_id,))
            row = con.execute("SELECT * FROM invoices WHERE id = ?", (invoice_id,)).fetchone()
    return invoice_to_response(row)
