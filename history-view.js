// history-view.js — active project (global selection), history list,
// conversation preview panel.
// Exposes: window.__ccbHistoryView
//
// Public API (after init):
//   render()                          — full re-render of project selector + history list + project context
//   renderHistoryList()               — filtered by the active project unless state.historyShowAll
//   renderProjectSelect()              — custom dropdown trigger label/icon (not a native <select>)
//   toggleProjectSelectDropdown() / closeProjectSelectDropdown()
//   renderProjectContext()            — instructions card + documents section for the active project
//   loadActiveProjectId() / setActiveProjectId(id) — persisted (chrome.storage) global project selection
//   openConversationView(b, opts) / closeConversationView()
//   renderConversationMessages(b, query)
//   updateNavMatch() / updateCvFooter()
//   openHiDropdown(b, menuBtn) / closeHiDropdown()
//   openProjectDropdown(project, menuBtn) — rename / delete
//   syncCollapsibleSections() / syncProjectDocumentsSection()
//   getProjects() / getAllProjects() / getProjectById(id) / getConversationProject(b)
//   buildHistoryMessages(b) / buildConversationInjectionText(messages)
//   formatTranscript(messages) / formatAge(ts) / dateGroup(ts) / extractSnippet(text, q, fromIndex)
//   addProject()
//   getCodeProjects()
//   createCodeProjectBookmark() / rescanCodeProject(id)
//   enableFilesForProject(projectId, relativePaths, enabled = true) / setAllCodeDocsEnabled(projectId, enabled)
//   openIgnorePatternsDialog(project) — editor for project.ignorePatterns (files/folders excluded from scanning)

