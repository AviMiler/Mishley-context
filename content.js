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
  } = window.__ccbRawConfig;

  const CONFIG_PUBLIC = { AUTO_OPEN_URLS, SEND_BUTTON_SELECTOR, SIDEBAR_WIDTH };
  const { loadBlocks: _loadBlocks, saveBlocks: _saveBlocks } = window.__ccbStorage;
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
    historySearchMode: "title",
    // The globally active project (or null = "no project"), selected via the
    // persistent bar above both tabs. Drives: which blocks/documents show in
    // the Context tab, which project a newly-started conversation is stamped
    // with, and the History tab's project filter. Persisted across sessions
    // (see loadActiveProjectId/setActiveProjectId in history-view.js).
    currentProjectId: null,
    activeProjectLoaded: false,
    // History tab: when a project is active, the list is filtered to that
    // project's conversations by default — this overrides the filter to show
    // everything. Transient (resets each panel session), like historySearchMode.
    historyShowAll: false,
    historyCollapsed: false,
    projectDocumentsCollapsed: false,
    blocksCollapsed: false,
    ctxWindow: CTX_WINDOW_DEFAULT,
    ctxWindowLoaded: false,
    docMaxChars: DOC_MAX_CHARS_DEFAULT,
    docMaxCharsLoaded: false,
    // Global code-project scan rules (which folders/files/extensions get
    // scanned, and the per-file size cap). Seeded from document-handler.js's
    // defaults on first load, then user-editable from Advanced Options.
    scanSettings: null,
    scanSettingsLoaded: false,
    gmAutoInjected: false,
    currentConversationViewId: null,
    cvSelectedIndices: new Set(),
    cvMatchElements: [],
    cvMatchIndex: 0,
    cvOpenedFromProject: false,
    hiDropdownCleanup: null,
    // Auto-save: id of the conversation block bound to *this* page load.
    // Cleared on URL change (SPA new chat); page refresh naturally resets it
    // because content scripts re-execute.
    currentConversationId: null,
  };

  // Live FRAMING getters — picks up edits from prompts.js automatically
  const framing = {
    get manualPre()    { return window.__ccbRawConfig.FRAMING_MANUAL_PRE || window.__ccbRawConfig.FRAMING || ""; },
    get manualPost()   { return window.__ccbRawConfig.FRAMING_MANUAL_POST || ""; },
    get gmPre()        { return window.__ccbRawConfig.FRAMING_GM_PRE || window.__ccbRawConfig.FRAMING || ""; },
    get gmPost()       { return window.__ccbRawConfig.FRAMING_GM_POST || ""; },
    get convPre()      { return window.__ccbRawConfig.FRAMING_CONV_PRE || ""; },
    get convPost()     { return window.__ccbRawConfig.FRAMING_CONV_POST || ""; },
    get projPre()      { return window.__ccbRawConfig.FRAMING_PROJ_PRE || ""; },
    get projPost()     { return window.__ccbRawConfig.FRAMING_PROJ_POST || ""; },
    get docsPre()      { return window.__ccbRawConfig.FRAMING_DOCS_PRE || ""; },
    get docsPost()     { return window.__ccbRawConfig.FRAMING_DOCS_POST || ""; },
    get summaryPrompt() { return window.__ccbRawConfig.SUMMARY_PROMPT || ""; },
  };

  let shadow = null;
  let $el = null;
  let mounted = false;
  let toastTimer = null;
  let searchTimeout = null;
  const ENABLE_SEARCH_DEBOUNCE = true;

  const DEBOUNCE_MS = 300;

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

  async function loadBlocks() {
    if (state.blocksLoaded) return;
    state.blocks = await _loadBlocks(STORAGE_KEY);
    await migrateCtxProjects();
    await window.__ccbHistoryView.loadActiveProjectId();
    state.blocksLoaded = true;
  }

  async function saveBlocks() {
    await _saveBlocks(STORAGE_KEY, state.blocks);
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
    state.docMaxChars = Number(data.docMaxChars) > 0 ? Number(data.docMaxChars) : DOC_MAX_CHARS_DEFAULT;
    state.docMaxCharsLoaded = true;
  }

  async function setDocMaxChars(k) {
    const val = Math.max(1, Math.min(1000, k)) * 1000;
    state.docMaxChars = val;
    state.docMaxCharsLoaded = true;
    await new Promise((r) => chrome.storage.local.set({ docMaxChars: val }, r));
    return val;
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
        denyDirs: Array.isArray(stored.denyDirs) ? stored.denyDirs : defaults.denyDirs,
        denyFilenames: Array.isArray(stored.denyFilenames) ? stored.denyFilenames : defaults.denyFilenames,
        codeExtensions: Array.isArray(stored.codeExtensions) ? stored.codeExtensions : defaults.codeExtensions,
        maxFileSizeKb: Number(stored.maxFileSizeKb) > 0 ? Number(stored.maxFileSizeKb) : defaults.maxFileSizeKb,
      };
    }
    state.scanSettingsLoaded = true;
  }

  async function saveScanSettings(next) {
    const defaults = window.__ccbDocHandler.getDefaultScanSettings();
    const val = {
      denyDirs: Array.isArray(next?.denyDirs) ? next.denyDirs : defaults.denyDirs,
      denyFilenames: Array.isArray(next?.denyFilenames) ? next.denyFilenames : defaults.denyFilenames,
      codeExtensions: Array.isArray(next?.codeExtensions) ? next.codeExtensions : defaults.codeExtensions,
      maxFileSizeKb: Math.max(1, Number(next?.maxFileSizeKb) || defaults.maxFileSizeKb),
    };
    state.scanSettings = val;
    state.scanSettingsLoaded = true;
    await new Promise((r) => chrome.storage.local.set({ ccb_scanSettings: val }, r));
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

  function moveTabIndicator(tab) {
    const indicator = $el("tabIndicator");
    if (!indicator) return;
    indicator.style.left = tab.offsetLeft + "px";
    indicator.style.width = tab.offsetWidth + "px";
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
      setDropdownCleanup: (fn) => { state.hiDropdownCleanup = fn; },
    });

    modals.init({
      getShadow,
      setStatus,
      refreshPromptsFromRawConfig: () => {},  // framing uses live getters; no-op
      loadBlocks,
      loadCtxWindow,
      getCtxWindow: () => state.ctxWindow,
      loadDocMaxChars,
      getDocMaxChars: () => state.docMaxChars,
      getProjects: () => historyView.getAllProjects(),
      loadScanSettings,
      // Never null: falls back to the built-in defaults if a scan somehow
      // fires before loadScanSettings() resolved, so a scan can't run with
      // every filter silently disabled.
      getScanSettings: () => state.scanSettings || docHandler.getDefaultScanSettings(),
      saveScanSettings,
      getDefaultScanSettings: () => docHandler.getDefaultScanSettings(),
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
      setStatus,
      render,
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
      getDocMaxChars: () => state.docMaxChars,
      // Never null: falls back to the built-in defaults if a scan somehow
      // fires before loadScanSettings() resolved, so a scan can't run with
      // every filter silently disabled.
      getScanSettings: () => state.scanSettings || docHandler.getDefaultScanSettings(),
    });

    chat.init({
      getShadow,
      state,
      config: { GM_ID, SEND_BUTTON_SELECTOR, NEW_CHAT_BTN_SELECTOR, MSG_SELECTORS, CHARS_PER_TOKEN },
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
    });
  }

  // ============================================================
  // Wire events (central switchboard)
  // ============================================================
  function debouncedRender() {
    if (!ENABLE_SEARCH_DEBOUNCE) {
      render();
      return;
    }
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(render, DEBOUNCE_MS);
  }

  function resetTabDefaults(tabName) {
    try {
      const historyView = window.__ccbHistoryView;
      if (tabName === "history") {
        state.historySearchMode = "title";
        $el("toggleSearchTitle")?.classList.add("active");
        $el("toggleSearchContent")?.classList.remove("active");
        if ($el("searchHistory")) $el("searchHistory").value = "";
        state.historyCollapsed = false;
        historyView.closeConversationView();
      } else if (tabName === "context") {
        state.selected.clear();
        updateInjectBtn();
        historyView.closeHiDropdown();
        const expanded = $el("ccb-ctx-expanded");
        if (expanded) {
          expanded.style.display = "none";
          expanded.setAttribute("aria-hidden", "true");
          $el("ccb-ctx-expand")?.setAttribute("aria-expanded", "false");
        }
      }
    } catch (e) {
      console.error("resetTabDefaults error", e);
    }
  }

  function wireEvents() {
    const modals = window.__ccbModals;
    const historyView = window.__ccbHistoryView;
    const chat = window.__ccbChat;

    $el("fab").addEventListener("click", togglePanel);
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
      }
    });
    $el("scanSettingsOverlay")?.addEventListener("click", (e) => {
      if (e.target === $el("scanSettingsOverlay")) modals.closeScanSettings();
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
    $el("importBackupInput").addEventListener("change", async () => {
      const file = $el("importBackupInput").files?.[0];
      await importBackupFile(file);
      $el("importBackupInput").value = "";
    });

    $el("savePromptsBtn")?.addEventListener(
      "click",
      () => void modals.savePromptsEditor(),
    );
    $el("cancelPromptsBtn")?.addEventListener("click", modals.closePromptsEditor);
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
    $el("resetFramingConvBtn")?.addEventListener(
      "click",
      () => void modals.resetPromptsEditor("framingConv"),
    );
    $el("resetFramingProjBtn")?.addEventListener(
      "click",
      () => void modals.resetPromptsEditor("framingProj"),
    );
    $el("resetFramingDocsBtn")?.addEventListener(
      "click",
      () => void modals.resetPromptsEditor("framingDocs"),
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
      const revert = () => { input.value = String(Math.round(state.docMaxChars / 1000)); };
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
    $el("addProjectBtn").addEventListener("click", () => void historyView.addProject());
    $el("addCodeProjectBtn").addEventListener("click", () => void historyView.createCodeProjectBookmark());
    $el("projectSelectBtn").addEventListener("click", () => {
      historyView.toggleProjectSelectDropdown();
    });
    $el("historyShowAll").addEventListener("change", (e) => {
      state.historyShowAll = e.target.checked;
      historyView.renderHistoryList();
    });
    $el("searchHistory").addEventListener("input", debouncedRender);
    $el("toggleSearchTitle").addEventListener("click", () => {
      state.historySearchMode = "title";
      $el("toggleSearchTitle").classList.add("active");
      $el("toggleSearchContent").classList.remove("active");
      $el("searchHistory").placeholder = "חיפוש בשיחות...";
      historyView.renderHistoryList();
    });
    $el("toggleSearchContent").addEventListener("click", () => {
      state.historySearchMode = "content";
      $el("toggleSearchContent").classList.add("active");
      $el("toggleSearchTitle").classList.remove("active");
      $el("searchHistory").placeholder = "חיפוש מילה בתוכן...";
      historyView.renderHistoryList();
    });
    $el("historyCollapseBtn").addEventListener("click", () => {
      state.historyCollapsed = !state.historyCollapsed;
      historyView.syncCollapsibleSections();
    });
    $el("addBtn").addEventListener("click", () => openEdit(null));
    $el("injectBtn").addEventListener("click", () => chat.injectSelected());
    $el("injectDocsBtn").addEventListener("click", () => historyView.injectProjectDocuments());
    // No manual "save chat" button anymore — auto-save (chat-features.js#
    // scheduleAutoSave) covers it. chat.saveChat() is still exported and still
    // does the full scroll-to-top capture; it just has no UI trigger today.
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
      if (project) historyView.openProjectDropdown(project, $el("projectEditBtn"));
    });

    // Conversation View
    $el("cvBack")?.addEventListener("click", historyView.closeConversationView);

    let cvSearchTimer = null;
    $el("cvSearch")?.addEventListener("input", () => {
      clearTimeout(cvSearchTimer);
      cvSearchTimer = setTimeout(() => {
        const b = state.currentConversationViewId ? state.blocks[state.currentConversationViewId] : null;
        if (b) historyView.renderConversationMessages(b, ($el("cvSearch")?.value || "").trim());
      }, DEBOUNCE_MS);
    });

    $el("cvNavPrev")?.addEventListener("click", () => {
      if (!state.cvMatchElements.length) return;
      state.cvMatchIndex =
        (state.cvMatchIndex - 1 + state.cvMatchElements.length) % state.cvMatchElements.length;
      historyView.updateNavMatch();
    });
    $el("cvNavNext")?.addEventListener("click", () => {
      if (!state.cvMatchElements.length) return;
      state.cvMatchIndex = (state.cvMatchIndex + 1) % state.cvMatchElements.length;
      historyView.updateNavMatch();
    });

    $el("cvSelAll")?.addEventListener("click", () => {
      const b = state.currentConversationViewId ? state.blocks[state.currentConversationViewId] : null;
      if (!b) return;
      state.cvSelectedIndices = new Set(historyView.buildHistoryMessages(b).map((_, i) => i));
      historyView.renderConversationMessages(b, ($el("cvSearch")?.value || "").trim());
    });
    $el("cvSelNone")?.addEventListener("click", () => {
      state.cvSelectedIndices = new Set();
      const b = state.currentConversationViewId ? state.blocks[state.currentConversationViewId] : null;
      if (b) historyView.renderConversationMessages(b, ($el("cvSearch")?.value || "").trim());
      else historyView.updateCvFooter();
    });

    // "טען נבחרים" — inject selected messages into current chat as context
    // (does NOT bind to the loaded conversation; current chat stays its own).
    // Deliberately does not auto-send — the user reviews/edits and sends
    // themselves, same as file loading (injectProjectDocuments).
    $el("cvLoadBtn")?.addEventListener("click", () => {
      const b = state.currentConversationViewId ? state.blocks[state.currentConversationViewId] : null;
      if (!b || !state.cvSelectedIndices.size) return;
      const allMsgs = historyView.buildHistoryMessages(b);
      const selectedMsgs = allMsgs.filter((_, i) => state.cvSelectedIndices.has(i));
      const text = historyView.buildConversationInjectionText(selectedMsgs);
      const r = ccbInject.injectIntoInput(text, "replace");
      if (r.ok) {
        historyView.closeConversationView();
        setStatus("נטען — ניתן לערוך ולשלוח ✓");
      } else {
        setStatus(r.error || "נכשל", true);
      }
    });

    shadow.querySelectorAll(".tab").forEach((tab) => {
      tab.addEventListener("click", async () => {
        historyView.closeConversationView();
        historyView.closeProjectSelectDropdown();
        resetTabDefaults(tab.dataset.tab);
        if ($el("panel").classList.contains("editing")) {
          if (hasUnsavedChanges()) {
            const ok = await modals.showConfirm({
              title: "שינויים שלא נשמרו",
              msg: "אם תצא עכשיו, השינויים שעשית יאבדו.",
              confirmLabel: "צא בלי לשמור",
            });
            if (!ok) return;
          }
          closeEdit();
        }
        shadow.querySelectorAll(".tab").forEach((t) => {
          t.classList.remove("active");
          t.setAttribute("aria-selected", "false");
        });
        shadow.querySelectorAll(".tab-pane").forEach((p) => p.classList.remove("active"));
        tab.classList.add("active");
        tab.setAttribute("aria-selected", "true");
        shadow.getElementById("pane-" + tab.dataset.tab).classList.add("active");
        moveTabIndicator(tab);
        render();
        window.__ccbCtxMeter.update();
      });
    });
    requestAnimationFrame(() => {
      const activeTab = shadow.querySelector(".tab.active");
      if (activeTab) moveTabIndicator(activeTab);
    });
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
      // Only the history pane has a search field to focus — guard against
      // focusing it while hidden behind the (now-default) context tab.
      if (shadow.querySelector(".tab.active")?.dataset.tab === "history") {
        $el("searchHistory").focus();
      }
    } else {
      window.__ccbHistoryView.closeConversationView();
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
  // Timing/operation log only — counts, never block/conversation content.
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
    const t2 = Date.now();
    window.__ccbHistoryView.render();
    const historyViewMs = Date.now() - t2;
    // After renderProjectContext() has pruned any non-active project's id from
    // state.selected, refresh the footer count so it matches what's ticked.
    updateInjectBtn();
    const t3 = Date.now();
    window.__ccbCtxMeter.watchConversation();
    window.__ccbCtxMeter.update();
    const ctxMeterMs = Date.now() - t3;
    console.log("[ccb-timing] render", {
      totalBlocks: Object.keys(state.blocks || {}).length,
      blocksListMs, historyViewMs, ctxMeterMs,
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
      btn.setAttribute("aria-label", collapsed ? "פתח פרומפטים" : "סגור פרומפטים");
    }
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
    if ((b.tags || []).length) {
      const tagsRow = document.createElement("div");
      tagsRow.className = "block-tags";
      for (const t of b.tags || []) {
        const span = document.createElement("span");
        span.className = "tag";
        span.textContent = t;
        tagsRow.appendChild(span);
      }
      main.appendChild(tagsRow);
    }

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
    list.innerHTML = "";

    if (!items.length) {
      const div = document.createElement("div");
      div.className = "empty";
      div.textContent = "בנק ריק\nלחץ + להוספת בלוק ראשון";
      list.appendChild(div);
      return;
    }

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
    const project = state.currentProjectId ? state.blocks[state.currentProjectId] : null;
    const docs = project?.documents || [];
    if (!docs.length) {
      btn.style.display = "none";
      return;
    }
    btn.style.display = "flex";
    // A code project's auto-generated "structure" doc is always enabled and
    // never exposed in the file tree to toggle off — it alone shouldn't
    // count as "something is selected" and keep the button clickable.
    const hasSelectable = docs.some((d) => d.type !== "structure" && d.enabled);
    btn.disabled = !hasSelectable;
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
      $el("editContent").value.trim() !== (b.content || "")
    );
  }

  function openEdit(id, prefill) {
    state.editingId = id;
    const b = id ? state.blocks[id] : null;
    $el("editTitle").value = b ? b.title : prefill?.title || "";
    $el("editTags").value = b ? (b.tags || []).join(", ") : prefill?.tags || "";
    $el("editContent").value = b ? b.content : prefill?.content || "";
    // Project blocks have their own delete flow (historyView.deleteProject,
    // behind #projectEditBtn's dropdown) that also cleans up child blocks/
    // conversation links — this generic delete doesn't, so it stays hidden
    // for kind:"project".
    $el("deleteBtn").style.display = id && b?.kind !== "project" ? "block" : "none";

    // Show which project this block belongs to: an existing block's own
    // projectId, or — for a brand-new block — the currently active project
    // it's about to be created into.
    const projectId = b ? b.projectId : state.currentProjectId;
    const project = projectId ? window.__ccbHistoryView.getProjectById(projectId) : null;
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
    const tags = $el("editTags")
      .value.split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    if (!title || !content) {
      setStatus("צריך כותרת ותוכן", true);
      return;
    }
    const id =
      state.editingId ||
      "b_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7);
    const existing = state.blocks[id];
    // Spread existing first so fields the form doesn't know about (kind,
    // autoLoad, projectId, and — critically — a project's documents/
    // isCodeProject/dirHandleId/lastScanned/depGraph) survive an edit
    // instead of being silently dropped.
    state.blocks[id] = { ...existing, id, title, content, tags, updated: Date.now() };
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
      msg: 'למחוק את "' + state.blocks[state.editingId].title + '"? לא ניתן לשחזר.',
      confirmLabel: "מחק",
      danger: true,
    });
    if (!ok) return;
    delete state.blocks[state.editingId];
    state.selected.delete(state.editingId);
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
    while (parts.length && tail.length + parts[parts.length - 1].length + 1 < maxLen) {
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
    $el("scanProgressPhase").textContent = p.label || PROGRESS_PHASE_LABELS[p.phase] || "";
    $el("scanProgressCount").textContent = total ? `${done} / ${total}` : done ? String(done) : "";
    $el("scanProgressCurrent").textContent = p.current ? shortenPath(p.current) : "";

    const fill = $el("scanProgressFill");
    fill.className = "scan-progress-fill" + (p.state === "done" ? " done" : p.state === "error" ? " error" : "");
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
      if (progressTimer) { clearTimeout(progressTimer); progressTimer = 0; }
      progressPending = null;
      const box = $el("scanProgress");
      if (box) box.style.display = "none";
    };
    if (holdMs > 0) setTimeout(hide, holdMs);
    else hide();
  }

  // ============================================================
  // Backup export/import (uses modals.showConfirm, mutates state.blocks)
  // ============================================================
  async function exportBackup() {
    await loadBlocks();
    const blob = new Blob([JSON.stringify(state.blocks, null, 2)], {
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

    state.blocks = parsed;
    state.blocksLoaded = true;
    state.selected.clear();
    state.editingId = null;
    await saveBlocks();
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
    window.__ccbChat?.stopMsgObserver();
    window.__ccbCtxMeter?.cleanup();
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
        // SPA navigation = new chat → unbind any auto-saved conversation
        state.currentConversationId = null;
        // Reattach msg observer in case the chat container was re-mounted
        window.__ccbChat.startMsgObserver();
        window.__ccbChat.tryAutoInject();
        // Refresh the sidebar so the active-conversation marker clears.
        render();
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
  // click to reset OUR in-memory state to match (active-conversation marker,
  // GM auto-inject flag).
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
        state.currentConversationId = null;
        window.__ccbChat.startMsgObserver();
        render();
        window.__ccbChat.tryAutoInject();
      },
      true,
    );
  }

  // ============================================================
  // Init
  // ============================================================
  function shouldAutoOpen() {
    return CONFIG_PUBLIC.AUTO_OPEN_URLS.some((u) => location.href.startsWith(u));
  }

  async function init() {
    if (!isActiveSitePage()) return;
    await loadCtxWindow();
    await loadDocMaxChars();
    await loadScanSettings();
    // mountUI must run before chat module touches shadow DOM
    mountUI();
    window.__ccbChat.startMsgObserver();
    window.__ccbCtxMeter.watchFileInputs();
    window.__ccbCtxMeter.watchConversation();
    await loadBlocks();
    installUrlChangeWatcher();
    installNewChatBtnWatcher();
    window.__ccbChat.tryAutoInject();
    if (shouldAutoOpen()) setPanelOpen(true);
  }

  if (
    document.readyState === "complete" ||
    document.readyState === "interactive"
  ) {
    init();
  } else {
    window.addEventListener("DOMContentLoaded", init, { once: true });
  }

  // API for summarizer.js
  window.__ccb = {
    MSG_SELECTORS,
    get blocks() {
      return state.blocks;
    },
    saveBlocks,
    loadBlocks,
    setStatus,
    renderPanel: () => {
      if (shadow && $el("panel").classList.contains("open")) render();
    },
  };
})();
