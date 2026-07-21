const SUPABASE_URL = "https://ewuaaaidxngjnjjkxfjo.supabase.co";
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV3dWFhYWlkeG5nam5qamt4ZmpvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQyMDY4MDcsImV4cCI6MjA5OTc4MjgwN30.xOZdxZNd1wWsvIsyz0E5j5f1T_xVYg52u29eYeGH6a0";

const toggle = document.getElementById("toggle");
const scannedEl = document.getElementById("scanned");
const warnedEl = document.getElementById("warned");
const allowCount = document.getElementById("allowCount");

function askParent(desc) {
  return new Promise((resolve) => {
    const modal = document.getElementById("lockModal");
    const emailEl = document.getElementById("lockEmail");
    const passEl = document.getElementById("lockPass");
    const statusEl = document.getElementById("lockStatus");
    const confirm = document.getElementById("lockConfirm");
    const cancel = document.getElementById("lockCancel");
    document.getElementById("lockDesc").textContent = desc;
    emailEl.value = ""; passEl.value = ""; statusEl.textContent = "";
    modal.style.display = "flex";
    const close = (ok) => { modal.style.display = "none"; confirm.onclick = null; cancel.onclick = null; resolve(ok); };
    cancel.onclick = () => close(false);
    confirm.onclick = async () => {
      const email = emailEl.value.trim().toLowerCase();
      const password = passEl.value;
      if (!email || !password) { statusEl.textContent = "Enter parent email and password."; return; }
      statusEl.textContent = "Checking…";
      confirm.disabled = true;
      try {
        const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "apikey": SUPABASE_ANON },
          body: JSON.stringify({ email, password }),
        });
        if (!res.ok) { statusEl.textContent = "Wrong email or password."; confirm.disabled = false; return; }
        close(true);
      } catch {
        statusEl.textContent = "Network error. Try again.";
        confirm.disabled = false;
      }
    };
  });
}

async function render() {
  const { enabled = true, stats = { scanned: 0, warned: 0 }, allowlist = [] } =
    await chrome.storage.local.get(["enabled","stats","allowlist"]);
  toggle.classList.toggle("on", !!enabled);
  scannedEl.textContent = stats.scanned || 0;
  warnedEl.textContent = stats.warned || 0;
  allowCount.textContent = `${allowlist.length} site${allowlist.length === 1 ? "" : "s"} allowed`;
}

toggle.addEventListener("click", async () => {
  const { enabled = true } = await chrome.storage.local.get("enabled");
  if (enabled) {
    const ok = await askParent("Turning off protection needs a parent. Enter your parent's Trust Shield email and password.");
    if (!ok) return;
  }
  await chrome.storage.local.set({ enabled: !enabled });
  render();
});

document.getElementById("clear").addEventListener("click", async () => {
  await chrome.storage.local.set({ allowlist: [], stats: { scanned: 0, warned: 0 } });
  render();
});

async function renderAutofill() {
  const { autofill } = await chrome.storage.local.get("autofill");
  const status = document.getElementById("autofillStatus");
  const n = autofill && Array.isArray(autofill.items) ? autofill.items.length : 0;
  status.textContent = n ? `${n} autofill entr${n === 1 ? "y" : "ies"} synced.` : "No autofill entries yet.";
}

document.getElementById("saveAutofill").addEventListener("click", async () => {
  const el = document.getElementById("autofillInput");
  const raw = (el.value || "").trim();
  const status = document.getElementById("autofillStatus");
  if (!raw) { status.textContent = "Paste the copied data first."; return; }
  try {
    const parsed = JSON.parse(raw);
    if (parsed.kind !== "trust-shield-autofill" || !Array.isArray(parsed.items)) throw new Error("bad");
    await chrome.storage.local.set({ autofill: { items: parsed.items, synced_at: Date.now() } });
    el.value = "";
    status.textContent = `Saved ${parsed.items.length} entr${parsed.items.length === 1 ? "y" : "ies"}. Reload target sites.`;
  } catch {
    status.textContent = "Couldn't read that. Copy again from Trust Shield.";
  }
});

document.getElementById("clearAutofill").addEventListener("click", async () => {
  await chrome.storage.local.remove("autofill");
  renderAutofill();
});

render();
renderAutofill();