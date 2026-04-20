(function () {
  // Wallet login via SIWE. Populates the #wallet-btn area in the header.

  const API = "/api/identity";
  const CHAIN_ID = 43114; // Avalanche C-Chain

  const btn = document.getElementById("wallet-btn");
  const label = document.getElementById("wallet-btn-label");
  const dot = document.getElementById("wallet-btn-dot");
  const menu = document.getElementById("wallet-menu");
  const menuAddr = document.getElementById("wallet-menu-addr");
  const menuPro = document.getElementById("wallet-menu-pro");
  const menuLogout = document.getElementById("wallet-menu-logout");

  if (!btn) return;

  function short(addr) {
    if (!addr) return "";
    return addr.slice(0, 6) + "…" + addr.slice(-4);
  }

  // EIP-55 checksum address (required by siwe). Uses js-sha3's keccak256.
  function toChecksumAddress(address) {
    const kec = (window.sha3 && window.sha3.keccak256) || window.keccak256;
    if (!kec) return address; // fallback: hope wallet already checksummed
    const lower = address.toLowerCase().replace(/^0x/, "");
    const hash = kec(lower);
    let out = "0x";
    for (let i = 0; i < lower.length; i++) {
      out += parseInt(hash[i], 16) >= 8 ? lower[i].toUpperCase() : lower[i];
    }
    return out;
  }

  function renderLoggedOut() {
    label.textContent = "Wallet verbinden";
    dot.className = "w-1.5 h-1.5 rounded-full bg-white/50";
    menu.classList.add("hidden");
    btn.dataset.state = "out";
  }

  function renderLoggedIn(me) {
    label.textContent = short(me.address);
    dot.className = "w-1.5 h-1.5 rounded-full bg-neon-500 pulse-dot";
    menuAddr.textContent = me.address;
    if (me.pro) {
      const until = new Date(me.pro_until * 1000);
      menuPro.innerHTML =
        '<span class="text-neon-500 font-semibold">Pro aktiv</span> · bis ' +
        until.toLocaleDateString("de-DE") +
        '<br/><a href="/dashboard" class="text-neon-500 hover:underline text-xs">→ Dashboard</a>';
    } else {
      menuPro.innerHTML =
        '<span class="text-white/60">Free-Tarif</span> · <a href="#" data-action="open-upgrade" class="text-neon-500 hover:underline">Pro freischalten</a>' +
        '<br/><a href="/dashboard" class="text-white/50 hover:text-neon-500 text-xs">→ Dashboard</a>';
    }
    btn.dataset.state = "in";
  }

  async function refreshMe() {
    try {
      const r = await fetch(API + "/me", { credentials: "include" });
      if (!r.ok) { renderLoggedOut(); return null; }
      const me = await r.json();
      if (me.address) renderLoggedIn(me);
      else renderLoggedOut();
      return me;
    } catch {
      renderLoggedOut();
      return null;
    }
  }

  async function requestChallenge() {
    const r = await fetch(API + "/siwe/challenge", { credentials: "include" });
    if (!r.ok) throw new Error("Konnte Challenge nicht holen (HTTP " + r.status + ")");
    return r.json();
  }

  function buildSiweMessage({ address, nonce }) {
    const origin = location.origin;
    const host = location.host;
    const issuedAt = new Date().toISOString();
    return (
      `${host} wants you to sign in with your Ethereum account:\n` +
      `${address}\n\n` +
      `Sign in to Dwinity - Self-Custody Ecosystem.\n\n` +
      `URI: ${origin}\n` +
      `Version: 1\n` +
      `Chain ID: ${CHAIN_ID}\n` +
      `Nonce: ${nonce}\n` +
      `Issued At: ${issuedAt}`
    );
  }

  async function connect() {
    if (!window.ethereum) {
      alert(
        "Keine Wallet erkannt.\n\n" +
        "Installiere MetaMask (oder eine kompatible Wallet wie Rabby/Trust) " +
        "und lade die Seite neu."
      );
      return;
    }

    label.textContent = "// verbinden …";
    btn.disabled = true;

    try {
      const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
      const raw = (accounts && accounts[0]) || "";
      if (!raw) throw new Error("Kein Wallet-Account");
      const address = toChecksumAddress(raw);

      const { nonce } = await requestChallenge();
      const message = buildSiweMessage({ address, nonce });

      const signature = await window.ethereum.request({
        method: "personal_sign",
        params: [message, address],
      });

      const r = await fetch(API + "/siwe/verify", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, signature }),
      });
      if (!r.ok) {
        const err = await r.text();
        throw new Error("Login fehlgeschlagen: " + err);
      }
      const me = await r.json();
      renderLoggedIn(me);
    } catch (err) {
      const msg = (err && err.message) || String(err);
      // user-rejected in MetaMask has code 4001
      if (err && (err.code === 4001 || /reject|cancel/i.test(msg))) {
        renderLoggedOut();
      } else {
        alert("Wallet-Login: " + msg);
        renderLoggedOut();
      }
    } finally {
      btn.disabled = false;
    }
  }

  async function logout() {
    try {
      await fetch(API + "/logout", { method: "POST", credentials: "include" });
    } catch {}
    renderLoggedOut();
  }

  // Click handler toggles connect (out) or menu (in)
  btn.addEventListener("click", (e) => {
    e.preventDefault();
    if (btn.dataset.state === "in") {
      menu.classList.toggle("hidden");
    } else {
      connect();
    }
  });

  menuLogout.addEventListener("click", (e) => {
    e.preventDefault();
    menu.classList.add("hidden");
    logout();
  });

  // click outside closes menu
  document.addEventListener("click", (e) => {
    if (!btn.contains(e.target) && !menu.contains(e.target)) {
      menu.classList.add("hidden");
    }
  });

  // Re-fetch /me when the upgrade flow says a payment landed.
  window.addEventListener("dwinity:pro-updated", (e) => {
    if (e && e.detail && e.detail.address) renderLoggedIn(e.detail);
  });

  // boot
  refreshMe();
})();
