// Signs the extension into the child's Trust Shield / Lovable Cloud account.
const SUPABASE_URL = "https://ewuaaaidxngjnjjkxfjo.supabase.co";
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV3dWFhYWlkeG5nam5qamt4ZmpvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQyMDY4MDcsImV4cCI6MjA5OTc4MjgwN30.xOZdxZNd1wWsvIsyz0E5j5f1T_xVYg52u29eYeGH6a0";

function childLabelSlug(label) {
  return (label || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
}

async function childEmailFor(parentEmail, label = "") {
  const parentNorm = parentEmail.trim().toLowerCase();
  const labelNorm = childLabelSlug(label);
  const seed = labelNorm
    ? `trustshield-child:${parentNorm}::${labelNorm}`
    : `trustshield-child:${parentNorm}`;
  const bytes = new TextEncoder().encode(seed);
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
  const cName = document.getElementById("cname")?.value || "";
  const pPass = document.getElementById("ppass").value;
  if (!pEmail || !pPass) { setStatus("Enter both fields.", "err"); return; }
  setStatus("Signing in…", "muted");
  try {
    // Try derivation WITH the provided name first, then fall back to the
    // legacy no-name derivation for accounts made before multi-child support.
    const emailsToTry = [];
    if (cName.trim()) emailsToTry.push(await childEmailFor(pEmail, cName));
    emailsToTry.push(await childEmailFor(pEmail, ""));

    let res, j, cEmail;
    for (const candidate of emailsToTry) {
      cEmail = candidate;
      res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "apikey": SUPABASE_ANON },
        body: JSON.stringify({ email: cEmail, password: pPass }),
      });
      j = await res.json();
      if (res.ok) break;
    }
    if (!res.ok) {
      const detail = j?.error_description || j?.msg || j?.error || "Sign-in failed";
      // Make the common case (wrong name) obvious.
      throw new Error(
        /invalid/i.test(detail)
          ? "Wrong parent email, name, or password. Ask your parent which name they set."
          : detail
      );
    }
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