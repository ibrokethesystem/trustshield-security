const toggle = document.getElementById("toggle");
const scannedEl = document.getElementById("scanned");
const warnedEl = document.getElementById("warned");
const allowCount = document.getElementById("allowCount");

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