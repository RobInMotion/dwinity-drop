(function () {
  const API = "/api";

  const $ = (id) => document.getElementById(id);

  function showError(msg) {
    const el = $("error");
    el.textContent = msg;
    el.classList.remove("hidden");
    $("meta").classList.add("hidden");
  }

  function b64UrlToU8(s) {
    s = s.replace(/-/g, "+").replace(/_/g, "/");
    const pad = s.length % 4 === 0 ? 0 : 4 - (s.length % 4);
    s += "=".repeat(pad);
    const bin = atob(s);
    const u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return u8;
  }

  function parseFragment() {
    const frag = location.hash.replace(/^#/, "");
    const params = {};
    frag.split("&").forEach((kv) => {
      const [k, v] = kv.split("=");
      if (k) params[k] = decodeURIComponent(v || "");
    });
    return params;
  }

  function parseId() {
    const m = location.pathname.match(/^\/d\/([A-Za-z0-9_-]+)\/?$/);
    return m ? m[1] : null;
  }

  function setProgress(pct, text) {
    $("dl-progress").classList.remove("hidden");
    $("dl-progress-bar").style.width = pct + "%";
    $("dl-progress-text").textContent = text;
  }

  function fetchWithProgress(url, onProgress) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("GET", url);
      xhr.responseType = "arraybuffer";
      xhr.onprogress = (e) => {
        if (e.lengthComputable) onProgress(e.loaded / e.total);
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) resolve(new Uint8Array(xhr.response));
        else reject(new Error("download failed: HTTP " + xhr.status));
      };
      xhr.onerror = () => reject(new Error("network error during download"));
      xhr.send();
    });
  }

  async function decryptAndSave(bytes, rawKey, filename) {
    if (bytes.length < 13) throw new Error("file too small — malformed");
    const iv = bytes.slice(0, 12);
    const ct = bytes.slice(12);
    const key = await crypto.subtle.importKey(
      "raw",
      rawKey,
      { name: "AES-GCM", length: 256 },
      false,
      ["decrypt"]
    );
    let plain;
    try {
      plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
    } catch {
      throw new Error("Entschlüsselung fehlgeschlagen — falscher Schlüssel oder manipulierte Datei.");
    }
    const blob = new Blob([plain], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename || "dwinity-drop-" + Date.now();
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }

  async function main() {
    const id = parseId();
    if (!id) {
      showError("Ungültiger Link — ID fehlt.");
      return;
    }
    const { k, n } = parseFragment();
    if (!k) {
      showError("Kein Schlüssel im Link gefunden (fehlt das #k=… Fragment?).");
      return;
    }

    let rawKey, filename;
    try {
      rawKey = b64UrlToU8(k);
      filename = n ? new TextDecoder().decode(b64UrlToU8(n)) : "download.bin";
    } catch {
      showError("Schlüssel oder Dateiname im Link ist beschädigt.");
      return;
    }

    $("filename").textContent = filename;
    $("meta").classList.remove("hidden");

    $("download-btn").addEventListener("click", async () => {
      $("download-btn").disabled = true;
      $("download-btn").classList.add("opacity-60", "cursor-not-allowed");
      try {
        setProgress(5, "// Signed-URL anfordern …");
        const r = await fetch(API + "/download-url/" + encodeURIComponent(id));
        if (r.status === 404) throw new Error("Datei existiert nicht (mehr).");
        if (!r.ok) throw new Error("API error: HTTP " + r.status);
        const { url } = await r.json();

        const bytes = await fetchWithProgress(url, (frac) => {
          const pct = 5 + Math.round(frac * 85);
          setProgress(pct, "// Download " + (frac * 100).toFixed(1) + "%");
        });

        setProgress(95, "// entschlüsseln …");
        await decryptAndSave(bytes, rawKey, filename);
        setProgress(100, "// fertig");
        $("dl-success").classList.remove("hidden");
      } catch (err) {
        showError(err.message || String(err));
      }
    });
  }

  main();
})();
