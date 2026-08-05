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
// 2026-08-06 (rework, replacing the original click-counter design) — the
// first version tracked "where the user stands" as an in-memory index
// incremented/decremented by clicks. That model has no way to know the
// user's real position on a freshly-loaded conversation, after new messages
// arrive without the arrows being touched, or after the user manually
// scrolls away from wherever the last click landed — every one of those
// leaves the stored index stale or meaningless (raised directly by the
// user, who also floated a full segment-list/minimap UI as an alternative;
// they chose fixing this mechanism instead of that bigger feature).
// Replaced entirely: there is no stored cursor. On every click, "current
// position" is DERIVED FRESH from the real viewport — whichever message
// currently has the most overlap with the visible viewport (measured via
// getBoundingClientRect, not a persistent observer, since this only runs on
// a discrete click) is treated as where the user stands right now. This
// makes every one of the scenarios above self-correcting by construction,
// since there is nothing to go stale: a freshly-loaded conversation
// (typically auto-scrolled to its bottom) naturally reads its last message
// as current; new messages arriving change what "last" means without any
// reset needed; a manually-scrolled position is exactly what gets read the
// next time an arrow is clicked.
//
// Public API:
//   init(deps) — { getShadow, MSG_SELECTORS }
//   goPrev()   — scroll+highlight the message before whichever is currently
//                in view
//   goNext()   — scroll+highlight the message after whichever is currently
//                in view
//   reset()    — clears any pending highlight and re-enables both buttons.
//                Called on fresh-chat resets (same points chat-features.js's
//                undo stack/quick-command menu already reset at) — there is
//                no cursor left to reset, only stale highlight/disabled-
//                state residue from the previous conversation.

(() => {
  if (window.__ccbMsgNavInstalled) return;
  window.__ccbMsgNavInstalled = true;

  let _deps = null;
  let _highlightedEl = null;
  let _highlightTimer = null;

  const $shadow = () => _deps?.getShadow?.();
  const $el = (id) => $shadow()?.getElementById(id);

  function getMessages() {
    const sel = _deps?.MSG_SELECTORS;
    if (!sel?.message) return [];
    return Array.from(document.querySelectorAll(sel.message));
  }

  // "Where the user stands right now" — the message with the most overlap
  // with the actual viewport. Falls back to whichever message's center is
  // closest to the viewport's center on the rare chance nothing intersects
  // at all (e.g. the container hasn't laid out messages yet).
  function findCurrentIndex(messages) {
    const viewportHeight = window.innerHeight;
    let bestIndex = -1;
    let bestVisible = 0;
    messages.forEach((el, i) => {
      const rect = el.getBoundingClientRect();
      const visible = Math.min(rect.bottom, viewportHeight) - Math.max(rect.top, 0);
      if (visible > bestVisible) {
        bestVisible = visible;
        bestIndex = i;
      }
    });
    if (bestIndex !== -1) return bestIndex;
    const center = viewportHeight / 2;
    let closestIndex = 0;
    let closestDistance = Infinity;
    messages.forEach((el, i) => {
      const rect = el.getBoundingClientRect();
      const distance = Math.abs(rect.top + rect.height / 2 - center);
      if (distance < closestDistance) {
        closestDistance = distance;
        closestIndex = i;
      }
    });
    return closestIndex;
  }

  // Disables an arrow once the target would be past that end of the message
  // list — a real `disabled` attribute, not just a dimmed look.
  function syncButtons(index, count) {
    const prevBtn = $el("msgNavPrev");
    const nextBtn = $el("msgNavNext");
    if (prevBtn) prevBtn.disabled = index <= 0;
    if (nextBtn) nextBtn.disabled = index >= count - 1;
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
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    highlightElement(el);
    syncButtons(index, messages.length);
  }

  function goPrev() {
    const messages = getMessages();
    if (!messages.length) return;
    const next = findCurrentIndex(messages) - 1;
    if (next < 0) return;
    goTo(next, messages);
  }

  function goNext() {
    const messages = getMessages();
    if (!messages.length) return;
    const next = findCurrentIndex(messages) + 1;
    if (next > messages.length - 1) return;
    goTo(next, messages);
  }

  function reset() {
    if (_highlightTimer !== null) {
      clearTimeout(_highlightTimer);
      _highlightTimer = null;
    }
    if (_highlightedEl) clearHighlight(_highlightedEl);
    _highlightedEl = null;
    // No cursor to clear anymore — just make sure neither button is left
    // showing a disabled state carried over from the previous conversation.
    const prevBtn = $el("msgNavPrev");
    const nextBtn = $el("msgNavNext");
    if (prevBtn) prevBtn.disabled = false;
    if (nextBtn) nextBtn.disabled = false;
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
