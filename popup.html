// Minimal popup: tells the active tab's content script to toggle the in-page panel,
// then closes itself. Keeps the toolbar icon and Ctrl+Shift+L (_execute_action) working.
(async () => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.id) {
      await chrome.tabs.sendMessage(tab.id, { action: 'togglePanel' });
    }
  } catch {
    // content script not available on this page — leave the popup info visible
    return;
  }
  window.close();
})();
