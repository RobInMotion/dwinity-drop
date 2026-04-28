(function () {
  // Capture ?ref=DW-XXXX from URL on any page, store in cookie for 30 days.
  // auth.js reads the cookie during SIWE login and sends it to the backend
  // for attribution. First-wins (backend doesn't override existing refs).
  //
  // Cookie is host-bound (no Domain= attr), SameSite=Lax, non-HttpOnly
  // because auth.js in the same origin needs to read it.

  const COOKIE_NAME = "dwid_ref";
  const COOKIE_MAX_AGE = 30 * 24 * 3600;  // 30 days

  function parseQuery() {
    const params = new URLSearchParams(location.search);
    return params.get("ref");
  }

  function setRefCookie(code) {
    const norm = (code || "").trim().toUpperCase();
    if (!norm || !/^[A-Z0-9_-]{3,32}$/.test(norm)) return;
    const secure = location.protocol === "https:" ? "; Secure" : "";
    document.cookie =
      `${COOKIE_NAME}=${encodeURIComponent(norm)}; Max-Age=${COOKIE_MAX_AGE}; Path=/; SameSite=Lax${secure}`;
  }

  function clearRefFromUrl() {
    // Remove the ref param from the URL bar so it's not shared further
    try {
      const url = new URL(location.href);
      if (url.searchParams.has("ref")) {
        url.searchParams.delete("ref");
        const newSearch = url.searchParams.toString();
        const newUrl = url.pathname + (newSearch ? "?" + newSearch : "") + url.hash;
        history.replaceState(null, "", newUrl);
      }
    } catch {}
  }

  const ref = parseQuery();
  if (ref) {
    setRefCookie(ref);
    clearRefFromUrl();
  }

  // Expose a reader for auth.js
  window.dwinityReadRef = function () {
    const match = document.cookie.match(/(?:^|;\s*)dwid_ref=([^;]+)/);
    return match ? decodeURIComponent(match[1]) : null;
  };
  window.dwinityClearRef = function () {
    document.cookie = "dwid_ref=; Max-Age=0; Path=/; SameSite=Lax";
  };
})();