(() => {
  if (window.__ccbHistoryViewInstalled) return;
  window.__ccbHistoryViewInstalled = true;

  let _deps = null;
  const $el = (id) => _deps?.getShadow?.()?.getElementById(id);

  const GROUP_ORDER = ["היום", "אתמול", "השבוע", "החודש", "קודם"];

  // ============================================================
  // Date / snippet utilities
  // ============================================================
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

  // ============================================================
  // Project lookups
  // ============================================================
  function getProjects() {
    return Object.values(_deps.state.blocks)
      .filter((b) => b.kind === "project" && !b.isCodeProject)
      .sort((a, b) => (b.updated || 0) - (a.updated || 0));
  }

  function getCodeProjects() {
    return Object.values(_deps.state.blocks)
      .filter((b) => b.kind === "project" && b.isCodeProject === true)
      .sort((a, b) => (b.updated || 0) - (a.updated || 0));
  }

  // Unified Context-tab "פרויקטים" list — regular + code projects together,
  // most-recently-updated first (a folder icon distinguishes code projects
  // in the selector dropdown; see renderProjectSelectItems).
  function getAllProjects() {
    return Object.values(_deps.state.blocks)
      .filter((b) => b.kind === "project")
      .sort((a, b) => (b.updated || 0) - (a.updated || 0));
  }

  function getProjectById(id) {
    const project = id ? _deps.state.blocks[id] : null;
    return project && project.kind === "project" ? project : null;
  }

  function getConversationProject(b) {
    return getProjectById(b?.projectId || null);
  }

  // ============================================================
  // Active project (global selection) — persisted across sessions so "which
  // project am I on" survives closing/reopening the panel.
  // ============================================================
  async function loadActiveProjectId() {
    if (_deps.state.activeProjectLoaded) return;
    const data = await new Promise((r) => chrome.storage.local.get("activeProjectId", r));
    _deps.state.currentProjectId = getProjectById(data.activeProjectId)?.id || null;
    _deps.state.activeProjectLoaded = true;
  }

  async function setActiveProjectId(id) {
    _deps.state.currentProjectId = getProjectById(id)?.id || null;
    await new Promise((r) =>
      chrome.storage.local.set({ activeProjectId: _deps.state.currentProjectId }, r),
    );
  }

  function getProjectConversationCount(projectId) {
    return Object.values(_deps.state.blocks).filter(
      (b) => b.kind === "conversation" && b.projectId === projectId,
    ).length;
  }

  // ============================================================
  // Transcript / framing builders
  // ============================================================
  function formatTranscript(messages) {
    return messages
      .map((m) => (m.role === "user" ? "User: " : "Assistant: ") + m.text)
      .join("\n\n");
  }

  // AI canned responses to injections. Old saved blocks may contain these
  // (created before capture-time filtering existed) — strip them here so they
  // don't appear in the conversation view or get re-injected on continue.
  const INJECTION_AUTORESPONSES = new Set([
    "Context loaded.",
    "Context loaded",
    "Transcript loaded.",
    "Transcript loaded",
    "Project guidelines loaded.",
    "Project guidelines loaded",
    "Files loaded.",
    "Files loaded",
  ]);

  function buildHistoryMessages(b) {
    if (Array.isArray(b.messages) && b.messages.length) {
      return b.messages.filter(
        (m) =>
          !(m && m.role === "ai" && INJECTION_AUTORESPONSES.has((m.text || "").trim())),
      );
    }
    const text = (b.content || "").trim();
    return text ? [{ role: "ai", text }] : [];
  }

  function buildConversationInjectionText(messages) {
    const INJECTED_PREFIX = "[[CCB:INJECTED]]\n";
    const framing = _deps.framing;
    const transcript = formatTranscript(messages);
    return (framing.convPre || INJECTED_PREFIX) + transcript + (framing.convPost || "\n\n");
  }

  // ============================================================
  // Collapsible sections
  // ============================================================
  function syncCollapsibleSections() {
    const state = _deps.state;
    const historySection = $el("historySection");
    const historyBtn = $el("historyCollapseBtn");

    if (historySection)
      historySection.classList.toggle("collapsed", state.historyCollapsed);
    if (historyBtn) {
      historyBtn.classList.toggle("collapsed", state.historyCollapsed);
      historyBtn.title = state.historyCollapsed
        ? "פתח שיחות אחרונות"
        : "סגור שיחות אחרונות";
      historyBtn.setAttribute(
        "aria-label",
        state.historyCollapsed ? "פתח שיחות אחרונות" : "סגור שיחות אחרונות",
      );
    }
  }

  // Renders the project-instructions card exactly like chat-features.js#renderGeneralMemory:
  // a select-for-inject checkbox + autoLoad toggle + title header, an
  // "auto-badge" below when on, and the WHOLE card clickable to open the shared
  // block-edit form (openEdit) — no dedicated edit button, no inline
  // accordion/textarea, and (since 2026-07-19) no separate "load instructions"
  // button in the section header: ticking the checkbox and pressing the footer
  // "טען פרומפטים" is the manual-load path, same as for GM.
  function renderProjectInstructionsCard(project) {
    const card = $el("projectInstructionsCard");
    if (!card) return;
    const on = project.autoLoad !== false; // missing autoLoad defaults to ON
    const selectedForInject = _deps.state.selected.has(project.id);

    card.innerHTML = "";
    const wrap = document.createElement("div");
    wrap.className = "gm-card";
    wrap.addEventListener("click", () => _deps.openEdit(project.id));

    const header = document.createElement("div");
    header.className = "gm-header";

    const selectLabel = document.createElement("label");
    selectLabel.className = "cb-wrap gm-select";
    selectLabel.title = "סמן כדי לטעון את ההנחיות עם 'טען פרומפטים'";
    selectLabel.addEventListener("click", (e) => e.stopPropagation());
    const selectInput = document.createElement("input");
    selectInput.type = "checkbox";
    selectInput.checked = selectedForInject;
    selectInput.setAttribute("aria-label", "הוסף את הנחיות הפרויקט להזרקה");
    selectInput.addEventListener("change", () => {
      if (selectInput.checked) _deps.state.selected.add(project.id);
      else _deps.state.selected.delete(project.id);
      _deps.updateInjectBtn();
    });
    const selectBox = document.createElement("span");
    selectBox.className = "cb-box";
    selectBox.innerHTML =
      '<svg class="cb-check" width="10" height="8" viewBox="0 0 10 8" fill="none"><polyline points="1,4 4,7 9,1" stroke="white" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    selectLabel.appendChild(selectInput);
    selectLabel.appendChild(selectBox);

    const toggleLabel = document.createElement("label");
    toggleLabel.className = "toggle";
    toggleLabel.title = "טעינה אוטומטית של הנחיות הפרויקט בתחילת שיחה";
    toggleLabel.addEventListener("click", (e) => e.stopPropagation());
    const toggleInput = document.createElement("input");
    toggleInput.type = "checkbox";
    toggleInput.checked = on;
    toggleInput.addEventListener("change", async () => {
      await _deps.loadBlocks();
      _deps.state.blocks[project.id].autoLoad = toggleInput.checked;
      _deps.state.blocks[project.id].updated = Date.now();
      await _deps.saveBlocks();
      renderProjectInstructionsCard(_deps.state.blocks[project.id]);
    });
    const toggleTrack = document.createElement("span");
    toggleTrack.className = "toggle-track";
    toggleLabel.appendChild(toggleInput);
    toggleLabel.appendChild(toggleTrack);

    const title = document.createElement("span");
    title.className = "gm-title";
    title.textContent = "הנחיות הפרויקט";

    const badge = document.createElement("span");
    badge.className = "auto-badge";
    badge.textContent = "נטען אוטומטית";
    if (!on) badge.style.display = "none";

    header.appendChild(selectLabel);
    header.appendChild(toggleLabel);
    header.appendChild(title);
    wrap.appendChild(header);

    if (on) wrap.appendChild(badge);

    card.appendChild(wrap);
  }

  // ============================================================
  // History row builder
  // ============================================================
  function createHistoryRow(
    b,
    {
      kind = "conversation",
      snippet = null,
      role = "user",
      showProjectTag = true,
      openedFromProject = false,
      messageIndex = null,
      searchQuery = "",
    } = {},
  ) {
    const isActive = _deps.state.currentConversationId === b.id;
    const isViewing = _deps.state.currentConversationViewId === b.id;
    const row = document.createElement("div");
    row.className =
      "hi-item" +
      (b.pinned ? " pinned" : "") +
      (kind === "message" ? " search-content" : "") +
      (isActive ? " active" : "") +
      (isViewing ? " viewing" : "");

    const head = document.createElement("div");
    head.className = "hi-head";

    if (isActive) {
      const activeDot = document.createElement("span");
      activeDot.className = "hi-active-dot";
      activeDot.title = "השיחה הפעילה";
      head.appendChild(activeDot);
    }
    if (isViewing) {
      const viewingDot = document.createElement("span");
      viewingDot.className = "hi-viewing-dot";
      viewingDot.title = "בתצוגה";
      head.appendChild(viewingDot);
    }

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

    // Click behavior:
    // - Conversation-kind row: toggle preview (close if already open on this
    //   conversation, otherwise open).
    // - Message-kind row (content-search hit): open preview, set its search
    //   to the same query so highlights appear, and scroll to the matched
    //   message. Re-clicking a different message hit on the same conversation
    //   re-scrolls without closing.
    row.addEventListener("click", () => {
      const isMessageHit = kind === "message" && messageIndex != null;
      if (isMessageHit) {
        if (_deps.state.currentConversationViewId !== b.id) {
          openConversationView(b, { openedFromProject });
        }
        const cvSearch = $el("cvSearch");
        if (cvSearch && searchQuery && cvSearch.value !== searchQuery) {
          cvSearch.value = searchQuery;
          renderConversationMessages(b, searchQuery);
        }
        scrollToMessageIndex(messageIndex);
        return;
      }
      if (_deps.state.currentConversationViewId === b.id) {
        closeConversationView();
      } else {
        openConversationView(b, { openedFromProject });
      }
    });

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

  // ============================================================
  // Project selector — custom dropdown (regular + code projects together), so
  // the sidebar shows one "פרויקטים" concept while leaving vertical room for
  // the open project's inline detail (incl. the code-project file tree)
  // below it. Not a native <select>: that can't render an SVG folder icon
  // for code projects (no markup allowed inside <option>, and the folder
  // emoji has no monochrome fallback glyph), and this way the dropdown
  // matches the panel's own visual language instead of the OS's.
  // ============================================================
  let _projSelectOutsideHandler = null;
  let _projSelectKeyHandler = null;

  function renderProjectSelect() {
    const btn = $el("projectSelectBtn");
    if (!btn) return;

    const projects = getAllProjects();
    const current = getProjectById(_deps.state.currentProjectId);
    const label = $el("projectSelectLabel");
    const icon = $el("projectSelectIcon");

    if (label) {
      label.textContent = current
        ? current.title
        : projects.length ? "— בחר פרויקט —" : "אין פרויקטים עדיין";
    }
    if (icon) icon.style.display = current?.isCodeProject ? "flex" : "none";

    // Keep an already-open dropdown's contents (and active row) in sync —
    // e.g. after renaming/deleting a project elsewhere while it's open.
    if ($el("projectSelectDropdown")?.classList.contains("open")) {
      renderProjectSelectItems(projects, current);
    }
  }

  function renderProjectSelectItems(projects, current) {
    const dd = $el("projectSelectDropdown");
    if (!dd) return;
    dd.innerHTML = "";

    const IC = window.__ccbTpl.IC;

    const clearItem = document.createElement("button");
    clearItem.type = "button";
    clearItem.className = "project-select-item" + (!current ? " active" : "");
    clearItem.setAttribute("role", "option");
    clearItem.setAttribute("aria-selected", String(!current));
    const clearTitle = document.createElement("span");
    clearTitle.className = "project-select-item-title";
    clearTitle.textContent = projects.length ? "ללא פרויקט" : "אין פרויקטים עדיין";
    clearItem.appendChild(clearTitle);
    clearItem.addEventListener("click", () => selectProjectFromDropdown(null));
    dd.appendChild(clearItem);

    for (const project of projects) {
      const item = document.createElement("button");
      item.type = "button";
      const isActive = current?.id === project.id;
      item.className = "project-select-item" + (isActive ? " active" : "");
      item.setAttribute("role", "option");
      item.setAttribute("aria-selected", String(isActive));
      if (project.isCodeProject) {
        const itemIcon = document.createElement("span");
        itemIcon.className = "project-select-item-icon";
        itemIcon.innerHTML = IC.folder;
        item.appendChild(itemIcon);
      }
      const itemTitle = document.createElement("span");
      itemTitle.className = "project-select-item-title";
      itemTitle.textContent = project.title;
      item.appendChild(itemTitle);
      item.addEventListener("click", () => selectProjectFromDropdown(project.id));
      dd.appendChild(item);
    }
  }

  function openProjectSelectDropdown() {
    const dd = $el("projectSelectDropdown");
    const btn = $el("projectSelectBtn");
    if (!dd || !btn) return;
    renderProjectSelectItems(getAllProjects(), getProjectById(_deps.state.currentProjectId));
    dd.classList.add("open");
    dd.setAttribute("aria-hidden", "false");
    btn.setAttribute("aria-expanded", "true");

    _projSelectOutsideHandler = (e) => {
      if (!dd.contains(e.target) && e.target !== btn && !btn.contains(e.target)) {
        closeProjectSelectDropdown();
      }
    };
    document.addEventListener("click", _projSelectOutsideHandler, { capture: true });
    _projSelectKeyHandler = (e) => {
      if (e.key === "Escape") closeProjectSelectDropdown();
    };
    document.addEventListener("keydown", _projSelectKeyHandler);
  }

  function closeProjectSelectDropdown() {
    const dd = $el("projectSelectDropdown");
    const btn = $el("projectSelectBtn");
    if (dd) {
      dd.classList.remove("open");
      dd.setAttribute("aria-hidden", "true");
    }
    if (btn) btn.setAttribute("aria-expanded", "false");
    if (_projSelectOutsideHandler) {
      document.removeEventListener("click", _projSelectOutsideHandler, { capture: true });
      _projSelectOutsideHandler = null;
    }
    if (_projSelectKeyHandler) {
      document.removeEventListener("keydown", _projSelectKeyHandler);
      _projSelectKeyHandler = null;
    }
  }

  function toggleProjectSelectDropdown() {
    const dd = $el("projectSelectDropdown");
    if (!dd) return;
    if (dd.classList.contains("open")) closeProjectSelectDropdown();
    else openProjectSelectDropdown();
  }

  async function selectProjectFromDropdown(id) {
    closeProjectSelectDropdown();
    await setActiveProjectId(id);
    _deps.render();
  }

  // Opens the OS folder picker, bookmarks the handle, and runs an initial scan.
  // Timing/operation logs only — never folder/file names or content, so what's
  // in a private project can't leak via the console.
  async function createCodeProjectBookmark() {
    const startedAt = Date.now();
    if (!window.showDirectoryPicker) {
      _deps.setStatus("הדפדפן לא תומך בבחירת תיקיות", true);
      return;
    }
    let dirHandle;
    const pickerStartedAt = Date.now();
    try {
      dirHandle = await window.showDirectoryPicker();
    } catch (e) {
      return; // user cancelled the picker
    }
    const pickerMs = Date.now() - pickerStartedAt;

    await _deps.loadBlocks();
    const id = "codeproj_" + Date.now();
    const putStartedAt = Date.now();
    await window.__ccbFsHandles.put(id, dirHandle);
    const putMs = Date.now() - putStartedAt;

    _deps.state.blocks[id] = {
      id,
      kind: "project",
      isCodeProject: true,
      title: dirHandle.name,
      dirHandleId: id,
      lastScanned: null,
      content: "",
      documents: [],
      ignorePatterns: [],
      updated: Date.now(),
    };
    const saveStartedAt = Date.now();
    await _deps.saveBlocks();
    const saveMs = Date.now() - saveStartedAt;
    await setActiveProjectId(id);
    _deps.render();

    _deps.setStatus("סורק פרויקט...");
    try {
      const { included, counts } = await _deps.docHandler.scanCodeProject(dirHandle, {
        ..._deps.getScanSettings(),
        ignorePatterns: _deps.state.blocks[id].ignorePatterns,
        onProgress: _deps.setProgress,
      });
      // Built while `included` still holds full file content in memory — the
      // graph itself is just path strings, so it stays cheap to persist.
      _deps.setProgress({ phase: "graph", done: included.length, total: included.length });
      const graphStartedAt = Date.now();
      _deps.state.blocks[id].depGraph = await window.__ccbDepGraph.buildGraph(included);
      const graphMs = Date.now() - graphStartedAt;
      await _deps.docHandler.syncCodeProjectDocuments(
        _deps.state.blocks[id], included, dirHandle.name, _deps.setProgress,
      );
      _deps.setProgress({ label: `נסרקו ${counts.included} קבצים`, done: counts.included, total: counts.included, state: "done" });
      _deps.clearProgress(2500);
      _deps.setStatus(`נסרקו ${counts.included} קבצים ✓`);
      console.log("[ccb-timing] createCodeProjectBookmark", {
        filesIncluded: counts.included,
        pickerMs, putMs, saveMs, graphMs,
        totalMs: Date.now() - startedAt,
      });
    } catch (e) {
      console.error("[history-view] Failed to scan code project", e);
      _deps.setProgress({ label: "שגיאה בסריקת הפרויקט", state: "error" });
      _deps.clearProgress(4000);
      _deps.setStatus("שגיאה בסריקת הפרויקט", true);
    }
    _deps.render();
  }

  // Re-verifies (or re-requests) folder permission, then rescans and re-syncs
  // project.documents — preserving `enabled` on files that already existed.
  // Timing/operation logs only — never folder/file names or content.
  async function rescanCodeProject(projectId) {
    const startedAt = Date.now();
    const project = getProjectById(projectId);
    if (!project || !project.isCodeProject) return;
    await _deps.loadBlocks();
    const proj = _deps.state.blocks[projectId];
    if (!proj) return;

    const permStartedAt = Date.now();
    let dirHandle = await window.__ccbFsHandles.get(proj.dirHandleId);
    let ok = dirHandle && (await window.__ccbFsHandles.verifyPermission(dirHandle, "read"));
    const permMs = Date.now() - permStartedAt;

    if (!ok) {
      const proceed = await _deps.modals.showConfirm({
        title: "נדרשת בחירת תיקייה מחדש",
        msg: "לא ניתן היה לאמת הרשאה לתיקייה השמורה. יש לבחור אותה מחדש.",
        confirmLabel: "בחר תיקייה",
      });
      if (!proceed) return;
      if (!window.showDirectoryPicker) {
        _deps.setStatus("הדפדפן לא תומך בבחירת תיקיות", true);
        return;
      }
      try {
        dirHandle = await window.showDirectoryPicker();
      } catch (e) {
        return;
      }
      await window.__ccbFsHandles.put(proj.dirHandleId, dirHandle);
    }

    _deps.setStatus("סורק פרויקט...");
    try {
      const { included, counts } = await _deps.docHandler.scanCodeProject(dirHandle, {
        ..._deps.getScanSettings(),
        ignorePatterns: proj.ignorePatterns,
        onProgress: _deps.setProgress,
      });
      _deps.setProgress({ phase: "graph", done: included.length, total: included.length });
      const graphStartedAt = Date.now();
      proj.depGraph = await window.__ccbDepGraph.buildGraph(included);
      const graphMs = Date.now() - graphStartedAt;
      await _deps.docHandler.syncCodeProjectDocuments(proj, included, dirHandle.name, _deps.setProgress);
      // Do NOT touch proj.title here — it's already set (folder name as the
      // default at creation, or whatever the user renamed it to via
      // renameProject). Rescanning is about files/structure, not the
      // project's display name; overwriting it here used to silently revert
      // a user's rename back to the folder name on every rescan.
      const saveStartedAt = Date.now();
      await _deps.saveBlocks();
      const saveMs = Date.now() - saveStartedAt;
      _deps.setProgress({ label: `נסרקו ${counts.included} קבצים`, done: counts.included, total: counts.included, state: "done" });
      _deps.clearProgress(2500);
      _deps.setStatus(`נסרקו ${counts.included} קבצים ✓`);
      console.log("[ccb-timing] rescanCodeProject", {
        filesIncluded: counts.included,
        permMs, graphMs, saveMs,
        totalMs: Date.now() - startedAt,
      });
    } catch (e) {
      console.error("[history-view] Failed to rescan code project", e);
      _deps.setProgress({ label: "שגיאה בסריקה מחדש", state: "error" });
      _deps.clearProgress(4000);
      _deps.setStatus("שגיאה בסריקה מחדש", true);
      return;
    }
    _deps.render();
  }

  // Bulk-sets the given code files' (by relativePath) enabled state in one
  // go — a single mutate + saveBlocks, not a toggleDocument() call per file.
  // Looping per-file saves is what caused the "injection is very slow" bug:
  // every save re-serializes the whole `blocks` object, so doing it N times
  // for a multi-file selection is wasteful (and used to be worse still, back
  // when file content itself lived inline in `blocks`). `enabled` defaults to
  // true for the dependency-graph call sites (which only ever add files);
  // code-tree.js's folder checkbox passes it explicitly both ways.
  // Returns how many docs actually matched (and had their state set). Callers
  // that report "N files marked" must use this, not the requested paths'
  // count — a stale dep graph can hold paths that no longer exist as
  // documents (renamed/deleted since the last scan), and those are silently
  // skipped here.
  async function enableFilesForProject(projectId, relativePaths, enabled = true) {
    const project = getProjectById(projectId);
    if (!project) return 0;
    const wanted = new Set(relativePaths);
    let matched = 0;
    for (const doc of project.documents || []) {
      if (doc.type === "code" && wanted.has(doc.name)) {
        doc.enabled = enabled;
        matched++;
      }
    }
    project.updated = Date.now();
    await _deps.saveBlocks();
    _deps.render();
    return matched;
  }

  // Same bulk-save principle for "select all" / "clear all" in the file tree.
  async function setAllCodeDocsEnabled(projectId, enabled) {
    const project = getProjectById(projectId);
    if (!project) return;
    for (const doc of project.documents || []) {
      if (doc.type === "code") doc.enabled = enabled;
    }
    project.updated = Date.now();
    await _deps.saveBlocks();
    _deps.render();
  }

  // ============================================================
  // Project rename / delete — direct actions (no dropdown/menu). Rename
  // works identically for regular and code projects; delete branches since
  // a code project also needs to release its directory-handle bookmark and
  // scanned file content. "Load all"/"refresh" used to live in a 3-dot menu
  // here too, but they're redundant now: refresh has its own dedicated
  // #codeProjectRefreshBtn in the documents header, and "load all" overlaps
  // with the per-folder select-all checkbox + footer "טען קבצים" button.
  // ============================================================
  async function renameProject(project) {
    const nextTitle = await _deps.modals.showPrompt({
      title: "שנה שם הפרויקט",
      defaultValue: project.title,
    });
    if (nextTitle === null || !nextTitle.trim()) return;
    await _deps.loadBlocks();
    _deps.state.blocks[project.id].title = nextTitle.trim();
    _deps.state.blocks[project.id].updated = Date.now();
    await _deps.saveBlocks();
    _deps.render();
  }

  // Shared by both delete flows: unlink the project from its conversations
  // (kept, just no longer tagged) and delete its own text blocks (their
  // lifecycle is tied to the project, unlike conversations).
  function unlinkProjectChildren(projectId) {
    for (const b of Object.values(_deps.state.blocks)) {
      if (b.projectId !== projectId) continue;
      if (b.kind === "conversation") {
        delete b.projectId;
      } else if (!b.kind) {
        _deps.state.selected?.delete(b.id);
        delete _deps.state.blocks[b.id];
      }
    }
  }

  async function deleteRegularProject(project) {
    const ok = await _deps.modals.showConfirm({
      title: "מחיקת פרויקט",
      msg: 'למחוק את "' + project.title + '"? הבלוקים של הפרויקט יימחקו; השיחות לא יימחקו, רק השיוך.',
      confirmLabel: "מחק",
      danger: true,
    });
    if (!ok) return;
    await _deps.loadBlocks();
    delete _deps.state.blocks[project.id];
    unlinkProjectChildren(project.id);
    if (_deps.state.currentProjectId === project.id) await setActiveProjectId(null);
    await _deps.saveBlocks();
    _deps.render();
  }

  async function deleteCodeProject(project) {
    const ok = await _deps.modals.showConfirm({
      title: "מחיקת פרויקט",
      msg: `למחוק את הפרויקט "${project.title}"? הקבצים בדיסק לא יימחקו, רק הקישור אליהם בתוסף.`,
      confirmLabel: "מחק",
      danger: true,
    });
    if (!ok) return;
    await _deps.loadBlocks();
    const removedProject = _deps.state.blocks[project.id];
    const dirHandleId = removedProject?.dirHandleId;
    const codeDocIds = (removedProject?.documents || [])
      .filter((d) => d.type === "code")
      .map((d) => d.id);
    delete _deps.state.blocks[project.id];
    unlinkProjectChildren(project.id);
    if (_deps.state.currentProjectId === project.id) await setActiveProjectId(null);
    await _deps.saveBlocks();
    if (dirHandleId) {
      try { await window.__ccbFsHandles.remove(dirHandleId); } catch { /* already gone */ }
    }
    await Promise.all(
      codeDocIds.map((id) => _deps.docHandler.removeCodeContent(id).catch(() => {})),
    );
    _deps.render();
  }

  function deleteProject(project) {
    return project.isCodeProject ? deleteCodeProject(project) : deleteRegularProject(project);
  }

  // ============================================================
  // Project management dropdown (rename / delete) — behind #projectEditBtn,
  // the leftmost button in #globalProjectBar. One menu for both regular and
  // code projects; rename/delete are the same shared actions above.
  // ============================================================
  function openProjectDropdown(project, menuBtn) {
    closeHiDropdown();
    const dd = $el("hiDropdown");
    const IC = window.__ccbTpl.IC;

    const renameItem = document.createElement("div");
    renameItem.className = "hd-item";
    renameItem.innerHTML = `${IC.pencil} שנה שם`;
    renameItem.addEventListener("click", () => {
      closeHiDropdown();
      renameProject(project);
    });

    const sep = document.createElement("div");
    sep.className = "hd-sep";

    const delItem = document.createElement("div");
    delItem.className = "hd-item danger";
    delItem.innerHTML = `${IC.trash} מחק`;
    delItem.addEventListener("click", () => {
      closeHiDropdown();
      deleteProject(project);
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
    document.addEventListener("click", onOutside, { capture: true, once: false });
    _deps.state.hiDropdownCleanup = () =>
      document.removeEventListener("click", onOutside, { capture: true });
  }

  // ============================================================
  // Project context — instructions card + documents section for whichever
  // project is currently active (global selection). Both are hidden when no
  // project is selected; there's no separate "view" to open/close anymore —
  // the selector's value directly drives what's rendered here.
  // ============================================================
  function renderProjectContext() {
    const project = getProjectById(_deps.state.currentProjectId);

    const editBtn = $el("projectEditBtn");
    if (editBtn) editBtn.style.display = project ? "flex" : "none";

    // A project's instructions card can be ticked for injection, so a project
    // id may sit in state.selected. Only the ACTIVE project's card is rendered,
    // so drop any other project's id — otherwise it would silently keep
    // inflating the footer button's count and get injected invisibly.
    for (const id of [..._deps.state.selected]) {
      const b = _deps.state.blocks[id];
      if (b?.kind === "project" && id !== _deps.state.currentProjectId)
        _deps.state.selected.delete(id);
    }

    const instrCard = $el("projectInstructionsCard");
    if (instrCard) instrCard.style.display = project ? "block" : "none";
    if (project) renderProjectInstructionsCard(project);

    const docsCard = $el("projectDocumentsCard");
    if (docsCard) docsCard.style.display = project ? "block" : "none";
    if (project) {
      renderProjectViewDocuments(project);
      wireProjectViewDocumentEvents();
      const addDocBtn = $el("projectAddDocumentBtn");
      if (addDocBtn) addDocBtn.style.display = project.isCodeProject ? "none" : "";
      // Refresh (rescan) lives in the documents header itself now — no more
      // separate info box above it. Only shown for code projects.
      const refreshBtn = $el("codeProjectRefreshBtn");
      if (refreshBtn) {
        refreshBtn.style.display = project.isCodeProject ? "flex" : "none";
        refreshBtn.title = project.lastScanned
          ? `רענן (נסרק לאחרונה: ${formatAge(project.lastScanned)})`
          : "רענן (טרם נסרק)";
        refreshBtn.onclick = () => rescanCodeProject(project.id);
      }
      const ignoreBtn = $el("codeProjectIgnoreBtn");
      if (ignoreBtn) {
        ignoreBtn.style.display = project.isCodeProject ? "flex" : "none";
        const ignoreCount = (project.ignorePatterns || []).length;
        ignoreBtn.title = ignoreCount ? `קבצים/תיקיות להתעלמות (${ignoreCount})` : "קבצים/תיקיות להתעלמות";
        ignoreBtn.onclick = () => openIgnorePatternsDialog(project);
      }
      syncProjectDocumentsSection();
    } else {
      const docsList = $el("projectDocumentsList");
      if (docsList) docsList.innerHTML = "";
    }
  }

  function syncProjectDocumentsSection() {
    const collapsed = !!_deps.state.projectDocumentsCollapsed;
    const list = $el("projectDocumentsList");
    const btn = $el("projectDocumentsToggle");
    if (list) list.classList.toggle("collapsed", collapsed);
    if (btn) {
      btn.classList.toggle("collapsed", collapsed);
      btn.title = collapsed ? "פתח קבצים" : "סגור קבצים";
      btn.setAttribute("aria-label", collapsed ? "פתח קבצים" : "סגור קבצים");
    }
  }

  async function addProject() {
    await _deps.loadBlocks();
    const title = await _deps.modals.showPrompt({
      title: "פרויקט חדש",
      defaultValue: "פרויקט חדש",
    });
    if (title === null || !title.trim()) return;
    const id = "proj_" + Date.now();
    _deps.state.blocks[id] = {
      id,
      kind: "project",
      title: title.trim(),
      content: "",
      documents: [],
      updated: Date.now(),
    };
    await _deps.saveBlocks();
    await setActiveProjectId(id);
    _deps.render();
  }

  // ============================================================
  // Conversation preview panel
  // ============================================================
  function openConversationView(b, { openedFromProject = false } = {}) {
    if (!b) return;

    _deps.state.cvOpenedFromProject = !!openedFromProject;

    const messages = buildHistoryMessages(b);
    _deps.state.currentConversationViewId = b.id;
    _deps.state.cvSelectedIndices = new Set(messages.map((_, i) => i));
    _deps.state.cvMatchElements = [];
    _deps.state.cvMatchIndex = 0;

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
    // Refresh history list so the "viewing" marker shows on the open row.
    _deps.render?.();
    setTimeout(() => $el("cvSearch")?.focus(), 10);
  }

  function closeConversationView() {
    _deps.state.currentConversationViewId = null;
    _deps.state.cvSelectedIndices = new Set();
    _deps.state.cvMatchElements = [];
    _deps.state.cvMatchIndex = 0;
    const view = $el("conversationView");
    view?.classList.remove("cv-open");
    view?.setAttribute("aria-hidden", "true");
    if ($el("cvSearch")) $el("cvSearch").value = "";
    // Refresh history list so the "viewing" marker clears.
    _deps.render?.();
  }

  function updateNavMatch() {
    const state = _deps.state;
    state.cvMatchElements.forEach((m) => m.classList.remove("cv-match-active"));
    const countEl = $el("cvSearchCount");
    const prevBtn = $el("cvNavPrev");
    const nextBtn = $el("cvNavNext");

    if (!state.cvMatchElements.length) {
      if (countEl) countEl.textContent = "";
      if (prevBtn) prevBtn.disabled = true;
      if (nextBtn) nextBtn.disabled = true;
      return;
    }

    if (state.cvMatchIndex < 0) state.cvMatchIndex = 0;
    if (state.cvMatchIndex >= state.cvMatchElements.length)
      state.cvMatchIndex = state.cvMatchElements.length - 1;

    const active = state.cvMatchElements[state.cvMatchIndex];
    active.classList.add("cv-match-active");
    try {
      active.scrollIntoView({ behavior: "smooth", block: "center" });
    } catch {
      active.scrollIntoView();
    }

    if (countEl)
      countEl.textContent = `${state.cvMatchIndex + 1}/${state.cvMatchElements.length}`;
    if (prevBtn) prevBtn.disabled = false;
    if (nextBtn) nextBtn.disabled = false;
  }

  function updateCvFooter() {
    const n = _deps.state.cvSelectedIndices.size;
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

  // Scroll the conversation preview to a specific message by its index.
  // Used when the user clicks a content-search hit in the History list —
  // the row knows which message inside the conversation it matched.
  function scrollToMessageIndex(index) {
    if (index == null) return;
    const box = $el("cvMessages");
    if (!box) return;
    // Defer one frame so the messages have a chance to render after a
    // freshly-opened conversation view.
    requestAnimationFrame(() => {
      const target = box.querySelector(`[data-msg-index="${index}"]`);
      if (!target) return;
      target.scrollIntoView({ block: "center", behavior: "smooth" });
      target.classList.add("cv-msg-flash");
      setTimeout(() => target.classList.remove("cv-msg-flash"), 1200);
    });
  }

  function renderConversationMessages(b, query) {
    const state = _deps.state;
    const box = $el("cvMessages");
    if (!box) return;
    box.innerHTML = "";

    const messages = buildHistoryMessages(b);
    const q = String(query || "").trim();
    state.cvMatchElements = [];
    state.cvMatchIndex = 0;

    messages.forEach((m, i) => {
      const role = m.role === "user" ? "user" : "ai";
      const msg = document.createElement("div");
      msg.className = `cv-msg cv-msg-${role}`;
      msg.dataset.msgIndex = String(i);

      const selectedNow = state.cvSelectedIndices.has(i);
      msg.classList.toggle("cv-selected", selectedNow);
      msg.classList.toggle("cv-deselected", !selectedNow);

      const roleRow = document.createElement("div");
      roleRow.className = "cv-msg-role";

      const check = document.createElement("span");
      check.className = "cv-msg-check";
      check.innerHTML = `<svg class="cv-msg-check-icon" width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
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
        if (state.cvSelectedIndices.has(i)) state.cvSelectedIndices.delete(i);
        else state.cvSelectedIndices.add(i);
        msg.classList.toggle("cv-selected", state.cvSelectedIndices.has(i));
        msg.classList.toggle("cv-deselected", !state.cvSelectedIndices.has(i));
        updateCvFooter();
      });

      box.appendChild(msg);
    });

    state.cvMatchElements = q ? Array.from(box.querySelectorAll("mark")) : [];

    const prevBtn = $el("cvNavPrev");
    const nextBtn = $el("cvNavNext");
    if (prevBtn) prevBtn.disabled = state.cvMatchElements.length === 0;
    if (nextBtn) nextBtn.disabled = state.cvMatchElements.length === 0;

    updateNavMatch();
    updateCvFooter();
  }

  // ============================================================
  // History-row dropdown (per conversation: pin / rename / assign / delete)
  // ============================================================
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
    if (_deps.state.hiDropdownCleanup) {
      _deps.state.hiDropdownCleanup();
      _deps.state.hiDropdownCleanup = null;
    }
  }

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
      await _deps.loadBlocks();
      _deps.state.blocks[b.id].pinned = !b.pinned;
      await _deps.saveBlocks();
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
      const newName = await _deps.modals.showPrompt({
        title: "שנה שם השיחה",
        defaultValue: b.title,
      });
      if (newName === null || newName.trim() === "") return;
      await _deps.loadBlocks();
      _deps.state.blocks[b.id].title = newName.trim();
      await _deps.saveBlocks();
      renderHistoryList();
    });

    const delItem = document.createElement("div");
    delItem.className = "hd-item danger";
    delItem.innerHTML =
      '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg> מחק';
    delItem.addEventListener("click", async () => {
      closeHiDropdown();
      const ok = await _deps.modals.showConfirm({
        title: "מחיקת שיחה",
        msg: 'למחוק את "' + b.title + '"? לא ניתן לשחזר.',
        confirmLabel: "מחק",
        danger: true,
      });
      if (!ok) return;
      delete _deps.state.blocks[b.id];
      await _deps.saveBlocks();
      renderHistoryList();
    });

    const projectItem = document.createElement("div");
    projectItem.className = "hd-item";
    projectItem.innerHTML =
      '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7h6l2 2h10v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M3 7V5a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v2"/></svg> שייך לפרויקט';
    projectItem.addEventListener("click", async () => {
      closeHiDropdown();
      const pick = await _deps.modals.showProjectPicker({
        title: "שייך לפרויקט",
        currentId: b.projectId || null,
        allowClear: true,
      });
      if (pick === undefined) return;
      await _deps.loadBlocks();
      if (!_deps.state.blocks[b.id]) return;
      if (pick === null) delete _deps.state.blocks[b.id].projectId;
      else _deps.state.blocks[b.id].projectId = pick;
      _deps.state.blocks[b.id].updated = Date.now();
      await _deps.saveBlocks();
      _deps.render();
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
    document.addEventListener("click", onOutside, { capture: true, once: false });
    _deps.state.hiDropdownCleanup = () =>
      document.removeEventListener("click", onOutside, { capture: true });
  }

  // ============================================================
  // History list
  // ============================================================
  // Shows/hides the "מציג שיחות של: <project>" row + "הצג את כל השיחות"
  // override — only meaningful once a specific project is active ("no
  // project" doesn't filter history at all, see renderHistoryList).
  function syncHistoryProjectFilterRow() {
    const project = getProjectById(_deps.state.currentProjectId);
    const row = $el("historyProjectFilterRow");
    if (row) row.style.display = project ? "flex" : "none";
    const label = $el("historyProjectFilterLabel");
    if (label && project) label.textContent = `מציג שיחות של: ${project.title}`;
    const cb = $el("historyShowAll");
    if (cb) cb.checked = !!_deps.state.historyShowAll;
  }

  function renderHistoryList() {
    const state = _deps.state;
    if (state.currentProjectId && !getProjectById(state.currentProjectId)) {
      state.currentProjectId = null;
    }
    syncHistoryProjectFilterRow();
    closeHiDropdown();
    const q = ($el("searchHistory")?.value || "").trim().toLowerCase();
    const all = Object.values(state.blocks)
      .filter((b) => b.kind === "conversation")
      .filter(
        (b) =>
          !state.currentProjectId ||
          state.historyShowAll ||
          b.projectId === state.currentProjectId,
      )
      .sort((a, b) => (b.updated || 0) - (a.updated || 0));

    const list = $el("historyList");
    list.innerHTML = "";

    if (!all.length) {
      const div = document.createElement("div");
      div.className = "empty";
      div.textContent = q
        ? "לא נמצא"
        : 'אין סיכומי שיחה שמורים\nלחץ "שמור שיחה" לשמירה';
      list.appendChild(div);
      return;
    }

    const rows = [];
    if (!q) {
      for (const b of all) rows.push({ block: b, kind: "conversation" });
    } else if (state.historySearchMode === "title") {
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
          messageIndex: rowData.messageIndex ?? null,
          searchQuery: q,
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
  // Render orchestrator (history-side of full render)
  // Timing/operation log only — counts, never conversation/file content.
  // This is the step every scan/inject flow ends with (`_deps.render()`),
  // and it previously had zero timing — a slow render here looked
  // identical to "nothing happening" in the console.
  // ============================================================
  function render() {
    const startedAt = Date.now();
    syncCollapsibleSections();
    const t1 = Date.now();
    renderProjectSelect();
    const projectSelectMs = Date.now() - t1;
    const t2 = Date.now();
    renderHistoryList();
    const historyListMs = Date.now() - t2;
    const t3 = Date.now();
    renderProjectContext();
    const projectContextMs = Date.now() - t3;
    console.log("[ccb-timing] history-view.render", {
      totalBlocks: Object.keys(_deps.state.blocks || {}).length,
      conversations: Object.values(_deps.state.blocks || {}).filter((b) => b.kind === "conversation").length,
      projectSelectMs, historyListMs, projectContextMs,
      totalMs: Date.now() - startedAt,
    });
  }

  // ============================================================
  // Document management
  // ============================================================
  function wireProjectViewDocumentEvents() {
    const addBtn = $el("projectAddDocumentBtn");
    if (addBtn) addBtn.onclick = openAddDocumentDialog;

  }

  // Thin wrapper so a throw anywhere in the load can't leave the persistent
  // progress indicator stuck on screen — unlike the old status toast, it has
  // no auto-hide of its own.
  async function injectProjectDocuments() {
    try {
      await runProjectDocumentsInjection();
    } catch (e) {
      console.error("[history-view] injectProjectDocuments failed", e);
      _deps.setProgress({ label: "טעינת הקבצים נכשלה", state: "error" });
      _deps.clearProgress(4000);
      _deps.setStatus("טעינת הקבצים נכשלה", true);
    }
  }

  // Timing/operation logs only — never file names or content.
  async function runProjectDocumentsInjection() {
    const startedAt = Date.now();
    const project = getProjectById(_deps.state.currentProjectId);
    if (!project) return;

    const enabledDocs = (_deps.docHandler?.getEnabledDocuments(project.id) || []);
    if (!enabledDocs.length) {
      _deps.setStatus("אין קבצים מסומנים", true);
      return;
    }

    _deps.setStatus("טוען קבצים...");

    // Resolve display content per doc without mutating the stored block.
    // Code-project files (and legacy blob-only docs) keep their text out of
    // `blocks` entirely, precisely so lookups like this stay a read — writing
    // it back onto doc.content here would re-bloat every future saveBlocks().
    // Code files are fetched in ONE batched storage read rather than a
    // round-trip per file — with a few hundred files selected the per-file
    // version was the slowest part of loading a large project.
    const contents = new Map();
    const codeDocs = enabledDocs.filter((d) => !d.content && d.type === "code");
    const codeContentsStartedAt = Date.now();
    const codeContents = codeDocs.length
      ? await _deps.docHandler.getCodeContents(codeDocs.map((d) => d.id))
      : new Map();
    const codeContentsMs = Date.now() - codeContentsStartedAt;

    let loaded = 0;
    let extractMs = 0;
    for (const doc of enabledDocs) {
      _deps.setProgress({ phase: "load", done: loaded, total: enabledDocs.length, current: doc.name });
      if (doc.content) {
        contents.set(doc.id, doc.content);
      } else if (doc.type === "code") {
        const text = codeContents.get(doc.id);
        if (text) contents.set(doc.id, text);
      } else if (doc.hasBlob) {
        // Blob-backed docs still go one at a time — extraction (DOCX/ODT/RTF
        // parsing) is per-file work, not a batchable lookup.
        const extractStartedAt = Date.now();
        const text = await _deps.docHandler.getOrExtractContent(project.id, doc.id);
        extractMs += Date.now() - extractStartedAt;
        if (text) contents.set(doc.id, text);
      }
      loaded++;
    }

    const textDocs   = enabledDocs.filter(d => contents.has(d.id));
    const binaryDocs = enabledDocs.filter(d => !contents.has(d.id));

    if (!textDocs.length && binaryDocs.length) {
      _deps.clearProgress();
      _deps.setStatus("הקבצים המסומנים אינם ניתנים לקריאה כטקסט", true);
      return;
    }

    const buildStartedAt = Date.now();
    let body = "";
    for (const doc of textDocs) {
      const content = contents.get(doc.id);
      // Code files are never truncated — the whole point of "load with
      // dependencies" is that every file in the closure has to actually be
      // there; a chopped-off file silently loses the exact function it was
      // pulled in for. The auto-generated structure doc (PROJECT_STRUCTURE.md)
      // is exempted for the same reason: a tree cut off mid-listing looks
      // complete but silently isn't, which is worse than the 10-20K tokens it
      // costs on a very large project. Non-code docs (long-form text,
      // extracted office docs) keep the cap so a single huge attachment can't
      // blow the context — its size is the user-editable "מגבלת תווים למסמך"
      // setting (Advanced Options), not a hardcoded number.
      const maxChars = (doc.type === "code" || doc.type === "structure")
        ? Infinity
        : (_deps.getDocMaxChars?.() || 50000);
      const injected = content.length > maxChars
        ? content.slice(0, maxChars) + "\n... [truncated]"
        : content;
      // Token label is computed on what is actually injected (post-truncation),
      // not the stored full-content estimate — the two disagreed whenever a
      // long non-code doc was cut at maxChars.
      body += `\n**${doc.name}** (${_deps.docHandler.estimateTokens(injected)} tokens)\n---\n`;
      body += injected;
      body += "\n";
    }
    if (binaryDocs.length) {
      body += `\n[קבצים ללא תוכן טקסט: ${binaryDocs.map(d => d.name).join(", ")}]\n`;
    }
    const buildMs = Date.now() - buildStartedAt;

    const f = _deps.framing;
    const text = f.docsPre + body + f.docsPost;
    const injectStartedAt = Date.now();
    const r = _deps.inject.injectIntoInput(text, "prepend");
    const injectMs = Date.now() - injectStartedAt;
    console.log("[ccb-timing] runProjectDocumentsInjection", {
      docsEnabled: enabledDocs.length,
      docsLoadedAsText: textDocs.length,
      docsBinary: binaryDocs.length,
      codeContentsMs, extractMs, buildMs, injectMs,
      totalMs: Date.now() - startedAt,
    });
    if (r.ok) {
      // Deliberately not auto-sending — the user reviews/edits the loaded
      // text (possibly adding their own question) and sends it themselves.
      await _deps.docHandler.injectFilesToChat(project.id);
      _deps.setProgress({ label: `${textDocs.length} קבצים נטענו`, done: enabledDocs.length, total: enabledDocs.length, state: "done" });
      _deps.clearProgress(2500);
      // Estimated over the FULL injected text (framing wrapper + headers +
      // separators included) — the per-doc sums alone hid the wrapper cost.
      const totalTokens = _deps.docHandler.estimateTokens(text);
      _deps.setStatus(`קבצים נטענו (~${totalTokens.toLocaleString("he-IL")} tokens) — ניתן לערוך ולשלוח ✓`);
    } else {
      _deps.setProgress({ label: r.error || "טעינת הקבצים נכשלה", state: "error" });
      _deps.clearProgress(4000);
      _deps.setStatus(r.error || "נכשל", true);
    }
  }

  function renderProjectViewDocuments(project) {
    const docsList = $el("projectDocumentsList");
    if (!docsList) return;

    // Code projects render the original folder tree inline (checkboxes +
    // per-file dependency-linking), owned by code-tree.js. Regular projects
    // keep the flat document list below.
    if (project.isCodeProject) {
      docsList.innerHTML = "";
      window.__ccbCodeTree.renderInline(project, docsList);
      return;
    }

    const docs = project.documents || [];
    docsList.innerHTML = "";

    if (!docs.length) {
      const empty = document.createElement("div");
      empty.className = "project-view-label";
      empty.style.color = "var(--text-faint)";
      empty.style.padding = "8px";
      empty.textContent = "אין קבצים";
      docsList.appendChild(empty);
      return;
    }

    docs.forEach((doc) => {
      const item = document.createElement("div");
      item.className = "doc-item";

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.className = "doc-item-checkbox";
      checkbox.checked = doc.enabled;
      checkbox.addEventListener("change", () => {
        _deps.docHandler.toggleDocument(project.id, doc.id, checkbox.checked);
        _deps.render();
      });

      const icon = document.createElement("span");
      icon.className = "doc-item-icon";
      icon.innerHTML = getDocumentIcon(doc.type);

      const info = document.createElement("div");
      info.className = "doc-item-info";

      const name = document.createElement("div");
      name.className = "doc-item-name";
      name.textContent = doc.name;

      const meta = document.createElement("div");
      meta.className = "doc-item-meta";
      meta.textContent = `${doc.estimatedTokens} tokens · ${formatAge(doc.added)}`;

      if (doc.preview) {
        const preview = document.createElement("div");
        preview.className = "doc-item-preview";
        preview.textContent = doc.preview;
        info.appendChild(preview);
      }

      info.insertBefore(meta, info.firstChild);
      info.insertBefore(name, info.firstChild);

      const deleteBtn = document.createElement("span");
      deleteBtn.className = "doc-item-delete";
      deleteBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>';
      deleteBtn.addEventListener("click", async () => {
        const ok = await _deps.modals.showConfirm({
          title: "מחק קובץ",
          msg: `למחוק את "${doc.name}"?`,
          confirmLabel: "מחק",
          danger: true,
        });
        if (!ok) return;
        _deps.docHandler.removeDocument(project.id, doc.id);
        _deps.render();
      });

      item.appendChild(checkbox);
      item.appendChild(icon);
      item.appendChild(info);
      item.appendChild(deleteBtn);
      docsList.appendChild(item);
    });
  }

  function getDocumentIcon(type) {
    const icons = {
      pdf: '<svg width="12" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>',
      word: '<svg width="12" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M12 19v-4M7 19h10"/></svg>',
      spreadsheet: '<svg width="12" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>',
      presentation: '<svg width="12" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="9" x2="15" y2="9"/><line x1="9" y1="15" x2="15" y2="15"/></svg>',
      image: '<svg width="12" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>',
      text: '<svg width="12" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>',
    };
    icons.file = icons.text;
    icons.code = icons.text;
    icons.structure = icons.text;
    return icons[type] || icons.file;
  }

  function openAddDocumentDialog() {
    const project = getProjectById(_deps.state.currentProjectId);
    if (!project) return;

    const overlay = $el("addDocumentOverlay");
    const fileInput = $el("docFileInput");
    const uploadPreview = $el("docUploadPreview");
    const pasteContent = $el("docPasteContent");

    // Reset state
    const tabButtons = overlay.querySelectorAll(".doc-tab");
    const tabContents = overlay.querySelectorAll(".doc-tab-content");
    tabButtons.forEach((b, i) => b.classList.toggle("active", i === 0));
    tabContents.forEach((c, i) => c.classList.toggle("active", i === 0));
    fileInput.value = "";
    pasteContent.value = "";
    $el("docUrlInput").value = "";
    $el("docUrlName").value = "";
    uploadPreview.style.display = "none";
    $el("docPasteTokens").textContent = "";

    overlay.classList.add("show");

    function closeDialog() {
      overlay.classList.remove("show");
      fileInput.value = "";
      pasteContent.value = "";
      $el("docUrlInput").value = "";
      $el("docUrlName").value = "";
      uploadPreview.style.display = "none";
    }

    // Tab switching — clone nodes to remove any stale listeners
    tabButtons.forEach((btn, idx) => {
      const fresh = btn.cloneNode(true);
      btn.replaceWith(fresh);
      fresh.addEventListener("click", () => {
        overlay.querySelectorAll(".doc-tab").forEach((b) => b.classList.remove("active"));
        overlay.querySelectorAll(".doc-tab-content").forEach((c) => c.classList.remove("active"));
        fresh.classList.add("active");
        overlay.querySelectorAll(".doc-tab-content")[idx].classList.add("active");
      });
    });

    // Drop zone — replace to clear stale listeners
    const dropZone = $el("docDropZone");
    const freshZone = dropZone.cloneNode(true);
    dropZone.replaceWith(freshZone);
    const freshInput = $el("docFileInput"); // re-query after clone

    freshZone.addEventListener("click", () => freshInput.click());
    freshZone.addEventListener("dragover", (e) => {
      e.preventDefault();
      freshZone.style.background = "rgba(0,0,0,0.05)";
    });
    freshZone.addEventListener("dragleave", () => { freshZone.style.background = ""; });
    freshZone.addEventListener("drop", (e) => {
      e.preventDefault();
      freshZone.style.background = "";
      if (e.dataTransfer.files.length) {
        freshInput.files = e.dataTransfer.files;
        freshInput.dispatchEvent(new Event("change"));
      }
    });
    freshInput.addEventListener("change", async () => {
      const file = freshInput.files[0];
      if (!file) return;
      let tokens = 0;
      try { tokens = await _deps.docHandler.estimateFileTokens(file); }
      catch (e) { tokens = Math.ceil(file.size / 3.5); }
      $el("docPreviewName").textContent = file.name;
      $el("docPreviewTokens").textContent = `${tokens} tokens`;
      uploadPreview.style.display = "block";
    });

    // Paste token counter
    const freshPaste = pasteContent.cloneNode(true);
    pasteContent.replaceWith(freshPaste);
    freshPaste.addEventListener("input", () => {
      $el("docPasteTokens").textContent = `${_deps.docHandler.estimateTokens(freshPaste.value)} tokens`;
    });

    // Add / Cancel buttons — replace to clear stale listeners
    const addBtn = $el("docAddBtn").cloneNode(true);
    $el("docAddBtn").replaceWith(addBtn);
    const cancelBtn = $el("docCancelBtn").cloneNode(true);
    $el("docCancelBtn").replaceWith(cancelBtn);

    cancelBtn.addEventListener("click", closeDialog);

    addBtn.addEventListener("click", async () => {
      const activeTab = overlay.querySelector(".doc-tab.active")?.dataset.tab;
      try {
        if (activeTab === "upload") {
          const file = freshInput.files[0];
          if (!file) { _deps.setStatus("בחר קובץ", true); return; }
          await _deps.docHandler.addDocument(file, project.id);
        } else if (activeTab === "paste") {
          const content = freshPaste.value.trim();
          if (!content) { _deps.setStatus("הדבק תוכן", true); return; }
          await _deps.docHandler.addDocument({ name: "תוכן מודבק", size: content.length, type: "text/plain" }, project.id, content);
        } else if (activeTab === "url") {
          const url = $el("docUrlInput").value.trim();
          if (!url) { _deps.setStatus("הוסף URL", true); return; }
          let name = $el("docUrlName").value.trim();
          if (!name) {
            try { name = new URL(url).pathname.split("/").filter(Boolean).pop() || url; }
            catch { name = url; }
          }
          await _deps.docHandler.addDocument({ name, size: 0, type: "text/uri-list" }, project.id, url);
        }
        closeDialog();
        _deps.setStatus("קובץ נוסף ✓");
        _deps.render();
      } catch (e) {
        console.error("[history-view] Failed to add document", e);
        _deps.setStatus(e?.message || "שגיאה בהוספת קובץ", true);
      }
    });
  }

  // ============================================================
  // Code project ignore list — file/folder names or globs to exclude from
  // scanCodeProject(), edited via the dialog opened by #codeProjectIgnoreBtn
  // next to the refresh button. Stored on project.ignorePatterns and applied
  // by document-handler.js on every scan/rescan.
  // ============================================================
  function renderIgnorePatternsList(patterns) {
    const list = $el("ignorePatternsList");
    if (!list) return;
    list.innerHTML = "";
    if (!patterns.length) {
      const empty = document.createElement("div");
      empty.className = "ignore-patterns-empty";
      empty.textContent = "אין קבצים או תיקיות בהתעלמות";
      list.appendChild(empty);
      return;
    }
    patterns.forEach((pattern, idx) => {
      const row = document.createElement("div");
      row.className = "ignore-pattern-row";
      const name = document.createElement("span");
      name.className = "ignore-pattern-name";
      name.textContent = pattern;
      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "ignore-pattern-remove";
      removeBtn.innerHTML = window.__ccbTpl.IC.x;
      removeBtn.setAttribute("aria-label", "הסר");
      removeBtn.onclick = () => {
        patterns.splice(idx, 1);
        renderIgnorePatternsList(patterns);
      };
      row.appendChild(name);
      row.appendChild(removeBtn);
      list.appendChild(row);
    });
  }

  function openIgnorePatternsDialog(project) {
    const overlay = $el("ignorePatternsOverlay");
    if (!overlay) return;

    const patterns = [...(project.ignorePatterns || [])];
    renderIgnorePatternsList(patterns);
    overlay.classList.add("show");

    function addFromInput(inputEl) {
      const raw = inputEl.value.trim();
      if (!raw) return;
      raw.split(",").map((s) => s.trim()).filter(Boolean).forEach((p) => {
        if (!patterns.includes(p)) patterns.push(p);
      });
      inputEl.value = "";
      renderIgnorePatternsList(patterns);
      inputEl.focus();
    }

    function closeDialog() {
      overlay.classList.remove("show");
    }

    // Clone every interactive element to strip stale listeners from prior opens.
    const input = $el("ignorePatternInput").cloneNode(true);
    $el("ignorePatternInput").replaceWith(input);
    input.value = "";
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); addFromInput(input); }
    });

    const addBtn = $el("ignorePatternAddBtn").cloneNode(true);
    $el("ignorePatternAddBtn").replaceWith(addBtn);
    addBtn.addEventListener("click", () => addFromInput(input));

    const saveBtn = $el("ignorePatternsSaveBtn").cloneNode(true);
    $el("ignorePatternsSaveBtn").replaceWith(saveBtn);
    saveBtn.addEventListener("click", async () => {
      await _deps.loadBlocks();
      const proj = _deps.state.blocks[project.id];
      if (proj) {
        proj.ignorePatterns = patterns;
        proj.updated = Date.now();
        await _deps.saveBlocks();
      }
      closeDialog();
      _deps.render();
      await rescanCodeProject(project.id);
    });

    const closeBtn = $el("ignorePatternsCloseBtn").cloneNode(true);
    $el("ignorePatternsCloseBtn").replaceWith(closeBtn);
    closeBtn.addEventListener("click", closeDialog);
  }

  // ============================================================
  // Public API
  // ============================================================
  window.__ccbHistoryView = {
    /**
     * @param {{
     *   getShadow: () => ShadowRoot,
     *   state: object,                    // mutable shared state
     *   framing: object,                  // getters for FRAMING_*_PRE/POST
     *   modals: object,                   // window.__ccbModals
     *   loadBlocks: () => Promise<void>,
     *   saveBlocks: () => Promise<void>,
     *   render: () => void,
     *   setStatus: (msg, isError?) => void,
     *   openEdit: (id, prefill?) => void, // shared block-edit form — used by the instructions card's whole-card click
     * }} deps
     */
    init(deps) { _deps = deps; },
    render,
    renderHistoryList,
    renderProjectSelect,
    toggleProjectSelectDropdown,
    closeProjectSelectDropdown,
    renderProjectContext,
    loadActiveProjectId,
    setActiveProjectId,
    openConversationView,
    closeConversationView,
    renderConversationMessages,
    updateNavMatch,
    updateCvFooter,
    openHiDropdown,
    closeHiDropdown,
    openProjectDropdown,
    syncCollapsibleSections,
    syncProjectDocumentsSection,
    getProjects,
    getAllProjects,
    getProjectById,
    getConversationProject,
    buildHistoryMessages,
    buildConversationInjectionText,
    formatTranscript,
    formatAge,
    dateGroup,
    extractSnippet,
    addProject,
    renderProjectViewDocuments,
    openAddDocumentDialog,
    injectProjectDocuments,
    getDocumentIcon,
    getCodeProjects,
    createCodeProjectBookmark,
    rescanCodeProject,
    enableFilesForProject,
    setAllCodeDocsEnabled,
    openIgnorePatternsDialog,
  };
})();
