// content.js — orchestrator: state, mount, wireEvents, edit form, context list, init.
// Dependencies (loaded first via manifest):
//   config.js        → window.__ccbRawConfig
//   prompts.js       → window.__ccbPromptsAPI
//   storage.js       → window.__ccbStorage
//   inject.js        → window.__ccbInject
//   push.js          → window.__ccbPush
//   ui-styles.js     → window.__ccbCSS
//   ui-template.js   → window.__ccbTpl
//   ctx-meter.js     → window.__ccbCtxMeter
//   ui-modals.js     → window.__ccbModals
//   document-handler.js → window.__ccbDocHandler
//   history-view.js  → window.__ccbHistoryView
//   chat-features.js → window.__ccbChat
//   msg-nav.js       → window.__ccbMsgNav
//   thinking-indicator.js → window.__ccbThinking
//   sessions.js      → window.__ccbSessions

(async () => {
  if (window.__ccbInstalled) return;
  window.__ccbInstalled = true;

  try {
    if (window.__ccbPromptsAPI?.ready) await window.__ccbPromptsAPI.ready;
  } catch {
    // ignore
  }

  const {
    AUTO_OPEN_URLS,
    SEND_BUTTON_SELECTOR,
    NEW_CHAT_BTN_SELECTOR,
    SIDEBAR_WIDTH,
    MSG_SELECTORS,
    STORAGE_KEY,
    GM_ID,
    CTX_WINDOW_DEFAULT,
    CHARS_PER_TOKEN,
    DOC_MAX_CHARS_DEFAULT,
    SESSIONS_ENABLED,
  } = window.__ccbRawConfig;

  const CONFIG_PUBLIC = { AUTO_OPEN_URLS, SEND_BUTTON_SELECTOR, SIDEBAR_WIDTH };
  const storage = window.__ccbStorage;
  const { loadBlocks: _loadBlocks, saveBlocks: _saveBlocks } = storage;
  const ccbInject = window.__ccbInject;
  const { pushPage } = window.__ccbPush;
  const CSS = window.__ccbCSS;
  const { IC, PANEL_HTML } = window.__ccbTpl;
  const isActiveSitePage = () =>
    CONFIG_PUBLIC.AUTO_OPEN_URLS.some((u) => location.href.startsWith(u));

  // ============================================================
  // Shared state — modules receive a reference and mutate directly
  // ============================================================
  const state = {
    blocks: {},
    blocksLoaded: false,
    selected: new Set(),
    editingId: null,
    // The globally active project (or null = "no project"), selected via the
    // persistent bar at the top of the panel. Drives which blocks/documents
    // show in the Context view. Persisted across sessions (see
    // loadActiveProjectId/setActiveProjectId in history-view.js).
    currentProjectId: null,
    activeProjectLoaded: false,
    projectDocumentsCollapsed: false,
    blocksCollapsed: false,
    ctxWindow: CTX_WINDOW_DEFAULT,
    ctxWindowLoaded: false,
    docMaxChars: DOC_MAX_CHARS_DEFAULT,
    docMaxCharsLoaded: false,
    // WHEN auto-inject fires: "start" (once, at conversation start — the
    // long-standing behavior) or "every" (prepended to every outgoing user
    // message at send time, see chat-features.js#installSendInterceptor).
    // Independent per source (2026-07-22) — GM and the active project's
    // instructions each have their own mode, so e.g. GM can ride every
    // message while project instructions only load once. WHAT gets loaded
    // stays controlled by the GM/project autoLoad toggles.
    autoInjectModeGm: "start",
    autoInjectModeProject: "start",
    autoInjectModeLoaded: false,
    // Global code-project scan rules (which folders/files/extensions get
    // scanned, and the per-file size cap). Seeded from document-handler.js's
    // defaults on first load, then user-editable from Advanced Options.
    scanSettings: null,
    scanSettingsLoaded: false,
    gmAutoInjected: false,
    hiDropdownCleanup: null,
    // Undo stack for the chat input's own text box (Phase 4.1). Array of
    // injection ids, oldest first — each undo click pops the most recent one
    // and surgically removes just that block's marked text from the box (see
    // injectTracked/undoLastInjection). Transient, per tab.
    injectionStack: [],
    // Onboarding guide (Phase 5): whether the user has dismissed the guide's
    // auto-open for good — either by scrolling it to the bottom, or by
    // checking its "don't show again" box. Plain closing (X/Escape) does NOT
    // set this, so the guide keeps auto-opening on the next panel open until
    // one of those two happens.
    onboardingSeen: false,
    onboardingSeenLoaded: false,
  };

  // Live FRAMING getters — picks up edits from prompts.js automatically
  const framing = {
    get manualPre() {
      return (
        window.__ccbRawConfig.FRAMING_MANUAL_PRE ||
        window.__ccbRawConfig.FRAMING ||
        ""
      );
    },
    get manualPost() {
      return window.__ccbRawConfig.FRAMING_MANUAL_POST || "";
    },
    get gmPre() {
      return (
        window.__ccbRawConfig.FRAMING_GM_PRE ||
        window.__ccbRawConfig.FRAMING ||
        ""
      );
    },
    get gmPost() {
      return window.__ccbRawConfig.FRAMING_GM_POST || "";
    },
    get projPre() {
      return window.__ccbRawConfig.FRAMING_PROJ_PRE || "";
    },
    get projPost() {
      return window.__ccbRawConfig.FRAMING_PROJ_POST || "";
    },
    get docsPre() {
      return window.__ccbRawConfig.FRAMING_DOCS_PRE || "";
    },
    get docsPost() {
      return window.__ccbRawConfig.FRAMING_DOCS_POST || "";
    },
    get everyPre() {
      return window.__ccbRawConfig.FRAMING_EVERY_PRE || "";
    },
    get everyPost() {
      return window.__ccbRawConfig.FRAMING_EVERY_POST || "";
    },
  };

  let shadow = null;
  let $el = null;
  let mounted = false;
  let toastTimer = null;

  // ============================================================
  // Storage wrappers (mutate state.blocks / state.ctxWindow)
  // ============================================================
  // One-time (idempotent) migration: fold the old Context-tab "ctx-project"
  // grouping blocks into the unified History-style "project" shape, so a
  // project can hold both plain text blocks (via child projectId) AND
  // documents/code-project file loading. Keeps the same id — child blocks
  // referencing it via projectId keep working unchanged.
  async function migrateCtxProjects() {
    let changed = false;
    for (const b of Object.values(state.blocks)) {
      if (b && b.kind === "ctx-project") {
        b.kind = "project";
        if (!Array.isArray(b.documents)) b.documents = [];
        if (b.isCodeProject === undefined) b.isCodeProject = false;
        changed = true;
      }
    }
    if (changed) await saveBlocks();
  }

  // ============================================================
  // Storage migration
  // ============================================================
  // v2 (2026-07-30) split the one giant `blocks` key: a code project's
  // depGraph was stored INLINE on its block, and since `blocks` is a single
  // storage key rewritten in full on every saveBlocks(), every file checkbox
  // re-serialized every dependency graph in the profile. Graphs moved to
  // their own `depGraph_<id>` keys (see storage.js's layout comment).
  //
  // v3 (2026-08-04) retired the conversation-history feature. Its blocks and
  // their `conv_<id>` data are now unreachable from any UI, so they're
  // deleted rather than left occupying storage forever (one real profile had
  // ~138MB of them). v2 also used to MOVE those messages out to `conv_<id>`;
  // that step is gone — anything still inline is deleted along with its block.
  //
  // The depGraph half is resumable by construction: each batch's own keys are
  // written and confirmed BEFORE the inline copies are stripped, so an
  // interrupted migration can only ever leave data in both places (harmless —
  // the next load re-migrates whatever is still inline), never in neither.
  const STORAGE_VERSION_KEY = "ccb_storageVersion";
  const STORAGE_VERSION = 3;
  // Keys per chrome.storage.local call. Each call is an IPC round-trip, so
  // bulk reads/writes are chunked rather than sent one key at a time.
  const STORAGE_BATCH = 50;

  async function migrateStorage() {
    let stored;
    try {
      stored = await storage.get([STORAGE_VERSION_KEY]);
    } catch {
      return false;
    }
    if ((stored[STORAGE_VERSION_KEY] || 1) >= STORAGE_VERSION) return false;

    // E1 guard: this mutates state.blocks across several awaits before its
    // own final save — see beginBlocksMutation's comment.
    beginBlocksMutation();
    try {
      const convIds = [];
      const graphs = [];
      for (const b of Object.values(state.blocks)) {
        if (!b) continue;
        if (b.kind === "conversation") convIds.push(b.id);
        if (b.depGraph && typeof b.depGraph === "object") graphs.push(b);
      }

      const total = convIds.length + graphs.length;
      let done = 0;
      if (total) {
        setProgress({ phase: "save", label: "מעדכן אחסון…", done: 0, total });

        for (const id of convIds) {
          delete state.blocks[id];
          state.selected.delete(id);
        }
        done += convIds.length;
        setProgress({ phase: "save", label: "מעדכן אחסון…", done, total });

        for (let i = 0; i < graphs.length; i += STORAGE_BATCH) {
          const batch = graphs.slice(i, i + STORAGE_BATCH);
          const items = {};
          for (const b of batch) items[storage.depGraphKey(b.id)] = b.depGraph;
          await storage.setBatched(items);
          for (const b of batch) delete b.depGraph;
          done += batch.length;
          setProgress({ phase: "save", label: "מעדכן אחסון…", done, total });
        }

        await flushSaveBlocks();
      }

      // After the blocks are durably rewritten — a purge that ran first and
      // was then interrupted would orphan nothing, but doing it in this order
      // means an interruption can only ever leave conv_ keys whose block is
      // already gone, which the next run's getKeys() sweep still finds and
      // removes.
      const purged = await storage.purgeConversationData(convIds);

      try {
        await storage.setBatched({ [STORAGE_VERSION_KEY]: STORAGE_VERSION });
      } catch {}
      if (total || purged) {
        setProgress({
          phase: "save",
          label: "האחסון עודכן",
          done: total,
          total,
          state: "done",
        });
        clearProgress(2000);
        console.log("[ccb-timing] storage.migrate", {
          version: STORAGE_VERSION,
          conversationKeysRemoved: purged,
          conversationBlocksRemoved: convIds.length,
          depGraphs: graphs.length,
        });
      }
      return total > 0;
    } finally {
      endBlocksMutation();
    }
  }

  async function loadBlocks() {
    if (state.blocksLoaded) return;
    state.blocks = await _loadBlocks(STORAGE_KEY);
    await migrateCtxProjects();
    await migrateStorage();
    await window.__ccbHistoryView.loadActiveProjectId();
    state.blocksLoaded = true;
  }

  // ============================================================
  // saveBlocks — coalesced
  // ============================================================
  // A bulk action (folder select-all in the code tree, "load with
  // dependencies", a rescan's document sync) mutates state.blocks many times
  // and calls saveBlocks() after each mutation. Each of those calls used to
  // re-serialize and rewrite the whole map. Writes within the coalesce window
  // are therefore merged into one.
  //
  // Trailing throttle, NOT a resetting debounce: the first call schedules
  // the flush and later calls join it without pushing the deadline back, so a
  // continuous stream of writes still lands on disk instead of starving.
  const SAVE_COALESCE_MS = 150;
  let _saveTimer = null;
  let _savePending = null;
  // E1: how many multi-await block-mutating operations are currently
  // in-flight in THIS tab (scan, rescan, backup import, storage migration —
  // see beginBlocksMutation/endBlocksMutation). A counter, not a boolean,
  // since these can nest/overlap (e.g. an import re-running the migration).
  // The cross-tab storage listener below must not overwrite state.blocks
  // while this is > 0: those operations hold a local reference they keep
  // mutating across several awaits before their own final save, so accepting
  // an external snapshot mid-operation would make that final save silently
  // discard everything the operation built. While the guard is up, an
  // external change is simply not applied — this reverts to ordinary
  // last-write-wins for that window, which is what every write did before
  // E1 existed, so it is not a new regression.
  let _blocksMutationDepth = 0;
  function beginBlocksMutation() {
    _blocksMutationDepth++;
  }
  function endBlocksMutation() {
    _blocksMutationDepth = Math.max(0, _blocksMutationDepth - 1);
  }

  // E1: a plain "skip our own echo once" flag is NOT enough here — it was
  // tried and rejected (see DECISIONS.md). The trailing-throttle coalescing
  // above deliberately allows a NEW edit to be queued while an earlier
  // write's chrome.storage.local.set() is still in flight (that's the whole
  // point of "a continuous stream of writes still lands on disk instead of
  // starving"). That means a write's own onChanged echo can arrive AFTER a
  // newer, not-yet-saved local edit already happened — applying that echo
  // (a boolean flag has no way to tell it's stale) would silently revert the
  // newer edit. _writeGeneration/_lastSavedGeneration below track exactly
  // "does state.blocks currently hold an edit not yet confirmed durable?" —
  // the E1 listener refuses to apply ANY incoming snapshot (self-echo or
  // genuinely external) while that's true, which is correct for both cases:
  // a stale self-echo must not overwrite a newer local edit, and a genuinely
  // external write must not clobber this tab's own pending edit either.
  let _writeGeneration = 0;
  let _lastSavedGeneration = 0;

  function saveBlocks() {
    _writeGeneration++;
    if (!_savePending) {
      let resolve;
      const promise = new Promise((r) => (resolve = r));
      _savePending = { promise, resolve };
    }
    const pending = _savePending;
    if (!_saveTimer) {
      _saveTimer = setTimeout(() => {
        flushSaveBlocks();
      }, SAVE_COALESCE_MS);
    }
    return pending.promise;
  }

  // Write immediately, bypassing the coalesce window. Used by the migration
  // (which must know the stripped map is durable before marking the version)
  // and on page unload.
  async function flushSaveBlocks() {
    if (_saveTimer) {
      clearTimeout(_saveTimer);
      _saveTimer = null;
    }
    const pending = _savePending;
    _savePending = null;
    // Capture BEFORE the write starts (nothing yields between here and the
    // set() call below, so this is exactly the generation this payload
    // reflects) — see _writeGeneration's comment above.
    const myGeneration = _writeGeneration;
    await _saveBlocks(STORAGE_KEY, state.blocks);
    // Only advance up to the generation THIS write actually captured. If a
    // newer edit happened while this write was in flight, _writeGeneration is
    // now ahead of myGeneration — that gap is exactly what tells the E1
    // listener a further save is still outstanding, and it's correct: that
    // newer edit already scheduled its own flush (saveBlocks() always
    // arms a new timer once _saveTimer/_savePending are cleared, which
    // happened at the top of this call), so it will catch up on its own.
    if (myGeneration > _lastSavedGeneration) _lastSavedGeneration = myGeneration;
    pending?.resolve();
  }

  async function loadCtxWindow() {
    if (state.ctxWindowLoaded) return;
    const data = await new Promise((r) =>
      chrome.storage.local.get("ctxWindow", r),
    );
    state.ctxWindow = data.ctxWindow || CTX_WINDOW_DEFAULT;
    state.ctxWindowLoaded = true;
  }

  async function setCtxWindow(k) {
    const val = Math.max(4, Math.min(2048, k)) * 1000;
    state.ctxWindow = val;
    await new Promise((r) => chrome.storage.local.set({ ctxWindow: val }, r));
    return val;
  }

  // Per-document character cap for the "טען קבצים" injection. Only bounds
  // ordinary documents — code files and the generated structure doc are exempt
  // in history-view.js, since truncating either silently drops exactly what was
  // loaded for. Stored in thousands of chars in the UI, raw chars here.
  async function loadDocMaxChars() {
    if (state.docMaxCharsLoaded) return;
    const data = await new Promise((r) =>
      chrome.storage.local.get("docMaxChars", r),
    );
    state.docMaxChars =
      Number(data.docMaxChars) > 0
        ? Number(data.docMaxChars)
        : DOC_MAX_CHARS_DEFAULT;
    state.docMaxCharsLoaded = true;
  }

  async function loadOnboardingSeen() {
    if (state.onboardingSeenLoaded) return;
    const data = await new Promise((r) =>
      chrome.storage.local.get("ccb_onboardingSeen", r),
    );
    state.onboardingSeen = !!data.ccb_onboardingSeen;
    state.onboardingSeenLoaded = true;
  }

  async function setOnboardingSeen(seen) {
    state.onboardingSeen = !!seen;
    state.onboardingSeenLoaded = true;
    await new Promise((r) =>
      chrome.storage.local.set({ ccb_onboardingSeen: !!seen }, r),
    );
  }

  async function setDocMaxChars(k) {
    const val = Math.max(1, Math.min(1000, k)) * 1000;
    state.docMaxChars = val;
    state.docMaxCharsLoaded = true;
    await new Promise((r) => chrome.storage.local.set({ docMaxChars: val }, r));
    return val;
  }

  // WHEN auto-inject fires — "start" | "every", tracked separately per source
  // ("gm" | "project"). Same load/set pattern as ctxWindow/docMaxChars. Must
  // be loaded before the first tryAutoInject() call, since a source in
  // "every" mode is excluded from the conversation-start injection.
  async function loadAutoInjectMode() {
    if (state.autoInjectModeLoaded) return;
    const data = await new Promise((r) =>
      chrome.storage.local.get(
        [
          "ccb_autoInjectModeGm",
          "ccb_autoInjectModeProject",
          "ccb_autoInjectMode",
        ],
        r,
      ),
    );
    // Migration: before 2026-07-22 there was one shared mode for both
    // sources under "ccb_autoInjectMode". Seed both new keys from it when
    // neither has been set yet, so a user who already chose "every" doesn't
    // silently revert to "start" the first time this loads post-split.
    const legacy = data.ccb_autoInjectMode === "every" ? "every" : "start";
    const normalize = (v, fallback) =>
      v === "every" || v === "start" ? v : fallback;
    state.autoInjectModeGm = normalize(data.ccb_autoInjectModeGm, legacy);
    state.autoInjectModeProject = normalize(
      data.ccb_autoInjectModeProject,
      legacy,
    );
    state.autoInjectModeLoaded = true;
  }

  const AUTO_INJECT_MODE_KEYS = {
    gm: "ccb_autoInjectModeGm",
    project: "ccb_autoInjectModeProject",
  };
  const AUTO_INJECT_MODE_LABELS = {
    gm: "הזיכרון הכללי",
    project: "הנחיות הפרויקט",
  };

  async function setAutoInjectMode(source, mode) {
    const val = mode === "every" ? "every" : "start";
    const key = AUTO_INJECT_MODE_KEYS[source] || AUTO_INJECT_MODE_KEYS.gm;
    if (source === "project") state.autoInjectModeProject = val;
    else state.autoInjectModeGm = val;
    state.autoInjectModeLoaded = true;
    await new Promise((r) => chrome.storage.local.set({ [key]: val }, r));
    const label = AUTO_INJECT_MODE_LABELS[source] || AUTO_INJECT_MODE_LABELS.gm;
    setStatus(
      val === "every"
        ? label + " ייטען בתחילת כל הודעה ✓"
        : label + " ייטען פעם אחת בתחילת שיחה ✓",
    );
    return val;
  }

  function getAutoInjectMode(source) {
    return source === "project"
      ? state.autoInjectModeProject
      : state.autoInjectModeGm;
  }

  // Global code-project scan rules. On first ever load there's no stored
  // value, so we seed from document-handler.js's built-in defaults AND persist
  // that immediately — so what the settings dialog shows is always exactly
  // what the scanner uses, and existing users see today's behavior unchanged,
  // just now visible and editable. Each field falls back individually so a
  // partially-written object (older build, interrupted write) can't leave a
  // filter undefined.
  async function loadScanSettings() {
    if (state.scanSettingsLoaded) return;
    const defaults = window.__ccbDocHandler.getDefaultScanSettings();
    const data = await new Promise((r) =>
      chrome.storage.local.get("ccb_scanSettings", r),
    );
    const stored = data.ccb_scanSettings;
    if (!stored) {
      state.scanSettings = defaults;
      await new Promise((r) =>
        chrome.storage.local.set({ ccb_scanSettings: defaults }, r),
      );
    } else {
      state.scanSettings = {
        denyDirs: Array.isArray(stored.denyDirs)
          ? stored.denyDirs
          : defaults.denyDirs,
        denyFilenames: Array.isArray(stored.denyFilenames)
          ? stored.denyFilenames
          : defaults.denyFilenames,
        codeExtensions: Array.isArray(stored.codeExtensions)
          ? stored.codeExtensions
          : defaults.codeExtensions,
        maxFileSizeKb:
          Number(stored.maxFileSizeKb) > 0
            ? Number(stored.maxFileSizeKb)
            : defaults.maxFileSizeKb,
      };
    }
    state.scanSettingsLoaded = true;
  }

  async function saveScanSettings(next) {
    const defaults = window.__ccbDocHandler.getDefaultScanSettings();
    const val = {
      denyDirs: Array.isArray(next?.denyDirs)
        ? next.denyDirs
        : defaults.denyDirs,
      denyFilenames: Array.isArray(next?.denyFilenames)
        ? next.denyFilenames
        : defaults.denyFilenames,
      codeExtensions: Array.isArray(next?.codeExtensions)
        ? next.codeExtensions
        : defaults.codeExtensions,
      maxFileSizeKb: Math.max(
        1,
        Number(next?.maxFileSizeKb) || defaults.maxFileSizeKb,
      ),
    };
    state.scanSettings = val;
    state.scanSettingsLoaded = true;
    await new Promise((r) =>
      chrome.storage.local.set({ ccb_scanSettings: val }, r),
    );
    return val;
  }

  // ============================================================
  // Mount
  // ============================================================
  function mountUI() {
    if (!isActiveSitePage()) return;
    if (mounted) return;
    mounted = true;
    const host = document.createElement("div");
    host.id = "ccb-host";
    host.style.cssText =
      "all:initial;position:fixed;top:0;left:0;width:0;height:0;z-index:2147483647;pointer-events:none;";
    document.body.appendChild(host);
    shadow = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = CSS;
    shadow.appendChild(style);
    const wrap = document.createElement("div");
    wrap.innerHTML = PANEL_HTML;
    while (wrap.firstChild) shadow.appendChild(wrap.firstChild);
    $el = (id) => shadow.getElementById(id);

    initModules();

    $el("fab").style.pointerEvents = "auto";
    $el("panel").style.pointerEvents = "auto";

    wireEvents();
  }

  // ============================================================
  // Module wiring — build deps + call each module's init()
  // ============================================================
  function initModules() {
    const getShadow = () => shadow;
    const modals = window.__ccbModals;
    const historyView = window.__ccbHistoryView;
    const chat = window.__ccbChat;
    const docHandler = window.__ccbDocHandler;

    window.__ccbCtxMeter.init({
      getShadow,
      MSG_SELECTORS,
      CHARS_PER_TOKEN,
      CTX_WINDOW_DEFAULT,
      getCtxWindow: () => state.ctxWindow,
      closeDropdown: () => historyView.closeHiDropdown(),
      setDropdownCleanup: (fn) => {
        state.hiDropdownCleanup = fn;
      },
    });

    window.__ccbMsgNav.init({ getShadow, MSG_SELECTORS });

    window.__ccbSessions.init({
      getShadow,
      AUTO_OPEN_URLS: CONFIG_PUBLIC.AUTO_OPEN_URLS,
      IC,
      setStatus,
      enabled: SESSIONS_ENABLED !== false,
    });

    // "Thinking" detection runs in every frame (top-level + every Parallel
    // Sessions iframe, per all_frames:true) — only sessions.js knows how to
    // RENDER the result (the tab strip only exists in the top-level frame),
    // so this frame-role branch is what tells thinking-indicator.js's local
    // detection where to send its result: straight to sessions.js's own
    // native-tab state when this IS the top-level frame, or up to the
    // top-level frame via postMessage when this frame is a session iframe.
    window.__ccbThinking.init({
      MSG_SELECTORS,
      onChange: (thinking) => {
        if (window.top === window.self) {
          window.__ccbSessions.setNativeThinking(thinking);
        } else {
          try {
            window.top.postMessage({ type: "ccbThinking", thinking }, window.location.origin);
          } catch {
            // Cross-origin top somehow reachable from here shouldn't happen
            // (sessions.js only ever creates same-origin session iframes) —
            // swallow rather than throw from an observer callback.
          }
        }
      },
    });

    modals.init({
      getShadow,
      setStatus,
      refreshPromptsFromRawConfig: () => {}, // framing uses live getters; no-op
      loadBlocks,
      loadCtxWindow,
      getCtxWindow: () => state.ctxWindow,
      loadDocMaxChars,
      getDocMaxChars: () => state.docMaxChars,
      loadAutoInjectMode,
      getAutoInjectMode,
      getProjects: () => historyView.getAllProjects(),
      loadScanSettings,
      // Never null: falls back to the built-in defaults if a scan somehow
      // fires before loadScanSettings() resolved, so a scan can't run with
      // every filter silently disabled.
      getScanSettings: () =>
        state.scanSettings || docHandler.getDefaultScanSettings(),
      saveScanSettings,
      getDefaultScanSettings: () => docHandler.getDefaultScanSettings(),
      getOnboardingSeen: () => state.onboardingSeen,
      setOnboardingSeen,
      getStorageUsage: getStorageUsageBreakdown,
      runOrphanSweep: sweepOrphanKeys,
    });

    docHandler.init({
      loadBlocks,
      saveBlocks,
      getBlocks: () => state.blocks,
    });

    window.__ccbCodeTree.init({
      docHandler,
      getShadow,
      historyView,
      modals,
      loadBlocks,
      saveBlocks,
      setStatus,
      render,
      getCtxWindow: () => state.ctxWindow,
      // A2: the scanned graph is no longer inline on the project block.
      loadDepGraph: (projectId) => storage.loadDepGraph(projectId),
    });

    historyView.init({
      getShadow,
      state,
      framing,
      modals,
      docHandler,
      loadBlocks,
      saveBlocks,
      render,
      setStatus,
      setProgress,
      clearProgress,
      inject: ccbInject,
      openEdit,
      updateInjectBtn,
      injectTracked,
      // A code project's scanned graph (A2) lives in its own `depGraph_<id>`
      // key — written only on scan, so it must not ride along on every
      // saveBlocks().
      saveDepGraph: (projectId, graph) => storage.saveDepGraph(projectId, graph),
      removeDepGraph: (projectId) => storage.removeDepGraph(projectId),
      // E1: a scan/rescan mutates state.blocks across several awaits before
      // its own final save — bracket it so the cross-tab storage listener
      // doesn't overwrite state.blocks mid-scan. See beginBlocksMutation's
      // comment in content.js.
      beginBlocksMutation,
      endBlocksMutation,
      getDocMaxChars: () => state.docMaxChars,
      getCtxWindow: () => state.ctxWindow,
      getAutoInjectMode,
      setAutoInjectMode,
      // Never null: falls back to the built-in defaults if a scan somehow
      // fires before loadScanSettings() resolved, so a scan can't run with
      // every filter silently disabled.
      getScanSettings: () =>
        state.scanSettings || docHandler.getDefaultScanSettings(),
    });

    chat.init({
      getShadow,
      state,
      config: {
        GM_ID,
        SEND_BUTTON_SELECTOR,
        NEW_CHAT_BTN_SELECTOR,
        MSG_SELECTORS,
        CHARS_PER_TOKEN,
      },
      framing,
      inject: ccbInject,
      modals,
      historyView,
      docHandler,
      loadBlocks,
      saveBlocks,
      setStatus,
      render,
      updateInjectBtn,
      openEdit,
      injectTracked,
      injectQuickCommand,
      clearInjectionStack,
      getAutoInjectMode,
      setAutoInjectMode,
    });
  }

  // ============================================================
  // Wire events (central switchboard)
  // ============================================================
  function wireEvents() {
    const modals = window.__ccbModals;
    const historyView = window.__ccbHistoryView;
    const chat = window.__ccbChat;

    $el("fab").addEventListener("click", togglePanel);
    $el("msgNavPrev").addEventListener("click", () => window.__ccbMsgNav.goPrev());
    $el("msgNavNext").addEventListener("click", () => window.__ccbMsgNav.goNext());
    $el("sessionsAddBtn")?.addEventListener("click", () => window.__ccbSessions.addSession());
    $el("settingsBtn").addEventListener("click", (e) => {
      e.stopPropagation();
      modals.closeSettings();
      void modals.openSettings();
    });
    $el("settingsCloseBtn").addEventListener("click", modals.closeSettings);
    $el("settingsOverlay").addEventListener("click", (e) => {
      if (e.target === $el("settingsOverlay")) modals.closeSettings();
    });
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        modals.closeSettings();
        modals.closeScanSettings();
        modals.closeOnboarding();
        window.__ccbCodeTree?.closeFilePreview?.();
        window.__ccbCodeTree?.closeDepsManager?.();
        window.__ccbCodeTree?.closeDepPicker?.();
      }
    });
    $el("scanSettingsOverlay")?.addEventListener("click", (e) => {
      if (e.target === $el("scanSettingsOverlay")) modals.closeScanSettings();
    });
    $el("storageInfoOverlay")?.addEventListener("click", (e) => {
      if (e.target === $el("storageInfoOverlay")) modals.closeStorageInfo();
    });
    $el("exportBackupBtn").addEventListener("click", exportBackup);
    $el("importBackupBtn").addEventListener("click", () => {
      modals.closeSettings();
      $el("importBackupInput").value = "";
      $el("importBackupInput").click();
    });
    $el("editPromptsBtn")?.addEventListener("click", () => {
      modals.openPromptsEditor();
    });
    $el("scanSettingsBtn")?.addEventListener("click", () => {
      modals.closeSettings();
      void modals.openScanSettings();
    });
    $el("storageInfoBtn")?.addEventListener("click", () => {
      modals.closeSettings();
      void modals.openStorageInfo();
    });
    $el("openOnboardingBtn")?.addEventListener("click", () => {
      modals.closeSettings();
      modals.openOnboarding();
    });
    $el("obClose")?.addEventListener("click", () => modals.closeOnboarding());
    $el("importBackupInput").addEventListener("change", async () => {
      const file = $el("importBackupInput").files?.[0];
      await importBackupFile(file);
      $el("importBackupInput").value = "";
    });

    $el("savePromptsBtn")?.addEventListener(
      "click",
      () => void modals.savePromptsEditor(),
    );
    $el("cancelPromptsBtn")?.addEventListener(
      "click",
      modals.closePromptsEditor,
    );
    $el("resetFramingBtn")?.addEventListener(
      "click",
      () => void modals.resetPromptsEditor("framingAll"),
    );
    $el("resetFramingManualBtn")?.addEventListener(
      "click",
      () => void modals.resetPromptsEditor("framingManual"),
    );
    $el("resetFramingGmBtn")?.addEventListener(
      "click",
      () => void modals.resetPromptsEditor("framingGm"),
    );
    $el("resetFramingProjBtn")?.addEventListener(
      "click",
      () => void modals.resetPromptsEditor("framingProj"),
    );
    $el("resetFramingDocsBtn")?.addEventListener(
      "click",
      () => void modals.resetPromptsEditor("framingDocs"),
    );
    $el("resetFramingEveryBtn")?.addEventListener(
      "click",
      () => void modals.resetPromptsEditor("framingEvery"),
    );
    $el("ccb-files-row").addEventListener("click", (e) => {
      e.stopPropagation();
      window.__ccbCtxMeter.openFilesDropdown($el("ccb-files-row"));
    });
    $el("ccb-ctx-size").addEventListener("change", async () => {
      const input = $el("ccb-ctx-size");
      const raw = input?.value?.trim() || "";
      if (!raw) {
        input.value = String(Math.round(state.ctxWindow / 1000));
        return;
      }
      const value = Number(raw);
      if (!Number.isFinite(value)) {
        input.value = String(Math.round(state.ctxWindow / 1000));
        return;
      }
      try {
        const next = await setCtxWindow(value);
        input.value = String(Math.round(next / 1000));
        window.__ccbCtxMeter.update();
      } catch (e) {
        console.error("Failed to save ctxWindow", e);
        input.value = String(Math.round(state.ctxWindow / 1000));
        setStatus("לא ניתן לשמור את חלון הקונטקסט", true);
      }
    });
    $el("ccb-doc-max-chars").addEventListener("change", async () => {
      const input = $el("ccb-doc-max-chars");
      const revert = () => {
        input.value = String(Math.round(state.docMaxChars / 1000));
      };
      const raw = input?.value?.trim() || "";
      if (!raw) return revert();
      const value = Number(raw);
      if (!Number.isFinite(value) || value < 1) return revert();
      try {
        const next = await setDocMaxChars(value);
        input.value = String(Math.round(next / 1000));
      } catch (e) {
        console.error("Failed to save docMaxChars", e);
        revert();
        setStatus("לא ניתן לשמור את מגבלת התווים", true);
      }
    });
    // Separate selects for GM and project-instructions auto-inject mode
    // (2026-07-22 split — previously one shared select/setting for both).
    $el("ccb-auto-inject-mode-gm")?.addEventListener("change", async (e) => {
      try {
        await setAutoInjectMode("gm", e.target.value);
        render(); // refresh the GM card's live badge
      } catch (err) {
        console.error("Failed to save autoInjectModeGm", err);
        e.target.value = state.autoInjectModeGm;
        setStatus("לא ניתן לשמור את מצב הטעינה", true);
      }
    });
    $el("ccb-auto-inject-mode-project")?.addEventListener(
      "change",
      async (e) => {
        try {
          await setAutoInjectMode("project", e.target.value);
          render(); // refresh the project-instructions card's live badge
        } catch (err) {
          console.error("Failed to save autoInjectModeProject", err);
          e.target.value = state.autoInjectModeProject;
          setStatus("לא ניתן לשמור את מצב הטעינה", true);
        }
      },
    );
    $el("closeBtn").addEventListener("click", async () => {
      if ($el("panel").classList.contains("editing") && hasUnsavedChanges()) {
        const ok = await modals.showConfirm({
          title: "שינויים שלא נשמרו",
          msg: "אם תצא עכשיו, השינויים שעשית יאבדו.",
          confirmLabel: "צא בלי לשמור",
        });
        if (!ok) return;
      }
      setPanelOpen(false);
    });
    $el("addProjectBtn").addEventListener(
      "click",
      () => void historyView.addProject(),
    );
    $el("addCodeProjectBtn").addEventListener(
      "click",
      () => void historyView.createCodeProjectBookmark(),
    );
    $el("projectSelectBtn").addEventListener("click", () => {
      historyView.toggleProjectSelectDropdown();
    });
    $el("addBtn").addEventListener("click", () => openEdit(null));
    $el("injectBtn").addEventListener("click", () => chat.injectSelected());
    $el("injectDocsBtn").addEventListener("click", () =>
      historyView.injectProjectDocuments(),
    );
    $el("undoInjectBtn").addEventListener("click", () => undoLastInjection());
    $el("saveBtn").addEventListener("click", saveEdit);
    $el("cancelBtn").addEventListener("click", closeEdit);
    $el("deleteBtn").addEventListener("click", deleteEdit);
    $el("projectDocumentsToggle").addEventListener("click", () => {
      state.projectDocumentsCollapsed = !state.projectDocumentsCollapsed;
      historyView.syncProjectDocumentsSection();
    });
    $el("blocksCollapseBtn").addEventListener("click", () => {
      state.blocksCollapsed = !state.blocksCollapsed;
      syncBlocksSection();
    });

    const ctxExpand = $el("ccb-ctx-expand");
    if (ctxExpand) {
      ctxExpand.addEventListener("click", (e) => {
        e.stopPropagation();
        const expanded = $el("ccb-ctx-expanded");
        const chevron = ctxExpand.querySelector(".collapse-btn");
        if (!expanded) return;
        const isOpen =
          expanded.style.display !== "" && expanded.style.display !== "block";
        if (isOpen) {
          expanded.style.display = "block";
          expanded.setAttribute("aria-hidden", "false");
          ctxExpand.setAttribute("aria-expanded", "true");
          chevron?.classList.remove("collapsed");
        } else {
          expanded.style.display = "none";
          expanded.setAttribute("aria-hidden", "true");
          ctxExpand.setAttribute("aria-expanded", "false");
          chevron?.classList.add("collapsed");
        }
        window.__ccbCtxMeter.update();
      });
    }

    $el("projectEditBtn").addEventListener("click", (e) => {
      e.stopPropagation();
      const project = historyView.getProjectById(state.currentProjectId);
      if (project)
        historyView.openProjectDropdown(project, $el("projectEditBtn"));
    });

    // Full-pane takeover views
    $el("fpBack")?.addEventListener("click", () =>
      window.__ccbCodeTree?.closeFilePreview?.(),
    );
    $el("dmBack")?.addEventListener("click", () =>
      window.__ccbCodeTree?.closeDepsManager?.(),
    );
    $el("dpBack")?.addEventListener("click", () =>
      window.__ccbCodeTree?.closeDepPicker?.(),
    );
  }

  // ============================================================
  // Panel open/close
  // ============================================================
  async function setPanelOpen(open) {
    if (!isActiveSitePage()) return;
    mountUI();

    if (open) {
      await loadBlocks();
      $el("panel").classList.add("open");
      $el("fab").classList.add("hidden");
      pushPage(true);
      render();
      updateInjectBtn();
      window.__ccbCtxMeter.update();
      // Onboarding guide: auto-opens on every panel open until the user
      // actually dismisses it (scrolled to the end, or checked "don't show
      // again") — not just once ever. See loadOnboardingSeen/setOnboardingSeen.
      await loadOnboardingSeen();
      if (!state.onboardingSeen) window.__ccbModals.openOnboarding();
    } else {
      window.__ccbCodeTree?.closeFilePreview?.();
      window.__ccbCodeTree?.closeDepsManager?.();
      window.__ccbCodeTree?.closeDepPicker?.();
      window.__ccbModals?.closeOnboarding();
      window.__ccbHistoryView.closeProjectSelectDropdown();
      $el("panel").classList.remove("open");
      $el("fab").classList.remove("hidden");
      pushPage(false);
      closeEdit();
    }
  }

  function togglePanel() {
    if (!isActiveSitePage()) return;
    mountUI();
    setPanelOpen(!$el("panel").classList.contains("open"));
  }

  // ============================================================
  // Render orchestrator
  // Timing/operation log only — counts, never block content.
  // Every scan/inject flow ends by calling this; before this it had zero
  // timing, so a slow render here was indistinguishable from "stuck" in
  // the console (see [ccb-timing] history-view.render for the breakdown
  // of the historyViewMs slice below).
  // ============================================================
  function render() {
    const startedAt = Date.now();
    window.__ccbChat.renderGeneralMemory();
    const t1 = Date.now();
    renderUnifiedBlocksList();
    const blocksListMs = Date.now() - t1;
    syncBlocksSection();
    syncInjectDocsBtn();
    syncUndoInjectBtn();
    const t2 = Date.now();
    window.__ccbHistoryView.render();
    const historyViewMs = Date.now() - t2;
    // After renderProjectContext() has pruned any non-active project's id from
    // state.selected, refresh the footer count so it matches what's ticked.
    updateInjectBtn();
    const t3 = Date.now();
    window.__ccbCtxMeter.watchConversation();
    window.__ccbCtxMeter.update();
    window.__ccbThinking.watch();
    const ctxMeterMs = Date.now() - t3;
    console.log("[ccb-timing] render", {
      totalBlocks: Object.keys(state.blocks || {}).length,
      blocksListMs,
      historyViewMs,
      ctxMeterMs,
      totalMs: Date.now() - startedAt,
    });
  }

  function syncBlocksSection() {
    const collapsed = state.blocksCollapsed;
    const section = $el("blocksSection");
    const btn = $el("blocksCollapseBtn");
    if (section) section.classList.toggle("collapsed", collapsed);
    if (btn) {
      btn.classList.toggle("collapsed", collapsed);
      btn.title = collapsed ? "פתח פרומפטים" : "סגור פרומפטים";
      btn.setAttribute(
        "aria-label",
        collapsed ? "פתח פרומפטים" : "סגור פרומפטים",
      );
    }

    // Show context hint only in "no project" mode
    const hasProject = !!state.currentProjectId;
    const noProjectHint = $el("noProjectHint");
    if (noProjectHint)
      noProjectHint.style.display = hasProject ? "none" : "block";
  }

  // ============================================================
  // Context list (kept here — tightly coupled to selected state)
  // ============================================================

  /** Renders a single context block row. `projTitle` shows a tag pill when the block belongs to a project. */
  function renderBlockRow(b, projTitle) {
    const isSelected = state.selected.has(b.id);
    const row = document.createElement("div");
    row.className = "block" + (isSelected ? " selected" : "");

    const cbWrap = document.createElement("label");
    cbWrap.className = "cb-wrap";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = isSelected;
    cb.setAttribute("aria-label", b.title);
    cbWrap.addEventListener("click", (e) => e.stopPropagation());
    cb.addEventListener("change", () => {
      if (cb.checked) state.selected.add(b.id);
      else state.selected.delete(b.id);
      row.classList.toggle("selected", cb.checked);
      updateInjectBtn();
    });
    const cbBox = document.createElement("span");
    cbBox.className = "cb-box";
    cbBox.innerHTML =
      '<svg class="cb-check" width="10" height="8" viewBox="0 0 10 8" fill="none"><polyline points="1,4 4,7 9,1" stroke="white" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    cbWrap.appendChild(cb);
    cbWrap.appendChild(cbBox);

    const main = document.createElement("div");
    main.className = "block-main";
    const head = document.createElement("div");
    head.className = "block-head";
    const titleEl = document.createElement("div");
    titleEl.className = "block-title";
    titleEl.textContent = b.title;
    head.appendChild(titleEl);

    // Project name tag — marks blocks that belong to the active project
    if (projTitle) {
      const tag = document.createElement("span");
      tag.className = "ctx-proj-tag";
      tag.textContent = projTitle;
      head.appendChild(tag);
    }

    main.appendChild(head);

    row.addEventListener("click", () => openEdit(b.id));
    row.appendChild(cbWrap);
    row.appendChild(main);
    return row;
  }

  /**
   * Renders the unified prompts list: general blocks (no projectId) plus the
   * active project's own blocks (tagged with the project title so they're
   * visually distinguishable). Blocks belonging to a *different* project stay
   * hidden — switching the active project narrows the list, it never shows
   * everything at once.
   */
  function renderUnifiedBlocksList() {
    const currentProjectId = state.currentProjectId;
    const items = Object.values(state.blocks)
      .filter((b) => !b.kind && b.id !== GM_ID)
      .filter((b) => !b.projectId || b.projectId === currentProjectId)
      .sort((a, b) => (b.updated || 0) - (a.updated || 0));

    const list = $el("list");
    if (!list) return;
    // No empty-state placeholder by design (2026-07-21): with nothing to show
    // the list simply stays blank, and the loop below naturally renders
    // nothing. The History tab keeps its own `.empty` states — that CSS class
    // is still in use, so it was not removed from ui-styles.js.
    list.innerHTML = "";

    for (const b of items) {
      const projTitle = b.projectId
        ? window.__ccbHistoryView.getProjectById(b.projectId)?.title
        : null;
      list.appendChild(renderBlockRow(b, projTitle));
    }
  }

  // ============================================================
  // Project docs inject button (footer)
  // ============================================================
  // The footer "קבצים" button is the single, global entry point for
  // injecting the currently open project's enabled documents (whether
  // hand-picked in the code-project file tree or the flat regular-project
  // document list — both live in #projectView, not duplicated here).
  function syncInjectDocsBtn() {
    const btn = $el("injectDocsBtn");
    if (!btn) return;
    const project = state.currentProjectId
      ? state.blocks[state.currentProjectId]
      : null;
    const docs = project?.documents || [];
    if (!docs.length) {
      btn.style.display = "none";
      return;
    }
    btn.style.display = "flex";
    // A code project's auto-generated "structure" doc used to be forced
    // always-enabled and hidden from the file tree, so it couldn't count as
    // "something is selected" on its own. It now has its own checkbox
    // (code-tree.js#renderStructureRow) like any other doc, so a project
    // where the user has deliberately checked only the structure doc should
    // make this button clickable too — no type exclusion needed anymore.
    const hasSelectable = docs.some((d) => d.enabled);
    btn.disabled = !hasSelectable;
  }

  // ============================================================
  // Undo last injection (Phase 4.1)
  //
  // Reworked (2026-07-28, second pass) after a real-browser report: the first
  // version compared the box's text before/after each injection to decide
  // whether to extend one combined undo or start a new one, and that
  // comparison silently broke in practice (prompts-then-files only undid the
  // files) — almost certainly the target site's contenteditable normalizing
  // its own DOM between our read and the next one, exactly the risk flagged
  // in Stage 3 review. Per the user's explicit direction: a real LIFO stack
  // of every tracked injection, each wrapped with its OWN small id marker
  // pair directly in the injected text — "בטל הזרקה" always undoes the single
  // MOST RECENT one, repeatable. The marker (plain ASCII brackets + a short
  // alnum id) survives contenteditable round-tripping far more reliably than
  // comparing large snapshots of the whole box, and — as a bonus over the
  // snapshot approach — still works correctly even if the user typed
  // something of their own before/after/between injected blocks, since undo
  // now surgically removes just the marked span instead of reverting the
  // entire box to an earlier state.
  //
  // Covers the manual, non-auto-send injection paths: prompts
  // (chat.injectSelected) and files (historyView.injectProjectDocuments →
  // runProjectDocumentsInjection) — both call injectTracked(text, mode)
  // instead of inject.injectIntoInput(text, mode) directly.
  // ============================================================
  // A simple, ever-increasing counter (1, 2, 3, ...) rather than a
  // timestamp+random id — the marker only needs to be unique among
  // injections currently sitting in the box during THIS page load (old ones
  // are gone the moment they're undone, sent, or the chat resets), and a
  // monotonic counter guarantees that with a much shorter, readable id.
  let _injectionIdCounter = 0;
  function generateInjectionId() {
    return String(++_injectionIdCounter);
  }

  function injectionMarkers(id) {
    return { start: `[[CCB:INJ:${id}]]`, end: `[[CCB:INJ-END:${id}]]` };
  }

  // Shared by injectTracked and injectQuickCommand (Phase 4.2): mints a new
  // id and wraps `text` with its marker pair, ready to hand to whichever
  // inject.js primitive actually writes it into the box.
  function wrapForTracking(text) {
    const id = generateInjectionId();
    const { start, end } = injectionMarkers(id);
    return { id, wrapped: `${start}\n${text}\n${end}\n` };
  }

  // Records a successful tracked injection on the undo stack and refreshes
  // the button. `resetStack` clears everything before pushing — used
  // whenever the write we just did wiped out (or never included) any
  // earlier markers, so nothing older would still be findable anyway.
  function commitTrackedInjection(id, resetStack) {
    if (resetStack) state.injectionStack = [];
    state.injectionStack.push(id);
    syncUndoInjectBtn();
  }

  // Drop-in replacement for ccbInject.injectIntoInput at the three tracked
  // call sites — same return shape ({ ok, error? }) — that also wraps the
  // text with a per-injection marker pair and records it on the undo stack.
  function injectTracked(text, mode) {
    const { id, wrapped } = wrapForTracking(text);
    const r = ccbInject.injectIntoInput(wrapped, mode);
    // "replace" wipes the whole box, taking every earlier marker with it —
    // nothing left on the stack would still be findable.
    if (r.ok) commitTrackedInjection(id, mode === "replace");
    return r;
  }

  // Phase 4.2 — quick commands ("/" + a saved prompt's own trigger, typed
  // anywhere the chat box's trigger-detection allows — see
  // chat-features.js#_qcRelevantSuffix — like invoking a skill in Claude
  // Code). `typedText` is exactly the trailing "/query" text chat-features.js
  // detected (2026-07-28 fix: this is no longer necessarily the box's ENTIRE
  // content — it's whatever comes after the last completed injection's own
  // end-marker, if any, which is what lets a SECOND quick command be typed
  // right after a first one instead of only ever working on an empty box).
  // Reuses the same marker-wrap so the injected prompt participates in the
  // same undo stack as any other injection.
  //
  // 2026-08-05: used to insert the injected block IN PLACE of the typed
  // "/query" (via ccbInject.replaceTrailingText alone) — so typing a
  // sentence first and a "/command" at its end left the injected block
  // stranded after that free text, instead of in the "injection area" the
  // user expects every injection (the footer "טען פרומפטים" button,
  // injectTracked's own "prepend" mode) to land in: the very front of the
  // box, before anything the user typed themselves. Now a two-step
  // operation: first delete just the "/query" text (replaceTrailingText
  // with an empty replacement — a plain drop-in, not a new primitive, since
  // that function already handles both the textarea and contenteditable
  // paths generically), then prepend the wrapped block to the box's start
  // exactly like injectTracked(text, "prepend") does — so free text typed
  // before, after, or around the trigger always ends up trailing after
  // every injected block, never interleaved with one.
  function injectQuickCommand(typedText, text) {
    const removed = ccbInject.replaceTrailingText(typedText, "");
    if (!removed.ok) return removed;
    const { id, wrapped } = wrapForTracking(text);
    const r = ccbInject.injectIntoInput(wrapped, "prepend");
    // Never resets the stack: an earlier injection's marker may still be
    // sitting earlier in the box (that's exactly what makes chaining a
    // second quick command possible), and it's still a valid undo target.
    if (r.ok) commitTrackedInjection(id, false);
    return r;
  }

  // Called when a real send goes out with stray injection markers still in
  // the box (chat-features.js#_interceptSend strips the marker tokens from
  // the sent text itself) — those injections are gone from the box now, so
  // their ids are no longer valid undo targets.
  function clearInjectionStack() {
    state.injectionStack = [];
    syncUndoInjectBtn();
  }

  function syncUndoInjectBtn() {
    const btn = $el("undoInjectBtn");
    if (!btn) return;
    const n = state.injectionStack.length;
    if (!n) {
      btn.style.display = "none";
      return;
    }
    btn.style.display = "flex";
    btn.innerHTML =
      n > 1 ? IC.undo + ' <span class="count-pill">' + n + "</span>" : IC.undo;
  }

  function undoLastInjection() {
    if (!state.injectionStack.length) return;
    const id = state.injectionStack.pop();
    const { start, end } = injectionMarkers(id);
    // Delegates to inject.js#removeMarkedSpan — a direct DOM-range deletion
    // of just the marked block, O(removed span) rather than reading the
    // whole field (innerText, layout-forcing) and rewriting everything still
    // in it via "replace" mode. That read-whole+rebuild-whole approach was
    // the first cut of this function and is what made undo slow/hang after
    // a large "טען קבצים" load — the box's UNCHANGED remainder was being
    // fully torn down and rebuilt as new DOM on every single undo click.
    const r = ccbInject.removeMarkedSpan(start, end);
    syncUndoInjectBtn();
    if (r.ok) {
      setStatus("ההזרקה האחרונה בוטלה ✓");
    } else if (r.error === "not-found") {
      // The marked block is gone already — sent, hand-edited, or the chat
      // was reset. Nothing to remove; the stale entry is already popped, so
      // the next click targets whatever was injected before it.
      setStatus("ההזרקה הזו כבר לא נמצאת בתיבה", true);
    } else {
      setStatus(r.error || "נכשל", true);
    }
  }

  // ============================================================
  // Edit form
  // ============================================================
  function hasUnsavedChanges() {
    if (
      !state.editingId &&
      !$el("editTitle").value.trim() &&
      !$el("editContent").value.trim()
    )
      return false;
    const b = state.editingId ? state.blocks[state.editingId] : null;
    if (!b)
      return (
        !!$el("editTitle").value.trim() || !!$el("editContent").value.trim()
      );
    return (
      $el("editTitle").value.trim() !== (b.title || "") ||
      $el("editContent").value.trim() !== (b.content || "") ||
      $el("editTrigger").value.trim() !== (b.trigger || "")
    );
  }

  function openEdit(id, prefill) {
    state.editingId = id;
    const b = id ? state.blocks[id] : null;
    $el("editTitle").value = b ? b.title : prefill?.title || "";
    $el("editTrigger").value = b ? b.trigger || "" : "";
    $el("editContent").value = b ? b.content : prefill?.content || "";
    // Project blocks have their own delete flow (historyView.deleteProject,
    // behind #projectEditBtn's dropdown) that also cleans up child blocks —
    // this generic delete doesn't, so it stays hidden for kind:"project".
    $el("deleteBtn").style.display =
      id && b?.kind !== "project" ? "block" : "none";

    // Show which project this block belongs to: an existing block's own
    // projectId, or — for a brand-new block — the currently active project
    // it's about to be created into.
    const projectId = b ? b.projectId : state.currentProjectId;
    const project = projectId
      ? window.__ccbHistoryView.getProjectById(projectId)
      : null;
    const tag = $el("editProjectTag");
    if (tag) {
      tag.style.display = project ? "flex" : "none";
      if (project) $el("editProjectTagText").textContent = project.title;
    }

    $el("panel").classList.add("editing");
    $el("editTitle").focus();
  }

  function closeEdit() {
    state.editingId = null;
    if (!shadow) return;
    $el("panel").classList.remove("editing");
    setStatus("");
  }

  async function saveEdit() {
    const title = $el("editTitle").value.trim();
    const content = $el("editContent").value.trim();
    const triggerRaw = $el("editTrigger").value.trim();
    if (!title || !content) {
      setStatus("צריך כותרת ותוכן", true);
      return;
    }
    const id =
      state.editingId ||
      "b_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7);

    // Quick-command trigger (Phase 4.2) — optional. Normalized to always
    // carry its own leading "/" so storage/lookup never has to guess;
    // empty clears any previously-saved trigger (spread below would
    // otherwise keep a stale one from `existing`).
    let trigger;
    if (triggerRaw) {
      trigger = triggerRaw.startsWith("/") ? triggerRaw : "/" + triggerRaw;
      if (/\s/.test(trigger)) {
        setStatus("קיצור לא יכול להכיל רווחים", true);
        return;
      }
      // Case-insensitive — matching at typing time (chat-features.js) is
      // also case-insensitive, so two triggers differing only by case would
      // otherwise both save fine yet be indistinguishable when typed.
      const conflict = Object.values(state.blocks).find(
        (b) =>
          b &&
          b.id !== id &&
          (b.trigger || "").toLowerCase() === trigger.toLowerCase(),
      );
      if (conflict) {
        setStatus(`הקיצור ${trigger} כבר בשימוש ע"י "${conflict.title}"`, true);
        return;
      }
    }

    const existing = state.blocks[id];
    // Spread existing first so fields the form doesn't know about (kind,
    // autoLoad, projectId, and — critically — a project's documents/
    // isCodeProject/dirHandleId/lastScanned/depGraph) survive an edit
    // instead of being silently dropped. Tags were retired 2026-07-28 — any
    // stale `tags` array on an old block rides along harmlessly via the
    // spread but is never read or rendered anymore.
    state.blocks[id] = {
      ...existing,
      id,
      title,
      content,
      trigger,
      updated: Date.now(),
    };
    // A brand-new block is created into whichever project is currently
    // active (or general, if none is); an existing block keeps its own.
    if (!existing && state.currentProjectId)
      state.blocks[id].projectId = state.currentProjectId;
    await saveBlocks();
    closeEdit();
    render();
  }

  async function deleteEdit() {
    if (!state.editingId) return;
    const ok = await window.__ccbModals.showConfirm({
      title: "מחיקת בלוק",
      msg:
        'למחוק את "' +
        state.blocks[state.editingId].title +
        '"? לא ניתן לשחזר.',
      confirmLabel: "מחק",
      danger: true,
    });
    if (!ok) return;
    const deletedId = state.editingId;
    delete state.blocks[deletedId];
    state.selected.delete(deletedId);
    await saveBlocks();
    closeEdit();
    render();
  }

  function updateInjectBtn() {
    if (!shadow) return;
    const btn = $el("injectBtn");
    const n = state.selected.size;
    btn.disabled = n === 0;
    if (n > 0) {
      btn.innerHTML =
        IC.upload + ' טען פרומפטים <span class="count-pill">' + n + "</span>";
    } else {
      btn.innerHTML = IC.upload + " טען פרומפטים";
    }
  }

  // ============================================================
  // Toast / status
  // ============================================================
  function setStatus(msg, isError) {
    if (!shadow) return;
    if ($el("panel").classList.contains("editing")) {
      const s = $el("status");
      if (!s) return;
      s.textContent = msg;
      s.style.color = isError ? "#c53030" : "#2f855a";
      s.style.display = msg ? "block" : "none";
      return;
    }
    if (!msg) return;
    const t = $el("toast");
    if (!t) return;
    t.textContent = msg;
    t.className = "show" + (isError ? " error" : "");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      t.className = "";
    }, 2500);
  }

  // ============================================================
  // Persistent progress indicator (#scanProgress)
  //
  // Unlike setStatus (a toast that auto-hides after 2.5s), this stays on
  // screen for the whole operation and reports both how many files are done
  // and which one is being handled right now. Long operations — scanning a
  // code project, saving its files, loading them into the chat — are exactly
  // the case where a vanished toast leaves the user unsure anything is
  // happening.
  //
  // DOM writes are throttled to one animation frame: the scan calls this once
  // per file with up to 12 reads in flight, and repainting a progress bar
  // thousands of times a second would eat the very latency budget the
  // concurrent scan exists to reclaim.
  // ============================================================
  const PROGRESS_THROTTLE_MS = 80;
  const PROGRESS_PHASE_LABELS = {
    discover: "מאתר קבצים",
    read: "קורא קבצים",
    graph: "בונה מפת תלויות",
    save: "שומר קבצים",
    load: "טוען קבצים לצ'אט",
  };

  let progressPending = null;
  let progressTimer = 0;
  // Bumped on every update so a held "done"/"error" hide scheduled by an
  // earlier operation can't hide the indicator of one that started since.
  let progressSeq = 0;

  // Long paths are shortened from the LEFT — the file name matters more than
  // the repo root it sits under.
  function shortenPath(p, maxLen = 46) {
    const text = String(p || "");
    if (text.length <= maxLen) return text;
    const parts = text.split("/");
    let tail = parts.pop() || text;
    while (
      parts.length &&
      tail.length + parts[parts.length - 1].length + 1 < maxLen
    ) {
      tail = parts.pop() + "/" + tail;
    }
    return "…/" + tail;
  }

  function flushProgress() {
    progressTimer = 0;
    const p = progressPending;
    progressPending = null;
    if (!p || !shadow) return;

    const box = $el("scanProgress");
    if (!box) return;
    box.style.display = "block";

    const total = Number(p.total) || 0;
    const done = Number(p.done) || 0;
    $el("scanProgressPhase").textContent =
      p.label || PROGRESS_PHASE_LABELS[p.phase] || "";
    $el("scanProgressCount").textContent = total
      ? `${done} / ${total}`
      : done
        ? String(done)
        : "";
    $el("scanProgressCurrent").textContent = p.current
      ? shortenPath(p.current)
      : "";

    const fill = $el("scanProgressFill");
    fill.className =
      "scan-progress-fill" +
      (p.state === "done" ? " done" : p.state === "error" ? " error" : "");
    if (total > 0) {
      fill.style.width = Math.min(100, Math.round((done / total) * 100)) + "%";
    } else if (p.state === "done" || p.state === "error") {
      fill.style.width = "100%";
    } else {
      // No total known yet (still discovering) — sweep instead of sitting at 0%.
      fill.className += " indeterminate";
    }
  }

  // Throttled with setTimeout rather than requestAnimationFrame: rAF is
  // suspended while the tab is backgrounded, and a scan the user left running
  // in another tab would then show a frozen indicator when they came back.
  function setProgress(payload) {
    progressPending = payload;
    progressSeq++;
    if (progressTimer) return;
    progressTimer = setTimeout(flushProgress, PROGRESS_THROTTLE_MS);
  }

  // `holdMs` keeps a final "done"/"error" state visible briefly so the user
  // sees the outcome instead of the indicator just vanishing.
  function clearProgress(holdMs = 0) {
    const seq = progressSeq;
    const hide = () => {
      // A newer operation started during the hold — leave its indicator alone.
      if (progressSeq !== seq) return;
      if (progressTimer) {
        clearTimeout(progressTimer);
        progressTimer = 0;
      }
      progressPending = null;
      const box = $el("scanProgress");
      if (box) box.style.display = "none";
    };
    if (holdMs > 0) setTimeout(hide, holdMs);
    else hide();
  }

  // ============================================================
  // Content-key bookkeeping — shared by backup (D1/D2) and orphan GC (D3/D4)
  // ============================================================
  // Every id a given `blocks` map currently "owns" content for, by prefix.
  // `conv_` is deliberately not tracked here — see storage.js's comment on
  // CONTENT_KEY_PREFIXES for why that space is a one-time purge, not this.
  function collectAliveContentIds(blocks) {
    const projectIds = new Set();
    const codeDocIds = new Set();
    const blobDocIds = new Set();
    for (const b of Object.values(blocks || {})) {
      if (!b) continue;
      if (b.isCodeProject) projectIds.add(b.id);
      for (const doc of b.documents || []) {
        if (!doc) continue;
        if (doc.type === "code") codeDocIds.add(doc.id);
        if (doc.hasBlob) blobDocIds.add(doc.id);
      }
    }
    return { projectIds, codeDocIds, blobDocIds };
  }

  // Removes depGraph_*/codeContent_*/docBlob_* keys owned by `oldBlocks` but
  // not by `newBlocks` — the case that arises when import replaces the whole
  // map wholesale (D2) and, more generally, whenever a delete path forgets a
  // storage key (D4's automatic sweep uses the same alive-set logic, but
  // computed once from a live key listing instead of an old/new diff).
  async function removeOrphansForReplacedBlocks(oldBlocks, newBlocks) {
    const before = collectAliveContentIds(oldBlocks);
    const after = collectAliveContentIds(newBlocks);
    const keys = [];
    for (const id of before.projectIds) {
      if (!after.projectIds.has(id)) keys.push(storage.depGraphKey(id));
    }
    for (const id of before.codeDocIds) {
      if (!after.codeDocIds.has(id)) keys.push(storage.codeContentKey(id));
    }
    for (const id of before.blobDocIds) {
      if (!after.blobDocIds.has(id)) keys.push(storage.docBlobKey(id));
    }
    if (keys.length) await storage.remove(keys);
    return keys.length;
  }

  // ============================================================
  // Orphan GC (D3 manual button + D4 automatic throttled sweep)
  // ============================================================
  // Lists every depGraph_*/codeContent_*/docBlob_* key actually in storage
  // (via listAllKeys — see storage.js) and removes whichever ones no live
  // block/document owns per collectAliveContentIds(state.blocks). Returns
  // null when the key listing isn't available (older Chrome) rather than a
  // count of 0 — "unknown" and "nothing to clean" must stay distinguishable,
  // same convention storage.js#purgeConversationData already uses.
  async function sweepOrphanKeys() {
    const allKeys = await storage.listAllKeys();
    if (allKeys === null) return null;
    const alive = collectAliveContentIds(state.blocks);
    const aliveKeys = new Set([
      ...Array.from(alive.projectIds, storage.depGraphKey),
      ...Array.from(alive.codeDocIds, storage.codeContentKey),
      ...Array.from(alive.blobDocIds, storage.docBlobKey),
    ]);
    const orphans = allKeys.filter(
      (k) =>
        storage.CONTENT_KEY_PREFIXES.some((p) => k.startsWith(p)) &&
        !aliveKeys.has(k),
    );
    if (orphans.length) await storage.remove(orphans);
    return orphans.length;
  }

  // D3: byte breakdown backing the storage-usage panel in Advanced Options.
  // `byPrefix`/an unlistable total are null (not 0) when getKeys()/
  // getBytesInUse() aren't available — the UI must show "unknown", not
  // report a false zero.
  async function getStorageUsageBreakdown() {
    const total = await storage.getBytesInUse(null);
    const blocksBytes = await storage.getBytesInUse([STORAGE_KEY]);
    const allKeys = await storage.listAllKeys();
    let byPrefix = null;
    if (allKeys) {
      byPrefix = {};
      for (const prefix of storage.CONTENT_KEY_PREFIXES) {
        const keys = allKeys.filter((k) => k.startsWith(prefix));
        byPrefix[prefix] = keys.length ? await storage.getBytesInUse(keys) : 0;
      }
    }
    return { total, blocksBytes, byPrefix };
  }

  // Automatic, throttled to once per calendar day — an orphan key is a slow
  // leak (interrupted scans, a delete path that missed a key), not something
  // that needs sweeping on every load. Tracked via a plain timestamp key
  // rather than storage.local's own quota APIs, since "was this checked
  // today" is all that's needed.
  const ORPHAN_GC_KEY = "ccb_lastOrphanGC";
  const ORPHAN_GC_INTERVAL_MS = 24 * 60 * 60 * 1000;

  async function maybeRunAutomaticOrphanGc() {
    let last = 0;
    try {
      const data = await storage.get([ORPHAN_GC_KEY]);
      last = data[ORPHAN_GC_KEY] || 0;
    } catch {
      return;
    }
    if (Date.now() - last < ORPHAN_GC_INTERVAL_MS) return;
    try {
      const removed = await sweepOrphanKeys();
      if (removed) console.log("[ccb-timing] storage.orphanGC", { removed });
    } catch {
      // Best-effort — a failed sweep just tries again on the next load past
      // the interval; it must never block panel init.
    } finally {
      await storage.setBatched({ [ORPHAN_GC_KEY]: Date.now() });
    }
  }

  // ============================================================
  // Backup export/import (uses modals.showConfirm, mutates state.blocks)
  // ============================================================
  // Backup format v3. A code project's dependency graph doesn't live on its
  // block (A2), so exporting `blocks` alone would produce a backup with every
  // graph missing; it gets its own section here and is restored to its own
  // key on import.
  //
  // v3 dropped the `conversations` section along with the conversation-history
  // feature itself (2026-08-04). A v2 file's conversation data is ignored on
  // import rather than restored — nothing can read it anymore.
  //
  // D1 (2026-08-04, same day): backup now includes codeContent_*/docBlob_*
  // content too — a restore that lists files with no text/blob behind them
  // was a real gap. Still one synchronous JSON.stringify, deliberately not
  // chunked/streamed: `blocks` is metadata-only since Phase A and the
  // conversation data that used to dominate the total size is gone, so at
  // today's scale streaming would be complexity without a real problem to
  // solve (confirmed with the user rather than assumed — see DECISIONS.md).
  const BACKUP_VERSION = 3;

  async function exportBackup() {
    await loadBlocks();
    const { projectIds, codeDocIds, blobDocIds } = collectAliveContentIds(state.blocks);

    setProgress({ phase: "read", label: "מכין גיבוי…", done: 0, total: 0 });
    const depGraphs = {};
    for (const id of projectIds) {
      const graph = state.blocks[id].depGraph || (await storage.loadDepGraph(id));
      if (graph) depGraphs[id] = graph;
    }
    const codeContents = {};
    if (codeDocIds.size) {
      const data = await storage.get(Array.from(codeDocIds, storage.codeContentKey));
      for (const id of codeDocIds) {
        const content = data[storage.codeContentKey(id)];
        if (content != null) codeContents[id] = content;
      }
    }
    const docBlobs = {};
    if (blobDocIds.size) {
      const data = await storage.get(Array.from(blobDocIds, storage.docBlobKey));
      for (const id of blobDocIds) {
        const blob = data[storage.docBlobKey(id)];
        if (blob != null) docBlobs[id] = blob;
      }
    }
    clearProgress();

    const payload = {
      __ccbBackupVersion: BACKUP_VERSION,
      exportedAt: Date.now(),
      blocks: state.blocks,
      depGraphs,
      codeContents,
      docBlobs,
    };
    const blob = new Blob([JSON.stringify(payload)], {
      type: "application/json;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "context-bank-backup.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    window.__ccbModals.closeSettings();
    setStatus("הגיבוי יוצא ✓");
  }

  async function importBackupFile(file) {
    if (!file) return;
    const text = await file.text();
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      setStatus("קובץ JSON לא תקין", true);
      return;
    }

    if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
      setStatus("מבנה קובץ לא תקין", true);
      return;
    }

    const ok = await window.__ccbModals.showConfirm({
      title: "ייבוא גיבוי",
      msg: "הייבוא יחליף את כל הבלוקים הקיימים. להמשיך?",
      confirmLabel: "ייבוא",
      danger: true,
    });
    if (!ok) return;

    // A v1 backup is a bare { [id]: block } map with data inline on the
    // blocks; v2/v3 separate it out, matching the storage layout. All are
    // accepted — an inline copy from a v1 file is simply migrated on the
    // next load, exactly like any other pre-v2 block. A v2 file's
    // `conversations` section is deliberately not restored: the feature that
    // read it is gone, so restoring it would only re-create the unreachable
    // data the v3 migration exists to purge.
    const isWrapped = parsed.__ccbBackupVersion >= 2 && parsed.blocks;
    const blocks = isWrapped ? parsed.blocks : parsed;
    if (!blocks || typeof blocks !== "object" || Array.isArray(blocks)) {
      setStatus("מבנה קובץ לא תקין", true);
      return;
    }

    setProgress({ phase: "save", label: "מייבא…", done: 0, total: 0 });
    // E1 guard: everything from here on mutates state.blocks across several
    // awaits before the operation is durably done — see
    // beginBlocksMutation's comment. Deliberately NOT covering the JSON
    // parse / confirm-dialog wait above, which don't mutate anything and can
    // sit open indefinitely on user input.
    beginBlocksMutation();
    try {
      if (isWrapped) {
        const items = {};
        for (const [id, graph] of Object.entries(parsed.depGraphs || {})) {
          items[storage.depGraphKey(id)] = graph;
        }
        // D1: restore code-file text and uploaded-doc blobs from the backup —
        // without this a restored project lists files with nothing behind it.
        for (const [id, content] of Object.entries(parsed.codeContents || {})) {
          items[storage.codeContentKey(id)] = content;
        }
        for (const [id, blob] of Object.entries(parsed.docBlobs || {})) {
          items[storage.docBlobKey(id)] = blob;
        }
        await storage.setBatched(items);
      }

      // D2: import replaces `blocks` wholesale, so anything the OLD data
      // owned that the NEW data doesn't would otherwise sit orphaned in
      // storage forever. Compute this before overwriting state.blocks.
      const oldBlocks = state.blocks;

      state.blocks = blocks;
      state.blocksLoaded = true;
      state.selected.clear();
      state.editingId = null;
      await flushSaveBlocks();
      await removeOrphansForReplacedBlocks(oldBlocks, blocks);
      // Rewind the version marker so the migration runs over the imported
      // blocks: a v1 file puts inline graphs back on them, and any file can
      // carry conversation blocks that must be purged under the v3 layout.
      await storage.setBatched({ [STORAGE_VERSION_KEY]: 1 });
      await migrateStorage();
    } finally {
      endBlocksMutation();
    }
    clearProgress();
    closeEdit();
    window.__ccbModals.closeSettings();
    render();
    updateInjectBtn();
    setStatus("הייבוא הושלם ✓");
  }

  // ============================================================
  // Cleanup
  // ============================================================
  window.addEventListener("beforeunload", () => {
    window.__ccbCtxMeter?.cleanup();
    // Don't let a write still sitting in the 150ms coalesce window die with
    // the page. Fire-and-forget — unload can't await, but issuing the set()
    // here is strictly better than dropping it.
    if (_savePending) flushSaveBlocks();
  });

  // ============================================================
  // Cross-tab sync (E1)
  // ============================================================
  // Two tabs on chat pages both hold their own state.blocks, loaded once and
  // never re-read (state.blocksLoaded guards loadBlocks against it) — before
  // this, editing in one tab and then saving from another was silent
  // last-write-wins over the WHOLE map, discarding the first tab's change.
  // Since Phase A moved bulk data (depGraph, previously conversation
  // messages) off `blocks` entirely, this mostly matters now for two tabs
  // both toggling the same project's documents/code-tree selection.
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local" || !changes.blocks || !state.blocksLoaded) return;
    // A scan/import/migration in THIS tab is mid-flight, holding its own
    // local reference across several awaits before its final save — accepting
    // an external snapshot now would make that final save silently discard
    // everything it built. Skip; its own save will supersede this event
    // anyway once it completes (ordinary last-write-wins for this window).
    if (_blocksMutationDepth > 0) return;
    // A local edit exists that isn't confirmed durable yet (either mid-flight
    // or still waiting out the coalesce window) — this incoming snapshot,
    // even if it's this tab's own echo, could predate that edit. Skip; once
    // the pending save completes, _lastSavedGeneration catches up and this
    // listener resumes accepting updates. See _writeGeneration's comment.
    if (_writeGeneration !== _lastSavedGeneration) return;
    state.blocks = changes.blocks.newValue || {};
    // The block being edited in THIS tab was deleted from another one —
    // close the form rather than let Save silently resurrect a stale copy.
    if (state.editingId && !state.blocks[state.editingId]) closeEdit();
    if (shadow) render();
  });

  // ============================================================
  // Message router + keyboard shortcut
  // ============================================================
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    (async () => {
      if (msg?.action === "togglePanel") {
        togglePanel();
        sendResponse({ ok: true });
      } else if (msg?.action === "inject") {
        sendResponse(ccbInject.injectIntoInput(msg.text, msg.mode));
      } else {
        sendResponse({ ok: false, error: "unknown action" });
      }
    })().catch((e) => sendResponse({ ok: false, error: e.message }));
    return true;
  });

  window.addEventListener(
    "keydown",
    (e) => {
      if (e.ctrlKey && e.shiftKey && (e.key === "L" || e.key === "l")) {
        e.preventDefault();
        togglePanel();
      }
    },
    true,
  );

  // ============================================================
  // URL change watcher (SPA navigation)
  // ============================================================
  let urlWatchInstalled = false;
  function installUrlChangeWatcher() {
    if (urlWatchInstalled) return;
    urlWatchInstalled = true;

    const notify = () => {
      try {
        window.dispatchEvent(new Event("ccb:urlchange"));
      } catch {
        // ignore
      }
    };

    try {
      const origPush = history.pushState;
      const origReplace = history.replaceState;
      history.pushState = function (...args) {
        const r = origPush.apply(this, args);
        notify();
        return r;
      };
      history.replaceState = function (...args) {
        const r = origReplace.apply(this, args);
        notify();
        return r;
      };
    } catch {
      // ignore
    }

    window.addEventListener("popstate", notify, true);

    window.addEventListener(
      "ccb:urlchange",
      () => {
        if (!isActiveSitePage()) return;
        state.gmAutoInjected = false;
        // A fresh chat has nothing left to undo.
        state.injectionStack = [];
        window.__ccbChat.closeQuickCommandMenu();
        window.__ccbMsgNav.reset();
        window.__ccbChat.tryAutoInject();
        syncUndoInjectBtn();
      },
      true,
    );
  }

  // ============================================================
  // New-chat button watcher
  //
  // Clicking the chat's "new chat" button should behave LOGICALLY like a
  // refresh — without actually reloading the page. We do NOT preventDefault:
  // the chat's own click handler clears its UI for us. We piggyback on the
  // click to reset OUR in-memory state to match (GM auto-inject flag, the
  // undo stack).
  //
  // Event delegation on document (capture phase) — survives re-renders.
  // ============================================================
  let _newChatDelegationInstalled = false;

  function installNewChatBtnWatcher() {
    if (!NEW_CHAT_BTN_SELECTOR) return;
    if (_newChatDelegationInstalled) return;
    _newChatDelegationInstalled = true;

    document.addEventListener(
      "click",
      (e) => {
        const target = e.target;
        if (!target || !target.closest) return;
        const btn = target.closest(NEW_CHAT_BTN_SELECTOR);
        if (!btn) return;

        console.debug("[ccb] new-chat button click → resetting state");

        state.gmAutoInjected = false;
        state.injectionStack = [];
        window.__ccbChat.closeQuickCommandMenu();
        window.__ccbMsgNav.reset();
        syncUndoInjectBtn();
        window.__ccbChat.tryAutoInject();
      },
      true,
    );
  }

  // ============================================================
  // Init
  // ============================================================
  function shouldAutoOpen() {
    return CONFIG_PUBLIC.AUTO_OPEN_URLS.some((u) =>
      location.href.startsWith(u),
    );
  }

  async function init() {
    if (!isActiveSitePage()) return;
    // עצל ולא חוסם בכוונה: אוצר המילים שוקל 3.6MB, ורק דפי האתר הפעיל
    // משלמים עליו. עד שהוא מוכן, estimateTextTokens מחזיר את האומדן
    // ההיוריסטי — הפאנל עולה מיד ומדייק את עצמו כשהטעינה מסתיימת.
    window.__ccbTokenizer?.load().then((ok) => {
      if (!ok || !shadow) return;
      window.__ccbCtxMeter.resetTokenCache();
      if ($el("panel")?.classList.contains("open")) render();
      else window.__ccbCtxMeter.update();
    });
    await loadCtxWindow();
    await loadDocMaxChars();
    await loadScanSettings();
    // mountUI must run before chat module touches shadow DOM
    mountUI();
    window.__ccbCtxMeter.watchFileInputs();
    window.__ccbCtxMeter.watchConversation();
    window.__ccbThinking.watch();
    await loadBlocks();
    // Must resolve before the first tryAutoInject — "every" mode suppresses
    // the conversation-start injection, and an unloaded mode would default to
    // "start" for that first call.
    await loadAutoInjectMode();
    installUrlChangeWatcher();
    installNewChatBtnWatcher();
    window.__ccbChat.tryAutoInject();
    if (shouldAutoOpen()) setPanelOpen(true);
    // D4: fire-and-forget, throttled to once/day internally — must never
    // delay panel init, so it isn't awaited.
    maybeRunAutomaticOrphanGc();
  }

  if (
    document.readyState === "complete" ||
    document.readyState === "interactive"
  ) {
    init();
  } else {
    window.addEventListener("DOMContentLoaded", init, { once: true });
  }
})();
