(function () {
  // Standalone egress-credit top-up flow. Independent of upgrade.js (which
  // covers Pro subscription invoices) — fewer cross-cutting changes.

  const AVAX_CHAIN_HEX = "0xa86a"; // 43114
  const ERC20_TRANSFER_SIG = "0xa9059cbb";

  const $ = (id) => document.getElementById(id);
  let currentInvoice = null;
  let pollHandle = null;

  function t(key, fallback) {
    const v = window.DDI18n && window.DDI18n.t && window.DDI18n.t(key);
    return (v && v !== key) ? v : fallback;
  }

  function fmtBytes(n) {
    if (n == null) return "—";
    if (n < 1024 * 1024 * 1024) return (n / 1024 / 1024).toFixed(1) + " MB";
    return (n / 1024 / 1024 / 1024).toFixed(2) + " GB";
  }

  async function loadMe() {
    try {
      const r = await fetch("/api/me", { credentials: "include" });
      if (!r.ok) return null;
      return await r.json();
    } catch { return null; }
  }

  function renderState(me) {
    const body = $("current-state-body");
    if (!me || !me.address) { body.textContent = t("topup.notLogged", "// nicht eingeloggt"); return; }
    const eg = me.egress || { bytes_used: 0, bytes_quota: 0, bytes_credits: 0, bytes_available: 0 };
    body.innerHTML =
      'Pro: <span class="' + (me.pro ? "text-neon-500" : "text-white/50") + '">' + (me.pro ? "aktiv" : "inaktiv") + '</span>' +
      ' · used <span class="text-white">' + fmtBytes(eg.bytes_used) + '</span>' +
      ' / quota <span class="text-white">' + fmtBytes(eg.bytes_quota) + '</span>' +
      ' · credits <span class="text-neon-500">' + fmtBytes(eg.bytes_credits) + '</span>' +
      ' · verfügbar <span class="text-neon-500">' + fmtBytes(eg.bytes_available) + '</span>';
  }

  async function loadQuote() {
    const gb = parseInt($("topup-gb").value, 10);
    const asset = (document.querySelector('input[name="topup-asset"]:checked') || {}).value || "USDC";
    $("gb-display").textContent = gb >= 1000 ? (gb / 1000).toFixed(1).replace(/\.0$/, "") + " TB" : gb + " GB";
    try {
      const r = await fetch(`/api/identity/payment/topup-quote?asset=${asset}&gb=${gb}`, { credentials: "include" });
      if (!r.ok) {
        const err = await r.text();
        $("quote-amount").textContent = "—";
        $("quote-note").textContent = err.slice(0, 200);
        return;
      }
      const q = await r.json();
      $("quote-gb").textContent = gb + " GB";
      $("quote-amount").textContent = q.amount_display + " " + q.asset;
      $("quote-note").textContent = q.note || "";
    } catch (e) {
      $("quote-amount").textContent = "—";
      $("quote-note").textContent = "Quote fehlgeschlagen";
    }
  }

  async function createTopup() {
    const err = $("topup-error");
    err.classList.add("hidden");
    const gb = parseInt($("topup-gb").value, 10);
    const asset = (document.querySelector('input[name="topup-asset"]:checked') || {}).value || "USDC";
    if (!Number.isFinite(gb) || gb < 25) {
      err.textContent = t("topup.err.minVol", "Volumen mindestens 25 GB"); err.classList.remove("hidden"); return;
    }
    const btn = $("topup-create-btn");
    btn.disabled = true; btn.textContent = t("topup.creating", "// erstelle Invoice …");
    try {
      const r = await fetch("/api/identity/payment/topup-invoice", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ asset, gb }),
      });
      if (!r.ok) {
        const text = await r.text();
        throw new Error("HTTP " + r.status + " — " + text.slice(0, 200));
      }
      currentInvoice = await r.json();
      showPayStep();
    } catch (e) {
      err.textContent = String(e.message || e);
      err.classList.remove("hidden");
    } finally {
      btn.disabled = false; btn.textContent = t("topup.cta", "Top-up erstellen →");
    }
  }

  function showPayStep() {
    $("step-choose").classList.add("hidden");
    $("step-pay").classList.remove("hidden");
    $("pay-receiver").textContent = currentInvoice.receiver;
    $("pay-contract").textContent = currentInvoice.contract;
    $("pay-amount").textContent = currentInvoice.amount_display + " " + currentInvoice.asset;
    $("pay-status").textContent = t("topup.waitingPayment", "// warte auf Zahlung — Auto-Detect via on-chain Matcher (≈30s)");
    startPolling();
  }

  function startPolling() {
    stopPolling();
    pollHandle = setInterval(async () => {
      if (!currentInvoice) return;
      try {
        const r = await fetch("/api/identity/payment/invoice/" + currentInvoice.id, { credentials: "include" });
        if (!r.ok) return;
        const inv = await r.json();
        if (inv.status === "paid") {
          stopPolling();
          showDone(inv);
        } else if (inv.status === "expired" || inv.status === "cancelled") {
          stopPolling();
          $("pay-status").textContent = "// Invoice " + inv.status + " — " + t("topup.recreate", "bitte neu erstellen");
        }
      } catch {}
    }, 5000);
  }

  function stopPolling() {
    if (pollHandle) { clearInterval(pollHandle); pollHandle = null; }
  }

  async function showDone(inv) {
    $("step-pay").classList.add("hidden");
    $("step-done").classList.remove("hidden");
    $("done-summary").innerHTML =
      "+" + (inv.gb_amount || "?") + " GB Egress-Credits<br/>" +
      '<span class="text-[11px]">tx: <a href="https://snowtrace.io/tx/' + inv.paid_tx +
      '" target="_blank" rel="noopener" class="text-neon-500 hover:underline">' +
      (inv.paid_tx ? inv.paid_tx.slice(0, 10) + "…" : "—") + "</a></span>";
    // Refresh state
    const me = await loadMe();
    renderState(me);
  }

  async function payViaWallet() {
    if (!currentInvoice) return;
    const err = $("pay-error");
    err.classList.add("hidden");
    if (!window.ethereum) {
      err.textContent = t("topup.err.noWallet", "Keine Wallet erkannt. Sende den Betrag manuell an die Empfänger-Adresse.");
      err.classList.remove("hidden");
      return;
    }
    const btn = $("pay-wallet-btn");
    btn.disabled = true; btn.textContent = t("topup.waitingWallet", "// warte auf Wallet-Bestätigung …");
    try {
      // 1) ensure Avalanche
      try {
        await window.ethereum.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: AVAX_CHAIN_HEX }],
        });
      } catch (switchErr) {
        if (switchErr && switchErr.code === 4902) {
          await window.ethereum.request({
            method: "wallet_addEthereumChain",
            params: [{
              chainId: AVAX_CHAIN_HEX,
              chainName: "Avalanche C-Chain",
              nativeCurrency: { name: "AVAX", symbol: "AVAX", decimals: 18 },
              rpcUrls: ["https://api.avax.network/ext/bc/C/rpc"],
              blockExplorerUrls: ["https://snowtrace.io"],
            }],
          });
        } else if (switchErr && switchErr.code !== 4001) {
          throw switchErr;
        }
      }

      // 2) encode transfer(receiver, amount)
      const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
      const from = accounts[0];
      const recvHex = currentInvoice.receiver.toLowerCase().replace(/^0x/, "").padStart(64, "0");
      const amountHex = BigInt(currentInvoice.amount_atomic).toString(16).padStart(64, "0");
      const data = ERC20_TRANSFER_SIG + recvHex + amountHex;

      const txHash = await window.ethereum.request({
        method: "eth_sendTransaction",
        params: [{
          from,
          to: currentInvoice.contract,
          data: "0x" + data.replace(/^0x/, ""),
          value: "0x0",
        }],
      });
      $("pay-status").innerHTML =
        '// TX gesendet · warte auf Bestätigung · ' +
        '<a href="https://snowtrace.io/tx/' + txHash + '" target="_blank" rel="noopener" class="text-neon-500 hover:underline">' +
        txHash.slice(0, 10) + '…</a>';
    } catch (e) {
      const msg = (e && e.message) || String(e);
      if (e && e.code === 4001) err.textContent = "Abgebrochen im Wallet.";
      else err.textContent = "Wallet-Payment: " + msg.slice(0, 200);
      err.classList.remove("hidden");
    } finally {
      btn.disabled = false; btn.textContent = t("topup.pay.cta", "Mit Wallet bezahlen →");
    }
  }

  function cancelPay() {
    stopPolling();
    currentInvoice = null;
    $("step-pay").classList.add("hidden");
    $("step-choose").classList.remove("hidden");
  }

  async function checkDwinAvailable() {
    try {
      const r = await fetch("/api/identity/payment/topup-quote?asset=DWIN&gb=50");
      return r.ok;
    } catch { return false; }
  }

  async function boot() {
    const me = await loadMe();
    if (!me || !me.address) {
      $("gate").classList.remove("hidden");
      return;
    }
    $("panel").classList.remove("hidden");
    renderState(me);
    loadQuote();

    // Light up DWIN if the server has it enabled
    if (await checkDwinAvailable()) {
      const dwinInput = document.querySelector('input[name="topup-asset"][value="DWIN"]');
      const dwinLabel = $("topup-dwin-label");
      if (dwinInput) dwinInput.disabled = false;
      if (dwinLabel) {
        const div = dwinLabel.querySelector("div");
        if (div) {
          div.classList.remove("opacity-50");
          const sub = div.querySelector("span");
          if (sub) sub.textContent = "+40% Bonus";
        }
      }
    }

    $("topup-gb").addEventListener("input", loadQuote);
    document.querySelectorAll('input[name="topup-asset"]').forEach((r) => r.addEventListener("change", loadQuote));
    $("topup-create-btn").addEventListener("click", createTopup);
    $("pay-wallet-btn").addEventListener("click", payViaWallet);
    $("pay-cancel-btn").addEventListener("click", cancelPay);
  }

  boot();
})();
