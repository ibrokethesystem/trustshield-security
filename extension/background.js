// Trust Shield — background service worker
// Intercepts top-frame navigations and warns before loading suspicious URLs.

const SUSPICIOUS_TLDS = [
  "zip","mov","xyz","top","tk","ml","ga","cf","gq","click","country","kim","work","loan","review","science","party"
];
const SHORTENERS = ["bit.ly","tinyurl.com","t.co","goo.gl","ow.ly","is.gd","buff.ly","cutt.ly","rebrand.ly","shorte.st"];
const BRAND_KEYWORDS = ["paypal","apple","microsoft","amazon","google","facebook","instagram","netflix","chase","wellsfargo","bankofamerica","coinbase","binance","usps","ups","fedex","dhl","irs"];
const RISKY_PATH_WORDS = ["login","verify","secure","account","update","confirm","wallet","gift","prize","free","password","signin","unlock"];

// Trust Shield hosted rating endpoint (VirusTotal-backed).
const RATING_ENDPOINT = "https://ewuaaaidxngjnjjkxfjo.supabase.co/functions/v1/rate-website";
const RATING_APIKEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV3dWFhYWlkeG5nam5qamt4ZmpvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQyMDY4MDcsImV4cCI6MjA5OTc4MjgwN30.xOZdxZNd1wWsvIsyz0E5j5f1T_xVYg52u29eYeGH6a0";
const ratingCache = new Map(); // host -> { rating, risk, ts }
const RATING_TTL_MS = 10 * 60 * 1000;

async function fetchWebsiteRating(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    const cached = ratingCache.get(host);
    if (cached && Date.now() - cached.ts < RATING_TTL_MS) return cached;
    // Rating endpoint now requires a Trust Shield user session. Skip when the
    // extension has no signed-in session cached in local storage.
    const { ts_session } = await chrome.storage.local.get("ts_session");
    if (!ts_session?.access_token) return null;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3500);
    const res = await fetch(RATING_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": RATING_APIKEY,
        "Authorization": `Bearer ${ts_session.access_token}`,
      },
      body: JSON.stringify({ url }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const j = await res.json();
    const out = {
      rating: j.rating || "unknown",
      risk: Number(j.risk_score || 0),
      malicious: Number(j.malicious || 0),
      suspicious: Number(j.suspicious || 0),
      ts: Date.now(),
    };
    ratingCache.set(host, out);
    return out;
  } catch { return null; }
}

const DEFAULTS = {
  enabled: true,
  allowlist: [],        // hostnames user allowed
  blocklist: [],        // hostnames user explicitly blocked
  stats: { scanned: 0, warned: 0 }
};

chrome.runtime.onInstalled.addListener(async () => {
  const cur = await chrome.storage.local.get(Object.keys(DEFAULTS));
  const patch = {};
  for (const k of Object.keys(DEFAULTS)) if (cur[k] === undefined) patch[k] = DEFAULTS[k];
  if (Object.keys(patch).length) await chrome.storage.local.set(patch);
});

function levenshtein(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) {
    dp[i][j] = a[i-1] === b[j-1]
      ? dp[i-1][j-1]
      : 1 + Math.min(dp[i-1][j-1], dp[i-1][j], dp[i][j-1]);
  }
  return dp[m][n];
}

