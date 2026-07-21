// Signs the extension into the child's Trust Shield / Lovable Cloud account.
const SUPABASE_URL = "https://ewuaaaidxngjnjjkxfjo.supabase.co";
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV3dWFhYWlkeG5nam5qamt4ZmpvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQyMDY4MDcsImV4cCI6MjA5OTc4MjgwN30.xOZdxZNd1wWsvIsyz0E5j5f1T_xVYg52u29eYeGH6a0";

async function childEmailFor(parentEmail) {
  const norm = parentEmail.trim().toLowerCase();
  const bytes = new TextEncoder().encode(`trustshield-child:${norm}`);
  const hashBuf = await crypto.subtle.digest("SHA-256", bytes);
  const hex = Array.from(new Uint8Array(hashBuf)).slice(0, 8)
    .map((b) => b.toString(16).padStart(2, "0")).join("");
  return `ts-child-${hex}@trustshield.family`;
}

function setStatus(msg, cls) {
  const el = document.getElementById("status");
  el.textContent = msg || "";
  el.className = "status " + (cls || "");
}

async function refreshView() {
  const { ts_session } = await chrome.storage.local.get("ts_session");
  const signedIn = !!ts_session?.access_token;
  document.getElementById("signIn").style.display = signedIn ? "none" : "block";
  document.getElementById("signedIn").style.display = signedIn ? "block" : "none";
  if (signedIn) {
    document.getElementById("whoami").textContent = ts_session.child_email || ts_session.user_id || "";
    document.getElementById("parentEmail").textContent = ts_session.parent_email || "";
  }
}

document.getElementById("pair").addEventListener("click", async () => {
  const pEmail = document.getElementById("pemail").value.trim().toLowerCase();
  const pPass = document.getElementById("ppass").value;
  if (!pEmail || !pPass) { setStatus("Enter both fields.", "err"); return; }
  setStatus("Signing in…", "muted");
  try {
    const cEmail = await childEmailFor(pEmail);
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "apikey": SUPABASE_ANON },
      body: JSON.stringify({ email: cEmail, password: pPass }),
    });
    const j = await res.json();
    if (!res.ok) throw new Error(j.error_description || j.msg || j.error || "Sign-in failed");
    await chrome.storage.local.set({
      ts_session: {
        access_token: j.access_token,
        refresh_token: j.refresh_token,
        expires_at: (j.expires_at ?? (Math.floor(Date.now()/1000) + (j.expires_in ?? 3600))) * 1000,
        user_id: j.user?.id,
        child_email: cEmail,
        parent_email: pEmail,
      },
    });
    setStatus("Paired! Trust Shield now protects this browser.", "ok");
    chrome.runtime.sendMessage({ type: "ts-session-updated" });
    refreshView();
  } catch (e) {
    setStatus(e.message || "Could not sign in.", "err");
  }
});

document.getElementById("signOut").addEventListener("click", async () => {
  await chrome.storage.local.remove(["ts_session", "ts_banned_hosts"]);
  refreshView();
});

refreshView();