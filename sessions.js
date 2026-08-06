// sessions.js — parallel session tabs: an internal tab strip that lets the
// user run several independent conversations on the SAME active chat site
// (Gemini/internal) inside one real browser tab, instead of juggling real
// Chrome tabs. Loaded before content.js, after msg-nav.js.
// Exposes: window.__ccbSessions
//
// Mechanism: tab #1 ("native") is whatever the top-level page already has
// loaded — never touched, never wrapped in an iframe, so it's never at risk
// of being lost while sessions are managed. Every additional tab is a real
// same-origin <iframe src="<active site base URL>">, which — because
// manifest.json's content_scripts entry is all_frames:true — gets its own
// fully independent Mishley instance mounted inside it automatically (its
// own shadow host, FAB, panel), no extra wiring needed here for that part.
// This module only owns the tab strip itself: which iframe is visible,
// creating/closing/renaming session entries, and persisting the tab list
// (titles only — not scroll position/conversation state, see below).
//
// Storage: chrome.storage.local["ccb_sessions"] — an array of
// { id, title, createdAt }. The native tab is never stored here (it isn't a
// tab this module created — it's just "whatever's already on the page").
// On a fresh page load every session's iframe reloads its site's base URL;
// resuming a session at the exact conversation it was on is out of scope
// for this version — see the CLAUDE.md plan this was built from.
//
// Nesting guard: the FAB button that opens this view (#sessionsBtn) is only
// meaningful in the TOP-LEVEL page — opening "session management" from
// inside a session iframe would let the user nest sessions inside sessions
// pointlessly. isInsideOwnIframe() reports whether this content-script
// instance is itself running inside a frame (window.top !== window.self);
// content.js hides #sessionsBtn outright when it's true.

