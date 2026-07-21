const params = new URLSearchParams(location.search);
const target = params.get("url") || "";
const risk = parseInt(params.get("risk") || "0", 10);
let reasons = [];
try { reasons = JSON.parse(params.get("reasons") || "[]"); } catch {}
const blocked = params.get("blocked") === "1";
const parentBanned = params.get("parentBanned") === "1";

let host = "";
try { host = new URL(target).hostname; } catch {}

document.getElementById("url").textContent = target;
document.getElementById("riskNum").textContent = risk + "/100";
document.getElementById("fill").style.width = Math.max(10, risk) + "%";
if (parentBanned) document.getElementById("title").textContent = "Your parent banned this website";
else if (blocked) document.getElementById("title").textContent = "You blocked this site earlier";

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
  // Ask the background to navigate this tab back to safety in one click.
  chrome.runtime.sendMessage({ type: "go-back" }, () => {
    // Fallback if messaging fails.
    if (chrome.runtime.lastError) {
      try { history.go(-1); } catch { location.href = "about:blank"; }
    }
  });
});

document.getElementById("allowOnce").addEventListener("click", async () => {
  const resp = await chrome.runtime.sendMessage({ type: "allow-always", host });
  if (resp && resp.ok === false && resp.reason === "parent_banned") {
    alert("Your parent has banned this website. Ask them to unban it in Trust Shield.");
    return;
  }
  location.href = target;
});

document.getElementById("allowAlways").addEventListener("click", async () => {
  const resp = await chrome.runtime.sendMessage({ type: "allow-always", host });
  if (resp && resp.ok === false && resp.reason === "parent_banned") {
    alert("Your parent has banned this website. Ask them to unban it in Trust Shield.");
    return;
  }
  location.href = target;
});