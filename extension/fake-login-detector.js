// Trust Shield — Fake login page detector
// Flags likely phishing / fake sign-in pages using local heuristics.
(function () {
  if (window.top !== window) return; // top frame only
  if (document.getElementById("__trust_shield_fake_login_banner__")) return;

  const BRANDS = [
    { key: "paypal",    legit: ["paypal.com"] },
    { key: "google",    legit: ["google.com", "gmail.com", "youtube.com", "googleusercontent.com"] },
    { key: "gmail",     legit: ["google.com", "gmail.com"] },
    { key: "apple",     legit: ["apple.com", "icloud.com"] },
    { key: "icloud",    legit: ["apple.com", "icloud.com"] },
    { key: "microsoft", legit: ["microsoft.com", "live.com", "office.com", "outlook.com", "microsoftonline.com"] },
    { key: "outlook",   legit: ["microsoft.com", "live.com", "outlook.com"] },
    { key: "office365", legit: ["microsoft.com", "office.com", "microsoftonline.com"] },
    { key: "facebook",  legit: ["facebook.com", "fb.com", "messenger.com"] },
    { key: "instagram", legit: ["instagram.com"] },
    { key: "whatsapp",  legit: ["whatsapp.com"] },
    { key: "amazon",    legit: ["amazon.com", "amazon.co.uk", "amazon.ca", "amazon.de", "amazon.fr"] },
    { key: "netflix",   legit: ["netflix.com"] },
    { key: "chase",     legit: ["chase.com"] },
    { key: "wellsfargo",legit: ["wellsfargo.com"] },
    { key: "bankofamerica", legit: ["bankofamerica.com", "bofa.com"] },
    { key: "coinbase",  legit: ["coinbase.com"] },
    { key: "binance",   legit: ["binance.com", "binance.us"] },
    { key: "metamask",  legit: ["metamask.io"] },
    { key: "github",    legit: ["github.com"] },
    { key: "linkedin",  legit: ["linkedin.com"] },
    { key: "dropbox",   legit: ["dropbox.com"] },
  ];
  const BAD_TLDS = [".tk",".ml",".ga",".cf",".gq",".xyz",".top",".zip",".mov",".click",".country",".work",".fit"];

  function hostRoot(h) { return h.toLowerCase().replace(/^www\./, ""); }
  function endsWithHost(h, root) { return h === root || h.endsWith("." + root); }
  function isIP(h) { return /^\d{1,3}(\.\d{1,3}){3}$/.test(h) || h.includes(":"); }

  function pageHasPassword() {
    return !!document.querySelector('input[type="password"]:not([disabled]):not([readonly])');
  }

  function analyze() {
    const reasons = [];
    const host = hostRoot(location.hostname);
    const proto = location.protocol;
    let severity = 0;

    if (!pageHasPassword()) return null;

    if (proto !== "https:") {
      reasons.push("Login form on an unencrypted (HTTP) page — credentials would be sent in plain text.");
      severity += 3;
    }
    if (isIP(location.hostname)) {
      reasons.push("Site is served from a raw IP address instead of a real domain.");
      severity += 3;
    }
    if (host.startsWith("xn--") || host.includes(".xn--")) {
      reasons.push("Domain uses punycode, which is often used to spoof real brands.");
      severity += 3;
    }
    for (const tld of BAD_TLDS) {
      if (host.endsWith(tld)) { reasons.push(`Uses a high-risk top-level domain (${tld}).`); severity += 2; break; }
    }
    if ((host.match(/-/g) || []).length >= 3) {
      reasons.push("Domain contains an unusual number of hyphens, common in spoofed URLs.");
      severity += 1;
    }
    if (host.split(".").length >= 5) {
      reasons.push("Domain has an unusually long chain of subdomains.");
      severity += 1;
    }

    // Brand impersonation: brand keyword appears somewhere but real brand domain is NOT the root.
    const fullHost = location.hostname.toLowerCase();
    for (const b of BRANDS) {
      if (fullHost.includes(b.key)) {
        const legit = b.legit.some((d) => endsWithHost(host, d));
        if (!legit) {
          reasons.push(`Page mentions "${b.key}" in its address but isn't on an official ${b.key} domain.`);
          severity += 4;
          break;
        }
      }
    }

    // Page contents impersonate a brand not matching the host.
    try {
      const text = (document.title + " " + (document.body ? document.body.innerText.slice(0, 4000) : "")).toLowerCase();
      for (const b of BRANDS) {
        if (text.includes("sign in to " + b.key) || text.includes("log in to " + b.key) ||
            text.includes(b.key + " account") || text.includes(b.key + " login")) {
          const legit = b.legit.some((d) => endsWithHost(host, d));
          if (!legit) {
            reasons.push(`Page claims to be ${b.key} sign-in but the domain isn't official.`);
            severity += 4;
            break;
          }
        }
      }
    } catch {}

    // Form posts credentials to a different origin.
    try {
      const pw = document.querySelector('input[type="password"]');
      const form = pw && pw.form;
      if (form && form.action) {
        const a = new URL(form.action, location.href);
        if (a.origin !== location.origin) {
          reasons.push("Password form submits to a different website than the one you're on.");
          severity += 3;
        }
        if (a.protocol === "http:") {
          reasons.push("Password form submits over unencrypted HTTP.");
          severity += 3;
        }
      }
    } catch {}

    if (severity < 3 || reasons.length === 0) return null;
    return { severity, reasons };
  }

  function showBanner(result) {
    if (document.getElementById("__trust_shield_fake_login_banner__")) return;
    chrome.storage.local.get({ fakeLoginDismissed: {} }, ({ fakeLoginDismissed }) => {
      const key = location.hostname;
      const last = fakeLoginDismissed[key] || 0;
      if (Date.now() - last < 1000 * 60 * 60 * 6) return; // 6h snooze per host

      const bar = document.createElement("div");
      bar.id = "__trust_shield_fake_login_banner__";
      bar.style.cssText =
        "position:fixed;z-index:2147483647;top:16px;left:50%;transform:translateX(-50%);" +
        "max-width:520px;width:calc(100% - 32px);" +
        "background:#7f1d1d;color:#fff;border:1px solid #ef4444;border-radius:14px;" +
        "padding:14px 16px;font:13px/1.45 -apple-system,system-ui,sans-serif;" +
        "box-shadow:0 12px 40px rgba(0,0,0,.5);";
      const list = result.reasons.map((r) => `<li style="margin:2px 0;">${r}</li>`).join("");
      bar.innerHTML =
        '<div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;">' +
        '<span style="width:24px;height:24px;border-radius:6px;background:#ef4444;display:inline-flex;align-items:center;justify-content:center;font-weight:700;">⚠</span>' +
        '<b style="font-size:14px;">Possible fake login page</b></div>' +
        '<div style="color:#fee2e2;margin-bottom:6px;">Trust Shield detected signs this sign-in page may be phishing:</div>' +
        `<ul style="margin:0 0 10px 18px;padding:0;color:#fecaca;">${list}</ul>` +
        '<div style="display:flex;gap:8px;justify-content:flex-end;">' +
        '<button id="__ts_fl_dismiss__" style="background:transparent;color:#fecaca;border:1px solid #fecaca;border-radius:8px;padding:6px 10px;cursor:pointer;">Dismiss</button>' +
        '<button id="__ts_fl_back__" style="background:#fff;color:#7f1d1d;border:0;border-radius:8px;padding:6px 12px;cursor:pointer;font-weight:600;">Go back</button>' +
        '</div>';
      document.documentElement.appendChild(bar);
      document.getElementById("__ts_fl_dismiss__").onclick = () => {
        fakeLoginDismissed[key] = Date.now();
        chrome.storage.local.set({ fakeLoginDismissed });
        bar.remove();
      };
      document.getElementById("__ts_fl_back__").onclick = () => {
        try { history.length > 1 ? history.back() : (location.href = "about:blank"); } catch { location.href = "about:blank"; }
      };
    });
  }

  function run() {
    const r = analyze();
    if (r) showBanner(r);
  }

  // Initial pass + watch for late-rendered login forms (SPAs).
  run();
  let tries = 0;
  const mo = new MutationObserver(() => {
    if (tries++ > 40) { mo.disconnect(); return; }
    run();
  });
  try { mo.observe(document.documentElement, { childList: true, subtree: true }); } catch {}
  setTimeout(() => mo.disconnect(), 20000);
})();
