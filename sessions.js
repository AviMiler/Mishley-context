// sessions.js — parallel session tabs: a persistent, always-visible tab strip
// pinned to the top of the page that lets the user run several independent
// conversations on the SAME active chat site (Gemini/internal) inside one
// real browser tab, instead of juggling real Chrome tabs. Loaded before
// content.js, after msg-nav.js. Exposes: window.__ccbSessions
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
// UX (reworked 2026-08-06, same day as first ship): the strip used to be a
// full-viewport takeover you opened via a FAB and had to close again to see
// the underlying page — real user feedback after trying it live was that
// switching conversations shouldn't mean "leaving and re-entering" anything.
// The strip (#sessionsView → .sessions-tabstrip) is now ALWAYS visible, a
// thin bar pinned to the top of the page (pushed down via push.js#pushTop so
// it doesn't sit over the site's own content) — switching tabs is one click,
// no open/close step. Only the SELECTED session's content still needs to
// visually cover the page: .sessions-frame-container is a fixed, full-width
// layer below the strip that's shown only while a non-native tab is active
// (native tab = nothing to cover, the real page is what's underneath).
//
// Nesting guard: the strip only makes sense in the TOP-LEVEL page — mounting
// it inside a session iframe would let the user nest sessions inside
// sessions pointlessly. isInsideOwnIframe() reports whether this
// content-script instance is itself running inside a frame
// (window.top !== window.self); init() skips mounting the strip when true.