(() => {
  if (window.__ccbSessionsInstalled) return;
  window.__ccbSessionsInstalled = true;

  const NATIVE_ID = "__native__";
  const STORAGE_KEY = "ccb_sessions";

  let _deps = null;
  let _sessions = []; // [{id, title, createdAt}] — iframe-backed tabs only
  let _activeId = NATIVE_ID;
  // Whether #sessionsView itself is shown at all — kept separate from
  // _activeId so "no sessions yet, but the overlay is open so + is
  // reachable" is representable (see openSessionsView).
  let _overlayOpen = false;
  let _iframes = new Map(); // id -> <iframe>
  let _loaded = false;

  const $shadow = () => _deps?.getShadow?.();
  const $el = (id) => $shadow()?.getElementById(id);

  function isInsideOwnIframe() {
    try {
      return window.top !== window.self;
    } catch {
      // Cross-origin top somehow reachable from here shouldn't happen (we
      // only ever create same-origin session iframes), but treat it as
      // "nested" defensively rather than risk opening the FAB recursively.
      return true;
    }
  }

  function genId() {
    return "s_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 7);
  }

  function baseUrl() {
    const urls = _deps?.AUTO_OPEN_URLS;
    return Array.isArray(urls) && urls[0] ? urls[0] : null;
  }

  async function loadSessions() {
    if (_loaded) return _sessions;
    try {
      const data = await window.__ccbStorage.get(STORAGE_KEY);
      _sessions = Array.isArray(data[STORAGE_KEY]) ? data[STORAGE_KEY] : [];
    } catch {
      _sessions = [];
    }
    _loaded = true;
    return _sessions;
  }

  function saveSessions() {
    return window.__ccbStorage.set({ [STORAGE_KEY]: _sessions });
  }

  function ensureIframe(session) {
    if (!session) return null;
    if (_iframes.has(session.id)) return _iframes.get(session.id);
    const container = $el("sessionsFrameContainer");
    const url = baseUrl();
    if (!container || !url) return null;
    const iframe = document.createElement("iframe");
    iframe.className = "sessions-iframe";
    iframe.src = url;
    iframe.dataset.sessionId = session.id;
    iframe.style.display = "none";
    container.appendChild(iframe);
    _iframes.set(session.id, iframe);
    return iframe;
  }

  function buildTabPill(session, closable) {
    const pill = document.createElement("button");
    pill.type = "button";
    pill.className = "sessions-tab" + (session.id === _activeId ? " active" : "");
    pill.dataset.id = session.id;

    const label = document.createElement("span");
    label.className = "sessions-tab-label";
    label.textContent = session.title;
    pill.appendChild(label);

    pill.addEventListener("click", () => switchSession(session.id));
    pill.addEventListener("dblclick", (e) => {
      e.stopPropagation();
      if (closable) void renameSession(session.id);
    });

    if (closable) {
      const closeBtn = document.createElement("span");
      closeBtn.className = "sessions-tab-close";
      closeBtn.setAttribute("role", "button");
      closeBtn.setAttribute("aria-label", "סגור שיחה");
      closeBtn.innerHTML = _deps?.IC?.x || "×";
      closeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        void closeSession(session.id);
      });
      pill.appendChild(closeBtn);
    }

    return pill;
  }

  function render() {
    const tabsEl = $el("sessionsTabs");
    if (tabsEl) {
      tabsEl.textContent = "";
      tabsEl.appendChild(buildTabPill({ id: NATIVE_ID, title: "השיחה הנוכחית" }, false));
      for (const s of _sessions) tabsEl.appendChild(buildTabPill(s, true));
    }

    for (const [id, iframe] of _iframes) {
      iframe.style.display = id === _activeId ? "block" : "none";
    }

    const emptyHint = $el("sessionsEmptyHint");
    if (emptyHint) {
      emptyHint.style.display = _sessions.length === 0 ? "flex" : "none";
    }

    const view = $el("sessionsView");
    if (view) {
      if (_overlayOpen) {
        view.classList.add("sv-open");
        view.setAttribute("aria-hidden", "false");
      } else {
        view.classList.remove("sv-open");
        view.setAttribute("aria-hidden", "true");
      }
    }
  }

  // Selecting the native tab hides the whole overlay — per this feature's
  // own design, the native page's content is never rendered INSIDE the
  // overlay (it isn't an iframe this module controls), so "showing" it
  // simply means getting the overlay out of the way.
  function switchSession(id) {
    if (id !== NATIVE_ID && !_sessions.some((s) => s.id === id)) return;
    _activeId = id;
    if (id === NATIVE_ID) {
      _overlayOpen = false;
    } else {
      _overlayOpen = true;
      ensureIframe(_sessions.find((s) => s.id === id));
    }
    render();
  }

  async function addSession() {
    await loadSessions();
    if (!baseUrl()) {
      _deps?.setStatus?.("לא ידועה כתובת האתר הפעיל");
      return;
    }
    const session = { id: genId(), title: `שיחה ${_sessions.length + 1}`, createdAt: Date.now() };
    _sessions.push(session);
    await saveSessions();
    switchSession(session.id);
  }

  async function closeSession(id) {
    const session = _sessions.find((s) => s.id === id);
    if (!session) return;
    // Native confirm(), not _deps.modals.showConfirm — that dialog lives
    // INSIDE #panel (the 380px sidebar), which translateX(-100%)s itself
    // off-screen whenever the panel is closed, taking any descendant with
    // it. This overlay is meant to work regardless of whether the sidebar
    // panel happens to be open, so it can't depend on that dialog.
    const ok = window.confirm(`לסגור את "${session.title}"? אי אפשר לשחזר אותה.`);
    if (!ok) return;
    const iframe = _iframes.get(id);
    if (iframe) {
      iframe.remove();
      _iframes.delete(id);
    }
    _sessions = _sessions.filter((s) => s.id !== id);
    await saveSessions();
    if (_activeId === id) switchSession(NATIVE_ID);
    else render();
  }

  async function renameSession(id) {
    const session = _sessions.find((s) => s.id === id);
    if (!session) return;
    // Native prompt() — same reasoning as closeSession's native confirm().
    const name = window.prompt("שם חדש לשיחה:", session.title);
    if (name === null || !name.trim()) return;
    session.title = name.trim();
    await saveSessions();
    render();
  }

  function openSessionsView() {
    if (isInsideOwnIframe()) return; // defensive — the trigger button is already hidden in this case
    // Same full-pane takeover area as the file preview / dependency manager /
    // dependency picker / onboarding guide — close them first so two
    // full-viewport views are never open together (mirrors the calls those
    // four already make to each other in code-tree.js/ui-modals.js).
    window.__ccbCodeTree?.closeFilePreview?.();
    window.__ccbCodeTree?.closeDepsManager?.();
    window.__ccbCodeTree?.closeDepPicker?.();
    window.__ccbModals?.closeOnboarding?.();
    void loadSessions().then(() => {
      _overlayOpen = true;
      // Reopening on the native selection has nothing of its own to show
      // inside the overlay (see switchSession) — jump straight to the most
      // recently added session tab if one exists so there's real content to
      // land on; otherwise stay on the empty tabstrip so "+" is reachable.
      if (_activeId === NATIVE_ID && _sessions.length) {
        _activeId = _sessions[_sessions.length - 1].id;
        ensureIframe(_sessions[_sessions.length - 1]);
      } else if (_activeId !== NATIVE_ID) {
        ensureIframe(_sessions.find((s) => s.id === _activeId));
      }
      render();
    });
  }

  // Hides the overlay without resetting which session tab was selected, so
  // reopening via the FAB lands back on the same tab. Distinct from
  // switchSession(NATIVE_ID), which explicitly switches the selection.
  function closeSessionsView() {
    _overlayOpen = false;
    render();
  }

  window.__ccbSessions = {
    /**
     * @param {{ getShadow: () => ShadowRoot, AUTO_OPEN_URLS: string[], IC: object, setStatus: (msg:string) => void }} deps
     */
    init(deps) {
      _deps = deps;
      void loadSessions();
    },
    openSessionsView,
    closeSessionsView,
    addSession,
    closeSession,
    renameSession,
    switchSession,
    isInsideOwnIframe,
  };
})();
