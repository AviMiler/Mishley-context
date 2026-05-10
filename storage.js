// storage.js — chrome.storage.local helpers. Loaded before content.js.
window.__ccbStorage = (() => {
  async function loadBlocks(storageKey) {
    try {
      const data = await chrome.storage.local.get(storageKey);
      return data[storageKey] || {};
    } catch {
      return {};
    }
  }

  async function saveBlocks(storageKey, blocks) {
    try {
      await chrome.storage.local.set({ [storageKey]: blocks });
    } catch {}
  }

  return { loadBlocks, saveBlocks };
})();
