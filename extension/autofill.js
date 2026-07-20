// Trust Shield — autofill content script
// Fills saved credentials into login forms on sites the user set up in the vault.

(function () {
  const origin = location.origin;
  const href = location.href;

  function hostMatches(entryUrl) {
    try {
      const u = new URL(entryUrl);
      const eh = u.hostname.toLowerCase().replace(/^www\./, "");
      const ph = location.hostname.toLowerCase().replace(/^www\./, "");
      return eh === ph || ph.endsWith("." + eh);
    } catch { return false; }
  }

  function findFields() {
    const pw = document.querySelector('input[type="password"]:not([disabled]):not([readonly])');
    if (!pw) return null;
    let user = null;
    const forms = pw.form ? [pw.form] : [document];
    for (const scope of forms) {
      user = scope.querySelector(
        'input[type="email"], input[type="text"][name*="user" i], input[type="text"][name*="email" i], input[type="text"][id*="user" i], input[type="text"][id*="email" i], input[autocomplete="username"], input[autocomplete="email"]'
      );
      if (user) break;
    }
    if (!user) {
      const inputs = Array.from(document.querySelectorAll('input')).filter(
        (i) => i !== pw && !i.disabled && !i.readOnly &&
          (i.type === "text" || i.type === "email" || i.type === "")
      );
      user = inputs[0] || null;
    }
    return { user, pw };
  }

  function setNative(el, value) {
    const proto = Object.getPrototypeOf(el);
    const desc = Object.getOwnPropertyDescriptor(proto, "value");
    if (desc && desc.set) desc.set.call(el, value);
    else el.value = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function ensureBanner(match, fields) {
    if (document.getElementById("__trust_shield_autofill_banner__")) return;
    const bar = document.createElement("div");
    bar.id = "__trust_shield_autofill_banner__";
    bar.style.cssText =
      "position:fixed;z-index:2147483647;bottom:16px;right:16px;max-width:320px;" +
      "background:#0f172a;color:#e2e8f0;border:1px solid #1e40af;border-radius:12px;" +
      "padding:12px 14px;font:13px/1.4 -apple-system,system-ui,sans-serif;" +
      "box-shadow:0 10px 30px rgba(0,0,0,.45);";
    bar.innerHTML =
      '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">' +
      '<span style="width:22px;height:22px;border-radius:6px;background:linear-gradient(135deg,#3b82f6,#1d4ed8);display:inline-flex;align-items:center;justify-content:center;font-weight:700;">🛡</span>' +
      '<b>Trust Shield autofill</b></div>' +
      '<div style="color:#94a3b8;margin-bottom:8px;">Fill saved credentials for <b style="color:#e2e8f0">' +
      (match.label || match.url) + '</b>?</div>' +
      '<div style="display:flex;gap:8px;justify-content:flex-end;">' +
      '<button id="__ts_af_no__" style="background:transparent;color:#94a3b8;border:1px solid #334155;border-radius:8px;padding:6px 10px;cursor:pointer;">Not now</button>' +
      '<button id="__ts_af_yes__" style="background:#3b82f6;color:#fff;border:0;border-radius:8px;padding:6px 12px;cursor:pointer;">Autofill</button>' +
      '</div>';
    document.documentElement.appendChild(bar);
    document.getElementById("__ts_af_no__").onclick = () => bar.remove();
    document.getElementById("__ts_af_yes__").onclick = () => {
      const f = findFields();
      if (f && f.pw) {
        if (f.user && match.username) setNative(f.user, match.username);
        setNative(f.pw, match.password);
      }
      bar.remove();
    };
  }

  async function run() {
    try {
      const { autofill } = await chrome.storage.local.get("autofill");
      const items = autofill && Array.isArray(autofill.items) ? autofill.items : [];
      if (!items.length) return;
      const match = items.find((e) => e.url && hostMatches(e.url));
      if (!match) return;

      const check = () => {
        const f = findFields();
        if (f && f.pw) ensureBanner(match, f);
      };
      check();
      const mo = new MutationObserver(() => check());
      mo.observe(document.documentElement, { childList: true, subtree: true });
      setTimeout(() => mo.disconnect(), 15000);
    } catch {}
  }
  run();
})();