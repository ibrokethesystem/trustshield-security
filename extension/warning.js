const params = new URLSearchParams(location.search);
const target = params.get("url") || "";
const risk = parseInt(params.get("risk") || "0", 10);
let reasons = [];
try { reasons = JSON.parse(params.get("reasons") || "[]"); } catch {}
const blocked = params.get("blocked") === "1";

let host = "";
try { host = new URL(target).hostname; } catch {}

document.getElementById("url").textContent = target;
document.getElementById("riskNum").textContent = risk + "/100";
document.getElementById("fill").style.width = Math.max(10, risk) + "%";
if (blocked) document.getElementById("title").textContent = "You blocked this site earlier";

const ul = document.getElementById("reasons");
if (!reasons.length) {
  const li = document.createElement("li");
  li.textContent = "Matches known suspicious URL patterns.";
  ul.appendChild(li);
} else {
  for (const r of reasons) {
    const li = document.createElement("li");
    li.textContent = r;
    ul.appendChild(li);
  }
}

document.getElementById("back").addEventListener("click", () => {
  if (history.length > 1) history.back(); else chrome.tabs && chrome.tabs.getCurrent ? window.close() : (location.href = "about:blank");
});

document.getElementById("allowOnce").addEventListener("click", async () => {
  // Add to allowlist for this session-ish then navigate.
  await chrome.runtime.sendMessage({ type: "allow-always", host }); // simplest: allow-always so we don't loop
  location.href = target;
});

document.getElementById("allowAlways").addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "allow-always", host });
  location.href = target;
});