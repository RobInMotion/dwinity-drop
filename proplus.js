(function () {
  // Standalone Pro+ subscription flow. Independent of upgrade.js, so Robin's
  // WIP there stays untouched.

  const AVAX_CHAIN_HEX = "0xa86a"; // 43114
  const ERC20_TRANSFER_SIG = "0xa9059cbb";

  const $ = (id) => document.getElementById(id);
  let currentInvoice = null;
  let pollHandle = null;
  let lastQuote = null;

  function t(key, fallback) {
    const v = window.DDI18n && window.DDI18n.t && window.DDI18n.t(key);
    return (v && v !== key) ? v : fallback;
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
    if (!me || !me.address) { body.textContent = t("proplus.notLogged", "// nicht eingeloggt"); return; }
    const tier = me.tier || "free";
    const label = { proplus: "Pro+", pro: "Pro", free: "Free" }[tier];
    let extra = "";
    if (tier === "proplus" && me.proplus_until) {
      const d = new Date(me.proplus_until * 1000);
      extra = ' · ' + t('proplus.expiresPrefix', 'läuft') + ' ' + d.toISOString().slice(0,10);
    } else if (tier === "pro" && me.pro_until) {
      const d = new Date(me.pro_until * 1000);
      extra = ' · ' + t('proplus.expiresPrefix', 'läuft') + ' ' + d.toISOString().slice(0,10);
    }
    body.innerHTML = 'Tier: <span class="text-cyan-400">' + label + '</span>' + extra;
  }

  async function loadQuote() {
    try {
      const r = await fetch("/api/identity/payment/quote");
      if (!r.ok) return;
      lastQuote = await r.json();
      updatePriceDisplay();
    } catch {}
  }

  function updatePriceDisplay() {
    if (!lastQuote) return;
    const asset = (document.querySelector('input[name="proplus-asset"]:checked') || {}).value || "USDC";
    const src = asset === "DWIN" ? lastQuote.dwin : lastQuote.usdc;
    const monthly = src.monthly_plus_display;
    const yearly = src.yearly_plus_display;
    const monthlyEl = document.querySelector('[data-price="monthly_plus"]');
    const yearlyEl = document.querySelector('[data-price="yearly_plus"]');
    if (monthlyEl) monthlyEl.textContent = monthly + " " + asset + " / mo";
    if (yearlyEl) yearlyEl.textContent = yearly + " " + asset + " / yr";
  }

  async function checkDwinAvailable() {
    if (!lastQuote) return false;
    return !!(lastQuote.dwin && lastQuote.dwin.enabled);
  }

  async function createInvoice() {
    const err = $("proplus-error");
    err.classList.add("hidden");
    const plan = (document.querySelector('input[name="proplus-plan"]:checked') || {}).value || "monthly_plus";
    const asset = (document.querySelector('input[name="proplus-asset"]:checked') || {}).value || "USDC";
    const btn = $("proplus-create-btn");
    btn.disabled = true; btn.textContent = t("proplus.creating", "// erstelle Invoice …");
    try {
      const r = await fetch("/api/identity/payment/invoice", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ asset, plan }),
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
      btn.disabled = false; btn.textContent = t("proplus.cta", "Pro+ kaufen →");
    }
  }

  function showPayStep() {
    $("step-choose").classList.add("hidden");
    $("step-pay").classList.remove("hidden");
    $("pay-receiver").textContent = currentInvoice.receiver;
    $("pay-contract").textContent = currentInvoice.contract;
    $("pay-amount").textContent = currentInvoice.amount_display + " " + currentInvoice.asset;
    $("pay-status").textContent = t("proplus.waitingPayment", "// warte auf Zahlung — Auto-Detect via on-chain Matcher (≈30s)");
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
          $("pay-status").textContent = "// Invoice " + inv.status + " — " + t("proplus.recreate", "bitte neu erstellen");
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
    const months = inv.duration_days >= 365 ? "12 Monate" : "1 Monat";
    $("done-summary").innerHTML =
      months + " Pro+ aktiviert<br/>" +
      '<span class="text-[11px]">tx: <a href="https://snowtrace.io/tx/' + inv.paid_tx +
      '" target="_blank" rel="noopener" class="text-cyan-400 hover:underline">' +
      (inv.paid_tx ? inv.paid_tx.slice(0, 10) + "…" : "—") + "</a></span>";
    const me = await loadMe();
    renderState(me);
  }

  async function payViaWallet() {
    if (!currentInvoice) return;
    const err = $("pay-error");
    err.classList.add("hidden");
    if (!window.ethereum) {
      err.textContent = t("proplus.err.noWallet", "Keine Wallet erkannt. Sende den Betrag manuell an die Empfänger-Adresse.");
      err.classList.remove("hidden");
      return;
    }
    const btn = $("pay-wallet-btn");
    btn.disabled = true; btn.textContent = t("proplus.waitingWallet", "// warte auf Wallet-Bestätigung …");
    try {
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
        '<a href="https://snowtrace.io/tx/' + txHash + '" target="_blank" rel="noopener" class="text-cyan-400 hover:underline">' +
        txHash.slice(0, 10) + '…</a>';
    } catch (e) {
      const msg = (e && e.message) || String(e);
      if (e && e.code === 4001) err.textContent = "Abgebrochen im Wallet.";
      else err.textContent = "Wallet-Payment: " + msg.slice(0, 200);
      err.classList.remove("hidden");
    } finally {
      btn.disabled = false; btn.textContent = t("proplus.pay.cta", "Mit Wallet bezahlen →");
    }
  }

  function cancelPay() {
    stopPolling();
    currentInvoice = null;
    $("step-pay").classList.add("hidden");
    $("step-choose").classList.remove("hidden");
  }

  async function boot() {
    const me = await loadMe();
    if (!me || !me.address) {
      $("gate").classList.remove("hidden");
      return;
    }
    $("panel").classList.remove("hidden");
    renderState(me);
    await loadQuote();

    if (await checkDwinAvailable()) {
      const dwinInput = document.querySelector('input[name="proplus-asset"][value="DWIN"]');
      const dwinLabel = $("proplus-dwin-label");
      if (dwinInput) dwinInput.disabled = false;
      if (dwinLabel) {
        const div = dwinLabel.querySelector("div");
        if (div) {
          div.classList.remove("opacity-50");
          const sub = div.querySelector("span");
          if (sub) sub.textContent = "+25% Rabatt";
        }
      }
    }

    document.querySelectorAll('input[name="proplus-asset"]').forEach((r) => r.addEventListener("change", updatePriceDisplay));
    $("proplus-create-btn").addEventListener("click", createInvoice);
    $("pay-wallet-btn").addEventListener("click", payViaWallet);
    $("pay-cancel-btn").addEventListener("click", cancelPay);
  }

  boot();
})();
