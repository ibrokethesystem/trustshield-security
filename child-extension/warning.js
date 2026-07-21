const SUPABASE_URL = "https://ewuaaaidxngjnjjkxfjo.supabase.co";
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV3dWFhYWlkeG5nam5qamt4ZmpvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQyMDY4MDcsImV4cCI6MjA5OTc4MjgwN30.xOZdxZNd1wWsvIsyz0E5j5f1T_xVYg52u29eYeGH6a0";

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

if (parentBanned) {
  document.getElementById("icon").textContent = "🚫";
  document.getElementById("title").textContent = "This site is blocked";
  document.getElementById("sub").textContent = "A parent has blocked this website. You can ask for permission to visit it, or go back to safety.";
  // Hide risk bar for parent-banned sites; the reason is the block itself.
  document.getElementById("riskRow").style.display = "none";
  // Hide "continue with an adult" for parent-banned sites — only a parent can unblock.
  document.getElementById("allowOnce").style.display = "none";
} else {
  // Only show "Ask for permission" for parent-banned sites.
  document.getElementById("askPerm").style.display = "none";
  if (blocked) document.getElementById("title").textContent = "You blocked this site earlier";
}

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

async function getChildSession() {
  const { ts_session } = await chrome.storage.local.get("ts_session");
  return ts_session || null;
}

document.getElementById("askPerm").addEventListener("click", async () => {
  const btn = document.getElementById("askPerm");
  const status = document.getElementById("askStatus");
  btn.disabled = true;
  status.style.color = "#fca5a5";
  status.textContent = "Sending request to your parent…";
  const s = await getChildSession();
  if (!s?.access_token || !s?.user_id) {
    status.textContent = "Sign in to Trust Shield Child Edition first (open the extension popup).";
    btn.disabled = false;
    return;
  }
  try {
    // Look up this child's parent_id so the insert satisfies the NOT NULL column.
    const linkRes = await fetch(
      `${SUPABASE_URL}/rest/v1/child_links?select=parent_id&child_id=eq.${s.user_id}&deleted_at=is.null&limit=1`,
      {
        headers: {
          "apikey": SUPABASE_ANON,
          "Authorization": `Bearer ${s.access_token}`,
        },
      }
    );
    if (!linkRes.ok) throw new Error(await linkRes.text());
    const links = await linkRes.json();
    const parent_id = Array.isArray(links) && links[0]?.parent_id;
    if (!parent_id) {
      status.textContent = "Couldn't find your parent account. Ask them to re-link your device.";
      btn.disabled = false;
      return;
    }
    const res = await fetch(`${SUPABASE_URL}/rest/v1/permission_requests`, {
      method: "POST",
      headers: {
        "apikey": SUPABASE_ANON,
        "Authorization": `Bearer ${s.access_token}`,
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
      },
      body: JSON.stringify({
        parent_id,
        child_id: s.user_id,
        kind: "unblock_site",
        note: host,
        status: "pending",
      }),
    });
    if (!res.ok) throw new Error(await res.text());
    status.style.color = "#86efac";
    status.textContent = `✅ Sent! Your parent has been asked to unblock ${host}.`;
  } catch (e) {
    status.textContent = "Couldn't send the request. Try again in a moment.";
    btn.disabled = false;
  }
});