(function () {
  const API = "/api";

  const $ = (id) => document.getElementById(id);

  // i18n helper: translated string if DDI18n is loaded, German fallback otherwise
  function tt(key, fallback, vars) {
    let v = (window.DDI18n && window.DDI18n.t && window.DDI18n.t(key)) || "";
    if (!v || v === key) v = fallback;
    if (vars) for (const k in vars) v = v.replace("{" + k + "}", vars[k]);
    return v;
  }

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
    if (sec < 0) return tt("ui.countdown.expired", "abgelaufen");
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
        showError(tt("err.linkExpiredOrBurned", "Dieser Link ist abgelaufen oder das Burn-Limit ist erreicht."));
        $("download-btn").disabled = true;
        $("download-btn").classList.add("opacity-60", "cursor-not-allowed");
        return;
      }
      if (r.status === 404) {
        showError(tt("err.fileNotFound", "Datei nicht gefunden."));
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
             <div class="text-red-400">${tt("dl.burnRemaining", "{r} von {m} übrig", { r: info.remaining_downloads, m: info.max_downloads })}</div>
           </div>`
        : `<div class="p-3 rounded-xl bg-void-800/60 border border-white/5">
             <div class="text-white/40 mb-1 text-[10px] uppercase tracking-widest">Downloads</div>
             <div class="text-white/70">${tt("dl.downloadsSoFar", "{n} bisher · unbegrenzt", { n: info.download_count })}</div>
           </div>`;
      bar.innerHTML = `
        <div class="p-3 rounded-xl bg-void-800/60 border border-white/5">
          <div class="text-white/40 mb-1 text-[10px] uppercase tracking-widest">${tt("dl.expiresLabel", "Läuft ab")}</div>
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
        showError(tt("err.linkExpiresNow", "Link läuft jetzt ab."));
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
      throw new Error(tt("err.decryptFailed", "Entschlüsselung fehlgeschlagen — falscher Schlüssel oder manipulierte Datei."));
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

  function aadV2(index) {
    const a = new Uint8Array(4);
    new DataView(a.buffer).setUint32(0, index, false);
    return a;
  }

  function aadV3(index, totalChunks, totalSize) {
    const a = new Uint8Array(16);
    const dv = new DataView(a.buffer);
    dv.setUint32(0, index, false);
    dv.setUint32(4, totalChunks, false);
    dv.setUint32(8, Math.floor(totalSize / 0x100000000), false);
    dv.setUint32(12, totalSize >>> 0, false);
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

  async function chunkedDownloadAndDecrypt(url, rawKey, chunkSize, filename, totalSizeHint, opts) {
    // opts.version: "v2" or "v3"; v3 also passes opts.totalChunks + opts.totalSize
    const version = (opts && opts.version) || "v2";
    const expectedChunks = (opts && opts.totalChunks) || 0;
    const expectedSize = (opts && opts.totalSize) || 0;

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
    let plainBytes = 0;

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
        const ad = version === "v3"
          ? aadV3(chunkIndex, expectedChunks, expectedSize)
          : aadV2(chunkIndex);
        plain = new Uint8Array(await crypto.subtle.decrypt(
          { name: "AES-GCM", iv, additionalData: ad },
          key, ct,
        ));
      } catch {
        throw new Error(tt("err.decryptChunkFailed", "Entschlüsselung fehlgeschlagen (Chunk {n}).", { n: chunkIndex }));
      }
      await writer.write(plain);
      plainBytes += plain.length;
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

      // v=3: verify the stream wasn't truncated. The AAD on each chunk binds
      // (chunk_index, total_chunks, total_size) — without this final assertion
      // a server that drops the tail of the file could deliver a syntactically
      // valid prefix that decrypts cleanly up to the truncation point.
      if (version === "v3") {
        if (chunkIndex !== expectedChunks) {
          throw new Error(tt("dl.incomplete", "Datei unvollständig: erwartet {e} Chunks, empfangen {g}", { e: expectedChunks, g: chunkIndex }));
        }
        if (plainBytes !== expectedSize) {
          throw new Error(tt("dl.sizeMismatch", "Größenabweichung: erwartet {e} Bytes, dekrypiert {g}", { e: expectedSize, g: plainBytes }));
        }
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
      showError(tt("err.invalidLinkNoId", "Ungültiger Link — ID fehlt."));
      return;
    }
    const params = parseFragment();
    const { k, n, v, c, t, s } = params;
    if (!k) {
      showError(tt("err.noKeyInLink", "Kein Schlüssel im Link gefunden (fehlt das #k=… Fragment?)."));
      return;
    }

    let rawKey, filename;
    try {
      rawKey = b64UrlToU8(k);
      filename = n ? new TextDecoder().decode(b64UrlToU8(n)) : "download.bin";
    } catch {
      showError(tt("err.linkCorrupt", "Schlüssel oder Dateiname im Link ist beschädigt."));
      return;
    }

    const isChunked = v === "2" || v === "3";
    const chunkVersion = v === "3" ? "v3" : "v2";
    const chunkSize = isChunked ? parseInt(c, 10) : 0;
    if (isChunked && (!chunkSize || chunkSize < 1024 || chunkSize > 64 * 1024 * 1024)) {
      showError(tt("err.invalidChunkSize", "Ungültige Chunk-Größe im Link."));
      return;
    }
    let totalChunks = 0;
    let totalSize = 0;
    if (chunkVersion === "v3") {
      totalChunks = parseInt(t, 10);
      totalSize = parseInt(s, 10);
      if (!totalChunks || totalChunks < 1 || totalChunks > 1_000_000) {
        showError(tt("err.invalidChunkCount", "Ungültige Chunk-Anzahl im Link."));
        return;
      }
      if (!Number.isFinite(totalSize) || totalSize < 1) {
        showError(tt("err.invalidFileSize", "Ungültige Dateigröße im Link."));
        return;
      }
    }

    $("filename").textContent = filename;
    $("meta").classList.remove("hidden");

    // Show expiry countdown + burn info up-front (no side effects)
    fetchInfo(id);

    $("download-btn").addEventListener("click", async () => {
      $("download-btn").disabled = true;
      $("download-btn").classList.add("opacity-60", "cursor-not-allowed");
      try {
        setProgress(5, tt("ui.progress.requestUrl", "// Signed-URL anfordern …"));
        const r = await fetch(API + "/download-url/" + encodeURIComponent(id));
        if (r.status === 404) throw new Error(tt("err.fileGone", "Datei existiert nicht (mehr)."));
        if (r.status === 409) throw new Error(tt("err.uploadNotFinished", "Upload noch nicht abgeschlossen."));
        if (r.status === 410) throw new Error(tt("err.linkExpiredOrBurned", "Link abgelaufen oder Burn-Limit erreicht."));
        if (r.status === 402) {
          // Egress quota exhausted on the uploader — render rich hint with /topup link
          const el = $("error");
          el.innerHTML = tt("err.egressExhausted", 'Egress-Limit des Senders erreicht. Der Empfänger kann nichts tun — der Sender muss <a href="/topup" class="text-neon-500 hover:underline">Egress-Credits nachladen</a> oder bis zum Monats-Reset warten.');
          el.classList.remove("hidden");
          $("meta").classList.add("hidden");
          return;
        }
        if (!r.ok) throw new Error("API error: HTTP " + r.status);
        const dl = await r.json();

        if (isChunked) {
          await chunkedDownloadAndDecrypt(dl.url, rawKey, chunkSize, filename, 0, {
            version: chunkVersion,
            totalChunks: totalChunks,
            totalSize: totalSize,
          });
        } else {
          const bytes = await fetchWithProgress(dl.url, (frac) => {
            const pct = 5 + Math.round(frac * 85);
            setProgress(pct, "// Download " + (frac * 100).toFixed(1) + "%");
          });
          setProgress(95, tt("ui.progress.decrypting", "// entschlüsseln …"));
          await decryptAndSave(bytes, rawKey, filename);
        }

        setProgress(100, tt("ui.progress.done", "// fertig"));
        $("dl-success").classList.remove("hidden");
      } catch (err) {
        if (err && err.name === "AbortError") {
          showError(tt("err.saveAborted", "Speichern abgebrochen."));
        } else {
          showError(err.message || String(err));
        }
      }
    });
  }

  main();
})();
(window.DDI18n ? (x) => window.DDI18n.register(x) : (x) => (window.__DDI18N_PENDING = window.__DDI18N_PENDING || []).push(x))({ en: {
  "dl.expiresLabel": "Expires",
  "dl.burnRemaining": "{r} of {m} left",
  "dl.downloadsSoFar": "{n} so far · unlimited",
  "dl.incomplete": "File incomplete: expected {e} chunks, received {g}",
  "dl.sizeMismatch": "Size mismatch: expected {e} bytes, decrypted {g}",
} });
