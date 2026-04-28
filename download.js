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

  function fmtDuration(sec) {
    if (sec < 0) return "abgelaufen";
    const d = Math.floor(sec / 86400);
    const h = Math.floor((sec % 86400) / 3600);
    const m = Math.floor((sec % 3600) / 60);
    if (d > 0) return d + "d " + h + "h";
    if (h > 0) return h + "h " + m + "m";
    return m + "m";
  }

  function fmtBytes(n) {
    if (n == null) return "—";
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
    if (n < 1024 * 1024 * 1024) return (n / 1024 / 1024).toFixed(2) + " MB";
    return (n / 1024 / 1024 / 1024).toFixed(2) + " GB";
  }

  let countdownTimer = null;

  async function fetchInfo(id) {
    let info;
    try {
      const r = await fetch(API + "/drop-info/" + encodeURIComponent(id));
      if (r.status === 410) {
        showError("Dieser Link ist abgelaufen oder das Burn-Limit ist erreicht.");
        $("download-btn").disabled = true;
        $("download-btn").classList.add("opacity-60", "cursor-not-allowed");
        return;
      }
      if (r.status === 404) {
        showError("Datei nicht gefunden.");
        $("download-btn").disabled = true;
        return;
      }
      if (!r.ok) return;
      info = await r.json();
    } catch { return; }

    // Ensure info-bar exists
    let bar = document.getElementById("info-bar");
    if (!bar) {
      bar = document.createElement("div");
      bar.id = "info-bar";
      bar.className = "mt-5 grid grid-cols-2 gap-3 text-xs font-mono";
      const meta = $("meta");
      const btn = $("download-btn");
      meta.insertBefore(bar, btn);
    }

    function renderBar() {
      const now = Math.floor(Date.now() / 1000);
      const remaining = info.expires_at - now;
      const expiryClass = remaining < 3600 ? "text-red-400" : remaining < 86400 ? "text-yellow-400" : "text-neon-500";
      const burnHtml = info.max_downloads != null
        ? `<div class="p-3 rounded-xl bg-red-500/5 border border-red-500/20">
             <div class="text-white/40 mb-1 text-[10px] uppercase tracking-widest">Burn-Limit</div>
             <div class="text-red-400">${info.remaining_downloads} von ${info.max_downloads} übrig</div>
           </div>`
        : `<div class="p-3 rounded-xl bg-void-800/60 border border-white/5">
             <div class="text-white/40 mb-1 text-[10px] uppercase tracking-widest">Downloads</div>
             <div class="text-white/70">${info.download_count} bisher · unbegrenzt</div>
           </div>`;
      bar.innerHTML = `
        <div class="p-3 rounded-xl bg-void-800/60 border border-white/5">
          <div class="text-white/40 mb-1 text-[10px] uppercase tracking-widest">Läuft ab</div>
          <div class="${expiryClass}">${fmtDuration(remaining)}</div>
          <div class="text-white/30 mt-1 text-[10px]">${fmtBytes(info.size)}</div>
        </div>
        ${burnHtml}
      `;
    }

    renderBar();
    if (countdownTimer) clearInterval(countdownTimer);
    countdownTimer = setInterval(() => {
      renderBar();
      const now = Math.floor(Date.now() / 1000);
      if (info.expires_at - now < 0) {
        clearInterval(countdownTimer);
        showError("Link läuft jetzt ab.");
      }
    }, 30_000);
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
    saveBlob(new Blob([plain], { type: "application/octet-stream" }), filename);
  }

  function saveBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename || "deaddrop-" + Date.now();
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }

  function aadFor(index) {
    const a = new Uint8Array(4);
    new DataView(a.buffer).setUint32(0, index, false);
    return a;
  }

  // Writer abstraction: prefers File System Access API (streaming to disk),
  // falls back to accumulating Blob parts in memory.
  async function getWriter(filename) {
    if (window.showSaveFilePicker) {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: filename || "download.bin",
        });
        const stream = await handle.createWritable();
        return {
          async write(bytes) { await stream.write(bytes); },
          async close() { await stream.close(); },
          type: "fs",
        };
      } catch (e) {
        if (e && e.name === "AbortError") throw e;
        // fall through to memory writer
      }
    }
    const parts = [];
    return {
      async write(bytes) { parts.push(bytes); },
      async close() {
        saveBlob(new Blob(parts, { type: "application/octet-stream" }), filename);
      },
      type: "mem",
    };
  }

  async function chunkedDownloadAndDecrypt(url, rawKey, chunkSize, filename, totalSizeHint) {
    const CT_CHUNK = chunkSize + 28; // IV(12) + GCM tag(16)
    const res = await fetch(url);
    if (!res.ok) throw new Error("download failed: HTTP " + res.status);
    const reader = res.body.getReader();
    const total = parseInt(res.headers.get("Content-Length") || totalSizeHint || 0, 10);

    const key = await crypto.subtle.importKey(
      "raw", rawKey, { name: "AES-GCM", length: 256 }, false, ["decrypt"]
    );

    const writer = await getWriter(filename);

    // Ring-style buffer: accumulate Uint8Arrays, peel off CT_CHUNK-sized
    // blocks without O(n²) slicing.
    const queue = [];   // pending chunks (Uint8Array)
    let queuedLen = 0;
    let readBytes = 0;
    let chunkIndex = 0;

    function takeBytes(n) {
      const out = new Uint8Array(n);
      let off = 0;
      while (off < n) {
        const head = queue[0];
        const need = n - off;
        if (head.length <= need) {
          out.set(head, off);
          off += head.length;
          queue.shift();
        } else {
          out.set(head.subarray(0, need), off);
          queue[0] = head.subarray(need);
          off += need;
        }
      }
      queuedLen -= n;
      return out;
    }

    async function processChunk(data) {
      const iv = data.subarray(0, 12);
      const ct = data.subarray(12);
      let plain;
      try {
        plain = new Uint8Array(await crypto.subtle.decrypt(
          { name: "AES-GCM", iv, additionalData: aadFor(chunkIndex) },
          key, ct,
        ));
      } catch {
        throw new Error("Entschlüsselung fehlgeschlagen (Chunk " + chunkIndex + ").");
      }
      await writer.write(plain);
      chunkIndex++;
    }

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value || !value.length) continue;
        queue.push(value);
        queuedLen += value.length;
        readBytes += value.length;

        while (queuedLen >= CT_CHUNK) {
          await processChunk(takeBytes(CT_CHUNK));
        }

        if (total) {
          const pct = 5 + Math.round((readBytes / total) * 85);
          setProgress(pct, "// Chunked · " + (readBytes / 1024 / 1024).toFixed(1) + " MB / " + (total / 1024 / 1024).toFixed(1) + " MB");
        } else {
          setProgress(50, "// Chunked · " + (readBytes / 1024 / 1024).toFixed(1) + " MB");
        }
      }

      if (queuedLen > 0) {
        // Final (possibly short) chunk
        if (queuedLen < 29) throw new Error("Manipulierte Datei (letzter Chunk zu kurz).");
        await processChunk(takeBytes(queuedLen));
      }
      await writer.close();
    } catch (err) {
      try { await writer.close(); } catch {}
      throw err;
    }
  }

  async function main() {
    const id = parseId();
    if (!id) {
      showError("Ungültiger Link — ID fehlt.");
      return;
    }
    const params = parseFragment();
    const { k, n, v, c } = params;
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

    const isChunked = v === "2";
    const chunkSize = isChunked ? parseInt(c, 10) : 0;
    if (isChunked && (!chunkSize || chunkSize < 1024 || chunkSize > 64 * 1024 * 1024)) {
      showError("Ungültige Chunk-Größe im Link.");
      return;
    }

    $("filename").textContent = filename;
    $("meta").classList.remove("hidden");

    // Show expiry countdown + burn info up-front (no side effects)
    fetchInfo(id);

    $("download-btn").addEventListener("click", async () => {
      $("download-btn").disabled = true;
      $("download-btn").classList.add("opacity-60", "cursor-not-allowed");
      try {
        setProgress(5, "// Signed-URL anfordern …");
        const r = await fetch(API + "/download-url/" + encodeURIComponent(id));
        if (r.status === 404) throw new Error("Datei existiert nicht (mehr).");
        if (r.status === 409) throw new Error("Upload noch nicht abgeschlossen.");
        if (r.status === 410) throw new Error("Link abgelaufen oder Burn-Limit erreicht.");
        if (r.status === 402) {
          // Egress quota exhausted on the uploader — render rich hint with /topup link
          const el = $("error");
          el.innerHTML = 'Egress-Limit des Senders erreicht. ' +
            'Der Empfänger kann nichts tun — der Sender muss <a href="/topup" class="text-neon-500 hover:underline">Egress-Credits nachladen</a> ' +
            'oder bis zum Monats-Reset warten.';
          el.classList.remove("hidden");
          $("meta").classList.add("hidden");
          return;
        }
        if (!r.ok) throw new Error("API error: HTTP " + r.status);
        const dl = await r.json();

        if (isChunked) {
          await chunkedDownloadAndDecrypt(dl.url, rawKey, chunkSize, filename);
        } else {
          const bytes = await fetchWithProgress(dl.url, (frac) => {
            const pct = 5 + Math.round(frac * 85);
            setProgress(pct, "// Download " + (frac * 100).toFixed(1) + "%");
          });
          setProgress(95, "// entschlüsseln …");
          await decryptAndSave(bytes, rawKey, filename);
        }

        setProgress(100, "// fertig");
        $("dl-success").classList.remove("hidden");
      } catch (err) {
        if (err && err.name === "AbortError") {
          showError("Speichern abgebrochen.");
        } else {
          showError(err.message || String(err));
        }
      }
    });
  }

  main();
})();
