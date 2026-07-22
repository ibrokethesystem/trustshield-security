const SUPABASE_URL = "https://ewuaaaidxngjnjjkxfjo.supabase.co";
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV3dWFhYWlkeG5nam5qamt4ZmpvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQyMDY4MDcsImV4cCI6MjA5OTc4MjgwN30.xOZdxZNd1wWsvIsyz0E5j5f1T_xVYg52u29eYeGH6a0";

const params = new URLSearchParams(location.search);
const target = params.get("url") || "";
let host = "";
try { host = new URL(target).hostname; } catch {}
document.getElementById("url").textContent = host || target || "—";

async function getChildSession() {
  const { ts_session } = await chrome.storage.local.get("ts_session");
  return ts_session || null;
}

document.getElementById("cancel").addEventListener("click", () => {
  window.close();
});

document.getElementById("send").addEventListener("click", async () => {
  const btn = document.getElementById("send");
  const status = document.getElementById("status");
  const reason = (document.getElementById("reason").value || "").trim();
  status.classList.remove("ok");
  if (!reason) {
    status.textContent = "Please tell your parent why you want to visit this site.";
    return;
  }
  btn.disabled = true;
  status.textContent = "Sending request to your parent…";
  const s = await getChildSession();
  if (!s?.access_token || !s?.user_id) {
    status.textContent = "Sign in to Trust Shield Child Edition first (open the extension popup).";
    btn.disabled = false;
    return;
  }
  try {
    const linkRes = await fetch(
      `${SUPABASE_URL}/rest/v1/child_links?select=parent_id&child_id=eq.${s.user_id}&deleted_at=is.null&limit=1`,
      { headers: { "apikey": SUPABASE_ANON, "Authorization": `Bearer ${s.access_token}` } }
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
        note: `${host}\n${reason}`,
        status: "pending",
      }),
    });
    if (!res.ok) throw new Error(await res.text());
    status.classList.add("ok");
    status.textContent = `✅ Sent! Your parent has been asked to unblock ${host}. You can close this tab.`;
  } catch (e) {
    status.textContent = "Couldn't send the request. Try again in a moment.";
    btn.disabled = false;
  }
});