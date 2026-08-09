// thinking-indicator.js — detects whether the host chat page is currently
// generating a response ("thinking"), by watching for the internal site's
// own `.waiting-indicator` element inside its message list. Runs in EVERY
// frame this content script mounts into (top-level page + every Parallel
// Sessions iframe, per manifest.json's all_frames:true) — this module only
// detects the local state, it has no opinion on what a frame does with it
// (self-render vs. postMessage up to the top frame — that branching lives
// in content.js, which is the one place that already knows whether this
// frame is the top-level page or a session iframe).
// Loaded before content.js, after msg-nav.js. Exposes: window.__ccbThinking
//
// Mirrors ctx-meter.js#watchConversation's re-arm pattern: `watch()` is
// idempotent (a no-op if the message-list root hasn't changed) and safe to
// call repeatedly from the same call sites ctx-meter's own watchConversation
// is called from (init, and every render()) — this is what lets it pick up
// the container once the chat page has actually mounted it, without a
// separate polling loop of its own.

(() => {
  if (window.__ccbThinkingInstalled) return;
  window.__ccbThinkingInstalled = true;

  let _deps = null;
  let _observedRoot = null;
  let _observer = null;
  let _lastThinking = null; // null forces the first check to always report

  function check() {
    if (!_observedRoot) return;
    const thinking = !!_observedRoot.querySelector(".waiting-indicator");
    if (thinking !== _lastThinking) {
      _lastThinking = thinking;
      _deps?.onChange?.(thinking);
    }
  }

  function watch() {
    const sel = _deps?.MSG_SELECTORS;
    const rootSel = sel?.messageList;
    if (!rootSel) return;
    const root = document.querySelector(rootSel);
    if (!root || root === _observedRoot) return;
    _observer?.disconnect();
    _observedRoot = root;
    _lastThinking = null;
    _observer = new MutationObserver(check);
    _observer.observe(root, { childList: true, subtree: true });
    check();
  }

  window.__ccbThinking = {
    /**
     * @param {{ MSG_SELECTORS: object, onChange: (thinking: boolean) => void }} deps
     */
    init(deps) {
      _deps = deps;
      watch();
    },
    watch,
  };
})();
