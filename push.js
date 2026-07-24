/* Dead Drop Web Push client. Exposes window.DDPush and auto-wires a control:
 *   <button data-push-toggle>…</button>   <span data-push-status></span>
 * On iOS-in-browser (push unsupported) it shows the "add to home screen" hint instead.
 * External file (CSP script-src 'self'). */
(function () {
  "use strict";
  var API = "/api/identity";
  var SW_URL = "/push-sw.js";

  function t(k, fb) {
    var v = window.DDI18n && window.DDI18n.t && window.DDI18n.t(k);
    return (v && v !== k) ? v : fb;
  }
  function supported() {
    return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  }
  function isIOS() {
    return /iP(hone|ad|od)/.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  }
  function isStandalone() {
    return window.navigator.standalone === true ||
      (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches);
  }
  function b64ToU8(base64) {
    var pad = "=".repeat((4 - (base64.length % 4)) % 4);
    var s = (base64 + pad).replace(/-/g, "+").replace(/_/g, "/");
    var raw = atob(s), out = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }

  async function getReg() {
    return (await navigator.serviceWorker.getRegistration(SW_URL)) ||
           (await navigator.serviceWorker.register(SW_URL));
  }
  async function currentSub() {
    if (!supported()) return null;
    try { return await (await getReg()).pushManager.getSubscription(); }
    catch (e) { return null; }
  }

  async function enable() {
    if (!supported()) throw new Error("unsupported");
    var perm = await Notification.requestPermission();
    if (perm !== "granted") throw new Error("denied");
    var reg = await getReg();
    var key = (await (await fetch(API + "/push/vapid-key")).json()).key;
    if (!key) throw new Error("no vapid key");
    var sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: b64ToU8(key),
    });
    var j = sub.toJSON();
    var r = await fetch(API + "/push/subscribe", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth,
        ua: (navigator.userAgent || "").slice(0, 200),
      }),
    });
    if (!r.ok) throw new Error("subscribe failed " + r.status);
    return true;
  }

  async function disable() {
    var sub = await currentSub();
    if (!sub) return true;
    try {
      await fetch(API + "/push/unsubscribe", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: sub.endpoint }),
      });
    } catch (e) {}
    try { await sub.unsubscribe(); } catch (e) {}
    return true;
  }

  async function status() {
    if (!supported()) return (isIOS() && !isStandalone()) ? "ios-needs-install" : "unsupported";
    if (Notification.permission === "denied") return "denied";
    return (await currentSub()) ? "on" : "off";
  }

  async function wire() {
    var toggle = document.querySelector("[data-push-toggle]");
    var hint = document.querySelector("[data-push-status]");
    if (!toggle && !hint) return;

    function render(s) {
      if (hint) {
        hint.textContent = {
          "ios-needs-install": t("push.iosHint", "📲 Zum Aktivieren: „Teilen“ → „Zum Home-Bildschirm“, dann in der App den Schalter nutzen."),
          "unsupported": t("push.unsupported", "Dein Browser unterstützt keine Push-Benachrichtigungen."),
          "denied": t("push.denied", "Benachrichtigungen sind in den Browser-Einstellungen blockiert."),
          "on": t("push.on", "🔔 Benachrichtigungen sind an."),
          "off": t("push.off", "🔕 Benachrichtigungen sind aus."),
        }[s] || "";
      }
      if (toggle) {
        var hideBtn = (s === "ios-needs-install" || s === "unsupported" || s === "denied");
        toggle.style.display = hideBtn ? "none" : "";
        if (!hideBtn) {
          toggle.textContent = s === "on" ? t("push.btnOff", "Ausschalten") : t("push.btnOn", "🔔 Aktivieren");
          toggle.dataset.state = s;
        }
      }
    }

    render(await status());
    if (toggle) {
      toggle.addEventListener("click", async function () {
        toggle.disabled = true;
        try {
          if (toggle.dataset.state === "on") await disable();
          else await enable();
        } catch (e) {}
        toggle.disabled = false;
        render(await status());
      });
    }
  }

  window.DDPush = { enable: enable, disable: disable, status: status, supported: supported, enableUI: wire };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wire);
  else wire();
})();