(() => {
  if (window.__ccbSessionsInstalled) return;
  window.__ccbSessionsInstalled = true;

  const NATIVE_ID = "__native__";
  const STORAGE_KEY = "ccb_sessions";
  // The native tab's custom title is stored separately from the sessions
  // array — it isn't a session this module created, just a display label
  // for the real top-level page, so it doesn't belong in _sessions/
  // STORAGE_KEY's shape.
  const NATIVE_TITLE_KEY = "ccb_sessions_native_title";
  const NATIVE_TITLE_DEFAULT = "השיחה הנוכחית";
  // Must match .sessions-tabstrip's fixed height in ui-styles.js.
  const STRIP_HEIGHT = 40;

  let _deps = null;
  let _sessions = []; // [{id, title, createdAt}] — iframe-backed tabs only
  let _nativeTitle = NATIVE_TITLE_DEFAULT;
  let _activeId = NATIVE_ID;
  let _iframes = new Map(); // id -> <iframe>
  let _loaded = false;
  // "Thinking" state per tab (2026-08-09) — whether that tab's own chat is
  // currently generating a response, shown as a small dot on its pill. The
  // native tab's own state lives directly on this module (its detector runs
  // in this same top-level frame, no cross-frame hop needed); session tabs'
  // state arrives via postMessage from each session iframe's own instance
  // of thinking-indicator.js (installMessageListener below) since only the
  // top-level frame renders the strip and a session iframe can't touch it
  // directly — see CLAUDE.md's Parallel Sessions section.
  let _nativeThinking = false;
  let _thinking = new Map(); // session id -> boolean

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
      const data = await window.__ccbStorage.get([STORAGE_KEY, NATIVE_TITLE_KEY]);
      _sessions = Array.isArray(data[STORAGE_KEY]) ? data[STORAGE_KEY] : [];
      if (typeof data[NATIVE_TITLE_KEY] === "string" && data[NATIVE_TITLE_KEY].trim()) {
        _nativeTitle = data[NATIVE_TITLE_KEY];
      }
    } catch {
      _sessions = [];
    }
    _loaded = true;
    return _sessions;
  }

  function saveSessions() {
    return window.__ccbStorage.set({ [STORAGE_KEY]: _sessions });
  }

  // Renaming the native tab has nowhere to persist inside a `session`
  // object (render() rebuilds a fresh {id, title} literal for it every
  // call — it isn't backed by an entry in _sessions), so it's routed
  // through its own storage key instead of saveSessions().
  async function commitRename(session, name) {
    if (session.id === NATIVE_ID) {
      _nativeTitle = name;
      await window.__ccbStorage.set({ [NATIVE_TITLE_KEY]: name });
    } else {
      session.title = name;
      await saveSessions();
    }
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

  // Chrome-style tab: a structural row (div, not a <button>) so its shape
  // can read as a real browser tab rather than an isolated pill button —
  // click-to-select still works via a plain click listener, keyboard access
  // via role="tab" + tabindex + Enter/Space. Rename/close/refresh are
  // independent capabilities (not one combined "closable" flag). Close is
  // deliberately native-tab-only-false: the native tab is the real
  // top-level page, not a session this module manages — closing it isn't a
  // real action (there's nothing to remove), and a prior round that gave it
  // a close-X that just switched tabs was reverted at the user's explicit
  // request in favor of no close button there at all. Rename and refresh
  // stay available on every tab, including native.
  function buildTabPill(session, { canRename, canClose, canRefresh, thinking }) {
    const tab = document.createElement("div");
    tab.className = "sessions-tab" + (session.id === _activeId ? " active" : "");
    tab.dataset.id = session.id;
    tab.setAttribute("role", "tab");
    tab.tabIndex = 0;

    if (thinking) {
      const dot = document.createElement("span");
      dot.className = "sessions-tab-thinking";
      dot.setAttribute("aria-label", "השיחה חושבת");
      tab.appendChild(dot);
    }

    const label = document.createElement("span");
    label.className = "sessions-tab-label";
    label.textContent = session.title;
    tab.appendChild(label);

    const select = () => switchSession(session.id);
    tab.addEventListener("click", select);
    tab.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        select();
      }
    });

    if (canRename) {
      const editBtn = document.createElement("span");
      editBtn.className = "sessions-tab-edit";
      editBtn.setAttribute("role", "button");
      editBtn.setAttribute("aria-label", "שנה שם");
      editBtn.innerHTML = _deps?.IC?.pencil || "✎";
      editBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        startInlineRename(tab, label, session);
      });
      tab.appendChild(editBtn);
    }

    if (canRefresh) {
      const refreshBtn = document.createElement("span");
      refreshBtn.className = "sessions-tab-refresh";
      refreshBtn.setAttribute("role", "button");
      refreshBtn.setAttribute("aria-label", "רענן");
      refreshBtn.innerHTML = _deps?.IC?.refresh || "↻";
      refreshBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        refreshTab(session.id);
      });
      tab.appendChild(refreshBtn);
    }

    if (canClose) {
      const closeBtn = document.createElement("span");
      closeBtn.className = "sessions-tab-close";
      closeBtn.setAttribute("role", "button");
      closeBtn.setAttribute("aria-label", "סגור שיחה");
      closeBtn.innerHTML = _deps?.IC?.x || "×";
      closeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        void closeSession(session.id);
      });
      tab.appendChild(closeBtn);
    }

    return tab;
  }

  // Swaps the tab's label span for a text <input>, in place — no popup, no
  // window.prompt(). Enter/blur commits, Escape cancels; either path just
  // re-renders (render() rebuilds every tab from _sessions, so a cancelled
  // edit simply reverts to the stored title with no separate "undo" state).
  function startInlineRename(tabEl, labelEl, session) {
    if (tabEl.querySelector(".sessions-tab-input")) return; // already editing
    const input = document.createElement("input");
    input.type = "text";
    input.className = "sessions-tab-input";
    input.value = session.title;
    input.addEventListener("click", (e) => e.stopPropagation());
    input.addEventListener("keydown", (e) => {
      e.stopPropagation(); // don't let Enter/Space bubble to the tab's own keydown (select())
      if (e.key === "Enter") {
        e.preventDefault();
        input.blur(); // triggers commit via the blur listener below
      } else if (e.key === "Escape") {
        e.preventDefault();
        render(); // discard — re-render from the unmodified session
      }
    });
    input.addEventListener("blur", async () => {
      const name = input.value.trim();
      if (name && name !== session.title) {
        await commitRename(session, name);
      }
      render();
    });
    labelEl.replaceWith(input);
    input.focus();
    input.select();
  }

  function render() {
    const tabsEl = $el("sessionsTabs");
    if (tabsEl) {
      tabsEl.textContent = "";
      tabsEl.appendChild(
        buildTabPill(
          { id: NATIVE_ID, title: _nativeTitle },
          { canRename: true, canClose: false, canRefresh: false, thinking: _nativeThinking },
        ),
      );
      for (const s of _sessions) {
        tabsEl.appendChild(
          buildTabPill(s, {
            canRename: true,
            canClose: true,
            canRefresh: true,
            thinking: _thinking.get(s.id) === true,
          }),
        );
      }
    }

    for (const [id, iframe] of _iframes) {
      iframe.style.display = id === _activeId ? "block" : "none";
    }

    const emptyHint = $el("sessionsEmptyHint");
    if (emptyHint) {
      emptyHint.style.display = _sessions.length === 0 ? "flex" : "none";
    }

    // The frame-container only needs to cover the viewport while a non-native
    // tab is selected — on the native tab, the real page underneath (pushed
    // down by the strip's own height, see pushTop) is what's shown, so the
    // container stays out of the way entirely (see .sfc-active in
    // ui-styles.js — without it the container is position:fixed but
    // display:none, out of flow, so it can't block clicks to the page below
    // the strip even though #sessionsView itself is always mounted).
    const container = $el("sessionsFrameContainer");
    if (container) container.classList.toggle("sfc-active", _activeId !== NATIVE_ID);
  }

  // Selecting the native tab hides the frame-container — the native page's
  // content is never rendered INSIDE it (it isn't an iframe this module
  // controls), so "showing" the native tab simply means getting the
  // container out of the way so the real page (visible underneath the
  // always-on strip) shows through.
  function switchSession(id) {
    if (id !== NATIVE_ID && !_sessions.some((s) => s.id === id)) return;
    _activeId = id;
    if (id !== NATIVE_ID) {
      // The frame-container covers the full viewport below the strip at a
      // very high z-index — well above the panel's own full-pane views
      // (file preview / dependency manager / dependency picker / onboarding
      // guide), which would otherwise be stuck open but visually hidden
      // underneath it. Close them first, same mutual-exclusion reasoning
      // this module has had since it was a full-viewport overlay.
      window.__ccbCodeTree?.closeFilePreview?.();
      window.__ccbCodeTree?.closeDepsManager?.();
      window.__ccbCodeTree?.closeDepPicker?.();
      window.__ccbModals?.closeOnboarding?.();
      ensureIframe(_sessions.find((s) => s.id === id));
    }
    render();
  }

  // Switches back to the native tab if a session's frame-container is
  // currently covering the viewport. Called by the panel's other full-pane
  // views (file preview / dependency manager / dependency picker / onboarding
  // guide) when THEY open, so the panel becomes visible again instead of
  // staying hidden underneath the cover — the reverse direction of the
  // mutual exclusion in switchSession above. A no-op on the native tab.
  function showNativeTab() {
    if (_activeId !== NATIVE_ID) switchSession(NATIVE_ID);
  }

  // Reloads a session tab's iframe by reassigning its own `src` to itself
  // (rather than going through `iframe.contentWindow`, since re-triggering
  // a navigation via `src` works uniformly whether or not the iframe has
  // ever been focused/activated and avoids any same-origin access nuance).
  // Native-tab-only-false: the native tab is the real top-level page, and
  // refreshing it would reload the whole page (dropping anything unsaved
  // there) — deliberately not offered here, same reasoning as its missing
  // close-X (see canClose above; render() passes canRefresh:false for it).
  // A session that was never switched to yet (no iframe created) has
  // nothing to reload, so this only acts if one already exists (switching
  // to it via the tab click is what creates it — see ensureIframe).
  function refreshTab(id) {
    const iframe = _iframes.get(id);
    if (iframe) iframe.src = iframe.src;
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
    // No confirmation prompt — at the user's explicit request, closing a
    // session tab is a direct, single-click action, same as closing a real
    // browser tab (no built-in undo either way, but neither warrants a
    // confirm() gate).
    const iframe = _iframes.get(id);
    if (iframe) {
      iframe.remove();
      _iframes.delete(id);
    }
    _sessions = _sessions.filter((s) => s.id !== id);
    _thinking.delete(id);
    await saveSessions();
    if (_activeId === id) switchSession(NATIVE_ID);
    else render();
  }

  // Called by the top-level frame's OWN thinking-indicator instance — no
  // cross-frame hop needed, sender and renderer are the same frame here.
  function setNativeThinking(thinking) {
    _nativeThinking = thinking;
    render();
  }

  // Only installed in the top-level frame (see init below) — every session
  // iframe's own instance of this module never reaches this branch, since
  // it isn't the one rendering the strip. Matches a postMessage'd session
  // iframe's contentWindow (event.source) against _iframes to find which
  // tab's dot to update; ignores anything not from a same-origin frame this
  // module itself created, since a session iframe always loads the active
  // site's own URL (see baseUrl()) — same origin as the top-level page.
  function installThinkingListener() {
    window.addEventListener("message", (event) => {
      if (event.origin !== window.location.origin) return;
      const data = event.data;
      if (!data || data.type !== "ccbThinking") return;
      for (const [id, iframe] of _iframes) {
        if (iframe.contentWindow === event.source) {
          _thinking.set(id, !!data.thinking);
          render();
          return;
        }
      }
    });
  }

  // F5 normally reloads the whole real browser tab, which — from inside a
  // session — is the wrong target: the user is looking at one session's
  // iframe, not the native page. Installed in EVERY frame (top-level AND
  // every session iframe, since each one runs its own fully independent
  // Mishley instance per all_frames:true) so the guard can act on whichever
  // frame the keydown actually reaches — keydown does NOT bubble across an
  // iframe boundary, so the top-level frame's own listener never sees an F5
  // pressed while focus is inside a session iframe; each frame has to
  // handle it locally.
  function installF5Guard() {
    window.addEventListener("keydown", (e) => {
      if (e.key !== "F5") return;
      if (isInsideOwnIframe()) {
        // This frame IS a session's own content (only the active session's
        // iframe is ever un-hidden, so only it can ever hold focus) — F5
        // here should refresh just this iframe, not the real tab.
        e.preventDefault();
        window.location.reload();
        return;
      }
      // Top-level frame: only intercept when a session tab is active (focus
      // is on the top document itself, e.g. the tab strip, not inside an
      // iframe) — reload that session instead of the real page. On the
      // native tab, do nothing and let F5 refresh the real page normally,
      // matching the native tab's existing lack of its own refresh button.
      if (_activeId === NATIVE_ID) return;
      e.preventDefault();
      refreshTab(_activeId);
    });
  }

  window.__ccbSessions = {
    /**
     * @param {{ getShadow: () => ShadowRoot, AUTO_OPEN_URLS: string[], IC: object, setStatus: (msg:string) => void, pushTop: (px:number) => void, enabled: boolean }} deps
     */
    init(deps) {
      _deps = deps;
      if (deps.enabled === false) {
        // Feature-off switch (config.js#SESSIONS_ENABLED) — nothing mounts,
        // not even the F5 guard, so the extension behaves as if this
        // module didn't exist at all. Same "hide the always-present
        // markup outright" approach as the isInsideOwnIframe branch below,
        // since #sessionsView is unconditionally in the template.
        const view = $el("sessionsView");
        if (view) view.style.display = "none";
        return;
      }
      installF5Guard();
      if (isInsideOwnIframe()) {
        // The strip only makes sense at the top level — a session iframe
        // already has its own fully independent Mishley instance mounted
        // inside it, and showing a nested strip there would let the user
        // nest sessions inside sessions pointlessly. Hide the markup
        // outright rather than just skipping render(), since the tabstrip
        // is otherwise unconditionally present in the template.
        const view = $el("sessionsView");
        if (view) view.style.display = "none";
        return;
      }
      installThinkingListener();
      void loadSessions().then(() => {
        _deps?.pushTop?.(STRIP_HEIGHT);
        // Pushes the SITE's own content down — Mishley's own panel lives in
        // this same shadow root, unaffected by that host-page style
        // injection, and would otherwise render its header right under the
        // strip. A host class lets ui-styles.js push .panel down too via
        // :host(.ccb-strip-active), the same declarative pattern as every
        // other conditional style in that file, instead of inline JS styles.
        $shadow()?.host?.classList.add("ccb-strip-active");
        render();
      });
    },
    addSession,
    closeSession,
    switchSession,
    showNativeTab,
    isInsideOwnIframe,
    setNativeThinking,
  };
})();
