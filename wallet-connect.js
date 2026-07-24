(function () {
  function vt(key, fallback, vars) {
    let v = (window.DDI18n && window.DDI18n.t && window.DDI18n.t(key)) || "";
    if (!v || v === key) v = fallback;
    if (vars) for (const k in vars) v = v.replace("{" + k + "}", vars[k]);
    return v;
  }

  // WalletConnect v2 bridge — lazy-loaded EIP-1193 provider so that
  // browsers without an injected wallet (Safari desktop, iOS, Brave w/o
  // extension, …) can still log in & sign transactions. After a successful
  // connect we expose the WC provider as window.ethereum so that all
  // existing eth_requestAccounts / personal_sign / eth_sendTransaction
  // call-sites in auth.js, upgrade.js, topup.js, vault.js, etc. keep
  // working without any change.

  const PROJECT_ID = window.DWINITY_WC_PROJECT_ID || "122fc1049c6f434732581a7d49cbd618";
  const CHAIN_ID = 43114; // Avalanche C-Chain
  // Locally vendored — CSP `script-src 'self'` blocks external CDNs.
  const SDK_URL = "/lib/wc-ethereum-provider.umd.js";
  const BUFFER_URL = "/lib/buffer-polyfill.js";

  // The WC v2 UMD bundle expects Node-style globals (Buffer, process, global)
  // that browsers don't ship. Without these polyfills the SDK script throws
  // mid-execution and never sets its exports.
  async function ensurePolyfills() {
    if (typeof window.process === "undefined") {
      window.process = { env: {} };
    }
    if (typeof window.global === "undefined") {
      window.global = window;
    }
    if (typeof window.Buffer === "undefined") {
      await new Promise((resolve, reject) => {
        const existing = document.querySelector('script[data-buffer-poly="1"]');
        if (existing) {
          existing.addEventListener("load", () => resolve());
          existing.addEventListener("error", () => reject(new Error("Buffer-Polyfill failed")));
          return;
        }
        const s = document.createElement("script");
        s.src = BUFFER_URL;
        s.async = false;
        s.dataset.bufferPoly = "1";
        s.onload = () => resolve();
        s.onerror = () => reject(new Error(vt("wc.bufferFail", "Buffer-Polyfill konnte nicht geladen werden")));
        document.head.appendChild(s);
      });
      // bundle.run UMD exports the module as window.buffer (lowercase namespace)
      if (window.buffer && window.buffer.Buffer && typeof window.Buffer === "undefined") {
        window.Buffer = window.buffer.Buffer;
      }
    }
  }

  let initPromise = null;

  // The UMD bundle exposes its API under window["@walletconnect/ethereum-provider"].
  function getFactory() {
    const ns = window["@walletconnect/ethereum-provider"];
    if (ns && ns.EthereumProvider) return ns.EthereumProvider;
    if (window.EthereumProvider && window.EthereumProvider.init) return window.EthereumProvider;
    return null;
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      if (getFactory()) return resolve();
      if (document.querySelector('script[data-wc-lib="1"]')) {
        // Already loading from another caller — wait briefly.
        const t0 = Date.now();
        const wait = () => {
          if (getFactory()) return resolve();
          if (Date.now() - t0 > 15000) return reject(new Error("WalletConnect-Timeout"));
          setTimeout(wait, 100);
        };
        return wait();
      }
      const s = document.createElement("script");
      s.src = src;
      s.async = true;
      s.dataset.wcLib = "1";
      s.onload = () => resolve();
      s.onerror = () => reject(new Error(vt("wc.libFail", "WalletConnect-Bibliothek konnte nicht geladen werden")));
      document.head.appendChild(s);
    });
  }

  async function getOrInit() {
    if (initPromise) return initPromise;
    initPromise = (async () => {
      if (PROJECT_ID === "REPLACE_WC_PROJECT_ID") {
        throw new Error(
          vt("wc.notConfigured", "WalletConnect ist noch nicht konfiguriert. ") +
          "Setze window.DWINITY_WC_PROJECT_ID auf eine Project-ID von cloud.walletconnect.com."
        );
      }
      await ensurePolyfills();
      await loadScript(SDK_URL);
      const F = getFactory();
      if (!F || !F.init) {
        const ns = window["@walletconnect/ethereum-provider"];
        const dbg = "ns=" + (ns ? "yes" : "no") +
                    (ns ? " keys=[" + Object.keys(ns).join(",") + "]" : "") +
                    " EP=" + (ns && ns.EthereumProvider ? "yes" : "no") +
                    " init=" + typeof (ns && ns.EthereumProvider && ns.EthereumProvider.init) +
                    " globalEP=" + typeof window.EthereumProvider;
        throw new Error(vt("wc.providerUnavailable", "WalletConnect-Provider nicht verfügbar — ") + dbg);
      }
      const provider = await F.init({
        projectId: PROJECT_ID,
        // Ethereum Mainnet (1) ist in jeder Wallet vorhanden → blockiert nie.
        // Avalanche kommt als optional dazu — wenn der User es hat, kann später
        // wallet_switchEthereumChain umschalten; falls nicht, läuft wenigstens
        // der SIWE-Login durch (Signatur ist chain-unabhängig).
        chains: [1],
        optionalChains: [CHAIN_ID, 1],
        methods: [
          "personal_sign", "eth_sign",
          "eth_signTypedData", "eth_signTypedData_v4",
          "eth_sendTransaction", "eth_accounts", "eth_chainId",
          "wallet_switchEthereumChain", "wallet_addEthereumChain",
        ],
        events: ["chainChanged", "accountsChanged"],
        showQrModal: true,
        qrModalOptions: { themeMode: "dark" },
        metadata: {
          name: "Dead Drop · Dwinity",
          description: "Zero-Knowledge File-Transfer & Personal-Data-Vault",
          url: location.origin,
          icons: [location.origin + "/favicon.png"],
        },
      });
      provider.__dwinityWC = true;
      provider.on && provider.on("disconnect", () => {
        if (window.ethereum && window.ethereum.__dwinityWC) {
          try { window.ethereum = undefined; } catch {}
        }
        initPromise = null;
      });
      provider.on && provider.on("accountsChanged", (accs) => {
        window.dispatchEvent(new CustomEvent("dwinity:wc-accounts", { detail: accs }));
      });
      return provider;
    })();
    return initPromise;
  }

  function hasSession(provider) {
    return !!(
      provider.session ||
      (provider.accounts && provider.accounts.length > 0)
    );
  }

  async function ensureConnected() {
    const provider = await getOrInit();
    if (!hasSession(provider)) {
      // enable() = connect (opens QR modal / deep-link) + populates accounts.
      // This is the canonical entry point; using bare connect() can leave
      // signer.session unset, causing later request() to throw
      // "Please call connect() before request()".
      await provider.enable();
    }
    if (!hasSession(provider)) {
      throw new Error(vt("wc.sessionFail", "Wallet-Session konnte nicht aufgebaut werden — bitte erneut versuchen"));
    }
    // Make existing call-sites just work.
    if (!window.ethereum || window.ethereum.__dwinityWC) {
      try { window.ethereum = provider; } catch {}
    }
    return provider;
  }

  async function disconnect() {
    if (!initPromise) return;
    try {
      const provider = await initPromise;
      if (provider && provider.disconnect) await provider.disconnect();
    } catch {}
    initPromise = null;
    if (window.ethereum && window.ethereum.__dwinityWC) {
      try { window.ethereum = undefined; } catch {}
    }
  }

  function hasInjectedWallet() {
    return !!(window.ethereum && !window.ethereum.__dwinityWC);
  }

  // Shared provider resolver for ALL on-chain flows (claim, pay, contribute, top-up):
  // use an injected wallet if present, else activate WalletConnect (mobile / no
  // extension). Returns a provider with .request(), or null if none can be established.
  async function resolveProvider() {
    if (window.ethereum && window.ethereum.request) return window.ethereum;
    try { return await ensureConnected(); } catch (e) { return null; }
  }

  window.dwinityWC = { ensureConnected, disconnect, hasInjectedWallet, resolveProvider };
})();
(window.DDI18n ? (x) => window.DDI18n.register(x) : (x) => (window.__DDI18N_PENDING = window.__DDI18N_PENDING || []).push(x))({ en: {
  "wc.bufferFail": "Buffer polyfill could not be loaded",
  "wc.libFail": "WalletConnect library could not be loaded",
  "wc.notConfigured": "WalletConnect is not configured yet. ",
  "wc.providerUnavailable": "WalletConnect provider unavailable — ",
  "wc.sessionFail": "Wallet session could not be established — please try again",
} });
