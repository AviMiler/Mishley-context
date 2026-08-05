// msg-nav.js — floating prev/next message navigation for the host page's own
// chat. Two buttons, fixed near the bottom-left of the viewport, step through
// every chat message (all roles, no filtering) in document order, using the
// same MSG_SELECTORS block-identification mechanism config.js already
// exposes for ctx-meter.js's token counting (config.js#MSG_SELECTORS —
// messageList/message/aiMessageMatch/userMessageMatch/messageText). This
// mechanism used to also serve the now-retired conversation-history capture
// feature, but is unrelated to and unaffected by that removal — it's still
// live, serving ctx-meter.js today.
// Loaded before content.js.
// Exposes: window.__ccbMsgNav
//
// Public API:
//   init(deps) — { getShadow, MSG_SELECTORS }
//   goPrev()   — scroll+highlight the previous message
//   goNext()   — scroll+highlight the next message
//   reset()    — clears the in-memory cursor (called on fresh-chat resets,
//                same points chat-features.js's undo stack/quick-command
//                menu already reset at, so a stale index can't point at a
//                previous conversation's now-gone DOM nodes)

(() => {
  if (window.__ccbMsgNavInstalled) return;
  window.__ccbMsgNavInstalled = true;

  let _deps = null;
  // null = no navigation yet this conversation. Otherwise an index into the
  // CURRENT document.querySelectorAll(sel.message) result — re-queried fresh
  // on every call (never cached), since new messages can arrive at any time.
  let _currentIndex = null;
  let _highlightedEl = null;
  let _highlightTimer = null;

  const $shadow = () => _deps?.getShadow?.();
  const $el = (id) => $shadow()?.getElementById(id);

  function getMessages() {
    const sel = _deps?.MSG_SELECTORS;
    if (!sel?.message) return [];
    return Array.from(document.querySelectorAll(sel.message));
  }

  // Disables an arrow once the cursor is at that end of the message list —
  // a real `disabled` attribute, not just a dimmed look, so it's genuinely
  // non-interactive there too.
  function syncButtons(count) {
    const prevBtn = $el("msgNavPrev");
    const nextBtn = $el("msgNavNext");
    if (prevBtn) prevBtn.disabled = _currentIndex !== null && _currentIndex <= 0;
    if (nextBtn)
      nextBtn.disabled = _currentIndex !== null && _currentIndex >= count - 1;
  }

  // The target message lives on the HOST PAGE, outside this extension's
  // shadow DOM — its stylesheet can't reach there (:host custom properties
  // don't cross the shadow boundary), so the flash is plain inline styles,
  // set then cleared, rather than a shared CSS class.
  function clearHighlight(el) {
    if (!el) return;
    el.style.boxShadow = "";
    el.style.backgroundColor = "";
    setTimeout(() => {
      // Only drop the transition if nothing re-highlighted this same
      // element in the meantime (rapid prev/prev/prev on one message).
      if (_highlightedEl !== el) el.style.transition = "";
    }, 450);
  }

  function highlightElement(el) {
    if (!el) return;
    // Cancel any still-pending clear from an earlier highlight so rapid
    // navigation can't leave a previous element stuck highlighted forever.
    if (_highlightTimer !== null) {
      clearTimeout(_highlightTimer);
      if (_highlightedEl && _highlightedEl !== el) clearHighlight(_highlightedEl);
    }
    _highlightedEl = el;
    el.style.transition = "background-color .4s ease, box-shadow .4s ease";
    el.style.boxShadow = "0 0 0 3px rgba(79,140,255,.55)";
    el.style.backgroundColor = "rgba(79,140,255,.10)";
    _highlightTimer = setTimeout(() => {
      clearHighlight(el);
      _highlightTimer = null;
    }, 1400);
  }

  function goTo(index, messages) {
    const el = messages[index];
    if (!el) return;
    _currentIndex = index;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    highlightElement(el);
    syncButtons(messages.length);
  }

  // No prior position starts from the LAST message (as if already at the
  // bottom of the chat, the common resting scroll position) and moves
  // backward from there; an existing position just steps back by one.
  function goPrev() {
    const messages = getMessages();
    if (!messages.length) return;
    const next = _currentIndex === null ? messages.length - 1 : _currentIndex - 1;
    if (next < 0) return;
    goTo(next, messages);
  }

  // No prior position starts from the FIRST message and moves forward.
  function goNext() {
    const messages = getMessages();
    if (!messages.length) return;
    const next = _currentIndex === null ? 0 : _currentIndex + 1;
    if (next > messages.length - 1) return;
    goTo(next, messages);
  }

  function reset() {
    _currentIndex = null;
    if (_highlightTimer !== null) {
      clearTimeout(_highlightTimer);
      _highlightTimer = null;
    }
    if (_highlightedEl) clearHighlight(_highlightedEl);
    _highlightedEl = null;
    syncButtons(getMessages().length);
  }

  window.__ccbMsgNav = {
    /**
     * @param {{ getShadow: () => ShadowRoot, MSG_SELECTORS: object }} deps
     */
    init(deps) {
      _deps = deps;
    },
    goPrev,
    goNext,
    reset,
  };
})();
