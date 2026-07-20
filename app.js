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

  // i18n helper: translated string if DDI18n is loaded, German fallback otherwise
  function tt(key, fallback, vars) {
    let v = (window.DDI18n && window.DDI18n.t && window.DDI18n.t(key)) || "";
    if (!v || v === key) v = fallback;
    if (vars) for (const k in vars) v = v.replace("{" + k + "}", vars[k]);
    return v;
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
    if (!window.JSZip) throw new Error(tt("err.zipLibMissing", "ZIP-Bibliothek nicht geladen"));
    setProgress(2, tt("ui.progress.bundling", "// {n} Dateien werden gebündelt …", { n: files.length }));
    const zip = new JSZip();
    for (const f of files) zip.file(f.name, f);
    const blob = await zip.generateAsync({ type: "blob", compression: "STORE" });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    return { blob, name: `deaddrop-${stamp}.zip`, bundled: true };
  }

  async function encryptBlob(blob) {
    setProgress(8, tt("ui.progress.encrypting", "// verschlüsseln …"));
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
  // Key is generated once per drop; shared via URL fragment (#k=…).
  //
  // v=2 AAD = chunk_index (4 bytes BE)         — prevents reordering only.
  // v=3 AAD = chunk_index || total_chunks || total_size (4+4+8 BE)
  //          — additionally prevents truncation: a server that drops the
  //          tail of the file would have to forge a final-chunk tag against
  //          a different total_chunks, which the recipient rejects.
  // Receivers parse `&v=2|3` from the URL fragment to pick the matching AAD.

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
    // 64-bit size, big-endian: hi32 || lo32. JS Number is precise to 2^53,
    // far above any realistic drop size on this platform (max ~5 GB Pro+).
    dv.setUint32(8, Math.floor(totalSize / 0x100000000), false);
    dv.setUint32(12, totalSize >>> 0, false);
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
          reject(new Error(tt("err.chunkUploadFailed", "Chunk-Upload fehlgeschlagen (HTTP {n})", { n: xhr.status })));
        }
      };
      xhr.onerror = () => {
        currentXhr = null;
        reject(new Error(tt("err.netDuringChunkUpload", "Netzwerk-Fehler während Chunk-Upload")));
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
    setProgress(4, tt("ui.progress.multipartInit", "// Multipart initialisieren …"));
    const initRes = await fetch(API + "/upload/multipart/init", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    });
    if (initRes.status === 429) throw new Error(tt("err.tooManyUploads", "Zu viele Uploads — kurz warten."));
    if (!initRes.ok) throw new Error(tt("err.initFailed", "Init fehlgeschlagen (HTTP {n})", { n: initRes.status }));
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
          { name: "AES-GCM", iv, additionalData: aadV3(i, numChunks, blob.size) },
          key, plain,
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
        if (!partRes.ok) throw new Error(tt("err.partUrlFailed", "Part-URL-Fehler (HTTP {n})", { n: partRes.status }));
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
      setProgress(97, tt("ui.progress.finalizing", "// Upload finalisieren …"));
      const completeRes = await fetch(API + "/upload/multipart/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          drop_id: dropId, upload_id: uploadId, parts,
        }),
      });
      if (!completeRes.ok) throw new Error(tt("err.completeFailed", "Complete fehlgeschlagen (HTTP {n})", { n: completeRes.status }));

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
        else reject(new Error(tt("err.uploadFailed", "Upload fehlgeschlagen (HTTP {n})", { n: xhr.status })));
      };
      xhr.onerror = () => {
        currentXhr = null;
        reject(new Error(tt("err.netDuringUpload", "Netzwerk-Fehler während Upload")));
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
      return d + (d === 1 ? tt("ui.retention.day", " Tag") : tt("ui.retention.days", " Tage"));
    }
    return hours + (hours === 1 ? tt("ui.retention.hour", " Stunde") : tt("ui.retention.hours", " Stunden"));
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
          emailError.textContent = tt("err.confirmPrivacy", "Bitte Datenschutzhinweise bestätigen.");
          emailError.classList.remove("hidden");
          return;
        }
        if (!/.+@.+\..+/.test(email)) {
          emailError.textContent = tt("err.invalidEmail", "Bitte eine gültige E-Mail angeben.");
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
          if (res.status === 429) throw new Error(tt("err.tooManyRequests", "Zu viele Anfragen — kurz warten."));
          if (!res.ok) throw new Error("HTTP " + res.status);
          localStorage.setItem(EMAIL_KEY, email);
          cleanup(); hideEmailGate(); resolve(true);
        } catch (err) {
          emailError.textContent = tt("err.genericPrefix", "Fehler: ") + (err.message || err);
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
      showError(tt("err.tooBig", "Zu groß: {size} (Max {max} pro Drop)", { size: fmtBytes(total), max: fmtBytes(MAX) }));
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
        throw new Error(tt("err.afterBundle", "Nach Bündelung {size} — Max {max}", { size: fmtBytes(blob.size), max: fmtBytes(MAX) }));
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

        setProgress(12, tt("ui.progress.requestUrl", "// Signed-URL anfordern …"));
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
        if (r.status === 429) throw new Error(tt("err.tooManyUploadsRetry", "Zu viele Uploads — kurz warten und nochmal."));
        if (!r.ok) throw new Error(tt("err.apiError", "API-Fehler (HTTP {n})", { n: r.status }));
        const payload = await r.json();

        await putWithProgress(payload.url, encrypted, (frac) => {
          const pct = 12 + Math.round(frac * 83);
          setProgress(pct, "// Upload " + (frac * 100).toFixed(1) + "%");
        });

        // Server-side confirm: the drop only becomes downloadable once the
        // API has verified the object really exists on Storj. Catches silent
        // upload failures (e.g. storage-side 403) before we hand out a link.
        setProgress(96, tt("ui.progress.confirming", "// Upload bestätigen …"));
        let confirmRes = await fetch(API + "/drops/" + payload.id + "/confirm", {
          method: "POST",
          credentials: "include",
        });
        if (confirmRes.status === 409) {
          await new Promise((res) => setTimeout(res, 1500));
          confirmRes = await fetch(API + "/drops/" + payload.id + "/confirm", {
            method: "POST",
            credentials: "include",
          });
        }
        if (!confirmRes.ok) {
          throw new Error(tt("err.confirmFailed", "Upload konnte nicht bestätigt werden (HTTP {n}) — die Datei ist nicht sicher angekommen. Bitte erneut versuchen.", { n: confirmRes.status }));
        }

        dropId = payload.id;
        rawKey = k;
        ctByteCount = encrypted.length;
      }

      setProgress(100, tt("ui.progress.done", "// fertig"));

      const keyB64 = u8ToB64Url(rawKey);
      const nameB64 = u8ToB64Url(new TextEncoder().encode(name));
      // v=3 binds total_chunks (t) and total_size (s) into each chunk's AAD —
      // recipients refuse to accept a stream that's missing trailing chunks
      // or that ends short. Legacy v=2 links keep working unchanged.
      const numChunks = useChunked ? Math.ceil(blob.size / CHUNK_SIZE) : 0;
      const share = location.origin + "/d/" + dropId + "#k=" + keyB64 + "&n=" + nameB64 +
        (useChunked
          ? "&v=3&c=" + CHUNK_SIZE + "&t=" + numChunks + "&s=" + blob.size
          : "");

      shareUrlEl.value = share;
      metaEl.textContent =
        (bundled ? tt("ui.meta.files", "{n} Dateien · ", { n: files.length }) : tt("ui.meta.oneFile", "1 Datei · ")) +
        fmtBytes(ctByteCount) + " " + tt("ui.meta.encrypted", "verschlüsselt") + " · " +
        (useChunked ? "chunked · " : "") +
        tt("ui.meta.available", "verfügbar ") + fmtRetention(retentionHours) +
        (burn ? " · 🔥 Burn-after-Read" : "");
      renderQR(share);
      result.classList.remove("hidden");

      // Save drop metadata to sessionStorage (per wallet) so the dashboard
      // can show the filename and a working share link within this tab session.
      // Intentional NOT localStorage: share_link contains the AES key in its
      // URL fragment — persisting it across tab/browser sessions would defeat
      // the "we see nothing" guarantee against a compromised device disk.
      try {
        const meRes = await fetch("/api/me", { credentials: "include" });
        if (meRes.ok) {
          const me = await meRes.json();
          if (me.address) {
            const key = "dwinity_drop_meta_" + me.address.toLowerCase();
            const store = JSON.parse(sessionStorage.getItem(key) || "{}");
            store[dropId] = { filename: name, share_link: share, ts: Date.now() };
            sessionStorage.setItem(key, JSON.stringify(store));
          }
        }
      } catch {}
    } catch (err) {
      if (err && err.aborted) {
        showError(tt("err.abortedNoData", "// abgebrochen · keine Daten auf Storj"));
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
      copyBtn.textContent = tt("ui.copy.done", "✓ kopiert");
      setTimeout(() => (copyBtn.textContent = tt("ui.copy.label", "Link kopieren")), 1500);
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
  let LAST_ME = null;

  function applyLimits(me) {
    MAX = me.max_size;
    MAX_RETENTION_HOURS = me.max_retention_hours;
    IS_PRO = !!me.pro;
    LAST_ME = me;

    const t = (key, fallback) => {
      const v = window.DDI18n && window.DDI18n.t && window.DDI18n.t(key);
      return v && v !== key ? v : fallback;
    };

    // Dropzone hint text
    const hint = zone.querySelector(".text-white\\/50.text-sm.mb-6");
    if (hint) {
      hint.textContent = me.proplus
        ? t("drop.meta.proplus", "bis 5 GB (Pro+) · Verschlüsselung im Browser · mehrere Dateien → ZIP")
        : IS_PRO
        ? t("drop.meta.pro", "bis 2 GB (Pro) · Verschlüsselung im Browser · mehrere Dateien → ZIP")
        : t("drop.meta.free", "bis 100 MB · Verschlüsselung im Browser · Pro = bis 2 GB · mehrere Dateien → ZIP");
    }

    // Retention <select>: gate 720h (Pro) and 2160h (Pro+) options by tier
    const gateOption = (value, key, lockedFallback, unlockedFallback) => {
      const opt = retentionSel.querySelector('option[value="' + value + '"]');
      if (!opt) return;
      const unlocked = MAX_RETENTION_HOURS >= value;
      opt.disabled = !unlocked;
      opt.textContent = unlocked
        ? t(key + ".unlocked", unlockedFallback)
        : t(key, lockedFallback);
    };
    gateOption(720, "drop.expire.30d", "30 Tage (Pro)", "30 Tage");
    gateOption(2160, "drop.expire.90d", "90 Tage (Pro+)", "90 Tage");

    if (parseInt(retentionSel.value, 10) > MAX_RETENTION_HOURS) {
      retentionSel.value = String(MAX_RETENTION_HOURS);
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
  // Re-apply tier-specific texts after a language switch (applyAll resets
  // the data-i18n options/hint to their locked base labels).
  window.addEventListener("dd:lang-changed", () => { if (LAST_ME) applyLimits(LAST_ME); });
  loadLimits();
})();
(window.DDI18n ? (x) => window.DDI18n.register(x) : (x) => (window.__DDI18N_PENDING = window.__DDI18N_PENDING || []).push(x))({ en: {
  "err.afterBundle": "After bundling {size} — max {max}",
  "err.abortedNoData": "// cancelled · no data on Storj",
} });
