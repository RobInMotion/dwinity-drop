(function () {
  const API = "/api";
  let MAX = 100 * 1024 * 1024;                      // updated from /api/me
  let MAX_RETENTION_HOURS = 168;                    // updated from /api/me
  let IS_PRO = false;
  const WARN_BUNDLE = 80 * 1024 * 1024;

  // Files >= CHUNKED_THRESHOLD use S3 multipart + stream-encryption
  // (keeps peak RAM bounded instead of O(filesize)).
  const CHUNKED_THRESHOLD = 50 * 1024 * 1024;   // 50 MB
  const CHUNK_SIZE = 5 * 1024 * 1024;           // plaintext per chunk (5 MB = S3 min)

  const $ = (id) => document.getElementById(id);
  const zone = $("dropzone");
  const fileInput = $("file-input");
  const btn = $("drop-btn");
  const progress = $("drop-progress");
  const progressBar = $("drop-progress-bar");
  const progressText = $("drop-progress-text");
  const result = $("drop-result");
  const shareUrlEl = $("drop-share-url");
  const copyBtn = $("drop-copy-btn");
  const errorEl = $("drop-error");
  const metaEl = $("drop-result-meta");
  const qrEl = $("drop-qr");
  const newBtn = $("drop-new-btn");
  const retentionSel = $("drop-retention");
  const burnToggle = $("drop-burn");
  const abortBtn = $("drop-abort-btn");

  let currentXhr = null;
  let aborted = false;

  function u8ToB64Url(u8) {
    let s = "";
    for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
    return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  function fmtBytes(n) {
    if (n < 1024) return n + " B";
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
    return (n / 1024 / 1024).toFixed(2) + " MB";
  }

  function showError(msg) {
    errorEl.textContent = msg;
    errorEl.classList.remove("hidden");
    progress.classList.add("hidden");
  }

  function hideError() { errorEl.classList.add("hidden"); }

  function setProgress(pct, text) {
    progress.classList.remove("hidden");
    progressBar.style.width = pct + "%";
    progressText.textContent = text;
  }

  function resetUI() {
    hideError();
    result.classList.add("hidden");
    progress.classList.add("hidden");
    progressBar.style.width = "0%";
    progressText.textContent = "";
    shareUrlEl.value = "";
    metaEl.textContent = "";
    qrEl.innerHTML = "";
    fileInput.value = "";
  }

  async function bundleIfNeeded(files) {
    if (files.length === 1) {
      return { blob: files[0], name: files[0].name, bundled: false };
    }
    if (!window.JSZip) throw new Error("ZIP-Bibliothek nicht geladen");
    setProgress(2, "// " + files.length + " Dateien werden gebündelt …");
    const zip = new JSZip();
    for (const f of files) zip.file(f.name, f);
    const blob = await zip.generateAsync({ type: "blob", compression: "STORE" });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    return { blob, name: `deaddrop-${stamp}.zip`, bundled: true };
  }

  async function encryptBlob(blob) {
    setProgress(8, "// verschlüsseln …");
    const key = await crypto.subtle.generateKey(
      { name: "AES-GCM", length: 256 },
      true,
      ["encrypt", "decrypt"]
    );
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const plaintext = new Uint8Array(await blob.arrayBuffer());
    const ciphertext = new Uint8Array(
      await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext)
    );
    const out = new Uint8Array(iv.length + ciphertext.length);
    out.set(iv, 0);
    out.set(ciphertext, iv.length);
    const rawKey = new Uint8Array(await crypto.subtle.exportKey("raw", key));
    return { encrypted: out, rawKey };
  }

  // ——— Chunked / multipart upload ———
  //
  // Envelope format (per chunk):   [IV(12) bytes] [AES-GCM ciphertext+tag]
  // AAD per chunk = chunk_index as 4-byte big-endian (prevents reordering)
  // Key is generated once per drop; shared via URL fragment (#k=…).

  function aadFor(index) {
    const a = new Uint8Array(4);
    new DataView(a.buffer).setUint32(0, index, false); // big-endian
    return a;
  }

  function putChunkWithProgress(url, body, onProgress) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      currentXhr = xhr;
      xhr.open("PUT", url);
      xhr.setRequestHeader("Content-Type", "application/octet-stream");
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(e.loaded, e.total);
      };
      xhr.onload = () => {
        currentXhr = null;
        if (xhr.status >= 200 && xhr.status < 300) {
          // ETag comes back in quotes: "abc123" — Storj echoes S3 behavior
          const etag = xhr.getResponseHeader("ETag") || "";
          resolve(etag);
        } else {
          reject(new Error("Chunk-Upload fehlgeschlagen (HTTP " + xhr.status + ")"));
        }
      };
      xhr.onerror = () => {
        currentXhr = null;
        reject(new Error("Netzwerk-Fehler während Chunk-Upload"));
      };
      xhr.onabort = () => {
        currentXhr = null;
        const err = new Error("abgebrochen");
        err.aborted = true;
        reject(err);
      };
      xhr.send(body);
    });
  }

  async function chunkedUpload(blob, body, totalSize) {
    // 1. Init multipart
    setProgress(4, "// Multipart initialisieren …");
    const initRes = await fetch(API + "/upload/multipart/init", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    });
    if (initRes.status === 429) throw new Error("Zu viele Uploads — kurz warten.");
    if (!initRes.ok) throw new Error("Init fehlgeschlagen (HTTP " + initRes.status + ")");
    const init = await initRes.json();
    const dropId = init.drop_id;
    const uploadId = init.upload_id;

    // 2. Generate key once
    const key = await crypto.subtle.generateKey(
      { name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]
    );
    const rawKey = new Uint8Array(await crypto.subtle.exportKey("raw", key));

    // 3. Encrypt + upload each chunk sequentially
    const numChunks = Math.ceil(blob.size / CHUNK_SIZE);
    const parts = [];
    let uploadedBytes = 0;
    // Each ciphertext chunk = 12 (IV) + plaintext + 16 (GCM tag)
    const totalCtBytes = blob.size + numChunks * 28;

    try {
      for (let i = 0; i < numChunks; i++) {
        if (aborted) throw Object.assign(new Error("abgebrochen"), { aborted: true });

        const offset = i * CHUNK_SIZE;
        const slice = blob.slice(offset, Math.min(offset + CHUNK_SIZE, blob.size));
        const plain = new Uint8Array(await slice.arrayBuffer());

        const iv = crypto.getRandomValues(new Uint8Array(12));
        const ct = new Uint8Array(await crypto.subtle.encrypt(
          { name: "AES-GCM", iv, additionalData: aadFor(i) }, key, plain
        ));
        const envelope = new Uint8Array(iv.length + ct.length);
        envelope.set(iv, 0);
        envelope.set(ct, iv.length);

        // Get signed URL for this part
        const partRes = await fetch(API + "/upload/multipart/part", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            drop_id: dropId,
            upload_id: uploadId,
            part_number: i + 1,
          }),
        });
        if (!partRes.ok) throw new Error("Part-URL-Fehler (HTTP " + partRes.status + ")");
        const partInfo = await partRes.json();

        const chunkStartBytes = uploadedBytes;
        const etag = await putChunkWithProgress(
          partInfo.url, envelope,
          (loaded, _total) => {
            const cumulative = chunkStartBytes + loaded;
            const frac = cumulative / totalCtBytes;
            const pct = 8 + Math.round(frac * 87);
            setProgress(
              pct,
              "// Chunk " + (i + 1) + "/" + numChunks + " · " +
              fmtBytes(cumulative) + " / " + fmtBytes(totalCtBytes)
            );
          }
        );
        uploadedBytes += envelope.length;
        parts.push({ PartNumber: i + 1, ETag: etag });
      }

      // 4. Complete
      setProgress(97, "// Upload finalisieren …");
      const completeRes = await fetch(API + "/upload/multipart/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          drop_id: dropId, upload_id: uploadId, parts,
        }),
      });
      if (!completeRes.ok) throw new Error("Complete fehlgeschlagen (HTTP " + completeRes.status + ")");

      return { id: dropId, rawKey, retention_hours: body.retention_hours };
    } catch (err) {
      // Best-effort abort — sweeper will clean up anyway after 6h
      try {
        await fetch(API + "/upload/multipart/abort", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ drop_id: dropId, upload_id: uploadId }),
        });
      } catch {}
      throw err;
    }
  }

  function putWithProgress(url, body, onProgress) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      currentXhr = xhr;
      xhr.open("PUT", url);
      xhr.setRequestHeader("Content-Type", "application/octet-stream");
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(e.loaded / e.total);
      };
      xhr.onload = () => {
        currentXhr = null;
        if (xhr.status >= 200 && xhr.status < 300) resolve();
        else reject(new Error("Upload fehlgeschlagen (HTTP " + xhr.status + ")"));
      };
      xhr.onerror = () => {
        currentXhr = null;
        reject(new Error("Netzwerk-Fehler während Upload"));
      };
      xhr.onabort = () => {
        currentXhr = null;
        const err = new Error("abgebrochen");
        err.aborted = true;
        reject(err);
      };
      xhr.send(body);
    });
  }

  function renderQR(url) {
    qrEl.innerHTML = "";
    if (typeof QRious === "undefined") return;
    const canvas = document.createElement("canvas");
    qrEl.appendChild(canvas);
    try {
      new QRious({
        element: canvas,
        value: url,
        size: 120,
        background: "#ffffff",
        foreground: "#05060A",
        level: "M",
      });
    } catch {
      qrEl.innerHTML = "";
    }
  }

  function fmtRetention(hours) {
    if (hours >= 24) {
      const d = Math.round(hours / 24);
      return d + (d === 1 ? " Tag" : " Tage");
    }
    return hours + (hours === 1 ? " Stunde" : " Stunden");
  }

  // ——— Free-tier email gate ———
  const EMAIL_KEY = "dwinity_drop_email_v1";
  const emailGate = document.getElementById("email-gate");
  const emailForm = document.getElementById("email-gate-form");
  const emailInput = document.getElementById("email-gate-input");
  const emailConsent = document.getElementById("email-gate-consent");
  const emailError = document.getElementById("email-gate-error");
  const emailClose = document.getElementById("email-gate-close");
  const emailBackdrop = document.getElementById("email-gate-backdrop");

  function hideEmailGate() {
    if (emailGate) emailGate.classList.add("hidden");
    document.body.style.overflow = "";
  }
  function showEmailGate() {
    if (!emailGate) return;
    emailGate.classList.remove("hidden");
    document.body.style.overflow = "hidden";
    setTimeout(() => emailInput && emailInput.focus(), 50);
  }

  /** Returns Promise<boolean>: true = gate passed, false = user cancelled. */
  async function ensureEmailGate() {
    // If logged in (wallet), skip gate.
    try {
      const r = await fetch("/api/me", { credentials: "include" });
      if (r.ok) {
        const me = await r.json();
        if (me.address) return true;
      }
    } catch {}

    // Already cached locally?
    const cached = localStorage.getItem(EMAIL_KEY);
    if (cached && /.+@.+\..+/.test(cached)) return true;

    if (!emailGate) return true;  // no gate element = legacy page, bypass

    return new Promise((resolve) => {
      const onCancel = (e) => {
        const wasCloseBtn = e && e.target && e.target.closest && e.target.closest("#email-gate-close");
        cleanup(); hideEmailGate(); resolve(false);
        // If user hit the "lieber Wallet verbinden" button, jump into SIWE
        if (wasCloseBtn && typeof window.connectWallet === "function") {
          setTimeout(() => window.connectWallet(), 50);
        }
      };
      const onSubmit = async (e) => {
        e.preventDefault();
        emailError.classList.add("hidden");
        const email = (emailInput.value || "").trim();
        if (!emailConsent.checked) {
          emailError.textContent = "Bitte Datenschutzhinweise bestätigen.";
          emailError.classList.remove("hidden");
          return;
        }
        if (!/.+@.+\..+/.test(email)) {
          emailError.textContent = "Bitte eine gültige E-Mail angeben.";
          emailError.classList.remove("hidden");
          return;
        }
        const btn = emailForm.querySelector('button[type=submit]');
        btn.disabled = true; const orig = btn.textContent; btn.textContent = "// sende …";
        try {
          const res = await fetch("/api/waitlist", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, product: "drop-free" }),
          });
          if (res.status === 429) throw new Error("Zu viele Anfragen — kurz warten.");
          if (!res.ok) throw new Error("HTTP " + res.status);
          localStorage.setItem(EMAIL_KEY, email);
          cleanup(); hideEmailGate(); resolve(true);
        } catch (err) {
          emailError.textContent = "Fehler: " + (err.message || err);
          emailError.classList.remove("hidden");
        } finally {
          btn.disabled = false; btn.textContent = orig;
        }
      };
      function cleanup() {
        emailForm.removeEventListener("submit", onSubmit);
        emailClose.removeEventListener("click", onCancel);
        emailBackdrop.removeEventListener("click", onCancel);
      }
      emailForm.addEventListener("submit", onSubmit);
      emailClose.addEventListener("click", onCancel);
      emailBackdrop.addEventListener("click", onCancel);
      showEmailGate();
    });
  }

  async function doUpload(files) {
    hideError();
    result.classList.add("hidden");
    aborted = false;
    if (!files || files.length === 0) return;

    // Free-tier gate: must provide email before the first upload (unless wallet-logged-in)
    const gated = await ensureEmailGate();
    if (!gated) return;

    let total = 0;
    for (const f of files) total += f.size;
    if (total > MAX) {
      showError("Zu groß: " + fmtBytes(total) + " (Max " + fmtBytes(MAX) + " pro Drop)");
      return;
    }

    const retentionHours = parseInt(retentionSel.value, 10) || 168;
    const burn = !!(burnToggle && burnToggle.checked);

    btn.disabled = true;
    btn.classList.add("opacity-60", "cursor-not-allowed");

    try {
      const { blob, name, bundled } = await bundleIfNeeded(Array.from(files));
      if (aborted) throw Object.assign(new Error("abgebrochen"), { aborted: true });
      if (blob.size > MAX) {
        throw new Error("Nach Bündelung " + fmtBytes(blob.size) + " — Max " + fmtBytes(MAX));
      }

      const useChunked = blob.size >= CHUNKED_THRESHOLD;
      let dropId, rawKey, ctByteCount;

      if (useChunked) {
        const body = {
          size: blob.size + Math.ceil(blob.size / CHUNK_SIZE) * 28,
          content_type: "application/octet-stream",
          retention_hours: retentionHours,
        };
        if (burn) body.max_downloads = 1;
        const res = await chunkedUpload(blob, body, blob.size);
        dropId = res.id;
        rawKey = res.rawKey;
        ctByteCount = body.size;
      } else {
        const { encrypted, rawKey: k } = await encryptBlob(blob);
        if (aborted) throw Object.assign(new Error("abgebrochen"), { aborted: true });

        setProgress(12, "// Signed-URL anfordern …");
        const body = {
          size: encrypted.length,
          content_type: "application/octet-stream",
          retention_hours: retentionHours,
        };
        if (burn) body.max_downloads = 1;
        const r = await fetch(API + "/upload-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(body),
        });
        if (r.status === 429) throw new Error("Zu viele Uploads — kurz warten und nochmal.");
        if (!r.ok) throw new Error("API-Fehler (HTTP " + r.status + ")");
        const payload = await r.json();

        await putWithProgress(payload.url, encrypted, (frac) => {
          const pct = 12 + Math.round(frac * 83);
          setProgress(pct, "// Upload " + (frac * 100).toFixed(1) + "%");
        });

        dropId = payload.id;
        rawKey = k;
        ctByteCount = encrypted.length;
      }

      setProgress(100, "// fertig");

      const keyB64 = u8ToB64Url(rawKey);
      const nameB64 = u8ToB64Url(new TextEncoder().encode(name));
      const share = location.origin + "/d/" + dropId + "#k=" + keyB64 + "&n=" + nameB64 +
        (useChunked ? "&v=2&c=" + CHUNK_SIZE : "");

      shareUrlEl.value = share;
      metaEl.textContent =
        (bundled ? files.length + " Dateien · " : "1 Datei · ") +
        fmtBytes(ctByteCount) + " verschlüsselt · " +
        (useChunked ? "chunked · " : "") +
        "verfügbar " + fmtRetention(retentionHours) +
        (burn ? " · 🔥 Burn-after-Read" : "");
      renderQR(share);
      result.classList.remove("hidden");

      // Save drop metadata to localStorage (per wallet) so the dashboard
      // can show the filename and a working share link on this device.
      try {
        const meRes = await fetch("/api/me", { credentials: "include" });
        if (meRes.ok) {
          const me = await meRes.json();
          if (me.address) {
            const key = "dwinity_drop_meta_" + me.address.toLowerCase();
            const store = JSON.parse(localStorage.getItem(key) || "{}");
            store[dropId] = { filename: name, share_link: share, ts: Date.now() };
            localStorage.setItem(key, JSON.stringify(store));
          }
        }
      } catch {}
    } catch (err) {
      if (err && err.aborted) {
        showError("// abgebrochen · keine Daten auf Storj");
      } else {
        showError(err.message || String(err));
      }
    } finally {
      btn.disabled = false;
      btn.classList.remove("opacity-60", "cursor-not-allowed");
      currentXhr = null;
    }
  }

  // ——— events ———
  if (!zone) return;

  btn.addEventListener("click", (e) => { e.preventDefault(); fileInput.click(); });
  fileInput.addEventListener("change", () => {
    if (fileInput.files.length) doUpload(fileInput.files);
  });

  ["dragenter", "dragover"].forEach((ev) =>
    zone.addEventListener(ev, (e) => {
      e.preventDefault();
      zone.classList.add("ring-2", "ring-neon-500/60", "bg-neon-500/5");
    })
  );
  ["dragleave", "drop"].forEach((ev) =>
    zone.addEventListener(ev, (e) => {
      e.preventDefault();
      zone.classList.remove("ring-2", "ring-neon-500/60", "bg-neon-500/5");
    })
  );
  zone.addEventListener("drop", (e) => {
    const fl = e.dataTransfer && e.dataTransfer.files;
    if (fl && fl.length) doUpload(fl);
  });

  copyBtn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(shareUrlEl.value);
      copyBtn.textContent = "✓ kopiert";
      setTimeout(() => (copyBtn.textContent = "Link kopieren"), 1500);
    } catch {
      shareUrlEl.select();
      document.execCommand("copy");
    }
  });

  newBtn.addEventListener("click", (e) => {
    e.preventDefault();
    resetUI();
  });

  abortBtn.addEventListener("click", (e) => {
    e.preventDefault();
    aborted = true;
    if (currentXhr) {
      try { currentXhr.abort(); } catch {}
    }
  });

  // ——— load tier limits from /api/me and adjust UI ———
  function applyLimits(me) {
    MAX = me.max_size;
    MAX_RETENTION_HOURS = me.max_retention_hours;
    IS_PRO = !!me.pro;

    // Dropzone hint text
    const hint = zone.querySelector(".text-white\\/50.text-sm.mb-6");
    if (hint) {
      const sizeText = IS_PRO
        ? "bis 2 GB (Pro) · Verschlüsselung im Browser"
        : "bis 100 MB · Verschlüsselung im Browser · Pro = bis 2 GB";
      hint.textContent = sizeText + " · mehrere Dateien → ZIP";
    }

    // Retention <select>: disable/gate 720h option for Free users
    const opt30 = retentionSel.querySelector('option[value="720"]');
    if (opt30) {
      if (IS_PRO) {
        opt30.disabled = false;
        opt30.textContent = "30 Tage";
      } else {
        opt30.disabled = true;
        opt30.textContent = "30 Tage (Pro)";
        if (parseInt(retentionSel.value, 10) > MAX_RETENTION_HOURS) {
          retentionSel.value = String(MAX_RETENTION_HOURS);
        }
      }
    }
  }

  async function loadLimits() {
    try {
      const r = await fetch(API + "/me", { credentials: "include" });
      if (!r.ok) return;
      const me = await r.json();
      applyLimits(me);
    } catch {}
  }

  window.addEventListener("dwinity:pro-updated", loadLimits);
  loadLimits();
})();
