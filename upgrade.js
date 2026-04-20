(function () {
  // Pro upgrade modal + invoice flow.
  // Requires: auth.js has already populated #wallet-btn. Opens when a button
  // with data-action="open-upgrade" is clicked, or by calling window.openUpgrade().

  const API = "/api/identity";
  const AVAX_CHAIN_HEX = "0xa86a"; // 43114
  const ERC20_TRANSFER_SIG = "0xa9059cbb";

  const modal = document.getElementById("upgrade-modal");
  if (!modal) return;

  const closeBtn = document.getElementById("upgrade-close");
  const backdrop = document.getElementById("upgrade-backdrop");
  const step1 = document.getElementById("upgrade-step-plan");
  const step2 = document.getElementById("upgrade-step-pay");
  const step3 = document.getElementById("upgrade-step-done");
  const err = document.getElementById("upgrade-error");
  const notLogged = document.getElementById("upgrade-not-logged");

  // step 1
  const planRadios = modal.querySelectorAll('input[name="upgrade-plan"]');
  const assetRadios = modal.querySelectorAll('input[name="upgrade-asset"]');
  const createBtn = document.getElementById("upgrade-create-btn");

  // step 2
  const addrEl = document.getElementById("upgrade-receiver");
  const amountEl = document.getElementById("upgrade-amount");
  const assetEl = document.getElementById("upgrade-asset-display");
  const qrEl = document.getElementById("upgrade-qr");
  const statusEl = document.getElementById("upgrade-status");
  const payBtn = document.getElementById("upgrade-pay-btn");
  const cancelBtn = document.getElementById("upgrade-cancel-btn");

  // step 3
  const doneMsg = document.getElementById("upgrade-done-msg");

  let currentInvoice = null;
  let pollTimer = null;
  let currentQuote = null;

  function show(el) { el.classList.remove("hidden"); }
  function hide(el) { el.classList.add("hidden"); }
  function setErr(msg) { if (msg) { err.textContent = msg; show(err); } else { hide(err); } }

  async function fetchQuote() {
    try {
      const r = await fetch(API + "/payment/quote");
      if (!r.ok) return null;
      return await r.json();
    } catch { return null; }
  }

  function renderPrices(quote) {
    if (!quote) return;
    currentQuote = quote;
    // Current asset selection drives which prices we show
    const asset = (Array.from(assetRadios).find(r => r.checked) || {}).value || "USDC";
    const src = asset === "DWIN" ? quote.dwin : quote.usdc;
    const suffix = asset;

    const monthlyEl = modal.querySelector('[data-price="monthly"]');
    const yearlyEl = modal.querySelector('[data-price="yearly"]');
    if (src && src.enabled && src.monthly_display) {
      monthlyEl.innerHTML = '<span class="font-600">' + src.monthly_display + '</span> ' + suffix;
      yearlyEl.innerHTML = '<span class="font-600">' + src.yearly_display + '</span> ' + suffix;
    } else {
      monthlyEl.textContent = "—";
      yearlyEl.textContent = "—";
    }

    // DWIN radio: enable/disable based on quote
    const dwinRadio = modal.querySelector('input[name="upgrade-asset"][value="DWIN"]');
    const dwinLabel = document.getElementById("upgrade-asset-dwin");
    const dwinNote = dwinLabel.querySelector("[data-dwin-note]");
    if (quote.dwin && quote.dwin.enabled) {
      dwinRadio.disabled = false;
      dwinLabel.classList.remove("cursor-not-allowed", "opacity-60", "bg-void-800/50");
      dwinLabel.classList.add("bg-void-800", "hover:border-neon-500/40");
      if (dwinNote) dwinNote.textContent = "Avalanche C-Chain · Ecosystem-native";
    } else {
      dwinRadio.disabled = true;
      dwinLabel.classList.add("cursor-not-allowed", "opacity-60");
      if (dwinNote) dwinNote.textContent = quote.dwin && quote.dwin.note || "DWIN-Payment bald verfügbar";
    }
  }

  async function openModal() {
    setErr("");
    show(modal);
    document.body.style.overflow = "hidden";
    const q = await fetchQuote();
    if (q) renderPrices(q);
  }

  function closeModal() {
    hide(modal);
    document.body.style.overflow = "";
    stopPolling();
    resetToStep1();
  }

  function resetToStep1() {
    currentInvoice = null;
    show(step1);
    hide(step2);
    hide(step3);
    hide(notLogged);
    setErr("");
  }

  function stopPolling() {
    if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; }
  }

  async function getMe() {
    try {
      const r = await fetch(API + "/me", { credentials: "include" });
      return r.ok ? await r.json() : null;
    } catch { return null; }
  }

  function renderQR(url) {
    qrEl.innerHTML = "";
    if (typeof QRious === "undefined") return;
    const canvas = document.createElement("canvas");
    qrEl.appendChild(canvas);
    try {
      new QRious({ element: canvas, value: url, size: 160, level: "M" });
    } catch {}
  }

  function buildPaymentURI(inv) {
    // EIP-681-style deep link: ethereum:<token>@<chain>/transfer?address=<recv>&uint256=<amount>
    return `ethereum:${inv.contract}@${inv.chain_id}/transfer?address=${inv.receiver}&uint256=${inv.amount_atomic}`;
  }

  async function createInvoice() {
    setErr("");
    const me = await getMe();
    if (!me || !me.address) {
      show(notLogged);
      return;
    }

    const plan = Array.from(planRadios).find(r => r.checked).value;
    const asset = Array.from(assetRadios).find(r => r.checked).value;

    createBtn.disabled = true;
    createBtn.textContent = "// erzeuge Invoice …";
    try {
      const r = await fetch(API + "/payment/invoice", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, asset }),
      });
      if (!r.ok) {
        const body = await r.text();
        throw new Error("Invoice-Erstellung fehlgeschlagen: " + body);
      }
      currentInvoice = await r.json();
      showStep2(currentInvoice);
    } catch (e) {
      setErr(e.message || String(e));
    } finally {
      createBtn.disabled = false;
      createBtn.textContent = "Invoice erzeugen →";
    }
  }

  function showStep2(inv) {
    hide(step1);
    show(step2);
    addrEl.textContent = inv.receiver;
    amountEl.textContent = inv.amount_display + " " + inv.asset;
    assetEl.textContent = inv.asset;
    renderQR(buildPaymentURI(inv));
    statusEl.innerHTML = '<span class="text-white/60">// warte auf Zahlung · Chain-Scan alle 30 s</span>';
    startPolling();
  }

  function startPolling() {
    stopPolling();
    async function tick() {
      if (!currentInvoice) return;
      try {
        const r = await fetch(API + "/payment/invoice/" + currentInvoice.id, { credentials: "include" });
        if (r.ok) {
          const inv = await r.json();
          currentInvoice = inv;
          if (inv.status === "paid") {
            onPaid(inv);
            return;
          }
          if (inv.status === "expired") {
            statusEl.innerHTML = '<span class="text-red-400">// Invoice abgelaufen — neu erzeugen</span>';
            return;
          }
          const secs = Math.max(0, inv.expires_at - Math.floor(Date.now() / 1000));
          const m = Math.floor(secs / 60), s = secs % 60;
          statusEl.innerHTML = `<span class="text-white/60">// wartet · Ablauf in ${m}:${String(s).padStart(2,"0")}</span>`;
        }
      } catch {}
      pollTimer = setTimeout(tick, 5000);
    }
    tick();
  }

  async function onPaid(inv) {
    hide(step2);
    show(step3);
    const until = new Date((inv.paid_at + inv.duration_days * 86400) * 1000);
    doneMsg.innerHTML =
      "Pro aktiv bis <span class='text-neon-500 font-semibold'>" +
      until.toLocaleDateString("de-DE") + "</span>. " +
      "TX: <a href='https://snowtrace.io/tx/" + inv.paid_tx + "' target='_blank' rel='noopener' class='text-neon-500 hover:underline font-mono text-xs'>" +
      inv.paid_tx.slice(0, 10) + "…</a>";
    // refresh wallet button state (auth.js re-fetches /me on next focus; we trigger directly)
    try {
      const me = await (await fetch(API + "/me", { credentials: "include" })).json();
      const evt = new CustomEvent("dwinity:pro-updated", { detail: me });
      window.dispatchEvent(evt);
    } catch {}
  }

  async function payViaWallet() {
    if (!currentInvoice) return;
    if (!window.ethereum) {
      setErr("Keine Wallet erkannt — Adresse + Betrag extern bezahlen.");
      return;
    }
    payBtn.disabled = true;
    payBtn.textContent = "// warte auf Wallet-Bestätigung …";
    setErr("");
    try {
      // 1) switch chain if needed
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
      statusEl.innerHTML =
        '<span class="text-neon-500">// TX gesendet · warte auf Bestätigung auf Avalanche …</span> ' +
        '<a href="https://snowtrace.io/tx/' + txHash + '" target="_blank" rel="noopener" class="text-xs text-neon-500 hover:underline font-mono">' +
        txHash.slice(0, 10) + '…</a>';
    } catch (e) {
      const msg = (e && e.message) || String(e);
      if (e && e.code === 4001) setErr("Abgebrochen im Wallet.");
      else setErr("Wallet-Payment: " + msg);
    } finally {
      payBtn.disabled = false;
      payBtn.textContent = "Mit diesem Wallet bezahlen →";
    }
  }

  // ——— wire up ———

  document.addEventListener("click", (e) => {
    const trigger = e.target.closest("[data-action='open-upgrade']");
    if (trigger) {
      e.preventDefault();
      openModal();
    }
  });

  closeBtn.addEventListener("click", closeModal);
  backdrop.addEventListener("click", closeModal);
  cancelBtn.addEventListener("click", () => { stopPolling(); resetToStep1(); });
  createBtn.addEventListener("click", createInvoice);
  payBtn.addEventListener("click", payViaWallet);

  // Re-render prices when user flips asset
  assetRadios.forEach((r) => r.addEventListener("change", () => renderPrices(currentQuote)));

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !modal.classList.contains("hidden")) closeModal();
  });

  window.openUpgrade = openModal;
})();