function analyzeUrl(rawUrl) {
  let u;
  try { u = new URL(rawUrl); } catch { return { risk: 0, reasons: [] }; }
  const host = u.hostname.toLowerCase();
  const path = (u.pathname + u.search).toLowerCase();
  const reasons = [];
  let risk = 0;

  if (u.protocol === "http:") { risk += 20; reasons.push("Site does not use HTTPS encryption."); }

  // IP address hosts
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(host)) { risk += 40; reasons.push("URL uses a raw IP address instead of a domain name."); }

  // Punycode
  if (host.includes("xn--")) { risk += 35; reasons.push("Hostname uses punycode — can disguise look-alike domains."); }

  // Suspicious TLD
  const tld = host.split(".").pop();
  if (SUSPICIOUS_TLDS.includes(tld)) { risk += 25; reasons.push(`Uncommon or abuse-prone top-level domain (.${tld}).`); }

  // Shorteners
  if (SHORTENERS.includes(host)) { risk += 30; reasons.push("Link shortener hides the real destination."); }

  // Too many subdomains
  const parts = host.split(".");
  if (parts.length >= 5) { risk += 15; reasons.push("Unusually deep subdomain chain."); }

  // Brand impersonation
  const registrable = parts.slice(-2).join(".");
  const sld = parts.length >= 2 ? parts[parts.length - 2] : host;
  for (const brand of BRAND_KEYWORDS) {
    if (host.includes(brand) && !registrable.startsWith(brand + ".")) {
      risk += 30; reasons.push(`Contains the "${brand}" brand outside its real domain.`); break;
    }
    if (sld.length >= 4 && sld !== brand && levenshtein(sld, brand) === 1) {
      risk += 35; reasons.push(`Domain looks like a misspelling of "${brand}".`); break;
    }
  }

  // Risky path keywords
  const pathHits = RISKY_PATH_WORDS.filter(w => path.includes(w));
  if (pathHits.length) { risk += 10 + pathHits.length * 5; reasons.push("URL path uses credential-harvesting keywords (" + pathHits.slice(0,3).join(", ") + ")."); }

  // Dangerous file extensions
  if (/\.(exe|scr|msi|bat|cmd|zip|mov|js)(\?|$)/i.test(u.pathname)) {
    risk += 30; reasons.push("URL points to an executable or archive download.");
  }

  // @ symbol trick
  if (rawUrl.includes("@") && rawUrl.indexOf("@") < (rawUrl.indexOf("?") === -1 ? rawUrl.length : rawUrl.indexOf("?"))) {
    risk += 25; reasons.push("URL contains an '@' — can redirect to a different host than it appears.");
  }

  risk = Math.min(100, risk);
  return { risk, reasons, host };
}

async function getState() {
  return await chrome.storage.local.get(["enabled","allowlist","blocklist","stats"]);
}

function bumpStats(patch) {
  chrome.storage.local.get("stats").then(({ stats }) => {
    const s = stats || { scanned: 0, warned: 0 };
    for (const k in patch) s[k] = (s[k] || 0) + patch[k];
    chrome.storage.local.set({ stats: s });
  });
}

chrome.webNavigation.onBeforeNavigate.addListener(async (details) => {
  if (details.frameId !== 0) return; // top frame only
  const url = details.url;
  if (!/^https?:/i.test(url)) return;

  const state = await getState();
  if (!state.enabled) return;

  let host;
  try { host = new URL(url).hostname.toLowerCase(); } catch { return; }

  // Never intercept the warning page itself or the extension origin
  if (url.startsWith(chrome.runtime.getURL(""))) return;

  bumpStats({ scanned: 1 });

  if ((state.allowlist || []).includes(host)) return;

  const forceBlocked = (state.blocklist || []).includes(host);
  const { risk, reasons } = analyzeUrl(url);

  // Blend in VirusTotal-backed website rating from Trust Shield's API.
  const rating = await fetchWebsiteRating(url);
  let totalRisk = risk;
  const totalReasons = reasons.slice();
  if (rating) {
    totalRisk = Math.min(100, totalRisk + rating.risk);
    if (rating.rating === "malicious") {
      totalReasons.unshift(`VirusTotal: ${rating.malicious} security vendor(s) flagged this URL as malicious.`);
    } else if (rating.rating === "suspicious") {
      totalReasons.unshift(`VirusTotal: ${rating.suspicious} security vendor(s) flagged this URL as suspicious.`);
    }
  }

  if (forceBlocked || totalRisk >= 30 || rating?.rating === "malicious") {
    bumpStats({ warned: 1 });
    const warn = chrome.runtime.getURL("warning.html")
      + "?url=" + encodeURIComponent(url)
      + "&risk=" + totalRisk
      + "&reasons=" + encodeURIComponent(JSON.stringify(totalReasons))
      + "&blocked=" + (forceBlocked ? "1" : "0")
      + "&rating=" + encodeURIComponent(rating?.rating || "unknown");
    chrome.tabs.update(details.tabId, { url: warn });
  }
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    if (msg?.type === "allow-once" || msg?.type === "allow-always") {
      const { allowlist = [] } = await chrome.storage.local.get("allowlist");
      if (msg.type === "allow-always" && msg.host && !allowlist.includes(msg.host)) {
        allowlist.push(msg.host);
        await chrome.storage.local.set({ allowlist });
      }
      sendResponse({ ok: true });
    }
    if (msg?.type === "go-back") {
      const tabId = _sender.tab?.id;
      if (tabId != null) {
        try {
          await chrome.tabs.goBack(tabId);
        } catch {
          try { await chrome.tabs.update(tabId, { url: "about:blank" }); } catch {}
        }
      }
      sendResponse({ ok: true });
    }
  })();
  return true;
});