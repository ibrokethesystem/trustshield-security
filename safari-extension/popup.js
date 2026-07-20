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

render();