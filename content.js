// content.js — UI orchestration, state, and business logic.
// Dependencies (loaded first via manifest):
//   config.js → window.__ccbRawConfig
//   storage.js → window.__ccbStorage
//   inject.js → window.__ccbInject
//   push.js → window.__ccbPush
//   ui-styles.js → window.__ccbCSS
//   ui-template.js → window.__ccbTpl

(() => {
  if (window.__ccbInstalled) return;
  window.__ccbInstalled = true;

  const {
    AUTO_OPEN_URLS,
    SEND_BUTTON_SELECTOR,
    SIDEBAR_WIDTH,
    MSG_SELECTORS,
    STORAGE_KEY,
    GM_ID,
    SUMMARY_PROMPT,
    FRAMING,
    CTX_WINDOW_DEFAULT,
    CHARS_PER_TOKEN,
  } = window.__ccbRawConfig;

  const CONFIG = { AUTO_OPEN_URLS, SEND_BUTTON_SELECTOR, SIDEBAR_WIDTH };
  const { loadBlocks: _loadBlocks, saveBlocks: _saveBlocks } =
    window.__ccbStorage;
  const { findInput, injectIntoInput } = window.__ccbInject;
  const { pushPage } = window.__ccbPush;
  const CSS = window.__ccbCSS;
  const { IC, PANEL_HTML } = window.__ccbTpl;
  const isActiveSitePage = () =>
    CONFIG.AUTO_OPEN_URLS.some((u) => location.href.startsWith(u));

  // ============================================================
  // State
  // ============================================================
  const ENABLE_SEARCH_DEBOUNCE = true; // false = השבתת debounce
  const DEBOUNCE_MS = 300; // זמן ההשהיה (מילישניות)

  let blocks = {};
  let blocksLoaded = false;
  let shadow = null;
  let $el = null;
  let selected = new Set();
  let editingId = null;
  let mounted = false;
  let historySearchMode = "title";
  let searchTimeout = null;
  let lastInjectedConversationId = null;
  let currentProjectId = null;
  let projectsCollapsed = false;
  let historyCollapsed = false;
  let projectInstructionsOpen = false;
  let ctxWindow = CTX_WINDOW_DEFAULT;
  let ctxWindowLoaded = false;
  let ctxExpandBound = false;

  // Conversation View (preview panel)
  let currentConversationViewId = null;
  let cvSelectedIndices = new Set();
  let cvMatchElements = [];
  let cvMatchIndex = 0;

  function formatAge(ts) {
    const t = Number(ts || 0);
    if (!t) return "";
    const diff = Date.now() - t;
    const sec = Math.max(0, Math.floor(diff / 1000));
    const min = Math.floor(sec / 60);
    const hr = Math.floor(min / 60);
    const day = Math.floor(hr / 24);
    if (day > 0) return `לפני ${day} ימים`;
    if (hr > 0) return `לפני ${hr} שעות`;
    if (min > 0) return `לפני ${min} דקות`;
    return "עכשיו";
  }

  async function loadBlocks() {
    if (blocksLoaded) return;
    blocks = await _loadBlocks(STORAGE_KEY);
    blocksLoaded = true;
  }

  async function saveBlocks() {
    await _saveBlocks(STORAGE_KEY, blocks);
  }

  async function loadCtxWindow() {
    if (ctxWindowLoaded) return;
    const data = await new Promise((r) =>
      chrome.storage.local.get("ctxWindow", r),
    );
    ctxWindow = data.ctxWindow || CTX_WINDOW_DEFAULT;
    ctxWindowLoaded = true;
  }

  async function setCtxWindow(k) {
    const val = Math.max(4, Math.min(2048, k)) * 1000;
    ctxWindow = val;
    await new Promise((r) => chrome.storage.local.set({ ctxWindow: val }, r));
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

    window.__ccbCtxMeter.init({
      getShadow: () => shadow,
      MSG_SELECTORS,
      CHARS_PER_TOKEN,
      CTX_WINDOW_DEFAULT,
      getCtxWindow: () => ctxWindow,
      closeDropdown: () => closeHiDropdown(),
      setDropdownCleanup: (fn) => {
        hiDropdownCleanup = fn;
      },
    });

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
  // Dialogs
  // ============================================================
  function showConfirm({ title, msg, confirmLabel, danger = false }) {
    return new Promise((resolve) => {
      $el("dialogTitle").textContent = title;
      $el("dialogMsg").textContent = msg;
      $el("dialogConfirm").textContent = confirmLabel;
      $el("dialogConfirm").className =
        "dialog-confirm" + (danger ? " danger" : "");
      $el("dialogCancel").textContent = "ביטול";
      const overlay = $el("dialogOverlay");
      overlay.classList.add("show");

      let settled = false;
      const done = (result) => {
        if (settled) return;
        settled = true;
        overlay.classList.remove("show");
        resolve(result);
      };
      $el("dialogConfirm").addEventListener("click", () => done(true), {
        once: true,
      });
      $el("dialogCancel").addEventListener("click", () => done(false), {
        once: true,
      });
    });
  }

  function showChoice({ title, msg, primaryLabel, secondaryLabel }) {
    return new Promise((resolve) => {
      $el("dialogTitle").textContent = title;
      $el("dialogMsg").textContent = msg;
      $el("dialogConfirm").textContent = primaryLabel;
      $el("dialogConfirm").className = "dialog-confirm";
      $el("dialogCancel").textContent = secondaryLabel;
      const overlay = $el("dialogOverlay");
      overlay.classList.add("show");

      let settled = false;
      const done = (result) => {
        if (settled) return;
        settled = true;
        overlay.classList.remove("show");
        resolve(result);
      };
      $el("dialogConfirm").addEventListener("click", () => done("primary"), {
        once: true,
      });
      $el("dialogCancel").addEventListener("click", () => done("secondary"), {
        once: true,
      });
    });
  }

  function showPrompt({ title, defaultValue = "" }) {
    return new Promise((resolve) => {
      $el("dialogTitle").textContent = title;
      $el("dialogMsg").textContent = "";
      $el("dialogConfirm").textContent = "שמור";
      $el("dialogConfirm").className = "dialog-confirm";
      $el("dialogCancel").textContent = "ביטול";
      const input = $el("dialogInput");
      input.value = defaultValue;
      input.style.display = "block";
      const overlay = $el("dialogOverlay");
      overlay.classList.add("show");
      setTimeout(() => {
        input.focus();
        input.select();
      }, 50);

      let settled = false;
      const done = (result) => {
        if (settled) return;
        settled = true;
        input.style.display = "none";
        overlay.classList.remove("show");
        resolve(result);
      };
      $el("dialogConfirm").addEventListener(
        "click",
        () => done(input.value.trim() || defaultValue),
        { once: true },
      );
      $el("dialogCancel").addEventListener("click", () => done(null), {
        once: true,
      });
      input.addEventListener(
        "keydown",
        (e) => {
          if (e.key === "Enter") done(input.value.trim() || defaultValue);
          if (e.key === "Escape") done(null);
        },
        { once: true },
      );
    });
  }

  async function openSettings() {
    const overlay = $el("settingsOverlay");
    const box = $el("settingsBox");
    const btn = $el("settingsBtn");
    if (!overlay || !box || !btn) return;
    const panelRect = $el("panel").getBoundingClientRect();
    const btnRect = btn.getBoundingClientRect();
    const left = btnRect.left - panelRect.left;
    const top = btnRect.bottom - panelRect.top + 10;
    box.style.left = Math.max(12, Math.min(left, panelRect.width - 282)) + "px";
    box.style.top = Math.max(12, top) + "px";
    await loadCtxWindow();
    const input = $el("ccb-ctx-size");
    if (input) input.value = String(Math.round(ctxWindow / 1000));
    overlay.classList.add("show");
  }

  function closeSettings() {
    const overlay = $el("settingsOverlay");
    if (overlay) overlay.classList.remove("show");
  }

  async function exportBackup() {
    await loadBlocks();
    const blob = new Blob([JSON.stringify(blocks, null, 2)], {
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
    closeSettings();
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

    const ok = await showConfirm({
      title: "ייבוא גיבוי",
      msg: "הייבוא יחליף את כל הבלוקים הקיימים. להמשיך?",
      confirmLabel: "ייבוא",
      danger: true,
    });
    if (!ok) return;

    blocks = parsed;
    blocksLoaded = true;
    selected.clear();
    editingId = null;
    await saveBlocks();
    closeEdit();
    closeSettings();
    render();
    updateInjectBtn();
    setStatus("הייבוא הושלם ✓");
  }

  // ============================================================
  // Wire events
  // ============================================================
  function hasUnsavedChanges() {
    if (
      !editingId &&
      !$el("editTitle").value.trim() &&
      !$el("editContent").value.trim()
    )
      return false;
    const b = editingId ? blocks[editingId] : null;
    if (!b)
      return (
        !!$el("editTitle").value.trim() || !!$el("editContent").value.trim()
      );
    return (
      $el("editTitle").value.trim() !== (b.title || "") ||
      $el("editContent").value.trim() !== (b.content || "")
    );
  }

  function debouncedRender() {
    if (!ENABLE_SEARCH_DEBOUNCE) {
      render();
      return;
    }
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(render, DEBOUNCE_MS);
  }

  function wireEvents() {
    $el("fab").addEventListener("click", togglePanel);
    $el("settingsBtn").addEventListener("click", (e) => {
      e.stopPropagation();
      closeSettings();
      void openSettings();
    });
    $el("settingsCloseBtn").addEventListener("click", closeSettings);
    $el("settingsOverlay").addEventListener("click", (e) => {
      if (e.target === $el("settingsOverlay")) closeSettings();
    });
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeSettings();
    });
    $el("exportBackupBtn").addEventListener("click", exportBackup);
    $el("importBackupBtn").addEventListener("click", () => {
      closeSettings();
      $el("importBackupInput").value = "";
      $el("importBackupInput").click();
    });
    $el("importBackupInput").addEventListener("change", async () => {
      const file = $el("importBackupInput").files?.[0];
      await importBackupFile(file);
      $el("importBackupInput").value = "";
    });
    $el("ccb-files-row").addEventListener("click", (e) => {
      e.stopPropagation();
      window.__ccbCtxMeter.openFilesDropdown($el("ccb-files-row"));
    });
    $el("ccb-ctx-size").addEventListener("change", async () => {
      const input = $el("ccb-ctx-size");
      const raw = input?.value?.trim() || "";
      if (!raw) {
        input.value = String(Math.round(ctxWindow / 1000));
        return;
      }
      const value = Number(raw);
      if (!Number.isFinite(value)) {
        input.value = String(Math.round(ctxWindow / 1000));
        return;
      }
      try {
        const next = await setCtxWindow(value);
        input.value = String(Math.round(next / 1000));
        window.__ccbCtxMeter.update();
      } catch (e) {
        console.error("Failed to save ctxWindow", e);
        input.value = String(Math.round(ctxWindow / 1000));
        setStatus("לא ניתן לשמור את חלון הקונטקסט", true);
      }
    });
    $el("closeBtn").addEventListener("click", async () => {
      if ($el("panel").classList.contains("editing") && hasUnsavedChanges()) {
        const ok = await showConfirm({
          title: "שינויים שלא נשמרו",
          msg: "אם תצא עכשיו, השינויים שעשית יאבדו.",
          confirmLabel: "צא בלי לשמור",
        });
        if (!ok) return;
      }
      setPanelOpen(false);
    });
    $el("addProjectBtn").addEventListener("click", async () => {
      await loadBlocks();
      const title = await showPrompt({
        title: "פרויקט חדש",
        defaultValue: "פרויקט חדש",
      });
      if (title === null || !title.trim()) return;
      const id = "proj_" + Date.now();
      blocks[id] = {
        id,
        kind: "project",
        title: title.trim(),
        content: "",
        updated: Date.now(),
      };
      await saveBlocks();
      currentProjectId = id;
      render();
    });
    $el("searchHistory").addEventListener("input", debouncedRender);
    $el("toggleSearchTitle").addEventListener("click", () => {
      historySearchMode = "title";
      $el("toggleSearchTitle").classList.add("active");
      $el("toggleSearchContent").classList.remove("active");
      $el("searchHistory").placeholder = "חיפוש בשיחות...";
      renderHistoryList();
    });
    $el("toggleSearchContent").addEventListener("click", () => {
      historySearchMode = "content";
      $el("toggleSearchContent").classList.add("active");
      $el("toggleSearchTitle").classList.remove("active");
      $el("searchHistory").placeholder = "חיפוש מילה בתוכן...";
      renderHistoryList();
    });
    $el("projectsCollapseBtn").addEventListener("click", () => {
      projectsCollapsed = !projectsCollapsed;
      syncCollapsibleSections();
    });
    $el("historyCollapseBtn").addEventListener("click", () => {
      historyCollapsed = !historyCollapsed;
      syncCollapsibleSections();
    });
    $el("addBtn").addEventListener("click", () => openEdit(null));
    $el("injectBtn").addEventListener("click", injectSelected);
    $el("summarizeBtnHistory").addEventListener("click", saveChat);
    $el("saveBtn").addEventListener("click", saveEdit);
    $el("cancelBtn").addEventListener("click", closeEdit);
    $el("deleteBtn").addEventListener("click", deleteEdit);
    $el("projectViewBack").addEventListener("click", closeProjectView);
    $el("projectInstructionsToggle").addEventListener("click", () => {
      projectInstructionsOpen = !projectInstructionsOpen;
      syncProjectInstructionsSection();
      if (projectInstructionsOpen) $el("projectViewInstructions")?.focus();
    });
    $el("projectInstructionsEditBtn").addEventListener("click", () => {
      projectInstructionsOpen = !projectInstructionsOpen;
      syncProjectInstructionsSection();
      if (projectInstructionsOpen) $el("projectViewInstructions")?.focus();
    });
    const ctxExpand = $el("ccb-ctx-expand");
    if (ctxExpand) {
      ctxExpand.addEventListener("click", (e) => {
        e.stopPropagation();
        const expanded = $el("ccb-ctx-expanded");
        const chevron = ctxExpand.querySelector(".collapse-btn");
        if (!expanded) return;
        const open =
          expanded.style.display !== "" && expanded.style.display !== "block";
        if (open) {
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
    $el("projectViewSaveBtn").addEventListener("click", saveProjectView);
    $el("projectViewMenuBtn").addEventListener("click", (e) => {
      e.stopPropagation();
      const project = getProjectById(currentProjectId);
      if (project) openProjectDropdown(project, $el("projectViewMenuBtn"));
    });

    // Conversation View controls
    $el("cvBack")?.addEventListener("click", closeConversationView);

    let cvSearchTimer = null;
    $el("cvSearch")?.addEventListener("input", () => {
      clearTimeout(cvSearchTimer);
      cvSearchTimer = setTimeout(() => {
        const b = currentConversationViewId
          ? blocks[currentConversationViewId]
          : null;
        if (b)
          renderConversationMessages(b, ($el("cvSearch")?.value || "").trim());
      }, DEBOUNCE_MS);
    });

    $el("cvNavPrev")?.addEventListener("click", () => {
      if (!cvMatchElements.length) return;
      cvMatchIndex =
        (cvMatchIndex - 1 + cvMatchElements.length) % cvMatchElements.length;
      updateNavMatch();
    });
    $el("cvNavNext")?.addEventListener("click", () => {
      if (!cvMatchElements.length) return;
      cvMatchIndex = (cvMatchIndex + 1) % cvMatchElements.length;
      updateNavMatch();
    });

    $el("cvSelAll")?.addEventListener("click", () => {
      const b = currentConversationViewId
        ? blocks[currentConversationViewId]
        : null;
      if (!b) return;
      cvSelectedIndices = new Set(buildHistoryMessages(b).map((_, i) => i));
      renderConversationMessages(b, ($el("cvSearch")?.value || "").trim());
    });
    $el("cvSelNone")?.addEventListener("click", () => {
      cvSelectedIndices = new Set();
      const b = currentConversationViewId
        ? blocks[currentConversationViewId]
        : null;
      if (b)
        renderConversationMessages(b, ($el("cvSearch")?.value || "").trim());
      else updateCvFooter();
    });

    $el("cvLoadBtn")?.addEventListener("click", () => {
      const b = currentConversationViewId
        ? blocks[currentConversationViewId]
        : null;
      if (!b || !cvSelectedIndices.size) return;
      const allMsgs = buildHistoryMessages(b);
      const selectedMsgs = allMsgs.filter((_, i) => cvSelectedIndices.has(i));
      const text = buildConversationInjectionText(selectedMsgs, b, {
        includeGeneralMemory: false,
      });
      const r = injectIntoInput(text, "replace");
      if (r.ok) {
        closeConversationView();
        setTimeout(
          () => document.querySelector(CONFIG.SEND_BUTTON_SELECTOR)?.click(),
          100,
        );
      } else {
        setStatus(r.error || "נכשל", true);
      }
    });

    shadow.querySelectorAll(".tab").forEach((tab) => {
      tab.addEventListener("click", async () => {
        closeConversationView();
        if ($el("panel").classList.contains("editing")) {
          if (hasUnsavedChanges()) {
            const ok = await showConfirm({
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
        shadow
          .querySelectorAll(".tab-pane")
          .forEach((p) => p.classList.remove("active"));
        tab.classList.add("active");
        tab.setAttribute("aria-selected", "true");
        shadow
          .getElementById("pane-" + tab.dataset.tab)
          .classList.add("active");
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

    // ensure delegated listener for ctx expand exists
    if (shadow && !ctxExpandBound) {
      shadow.addEventListener("click", (e) => {
        const path = e.composedPath ? e.composedPath() : [e.target];
        const btn = path.find((n) => n && n.id === "ccb-ctx-expand");
        if (!btn) return;
        const expanded = shadow.getElementById("ccb-ctx-expanded");
        if (!expanded) return;
        const open =
          expanded.style.display !== "" && expanded.style.display !== "block";
        const chevron = btn.querySelector(".collapse-btn");
        if (open) {
          expanded.style.display = "block";
          expanded.setAttribute("aria-hidden", "false");
          btn.setAttribute("aria-expanded", "true");
          chevron?.classList.remove("collapsed");
        } else {
          expanded.style.display = "none";
          expanded.setAttribute("aria-hidden", "true");
          btn.setAttribute("aria-expanded", "false");
          chevron?.classList.add("collapsed");
        }
        window.__ccbCtxMeter.update();
      });
      ctxExpandBound = true;
    }

    if (open) {
      await loadBlocks();
      $el("panel").classList.add("open");
      $el("fab").classList.add("hidden");
      pushPage(true);
      render();
      updateInjectBtn();
      window.__ccbCtxMeter.update();
      if (getProjectById(currentProjectId)) {
        if (projectInstructionsOpen) $el("projectViewInstructions")?.focus();
        else $el("projectInstructionsEditBtn")?.focus();
      } else {
        $el("searchHistory").focus();
      }
    } else {
      closeConversationView();
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
  // General Memory
  // ============================================================
  function getGM() {
    return (
      blocks[GM_ID] || {
        id: GM_ID,
        kind: "general_memory",
        content: "",
        autoLoad: false,
      }
    );
  }

  function renderGeneralMemory() {
    const card = $el("gmCard");
    if (!card) return;
    const gm = getGM();
    const on = !!gm.autoLoad;
    const content = (gm.content || "").trim();
    const selectedForInject = selected.has(GM_ID);

    card.innerHTML = "";
    const wrap = document.createElement("div");
    wrap.className = "gm-card";

    const header = document.createElement("div");
    header.className = "gm-header";

    const selectLabel = document.createElement("label");
    selectLabel.className = "cb-wrap gm-select";
    const selectInput = document.createElement("input");
    selectInput.type = "checkbox";
    selectInput.checked = selectedForInject;
    selectInput.setAttribute("aria-label", "הוסף זיכרון כללי להזרקה");
    selectInput.addEventListener("change", () => {
      if (selectInput.checked) selected.add(GM_ID);
      else selected.delete(GM_ID);
      updateInjectBtn();
    });
    const selectBox = document.createElement("span");
    selectBox.className = "cb-box";
    selectBox.innerHTML =
      '<svg class="cb-check" width="10" height="8" viewBox="0 0 10 8" fill="none"><polyline points="1,4 4,7 9,1" stroke="white" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    selectLabel.appendChild(selectInput);
    selectLabel.appendChild(selectBox);

    const toggleLabel = document.createElement("label");
    toggleLabel.className = "toggle";
    const toggleInput = document.createElement("input");
    toggleInput.type = "checkbox";
    toggleInput.checked = on;
    toggleInput.addEventListener("change", async () => {
      await loadBlocks();
      const g = getGM();
      g.autoLoad = toggleInput.checked;
      g.kind = "general_memory";
      g.id = GM_ID;
      blocks[GM_ID] = g;
      await saveBlocks();
      renderGeneralMemory();
    });
    const toggleTrack = document.createElement("span");
    toggleTrack.className = "toggle-track";
    toggleLabel.appendChild(toggleInput);
    toggleLabel.appendChild(toggleTrack);

    const title = document.createElement("span");
    title.className = "gm-title";
    title.textContent = "זיכרון כללי";

    const badge = document.createElement("span");
    badge.className = "auto-badge";
    badge.textContent = "נטען אוטומטית";
    if (!on) badge.style.display = "none";

    const editBtn = document.createElement("button");
    editBtn.className = "gm-edit-btn";
    editBtn.textContent = "עריכה";
    editBtn.addEventListener("click", () =>
      openEdit(GM_ID, { title: "זיכרון כללי", content, tags: "" }),
    );

    header.appendChild(selectLabel);
    header.appendChild(toggleLabel);
    header.appendChild(title);
    header.appendChild(editBtn);
    wrap.appendChild(header);

    if (on) wrap.appendChild(badge);

    card.appendChild(wrap);
  }

  function syncCollapsibleSections() {
    const projectsSection = $el("projectsSection");
    const historySection = $el("historySection");
    const projectsBtn = $el("projectsCollapseBtn");
    const historyBtn = $el("historyCollapseBtn");

    if (projectsSection)
      projectsSection.classList.toggle("collapsed", projectsCollapsed);
    if (historySection)
      historySection.classList.toggle("collapsed", historyCollapsed);
    if (projectsBtn) {
      projectsBtn.classList.toggle("collapsed", projectsCollapsed);
      projectsBtn.title = projectsCollapsed ? "פתח פרויקטים" : "סגור פרויקטים";
      projectsBtn.setAttribute(
        "aria-label",
        projectsCollapsed ? "פתח פרויקטים" : "סגור פרויקטים",
      );
    }
    if (historyBtn) {
      historyBtn.classList.toggle("collapsed", historyCollapsed);
      historyBtn.title = historyCollapsed
        ? "פתח שיחות אחרונות"
        : "סגור שיחות אחרונות";
      historyBtn.setAttribute(
        "aria-label",
        historyCollapsed ? "פתח שיחות אחרונות" : "סגור שיחות אחרונות",
      );
    }
  }

  function syncProjectInstructionsSection() {
    const panel = $el("projectInstructionsPanel");
    const btn = $el("projectInstructionsToggle");
    const editBtn = $el("projectInstructionsEditBtn");
    if (panel) panel.classList.toggle("collapsed", !projectInstructionsOpen);
    if (btn) {
      btn.classList.toggle("collapsed", !projectInstructionsOpen);
      btn.title = projectInstructionsOpen
        ? "סגור עריכת הנחיות"
        : "פתח עריכת הנחיות";
      btn.setAttribute(
        "aria-label",
        projectInstructionsOpen ? "סגור עריכת הנחיות" : "פתח עריכת הנחיות",
      );
      btn.setAttribute("aria-expanded", String(projectInstructionsOpen));
    }
    if (editBtn)
      editBtn.textContent = projectInstructionsOpen ? "סגור" : "עריכה";
    if (editBtn)
      editBtn.setAttribute(
        "aria-label",
        projectInstructionsOpen ? "סגור עריכת הנחיות" : "פתח עריכת הנחיות",
      );
  }

  async function tryAutoInject() {
    const gm = getGM();
    if (!gm.autoLoad || !(gm.content || "").trim()) return;
    let tries = 0;
    const poll = setInterval(() => {
      tries++;
      if (tries > 100) {
        clearInterval(poll);
        return;
      }
      const el = findInput();
      if (!el) return;
      clearInterval(poll);
      injectIntoInput(FRAMING + gm.content, "prepend");
      setTimeout(() => {
        const btn = document.querySelector(CONFIG.SEND_BUTTON_SELECTOR);
        if (btn) btn.click();
      }, 100);
    }, 100);
  }

  // ============================================================
  // Render
  // ============================================================
  function dateGroup(ts) {
    const now = new Date();
    const d = new Date(ts);
    const diffDays = Math.floor((Date.now() - ts) / 86400000);
    if (diffDays === 0 && now.getDate() === d.getDate()) return "היום";
    if (diffDays <= 1 && now.getDate() - d.getDate() === 1) return "אתמול";
    if (diffDays < 7) return "השבוע";
    if (diffDays < 30) return "החודש";
    return "קודם";
  }

  const GROUP_ORDER = ["היום", "אתמול", "השבוע", "החודש", "קודם"];

  function extractSnippet(text, q, fromIndex = 0) {
    if (!text || !q) return null;
    const haystack = text.toLowerCase();
    const needle = q.toLowerCase();
    const idx = haystack.indexOf(needle, fromIndex);
    if (idx === -1) return null;
    const start = Math.max(0, idx - 50);
    const end = Math.min(text.length, idx + q.length + 50);
    return {
      idx,
      prefix: start > 0 ? "…" : "",
      before: text.slice(start, idx),
      match: text.slice(idx, idx + q.length),
      after: text.slice(idx + q.length, end),
      suffix: end < text.length ? "…" : "",
    };
  }

  function render() {
    renderGeneralMemory();
    renderContextList();
    syncCollapsibleSections();
    renderProjectList();
    renderHistoryList();
    renderProjectView();
    window.__ccbCtxMeter.watchConversation();
    window.__ccbCtxMeter.update();
  }

  function getProjects() {
    return Object.values(blocks)
      .filter((b) => b.kind === "project")
      .sort((a, b) => (b.updated || 0) - (a.updated || 0));
  }

  function getProjectById(id) {
    const project = id ? blocks[id] : null;
    return project && project.kind === "project" ? project : null;
  }

  function getConversationProject(b) {
    return getProjectById(b?.projectId || null);
  }

  function getProjectConversationCount(projectId) {
    return Object.values(blocks).filter(
      (b) => b.kind === "conversation" && b.projectId === projectId,
    ).length;
  }

  function createHistoryRow(
    b,
    {
      kind = "conversation",
      snippet = null,
      role = "user",
      showProjectTag = true,
    } = {},
  ) {
    const row = document.createElement("div");
    row.className =
      "hi-item" +
      (b.pinned ? " pinned" : "") +
      (kind === "message" ? " search-content" : "");

    const head = document.createElement("div");
    head.className = "hi-head";

    const title = document.createElement("div");
    title.className = "hi-title";
    title.textContent = b.title;
    head.appendChild(title);

    const project = getConversationProject(b);
    if (showProjectTag && project) {
      const tag = document.createElement("span");
      tag.className = "hi-project-tag";
      tag.textContent = project.title;
      head.appendChild(tag);
    }

    const menuBtn = document.createElement("button");
    menuBtn.className = "hi-menu-btn";
    menuBtn.innerHTML = "···";
    menuBtn.title = "אפשרויות";
    menuBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      openHiDropdown(b, menuBtn);
    });

    row.addEventListener("click", () => openConversationView(b));

    head.appendChild(menuBtn);
    row.appendChild(head);

    if (kind === "message" && snippet) {
      const snippetRow = document.createElement("div");
      snippetRow.className = "hi-snippet-row";

      const roleLabel = document.createElement("span");
      roleLabel.className = "hi-match-role";
      roleLabel.textContent = role === "ai" ? "ai" : "user";

      const snippetEl = document.createElement("div");
      snippetEl.className = "hi-snippet";
      if (snippet.prefix)
        snippetEl.appendChild(document.createTextNode(snippet.prefix));
      snippetEl.appendChild(document.createTextNode(snippet.before));
      const mark = document.createElement("mark");
      mark.textContent = snippet.match;
      snippetEl.appendChild(mark);
      snippetEl.appendChild(document.createTextNode(snippet.after));
      if (snippet.suffix)
        snippetEl.appendChild(document.createTextNode(snippet.suffix));

      snippetRow.appendChild(roleLabel);
      snippetRow.appendChild(snippetEl);
      row.appendChild(snippetRow);
    }

    return row;
  }

  function renderProjectList() {
    const list = $el("projectList");
    if (!list) return;
    list.innerHTML = "";

    const projects = getProjects();
    if (!projects.length) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.style.padding = "12px 0 2px";
      empty.textContent = "אין פרויקטים עדיין";
      list.appendChild(empty);
      return;
    }

    for (const project of projects) {
      const card = document.createElement("div");
      card.className = "project-card";

      const dot = document.createElement("span");
      dot.className = "project-dot";
      const name = document.createElement("span");
      name.className = "project-name";
      name.textContent = project.title;
      const count = document.createElement("span");
      count.className = "project-count";
      count.textContent = getProjectConversationCount(project.id) + " שיחות";

      card.appendChild(dot);
      card.appendChild(name);
      card.appendChild(count);
      card.addEventListener("click", () => openProjectView(project.id));
      list.appendChild(card);
    }
  }

  function updateHistoryLayoutForProjectView() {
    const inProject = !!getProjectById(currentProjectId);
    const toolbar = $el("historyToolbar");
    const projectsSection = $el("projectsSection");
    const historySection = $el("historySection");
    const view = $el("projectView");
    if (toolbar) toolbar.style.display = inProject ? "none" : "";
    if (projectsSection)
      projectsSection.style.display = inProject ? "none" : "";
    if (historySection) historySection.style.display = inProject ? "none" : "";
    if (view) view.style.display = inProject ? "flex" : "none";
  }

  function renderProjectViewConversations(project) {
    const list = $el("projectViewConversations");
    if (!list) return;
    list.innerHTML = "";

    const items = Object.values(blocks)
      .filter((b) => b.kind === "conversation" && b.projectId === project.id)
      .sort((a, b) => (b.updated || 0) - (a.updated || 0));

    if (!items.length) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.style.padding = "24px 8px";
      empty.textContent = "אין שיחות משויכות לפרויקט הזה";
      list.appendChild(empty);
      return;
    }

    for (const b of items) {
      list.appendChild(createHistoryRow(b, { showProjectTag: false }));
    }
  }

  function renderProjectView() {
    const project = getProjectById(currentProjectId);
    updateHistoryLayoutForProjectView();

    const view = $el("projectView");
    if (!view) return;
    if (!project) {
      currentProjectId = null;
      updateHistoryLayoutForProjectView();
      return;
    }

    $el("projectViewTitle").textContent = project.title;
    if ($el("projectInstructionsPreview")) {
      $el("projectInstructionsPreview").textContent =
        (project.content || "").trim() || "אין עדיין הנחיות לפרויקט הזה";
    }
    $el("projectViewInstructions").value = project.content || "";
    renderProjectViewConversations(project);
    syncProjectInstructionsSection();
  }

  function openProjectView(projectId) {
    const project = getProjectById(projectId);
    if (!project) return;
    closeConversationView();
    currentProjectId = project.id;
    projectInstructionsOpen = false;
    render();
  }

  function closeProjectView() {
    if (!currentProjectId) return;
    currentProjectId = null;
    projectInstructionsOpen = false;
    render();
  }

  function openConversationView(b) {
    if (!b) return;
    closeProjectView();

    const messages = buildHistoryMessages(b);
    currentConversationViewId = b.id;
    cvSelectedIndices = new Set(messages.map((_, i) => i));
    cvMatchElements = [];
    cvMatchIndex = 0;

    $el("cvTitle").textContent = b.title || "שיחה";
    const project = getConversationProject(b);
    const parts = [];
    const age = formatAge(b.updated);
    if (age) parts.push(age);
    parts.push(messages.length + " הודעות");
    if (project?.title) parts.push(project.title);
    $el("cvMeta").textContent = parts.join(" · ");

    const view = $el("conversationView");
    view?.classList.add("cv-open");
    view?.setAttribute("aria-hidden", "false");
    const s = $el("cvSearch");
    if (s) s.value = "";
    renderConversationMessages(b, "");
    const msgBox = $el("cvMessages");
    if (msgBox) msgBox.scrollTop = 0;
    setTimeout(() => $el("cvSearch")?.focus(), 10);
  }

  function closeConversationView() {
    currentConversationViewId = null;
    cvSelectedIndices = new Set();
    cvMatchElements = [];
    cvMatchIndex = 0;
    const view = $el("conversationView");
    view?.classList.remove("cv-open");
    view?.setAttribute("aria-hidden", "true");
    if ($el("cvSearch")) $el("cvSearch").value = "";
  }

  function updateNavMatch() {
    cvMatchElements.forEach((m) => m.classList.remove("cv-match-active"));
    const countEl = $el("cvSearchCount");
    const prevBtn = $el("cvNavPrev");
    const nextBtn = $el("cvNavNext");

    if (!cvMatchElements.length) {
      if (countEl) countEl.textContent = "";
      if (prevBtn) prevBtn.disabled = true;
      if (nextBtn) nextBtn.disabled = true;
      return;
    }

    if (cvMatchIndex < 0) cvMatchIndex = 0;
    if (cvMatchIndex >= cvMatchElements.length)
      cvMatchIndex = cvMatchElements.length - 1;

    const active = cvMatchElements[cvMatchIndex];
    active.classList.add("cv-match-active");
    try {
      active.scrollIntoView({ behavior: "smooth", block: "center" });
    } catch {
      active.scrollIntoView();
    }

    if (countEl)
      countEl.textContent = `${cvMatchIndex + 1}/${cvMatchElements.length}`;
    if (prevBtn) prevBtn.disabled = false;
    if (nextBtn) nextBtn.disabled = false;
  }

  function updateCvFooter() {
    const n = cvSelectedIndices.size;
    const count = $el("cvSelCount");
    if (count) count.textContent = n + " נבחרו";
    const btn = $el("cvLoadBtn");
    if (btn) {
      btn.disabled = n === 0;
      btn.textContent = `טען נבחרים (${n})`;
    }
  }

  function escapeRegExp(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function buildHighlightedNodes(text, query) {
    const frag = document.createDocumentFragment();
    const raw = String(text || "");
    const q = String(query || "").trim();
    if (!q) {
      frag.appendChild(document.createTextNode(raw));
      return frag;
    }
    let re = null;
    try {
      re = new RegExp(escapeRegExp(q), "gi");
    } catch {
      frag.appendChild(document.createTextNode(raw));
      return frag;
    }
    let last = 0;
    for (const m of raw.matchAll(re)) {
      const idx = m.index ?? -1;
      if (idx < 0) continue;
      if (idx > last)
        frag.appendChild(document.createTextNode(raw.slice(last, idx)));
      const mark = document.createElement("mark");
      mark.textContent = raw.slice(idx, idx + m[0].length);
      frag.appendChild(mark);
      last = idx + m[0].length;
    }
    if (last < raw.length)
      frag.appendChild(document.createTextNode(raw.slice(last)));
    return frag;
  }

  function renderConversationMessages(b, query) {
    const box = $el("cvMessages");
    if (!box) return;
    box.innerHTML = "";

    const messages = buildHistoryMessages(b);
    const q = String(query || "").trim();
    cvMatchElements = [];
    cvMatchIndex = 0;

    messages.forEach((m, i) => {
      const role = m.role === "user" ? "user" : "ai";
      const msg = document.createElement("div");
      msg.className = `cv-msg cv-msg-${role}`;

      const selectedNow = cvSelectedIndices.has(i);
      msg.classList.toggle("cv-selected", selectedNow);
      msg.classList.toggle("cv-deselected", !selectedNow);

      const roleRow = document.createElement("div");
      roleRow.className = "cv-msg-role";

      const check = document.createElement("span");
      check.className = "cv-msg-check";
      roleRow.appendChild(check);

      const label = document.createElement("span");
      label.textContent = role === "user" ? "אתה" : "AI";
      roleRow.appendChild(label);

      const bubble = document.createElement("div");
      bubble.className = "cv-msg-bubble";
      bubble.appendChild(buildHighlightedNodes(m.text || "", q));

      if (q) {
        const hasMatch = bubble.querySelector("mark");
        msg.classList.toggle("cv-dim", !hasMatch);
      }

      msg.appendChild(roleRow);
      msg.appendChild(bubble);

      msg.addEventListener("click", () => {
        if (cvSelectedIndices.has(i)) cvSelectedIndices.delete(i);
        else cvSelectedIndices.add(i);
        msg.classList.toggle("cv-selected", cvSelectedIndices.has(i));
        msg.classList.toggle("cv-deselected", !cvSelectedIndices.has(i));
        updateCvFooter();
      });

      box.appendChild(msg);
    });

    // collect match marks for navigation
    if (q) {
      cvMatchElements = Array.from(box.querySelectorAll("mark"));
    } else {
      cvMatchElements = [];
    }

    const prevBtn = $el("cvNavPrev");
    const nextBtn = $el("cvNavNext");
    if (prevBtn) prevBtn.disabled = cvMatchElements.length === 0;
    if (nextBtn) nextBtn.disabled = cvMatchElements.length === 0;

    updateNavMatch();
    updateCvFooter();
  }

  async function saveProjectView() {
    const project = getProjectById(currentProjectId);
    if (!project) return;
    await loadBlocks();
    const nextContent = ($el("projectViewInstructions")?.value || "").trim();
    blocks[project.id].content = nextContent;
    blocks[project.id].updated = Date.now();
    await saveBlocks();
    render();
    setStatus("הפרויקט נשמר ✓");
  }

  function openProjectDropdown(project, menuBtn) {
    closeHiDropdown();
    const dd = $el("hiDropdown");

    const renameItem = document.createElement("div");
    renameItem.className = "hd-item";
    renameItem.innerHTML =
      '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg> שנה שם';
    renameItem.addEventListener("click", async () => {
      closeHiDropdown();
      const nextTitle = await showPrompt({
        title: "שנה שם הפרויקט",
        defaultValue: project.title,
      });
      if (nextTitle === null || !nextTitle.trim()) return;
      await loadBlocks();
      blocks[project.id].title = nextTitle.trim();
      blocks[project.id].updated = Date.now();
      await saveBlocks();
      render();
    });

    const sep = document.createElement("div");
    sep.className = "hd-sep";

    const delItem = document.createElement("div");
    delItem.className = "hd-item danger";
    delItem.innerHTML =
      '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg> מחק';
    delItem.addEventListener("click", async () => {
      closeHiDropdown();
      const ok = await showConfirm({
        title: "מחיקת פרויקט",
        msg: 'למחוק את "' + project.title + '"? השיחות לא יימחקו, רק השיוך.',
        confirmLabel: "מחק",
        danger: true,
      });
      if (!ok) return;
      await loadBlocks();
      delete blocks[project.id];
      for (const b of Object.values(blocks)) {
        if (b.kind === "conversation" && b.projectId === project.id) {
          delete b.projectId;
        }
      }
      if (currentProjectId === project.id) currentProjectId = null;
      await saveBlocks();
      render();
    });

    dd.innerHTML = "";
    dd.appendChild(renameItem);
    dd.appendChild(sep);
    dd.appendChild(delItem);

    const rect = menuBtn.getBoundingClientRect();
    dd.style.top = rect.top + "px";
    dd.style.left = rect.right + 6 + "px";
    dd.classList.add("open");

    const onOutside = (e) => {
      if (!dd.contains(e.target) && e.target !== menuBtn) closeHiDropdown();
    };
    document.addEventListener("click", onOutside, {
      capture: true,
      once: false,
    });
    hiDropdownCleanup = () =>
      document.removeEventListener("click", onOutside, { capture: true });
  }

  async function showProjectPicker({
    title = "שייך לפרויקט",
    currentId = null,
    allowClear = true,
  } = {}) {
    await loadBlocks();
    const projects = getProjects();
    if (!projects.length) return null;

    return new Promise((resolve) => {
      const overlay = $el("dialogOverlay");
      const dlgTitle = $el("dialogTitle");
      const dlgMsg = $el("dialogMsg");
      const confirm = $el("dialogConfirm");
      const cancel = $el("dialogCancel");
      const input = $el("dialogInput");

      dlgTitle.textContent = title;
      dlgMsg.innerHTML = "";
      input.style.display = "none";
      confirm.style.display = "none";
      cancel.textContent = "ביטול";
      overlay.classList.add("show");

      const picker = document.createElement("div");
      picker.className = "project-picker";

      if (allowClear) {
        const clearBtn = document.createElement("button");
        clearBtn.type = "button";
        clearBtn.className =
          "project-picker-item" + (currentId === null ? " active" : "");
        clearBtn.textContent = "ללא פרויקט";
        clearBtn.addEventListener("click", () => done(null));
        picker.appendChild(clearBtn);
      }

      for (const project of projects) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className =
          "project-picker-item" + (currentId === project.id ? " active" : "");
        btn.textContent = project.title;
        btn.addEventListener("click", () => done(project.id));
        picker.appendChild(btn);
      }

      dlgMsg.appendChild(picker);

      let settled = false;
      const cleanup = () => {
        dlgMsg.innerHTML = "";
        confirm.style.display = "";
        input.style.display = "none";
        overlay.classList.remove("show");
      };
      const done = (result) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(result);
      };

      cancel.addEventListener("click", () => done(undefined), { once: true });
      overlay.addEventListener(
        "click",
        (e) => {
          if (e.target === overlay) done(undefined);
        },
        { once: true },
      );
    });
  }

  function renderContextList() {
    const items = Object.values(blocks)
      .filter(
        (b) =>
          b.kind !== "conversation" && b.kind !== "project" && b.id !== GM_ID,
      )
      .sort((a, b) => (b.updated || 0) - (a.updated || 0));

    const list = $el("list");
    list.innerHTML = "";
    if (!items.length) {
      const div = document.createElement("div");
      div.className = "empty";
      div.textContent = "בנק ריק\nלחץ + להוספת בלוק ראשון";
      list.appendChild(div);
      return;
    }
    for (const b of items) {
      const isSelected = selected.has(b.id);
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
        if (cb.checked) selected.add(b.id);
        else selected.delete(b.id);
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
      const title = document.createElement("div");
      title.className = "block-title";
      title.textContent = b.title;
      head.appendChild(title);

      const tagCount = (b.tags || []).length;
      if (tagCount) {
        const meta = document.createElement("span");
        meta.className = "block-meta";
        meta.textContent = tagCount + " תגים";
        head.appendChild(meta);
      }
      main.appendChild(head);
      if (tagCount) {
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
      list.appendChild(row);
    }
  }

  // ============================================================
  // History
  // ============================================================
  function formatTranscript(messages) {
    return messages
      .map((m) => (m.role === "user" ? "User: " : "Assistant: ") + m.text)
      .join("\n\n");
  }

  let historyBubbleObserver = null;
  let historyBubbleTimer = null;

  function stopHistoryBubbleObserver() {
    if (historyBubbleObserver) {
      historyBubbleObserver.disconnect();
      historyBubbleObserver = null;
    }
    if (historyBubbleTimer) {
      clearTimeout(historyBubbleTimer);
      historyBubbleTimer = null;
    }
  }

  function buildHistoryMessages(b) {
    if (Array.isArray(b.messages) && b.messages.length) return b.messages;
    const text = (b.content || "").trim();
    return text ? [{ role: "ai", text }] : [];
  }

  function buildProjectSectionText(block) {
    const project = getConversationProject(block);
    if (!project) return "";
    const content = (project.content || "").trim();
    return "## " + project.title + "\n" + (content || "") + "\n\n";
  }

  function buildConversationInjectionText(
    messages,
    block,
    { includeGeneralMemory = true } = {},
  ) {
    const gm = getGM();
    const parts = [FRAMING];
    if (includeGeneralMemory && gm.autoLoad && (gm.content || "").trim()) {
      parts.push(gm.content.trim() + "\n\n");
    }
    parts.push(buildProjectSectionText(block));
    parts.push("---\n\n" + formatTranscript(messages));
    return parts.join("");
  }

  function injectHistoryBubbles(messages, { persist = false } = {}) {
    const container = document.querySelector(MSG_SELECTORS.messageList);
    if (!container) return false;

    stopHistoryBubbleObserver();

    const prev = container.querySelector("[data-ccb-history]");
    if (prev) prev.remove();

    const wrapper = document.createElement("div");
    wrapper.dataset.ccbHistory = "1";
    wrapper.style.cssText =
      "padding:16px;border-bottom:1px solid rgba(0,0,0,.1);" +
      "background:rgba(0,0,0,.02);font-family:system-ui,sans-serif;";

    const label = document.createElement("div");
    label.style.cssText =
      "font-size:11px;color:#888;text-align:center;margin-bottom:12px;";
    label.textContent = "— היסטוריית שיחה קודמת —";
    wrapper.appendChild(label);

    for (const m of messages) {
      const bubble = document.createElement("div");
      bubble.style.cssText =
        "margin:6px 0;padding:10px 14px;border-radius:12px;" +
        "font-size:14px;line-height:1.5;max-width:80%;word-break:break-word;" +
        "white-space:pre-wrap;" +
        (m.role === "user"
          ? "background:#e3f2fd;margin-left:auto;text-align:right;"
          : "background:#f5f5f5;margin-right:auto;");
      bubble.textContent = m.text;
      wrapper.appendChild(bubble);
    }

    container.prepend(wrapper);

    if (persist) {
      historyBubbleObserver = new MutationObserver(() => {
        if (!container.contains(wrapper)) container.prepend(wrapper);
      });
      historyBubbleObserver.observe(container, { childList: true });
      historyBubbleTimer = setTimeout(() => {
        stopHistoryBubbleObserver();
      }, 10000);
    }

    return true;
  }

  async function loadConversation(b, mode = null) {
    const messages = buildHistoryMessages(b);

    if (!mode) {
      const choice = await showChoice({
        title: "איך לטעון את השיחה?",
        msg: "בחר אם רק להציג את ההיסטוריה ב-DOM, או להזריק את תוכן השיחה לצ'אט.",
        primaryLabel: "הזרקה לצ'אט",
        secondaryLabel: "רק צפייה בהיסטוריה",
      });
      if (choice === "primary") mode = "inject";
      else if (choice === "secondary") mode = "view";
      else return;
    }

    // סמן את השיחה הזו כמוזרקת/נבחרת כרגע (לעדכון בעתיד)
    lastInjectedConversationId = b.id;

    if (mode === "view") {
      const projectText = buildProjectSectionText(b);
      if (projectText) {
        const r = injectIntoInput(FRAMING + projectText, "replace");
        if (r.ok) {
          setTimeout(() => {
            const btn = document.querySelector(CONFIG.SEND_BUTTON_SELECTOR);
            if (btn) btn.click();
          }, 100);
        } else {
          setStatus(r.error || "נכשל", true);
        }
      }
      injectHistoryBubbles(messages, { persist: false });
      return;
    }

    // תמיד בנה את הנחיות הפרויקט גם אם אין הודעות
    const transcript = buildConversationInjectionText(messages, b);

    const r = injectIntoInput(transcript, "replace");
    if (r.ok) {
      setTimeout(() => {
        const btn = document.querySelector(CONFIG.SEND_BUTTON_SELECTOR);
        if (btn) btn.click();
      }, 100);
    } else {
      setStatus(r.error || "נכשל", true);
    }

    if (messages.length && MSG_SELECTORS.messageList) {
      const stableAncestor =
        document.querySelector("chat-window") ||
        document.querySelector("chat-window-content") ||
        document.body;
      let injected = false;
      const waitObs = new MutationObserver(() => {
        const container = document.querySelector(MSG_SELECTORS.messageList);
        if (container && container.children.length > 0 && !injected) {
          injected = true;
          waitObs.disconnect();
          injectHistoryBubbles(messages, { persist: true });
        }
      });
      waitObs.observe(stableAncestor, { childList: true, subtree: true });
      setTimeout(() => waitObs.disconnect(), 15000);
    }
  }

  let hiDropdownCleanup = null;

  function openHiDropdown(b, menuBtn) {
    closeHiDropdown();
    const dd = $el("hiDropdown");

    const pinItem = document.createElement("div");
    pinItem.className = "hd-item";
    pinItem.innerHTML = b.pinned
      ? '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="3" y1="21" x2="21" y2="3"/><path d="M14 3l7 7-1.5 1.5"/><path d="M3 14l1.5-1.5"/></svg> בטל הצמדה'
      : '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"/></svg> הצמד';
    pinItem.addEventListener("click", async () => {
      closeHiDropdown();
      await loadBlocks();
      blocks[b.id].pinned = !b.pinned;
      await saveBlocks();
      renderHistoryList();
    });

    const sep = document.createElement("div");
    sep.className = "hd-sep";

    const renameItem = document.createElement("div");
    renameItem.className = "hd-item";
    renameItem.innerHTML =
      '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg> שנה שם';
    renameItem.addEventListener("click", async () => {
      closeHiDropdown();
      const newName = await showPrompt({
        title: "שנה שם השיחה",
        defaultValue: b.title,
      });
      if (newName === null || newName.trim() === "") return;
      await loadBlocks();
      blocks[b.id].title = newName.trim();
      await saveBlocks();
      renderHistoryList();
    });

    const delItem = document.createElement("div");
    delItem.className = "hd-item danger";
    delItem.innerHTML =
      '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg> מחק';
    delItem.addEventListener("click", async () => {
      closeHiDropdown();
      const ok = await showConfirm({
        title: "מחיקת שיחה",
        msg: 'למחוק את "' + b.title + '"? לא ניתן לשחזר.',
        confirmLabel: "מחק",
        danger: true,
      });
      if (!ok) return;
      delete blocks[b.id];
      await saveBlocks();
      renderHistoryList();
    });

    const projectItem = document.createElement("div");
    projectItem.className = "hd-item";
    projectItem.innerHTML =
      '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7h6l2 2h10v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M3 7V5a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v2"/></svg> שייך לפרויקט';
    projectItem.addEventListener("click", async () => {
      closeHiDropdown();
      const pick = await showProjectPicker({
        title: "שייך לפרויקט",
        currentId: b.projectId || null,
        allowClear: true,
      });
      if (pick === undefined) return;
      await loadBlocks();
      if (!blocks[b.id]) return;
      if (pick === null) delete blocks[b.id].projectId;
      else blocks[b.id].projectId = pick;
      blocks[b.id].updated = Date.now();
      await saveBlocks();
      render();
    });

    dd.innerHTML = "";
    dd.appendChild(pinItem);
    dd.appendChild(sep);
    dd.appendChild(renameItem);
    dd.appendChild(projectItem);
    dd.appendChild(sep.cloneNode());
    dd.appendChild(delItem);

    const rect = menuBtn.getBoundingClientRect();
    dd.style.top = rect.top + "px";
    dd.style.left = rect.right + 6 + "px";
    dd.classList.add("open");

    const onOutside = (e) => {
      if (!dd.contains(e.target) && e.target !== menuBtn) closeHiDropdown();
    };
    document.addEventListener("click", onOutside, {
      capture: true,
      once: false,
    });
    hiDropdownCleanup = () =>
      document.removeEventListener("click", onOutside, { capture: true });
  }

  function closeHiDropdown() {
    const dd = $el("hiDropdown");
    if (dd) {
      dd.classList.remove("open", "ctx-files-dropdown");
      dd.dataset.menuType = "";
      dd.innerHTML = "";
      dd.style.minWidth = "";
      dd.style.maxWidth = "";
      dd.style.maxHeight = "";
    }
    if (hiDropdownCleanup) {
      hiDropdownCleanup();
      hiDropdownCleanup = null;
    }
  }

  function renderHistoryList() {
    if (currentProjectId && !getProjectById(currentProjectId)) {
      currentProjectId = null;
    }
    closeHiDropdown();
    const q = ($el("searchHistory")?.value || "").trim().toLowerCase();
    const all = Object.values(blocks)
      .filter((b) => b.kind === "conversation")
      .filter((b) => !currentProjectId || b.projectId === currentProjectId)
      .sort((a, b) => (b.updated || 0) - (a.updated || 0));

    const list = $el("historyList");
    list.innerHTML = "";

    if (!all.length) {
      const div = document.createElement("div");
      div.className = "empty";
      div.textContent = q
        ? "לא נמצא"
        : 'אין סיכומי שיחה שמורים\nלחץ "סכם שיחה" לשמירה';
      list.appendChild(div);
      return;
    }

    const rows = [];
    if (!q) {
      for (const b of all) rows.push({ block: b, kind: "conversation" });
    } else if (historySearchMode === "title") {
      for (const b of all) {
        if (b.title.toLowerCase().includes(q))
          rows.push({ block: b, kind: "conversation" });
      }
    } else {
      for (const b of all) {
        for (const [index, m] of (b.messages || []).entries()) {
          const text = (m?.text || "").trim();
          if (!text) continue;
          let fromIndex = 0;
          while (true) {
            const snippet = extractSnippet(text, q, fromIndex);
            if (!snippet) break;
            rows.push({
              block: b,
              kind: "message",
              role: m.role || "user",
              snippet,
              messageIndex: index,
            });
            fromIndex = snippet.idx + Math.max(q.length, 1);
          }
        }
      }
    }

    if (!rows.length) {
      const div = document.createElement("div");
      div.className = "empty";
      div.textContent = "לא נמצא";
      list.appendChild(div);
      return;
    }

    const pinned = rows.filter((row) => row.block.pinned);
    const rest = rows.filter((row) => !row.block.pinned);

    function addItem(rowData) {
      list.appendChild(
        createHistoryRow(rowData.block, {
          kind: rowData.kind,
          snippet: rowData.snippet,
          role: rowData.role,
          showProjectTag: true,
        }),
      );
    }

    if (pinned.length) {
      const label = document.createElement("div");
      label.className = "date-group-label";
      label.textContent = "מוצמד";
      list.appendChild(label);
      pinned.forEach(addItem);
    }

    const groups = {};
    for (const rowData of rest) {
      const g = dateGroup(rowData.block.updated || 0);
      if (!groups[g]) groups[g] = [];
      groups[g].push(rowData);
    }
    for (const groupName of GROUP_ORDER) {
      if (!groups[groupName]) continue;
      const label = document.createElement("div");
      label.className = "date-group-label";
      label.textContent = groupName;
      list.appendChild(label);
      groups[groupName].forEach(addItem);
    }
  }

  // ============================================================
  // Edit form
  // ============================================================
  function openEdit(id, prefill) {
    editingId = id;
    const b = id ? blocks[id] : null;
    $el("editTitle").value = b ? b.title : prefill?.title || "";
    $el("editTags").value = b ? (b.tags || []).join(", ") : prefill?.tags || "";
    $el("editContent").value = b ? b.content : prefill?.content || "";
    $el("deleteBtn").style.display = id ? "block" : "none";
    $el("panel").classList.add("editing");
    $el("editTitle").focus();
  }

  function closeEdit() {
    editingId = null;
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
      editingId ||
      "b_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7);
    const existing = blocks[id];
    blocks[id] = { id, title, content, tags, updated: Date.now() };
    if (existing?.kind) blocks[id].kind = existing.kind;
    if (existing?.autoLoad !== undefined)
      blocks[id].autoLoad = existing.autoLoad;
    await saveBlocks();
    closeEdit();
    render();
  }

  async function deleteEdit() {
    if (!editingId) return;
    const ok = await showConfirm({
      title: "מחיקת בלוק",
      msg: 'למחוק את "' + blocks[editingId].title + '"? לא ניתן לשחזר.',
      confirmLabel: "מחק",
      danger: true,
    });
    if (!ok) return;
    delete blocks[editingId];
    selected.delete(editingId);
    await saveBlocks();
    closeEdit();
    render();
  }

  function updateInjectBtn() {
    if (!shadow) return;
    const btn = $el("injectBtn");
    const n = selected.size;
    btn.disabled = n === 0;
    if (n > 0) {
      btn.innerHTML =
        IC.upload + ' טען נבחרים <span class="count-pill">' + n + "</span>";
    } else {
      btn.innerHTML = IC.upload + " טען נבחרים";
    }
  }

  // ============================================================
  // Inject selected context blocks
  // ============================================================
  function injectSelected() {
    if (selected.size === 0) {
      setStatus("בחר בלוקים תחילה", true);
      return;
    }
    const orderedIds = selected.has(GM_ID)
      ? [GM_ID, ...[...selected].filter((id) => id !== GM_ID)]
      : [...selected];
    const ordered = orderedIds
      .map((id) => (id === GM_ID ? blocks[id] || getGM() : blocks[id]))
      .filter(Boolean);
    const text =
      FRAMING +
      ordered.map((b) => "## " + b.title + "\n" + b.content).join("\n\n") +
      "\n\n---\n\n";
    const r = injectIntoInput(text, "prepend");
    if (r.ok) {
      setStatus("הוזרק ✓");
      setTimeout(() => {
        const btn = document.querySelector(CONFIG.SEND_BUTTON_SELECTOR);
        if (btn) btn.click();
        else setStatus("לא נמצא כפתור שליחה", true);
      }, 100);
    } else {
      setStatus(r.error || "נכשל", true);
    }
  }

  // ============================================================
  // Save chat
  // ============================================================
  function findScrollableAncestor() {
    const isScrollable = (el) => {
      const cs = getComputedStyle(el);
      return (
        (cs.overflowY === "auto" || cs.overflowY === "scroll") &&
        el.scrollHeight - el.clientHeight > 50
      );
    };
    let el = document.querySelector(MSG_SELECTORS.messageList);
    while (el && el !== document.body) {
      if (isScrollable(el)) return el;
      el = el.parentElement;
    }
    for (const cand of document.querySelectorAll(
      "main, [class*='scroll'], [class*='conversation']",
    )) {
      if (isScrollable(cand)) return cand;
    }
    return null;
  }

  function captureConversation() {
    const container = document.querySelector(MSG_SELECTORS.messageList);
    if (!container) return [];
    const nodes = container.querySelectorAll(MSG_SELECTORS.message);
    const messages = [];
    for (const n of nodes) {
      const text = MSG_SELECTORS.messageText(n) || "";
      if (!text.trim()) continue;
      if (text.includes("[[CCB:INJECTED]]")) continue;
      // בדוק באמצעות userMessageMatch ו-aiMessageMatch אם זה קיים
      let role = "user"; // ברירת מחדל
      if (MSG_SELECTORS.aiMessageMatch && MSG_SELECTORS.aiMessageMatch(n)) {
        role = "ai";
      } else if (
        MSG_SELECTORS.userMessageMatch &&
        MSG_SELECTORS.userMessageMatch(n)
      ) {
        role = "user";
      }
      messages.push({ role, text: text.trim() });
    }
    return messages;
  }

  function messageListsEqual(a, b) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length)
      return false;
    for (let i = 0; i < a.length; i++) {
      if ((a[i]?.role || "") !== (b[i]?.role || "")) return false;
      if ((a[i]?.text || "").trim() !== (b[i]?.text || "").trim()) return false;
    }
    return true;
  }

  function appendConversationMessages(existing, incoming) {
    if (!Array.isArray(existing) || !Array.isArray(incoming)) return incoming;
    if (!incoming.length) return existing;
    if (messageListsEqual(existing.slice(-incoming.length), incoming))
      return existing;
    if (
      existing.length &&
      incoming.length >= existing.length &&
      messageListsEqual(incoming.slice(0, existing.length), existing)
    ) {
      return incoming;
    }
    return [...existing, ...incoming];
  }

  function upsertConversationMessages(id, messages) {
    const block = blocks[id];
    if (!block) return false;
    block.messages = messages;
    block.updated = Date.now();
    return true;
  }

  async function scrollAndCaptureAll() {
    const scroller = findScrollableAncestor();
    if (!scroller) return;
    return new Promise((resolve) => {
      let lastCount = 0;
      let stable = 0;
      const check = setInterval(() => {
        scroller.scrollTo({ top: 0 });
        scroller.scrollTop = 0;
        const count = document.querySelectorAll(MSG_SELECTORS.message).length;
        if (count === lastCount) {
          if (++stable >= 3) {
            clearInterval(check);
            resolve();
          }
        } else {
          lastCount = count;
          stable = 0;
        }
      }, 300);
      setTimeout(() => {
        clearInterval(check);
        resolve();
      }, 8000);
    });
  }

  async function saveChat() {
    if (!inlineReady()) {
      const r = injectIntoInput(SUMMARY_PROMPT, "replace");
      if (r.ok) {
        setTimeout(() => {
          const btn = document.querySelector(CONFIG.SEND_BUTTON_SELECTOR);
          if (btn) btn.click();
          else setStatus("לא נמצא כפתור שליחה", true);
        }, 100);
      } else {
        setStatus(r.error || "נכשל", true);
      }
      return;
    }

    setStatus("גולל לתחילה…");
    await scrollAndCaptureAll();
    const messages = captureConversation();
    if (!messages.length) {
      setStatus("לא נמצאו הודעות — ודא MSG_SELECTORS", true);
      return;
    }

    await loadBlocks();

    // אם יש שיחה מוזרקת כרגע, עדכן אותה במקום לבקש שם חדש
    if (lastInjectedConversationId && blocks[lastInjectedConversationId]) {
      const block = blocks[lastInjectedConversationId];
      const existing = Array.isArray(block.messages) ? block.messages : [];
      const merged = appendConversationMessages(existing, messages);
      upsertConversationMessages(lastInjectedConversationId, merged);
      await saveBlocks();
      setStatus("השיחה עודכנה ✓");
      render();
      return;
    }

    // אחרת, צור שיחה חדשה
    const now = new Date();
    const defaultTitle =
      "שיחה — " +
      now.toLocaleDateString("he-IL") +
      " " +
      now.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
    const chosenTitle = await showPrompt({
      title: "שם לשיחה",
      defaultValue: defaultTitle,
    });
    if (chosenTitle === null) {
      setStatus("");
      return;
    }

    const projectId = null;

    const id = "b_" + Date.now() + "_conv";
    blocks[id] = {
      id,
      title: chosenTitle,
      messages,
      kind: "conversation",
      projectId,
      updated: Date.now(),
    };
    lastInjectedConversationId = id;
    await saveBlocks();
    setStatus("השיחה נשמרה ✓");
    render();
  }

  // ============================================================
  // Toast / status
  // ============================================================
  let toastTimer = null;
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
  // Inline save button on AI messages
  // ============================================================
  let msgObserver = null;
  const SAVE_BTN_FLAG = "__ccbSaveBtn";

  function inlineReady() {
    return (
      MSG_SELECTORS.messageList &&
      MSG_SELECTORS.message &&
      typeof MSG_SELECTORS.aiMessageMatch === "function" &&
      typeof MSG_SELECTORS.messageText === "function"
    );
  }

  function decorateMessage(node) {
    if (!node || node[SAVE_BTN_FLAG]) return;
    if (!MSG_SELECTORS.aiMessageMatch(node)) return;
    node[SAVE_BTN_FLAG] = true;
    const btn = document.createElement("button");
    btn.textContent = "💾 שמור לבנק";
    btn.style.cssText =
      "all:revert;margin:4px;padding:2px 8px;font-size:12px;" +
      "border:1px solid #ccc;border-radius:4px;background:#fff;" +
      "cursor:pointer;font-family:system-ui,sans-serif;";
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      await loadBlocks();
      mountUI();
      await setPanelOpen(true);
      const text = MSG_SELECTORS.messageText(node) || "";
      openEdit(null, { content: text });
    });
    node.appendChild(btn);
  }

  function startMsgObserver() {
    if (!inlineReady() || msgObserver) return;
    const container = document.querySelector(MSG_SELECTORS.messageList);
    if (!container) return;
    container.querySelectorAll(MSG_SELECTORS.message).forEach(decorateMessage);
    msgObserver = new MutationObserver((muts) => {
      for (const m of muts) {
        m.addedNodes.forEach((n) => {
          if (n.nodeType !== 1) return;
          if (n.matches?.(MSG_SELECTORS.message)) decorateMessage(n);
          n.querySelectorAll?.(MSG_SELECTORS.message).forEach(decorateMessage);
        });
      }
    });
    msgObserver.observe(container, { childList: true, subtree: true });
  }

  window.addEventListener("beforeunload", () => {
    msgObserver?.disconnect();
    msgObserver = null;
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
        sendResponse(injectIntoInput(msg.text, msg.mode));
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
  // Init
  // ============================================================
  function shouldAutoOpen() {
    return CONFIG.AUTO_OPEN_URLS.some((u) => location.href.startsWith(u));
  }

  async function init() {
    if (!isActiveSitePage()) return;
    await loadCtxWindow();
    startMsgObserver();
    window.__ccbCtxMeter.watchFileInputs();
    window.__ccbCtxMeter.watchConversation();
    await loadBlocks();
    tryAutoInject();
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
      return blocks;
    },
    saveBlocks,
    loadBlocks,
    setStatus,
    renderPanel: () => {
      if (shadow && $el("panel").classList.contains("open")) render();
    },
  };
})();
