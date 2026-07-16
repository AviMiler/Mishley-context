// history-view.js — projects, history list, conversation preview panel.
// Exposes: window.__ccbHistoryView
//
// Public API (after init):
//   render()                          — full re-render of project list + history list + project view
//   renderHistoryList()
//   renderProjectList()
//   renderProjectView()
//   openProjectView(id) / closeProjectView()
//   openConversationView(b, opts) / closeConversationView()
//   renderConversationMessages(b, query)
//   updateNavMatch() / updateCvFooter()
//   openHiDropdown(b, menuBtn) / closeHiDropdown()
//   openProjectDropdown(project, menuBtn)
//   syncCollapsibleSections() / syncProjectInstructionsSection()
//   getProjects() / getAllProjects() / getProjectById(id) / getConversationProject(b)
//   buildHistoryMessages(b) / buildConversationInjectionText(messages, block, opts) / buildProjectSectionText(block)
//   formatTranscript(messages) / formatAge(ts) / dateGroup(ts) / extractSnippet(text, q, fromIndex)
//   saveProjectView()
//   addProject()
//   getCodeProjects()
//   createCodeProjectBookmark() / rescanCodeProject(id) / loadCodeProjectAll(id) / openCodeProjectPicker(id)
//   openCodeProjectDropdown(project, menuBtn)
//   enableFilesForProject(projectId, relativePaths) / setAllCodeDocsEnabled(projectId, enabled)

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
  // most-recently-updated first (folder-icon styling distinguishes code
  // projects at render time; see renderProjectList).
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

  function buildProjectSectionText(block) {
    const project = getConversationProject(block);
    if (!project) return "";
    const content = (project.content || "").trim();
    let text = "## " + project.title + "\n" + (content || "") + "\n\n";

    // Inject enabled documents
    const enabledDocs = _deps.docHandler?.getEnabledDocuments(project.id) || [];
    if (enabledDocs.length > 0) {
      text += "<documents>\n";
      for (const doc of enabledDocs) {
        text += `\n**${doc.name}** (${doc.estimatedTokens} tokens)\n`;
        text += "---\n";
        if (doc.content) {
          // Truncate very long documents to avoid bloating context
          const maxChars = 10000;
          const docContent = doc.content.length > maxChars
            ? doc.content.slice(0, maxChars) + "\n... [truncated]"
            : doc.content;
          text += docContent + "\n";
        } else {
          text += `[URL: ${doc.name}]\n`;
        }
        text += "\n";
      }
      text += "</documents>\n\n";
    }

    return text;
  }

  function buildConversationInjectionText(
    messages,
    block,
    { includeProjectInstructions = false } = {},
  ) {
    const INJECTED_PREFIX = "[[CCB:INJECTED]]\n";
    const framing = _deps.framing;
    const transcript = formatTranscript(messages);

    let projectBlock = "";
    if (includeProjectInstructions) {
      const projectSection = buildProjectSectionText(block);
      if (projectSection) {
        projectBlock = (framing.projPre || INJECTED_PREFIX) + projectSection + (framing.projPost || "\n\n");
      }
    }

    const conversationBlock = (framing.convPre || INJECTED_PREFIX) + transcript + (framing.convPost || "\n\n");
    return projectBlock + conversationBlock;
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

  function syncProjectInstructionsSection() {
    const open = _deps.state.projectInstructionsOpen;
    const panel = $el("projectInstructionsPanel");
    const btn = $el("projectInstructionsToggle");
    const editBtn = $el("projectInstructionsEditBtn");
    if (panel) panel.classList.toggle("collapsed", !open);
    if (btn) {
      btn.classList.toggle("collapsed", !open);
      btn.title = open ? "סגור עריכת הנחיות" : "פתח עריכת הנחיות";
      btn.setAttribute("aria-label", open ? "סגור עריכת הנחיות" : "פתח עריכת הנחיות");
      btn.setAttribute("aria-expanded", String(open));
    }
    if (editBtn) {
      editBtn.textContent = open ? "סגור" : "עריכה";
      editBtn.setAttribute("aria-label", open ? "סגור עריכת הנחיות" : "פתח עריכת הנחיות");
    }
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
  // Project list
  // ============================================================
  // Unified list: regular + code projects together, one card style each
  // (folder icon + scan meta for code projects, dot + conversation count
  // for regular ones), so the sidebar shows a single "פרויקטים" concept.
  function renderProjectList() {
    const list = $el("projectList");
    if (!list) return;
    list.innerHTML = "";

    const projects = getAllProjects();
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
      card.className = "project-card" + (project.isCodeProject ? " code-project-card" : "");

      if (project.isCodeProject) {
        const icon = document.createElement("span");
        icon.className = "code-tree-icon";
        icon.innerHTML = window.__ccbTpl.IC.folder;

        const info = document.createElement("div");
        info.className = "code-project-info";
        const name = document.createElement("span");
        name.className = "project-name";
        name.textContent = project.title;
        const meta = document.createElement("span");
        meta.className = "code-project-meta";
        meta.textContent = project.lastScanned
          ? `נסרק לאחרונה: ${formatAge(project.lastScanned)}`
          : "טרם נסרק";
        info.appendChild(name);
        info.appendChild(meta);

        const menuBtn = document.createElement("button");
        menuBtn.type = "button";
        menuBtn.className = "hi-menu-btn";
        menuBtn.innerHTML = window.__ccbTpl.IC.menuDots;
        menuBtn.setAttribute("aria-label", "אפשרויות");
        menuBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          openCodeProjectDropdown(project, menuBtn);
        });

        card.appendChild(icon);
        card.appendChild(info);
        card.appendChild(menuBtn);
      } else {
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
      }

      card.addEventListener("click", () => openProjectView(project.id));
      list.appendChild(card);
    }
  }

  // Opens the OS folder picker, bookmarks the handle, and runs an initial scan.
  async function createCodeProjectBookmark() {
    if (!window.showDirectoryPicker) {
      _deps.setStatus("הדפדפן לא תומך בבחירת תיקיות", true);
      return;
    }
    let dirHandle;
    try {
      dirHandle = await window.showDirectoryPicker();
    } catch (e) {
      return; // user cancelled the picker
    }

    await _deps.loadBlocks();
    const id = "codeproj_" + Date.now();
    await window.__ccbFsHandles.put(id, dirHandle);

    _deps.state.blocks[id] = {
      id,
      kind: "project",
      isCodeProject: true,
      title: dirHandle.name,
      dirHandleId: id,
      lastScanned: null,
      content: "",
      documents: [],
      updated: Date.now(),
    };
    await _deps.saveBlocks();
    _deps.render();

    _deps.setStatus("סורק פרויקט...");
    try {
      const { included, counts } = await _deps.docHandler.scanCodeProject(dirHandle);
      // Built while `included` still holds full file content in memory — the
      // graph itself is just path strings, so it stays cheap to persist.
      _deps.state.blocks[id].depGraph = window.__ccbDepGraph.buildGraph(included);
      await _deps.docHandler.syncCodeProjectDocuments(_deps.state.blocks[id], included, dirHandle.name);
      _deps.setStatus(`נסרקו ${counts.included} קבצים ✓`);
    } catch (e) {
      console.error("[history-view] Failed to scan code project", e);
      _deps.setStatus("שגיאה בסריקת הפרויקט", true);
    }
    _deps.render();
  }

  // Re-verifies (or re-requests) folder permission, then rescans and re-syncs
  // project.documents — preserving `enabled` on files that already existed.
  async function rescanCodeProject(projectId) {
    const project = getProjectById(projectId);
    if (!project || !project.isCodeProject) return;
    await _deps.loadBlocks();
    const proj = _deps.state.blocks[projectId];
    if (!proj) return;

    let dirHandle = await window.__ccbFsHandles.get(proj.dirHandleId);
    let ok = dirHandle && (await window.__ccbFsHandles.verifyPermission(dirHandle, "read"));

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
      const { included, counts } = await _deps.docHandler.scanCodeProject(dirHandle);
      proj.depGraph = window.__ccbDepGraph.buildGraph(included);
      await _deps.docHandler.syncCodeProjectDocuments(proj, included, dirHandle.name);
      proj.title = dirHandle.name;
      await _deps.saveBlocks();
      _deps.setStatus(`נסרקו ${counts.included} קבצים ✓`);
    } catch (e) {
      console.error("[history-view] Failed to rescan code project", e);
      _deps.setStatus("שגיאה בסריקה מחדש", true);
      return;
    }
    _deps.render();
  }

  // Enables every document (structure + all files) and injects them all.
  async function loadCodeProjectAll(projectId) {
    const project = getProjectById(projectId);
    if (!project || !project.isCodeProject) return;
    if (!project.lastScanned) await rescanCodeProject(projectId);
    if (!project.lastScanned) return; // scan failed or was cancelled

    for (const doc of project.documents || []) doc.enabled = true;
    project.updated = Date.now();
    await _deps.saveBlocks();
    _deps.state.docsProjectId = projectId;
    await injectProjectDocuments();
  }

  // Ensures a scan exists, enables the structure doc, and opens the file tree
  // picker so the user can hand-pick which additional files to inject.
  async function openCodeProjectPicker(projectId) {
    const project = getProjectById(projectId);
    if (!project || !project.isCodeProject) return;
    if (!project.lastScanned) await rescanCodeProject(projectId);
    if (!project.lastScanned) return;

    const structureDoc = (project.documents || []).find((d) => d.type === "structure");
    if (structureDoc) structureDoc.enabled = true;
    await _deps.saveBlocks();
    _deps.state.docsProjectId = projectId;
    window.__ccbCodeTree.open(project);
  }

  // Bulk-enables the given code files (by relativePath) in one go — a single
  // mutate + saveBlocks, not a toggleDocument() call per file. Looping
  // per-file saves is what caused the "injection is very slow" bug: every
  // save re-serializes the whole `blocks` object, so doing it N times for a
  // multi-file selection is wasteful (and used to be worse still, back when
  // file content itself lived inline in `blocks`).
  async function enableFilesForProject(projectId, relativePaths) {
    const project = getProjectById(projectId);
    if (!project) return;
    const wanted = new Set(relativePaths);
    for (const doc of project.documents || []) {
      if (doc.type === "code" && wanted.has(doc.name)) doc.enabled = true;
    }
    project.updated = Date.now();
    await _deps.saveBlocks();
    _deps.render();
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
  // Code project dropdown (load all / pick files / refresh / remove)
  // ============================================================
  function openCodeProjectDropdown(project, menuBtn) {
    closeHiDropdown();
    const dd = $el("hiDropdown");
    const IC = window.__ccbTpl.IC;

    const loadAllItem = document.createElement("div");
    loadAllItem.className = "hd-item";
    loadAllItem.innerHTML = `${IC.upload} טען הכל לצ'אט`;
    loadAllItem.addEventListener("click", async () => {
      closeHiDropdown();
      await loadCodeProjectAll(project.id);
    });

    const pickerItem = document.createElement("div");
    pickerItem.className = "hd-item";
    pickerItem.innerHTML = `${IC.folder} טען מבנה וקבצים מסוימים`;
    pickerItem.addEventListener("click", async () => {
      closeHiDropdown();
      await openCodeProjectPicker(project.id);
    });

    const sep = document.createElement("div");
    sep.className = "hd-sep";

    const refreshItem = document.createElement("div");
    refreshItem.className = "hd-item";
    refreshItem.innerHTML = `${IC.refresh} רענן`;
    refreshItem.addEventListener("click", async () => {
      closeHiDropdown();
      await rescanCodeProject(project.id);
    });

    const delItem = document.createElement("div");
    delItem.className = "hd-item danger";
    delItem.innerHTML = `${IC.trash} הסר סימניה`;
    delItem.addEventListener("click", async () => {
      closeHiDropdown();
      const ok = await _deps.modals.showConfirm({
        title: "הסרת סימניה",
        msg: `להסיר את הסימניה "${project.title}"? הקבצים בדיסק לא יימחקו.`,
        confirmLabel: "הסר",
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
      for (const b of Object.values(_deps.state.blocks)) {
        if (!b.kind && b.projectId === project.id) delete b.projectId;
      }
      if (_deps.state.currentProjectId === project.id) _deps.state.currentProjectId = null;
      await _deps.saveBlocks();
      if (dirHandleId) {
        try { await window.__ccbFsHandles.remove(dirHandleId); } catch { /* already gone */ }
      }
      await Promise.all(
        codeDocIds.map((id) => _deps.docHandler.removeCodeContent(id).catch(() => {})),
      );
      _deps.render();
    });

    dd.innerHTML = "";
    dd.appendChild(loadAllItem);
    dd.appendChild(pickerItem);
    dd.appendChild(sep);
    dd.appendChild(refreshItem);
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
  // Project view
  // ============================================================
  // Toggles between the unified project list and the open project's detail
  // view, both inside the Context tab's "פרויקטים" sub-view. The History tab
  // no longer hosts any project UI, so it needs no layout changes here.
  function syncCtxProjectsLayout() {
    const inProject = !!getProjectById(_deps.state.currentProjectId);
    const listWrap = $el("ctxProjectListWrap");
    const view = $el("projectView");
    if (listWrap) listWrap.style.display = inProject ? "none" : "";
    if (view) view.style.display = inProject ? "flex" : "none";
  }

  function renderProjectViewConversations(project) {
    const list = $el("projectViewConversations");
    if (!list) return;
    list.innerHTML = "";

    const items = Object.values(_deps.state.blocks)
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
      list.appendChild(
        createHistoryRow(b, { showProjectTag: false, openedFromProject: true }),
      );
    }
  }

  function renderProjectView() {
    const project = getProjectById(_deps.state.currentProjectId);
    syncCtxProjectsLayout();

    const view = $el("projectView");
    if (!view) return;
    if (!project) {
      _deps.state.currentProjectId = null;
      syncCtxProjectsLayout();
      return;
    }

    $el("projectViewTitle").textContent = project.title;
    if ($el("projectInstructionsPreview")) {
      $el("projectInstructionsPreview").textContent =
        (project.content || "").trim() || "אין עדיין הנחיות לפרויקט הזה";
    }
    $el("projectViewInstructions").value = project.content || "";
    renderProjectViewConversations(project);
    renderProjectViewDocuments(project);
    syncProjectInstructionsSection();
    wireProjectViewDocumentEvents();

    const addDocBtn = $el("projectAddDocumentBtn");
    if (addDocBtn) addDocBtn.style.display = project.isCodeProject ? "none" : "";

    const infoRow = $el("codeProjectInfoRow");
    if (infoRow) {
      if (project.isCodeProject) {
        infoRow.style.display = "flex";
        const text = $el("codeProjectInfoText");
        if (text) {
          text.textContent = project.lastScanned
            ? `${project.title} · נסרק לאחרונה: ${formatAge(project.lastScanned)}`
            : `${project.title} · טרם נסרק`;
        }
        const refreshBtn = $el("codeProjectInfoRefreshBtn");
        if (refreshBtn) refreshBtn.onclick = () => rescanCodeProject(project.id);
      } else {
        infoRow.style.display = "none";
      }
    }
  }

  function openProjectView(projectId) {
    const project = getProjectById(projectId);
    if (!project) return;
    closeConversationView();
    _deps.state.currentProjectId = project.id;
    _deps.state.projectInstructionsOpen = false;
    _deps.render();
  }

  function closeProjectView() {
    if (!_deps.state.currentProjectId) return;
    _deps.state.currentProjectId = null;
    _deps.state.projectInstructionsOpen = false;
    _deps.render();
  }

  async function saveProjectView() {
    const project = getProjectById(_deps.state.currentProjectId);
    if (!project) return;
    await _deps.loadBlocks();
    const nextContent = ($el("projectViewInstructions")?.value || "").trim();
    _deps.state.blocks[project.id].content = nextContent;
    _deps.state.blocks[project.id].updated = Date.now();
    await _deps.saveBlocks();
    _deps.render();
    _deps.setStatus("הפרויקט נשמר ✓");
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
    _deps.state.currentProjectId = id;
    _deps.render();
  }

  // ============================================================
  // Conversation preview panel
  // ============================================================
  function openConversationView(b, { openedFromProject = false } = {}) {
    if (!b) return;
    closeProjectView();

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

    const projectBar = $el("cvProjectBar");
    const projectCheckbox = $el("cvIncludeProject");
    if (project) {
      if (projectBar) projectBar.style.display = "";
      // If the conversation is assigned to a project, default the checkbox
      // to ON regardless of how the view was opened (history list, search,
      // or project view). If the user is continuing a conversation that
      // belongs to a project, they almost always want the project's
      // instructions in the injection. They can untick to opt out.
      if (projectCheckbox) projectCheckbox.checked = true;
    } else {
      if (projectBar) projectBar.style.display = "none";
      if (projectCheckbox) projectCheckbox.checked = false;
    }

    // If this conversation is already the active one, swap the "המשך שיחה"
    // button with a non-clickable label. The button stays as the same DOM
    // node so its click handler remains wired — we just toggle a class and
    // its text content, and the CSS removes pointer-events.
    const continueBtn = $el("cvContinueBtn");
    if (continueBtn) {
      const isActive = _deps.state.currentConversationId === b.id;
      continueBtn.classList.toggle("is-active-label", isActive);
      continueBtn.textContent = isActive ? "השיחה פעילה" : "המשך שיחה";
      continueBtn.setAttribute("aria-disabled", isActive ? "true" : "false");
    }

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
  // Project dropdown (rename / delete)
  // ============================================================
  function openProjectDropdown(project, menuBtn) {
    closeHiDropdown();
    const dd = $el("hiDropdown");

    const renameItem = document.createElement("div");
    renameItem.className = "hd-item";
    renameItem.innerHTML =
      '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg> שנה שם';
    renameItem.addEventListener("click", async () => {
      closeHiDropdown();
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
    });

    const sep = document.createElement("div");
    sep.className = "hd-sep";

    const delItem = document.createElement("div");
    delItem.className = "hd-item danger";
    delItem.innerHTML =
      '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg> מחק';
    delItem.addEventListener("click", async () => {
      closeHiDropdown();
      const ok = await _deps.modals.showConfirm({
        title: "מחיקת פרויקט",
        msg: 'למחוק את "' + project.title + '"? הבלוקים של הפרויקט יימחקו; השיחות לא יימחקו, רק השיוך.',
        confirmLabel: "מחק",
        danger: true,
      });
      if (!ok) return;
      await _deps.loadBlocks();
      delete _deps.state.blocks[project.id];
      for (const b of Object.values(_deps.state.blocks)) {
        if (b.projectId !== project.id) continue;
        if (b.kind === "conversation") {
          delete b.projectId;
        } else if (!b.kind) {
          // Project's own text blocks — same lifecycle as the project itself.
          _deps.state.selected?.delete(b.id);
          delete _deps.state.blocks[b.id];
        }
      }
      if (_deps.state.currentProjectId === project.id) _deps.state.currentProjectId = null;
      await _deps.saveBlocks();
      _deps.render();
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
  // History list
  // ============================================================
  function renderHistoryList() {
    const state = _deps.state;
    if (state.currentProjectId && !getProjectById(state.currentProjectId)) {
      state.currentProjectId = null;
    }
    closeHiDropdown();
    const q = ($el("searchHistory")?.value || "").trim().toLowerCase();
    const all = Object.values(state.blocks)
      .filter((b) => b.kind === "conversation")
      .filter((b) => !state.currentProjectId || b.projectId === state.currentProjectId)
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
  // ============================================================
  function render() {
    syncCollapsibleSections();
    renderProjectList();
    renderHistoryList();
    renderProjectView();
  }

  // ============================================================
  // Document management
  // ============================================================
  function wireProjectViewDocumentEvents() {
    const addBtn = $el("projectAddDocumentBtn");
    if (addBtn) addBtn.onclick = openAddDocumentDialog;

  }

  async function injectProjectDocuments() {
    const pid = _deps.state.docsProjectId || _deps.state.currentProjectId;
    const project = getProjectById(pid);
    if (!project) return;

    const enabledDocs = (_deps.docHandler?.getEnabledDocuments(project.id) || []);
    if (!enabledDocs.length) {
      _deps.setStatus("אין מסמכים מסומנים", true);
      return;
    }

    _deps.setStatus("טוען מסמכים...");

    // Resolve display content per doc without mutating the stored block.
    // Code-project files (and legacy blob-only docs) keep their text out of
    // `blocks` entirely, precisely so lookups like this stay a read — writing
    // it back onto doc.content here would re-bloat every future saveBlocks().
    const contents = new Map();
    for (const doc of enabledDocs) {
      if (doc.content) {
        contents.set(doc.id, doc.content);
      } else if (doc.type === "code" || doc.hasBlob) {
        const text = await _deps.docHandler.getOrExtractContent(project.id, doc.id);
        if (text) contents.set(doc.id, text);
      }
    }

    const textDocs   = enabledDocs.filter(d => contents.has(d.id));
    const binaryDocs = enabledDocs.filter(d => !contents.has(d.id));

    if (!textDocs.length && binaryDocs.length) {
      _deps.setStatus("הקבצים המסומנים אינם ניתנים לקריאה כטקסט", true);
      return;
    }

    let body = "<documents>\n";
    for (const doc of textDocs) {
      const content = contents.get(doc.id);
      // Code files are never truncated — the whole point of "load with
      // dependencies" is that every file in the closure has to actually be
      // there; a chopped-off file silently loses the exact function it was
      // pulled in for. Non-code docs (long-form text, extracted office docs)
      // keep the cap so a single huge attachment can't blow the context.
      const maxChars = doc.type === "code" ? Infinity : 10000;
      body += `\n**${doc.name}** (${doc.estimatedTokens} tokens)\n---\n`;
      body += content.length > maxChars
        ? content.slice(0, maxChars) + "\n... [truncated]"
        : content;
      body += "\n";
    }
    if (binaryDocs.length) {
      body += `\n[קבצים ללא תוכן טקסט: ${binaryDocs.map(d => d.name).join(", ")}]\n`;
    }
    body += "</documents>";

    const f = _deps.framing;
    const text = f.manualPre + body + "\n\n---\n\n" + f.manualPost;
    const r = _deps.inject.injectIntoInput(text, "prepend");
    if (r.ok) {
      _deps.setStatus("מסמכים הוזרקו ✓");
      setTimeout(() => document.querySelector(_deps.sendButtonSel)?.click(), 100);
    } else {
      _deps.setStatus(r.error || "נכשל", true);
    }
  }

  function renderProjectViewDocuments(project) {
    const docsList = $el("projectDocumentsList");
    if (!docsList) return;

    const docs = project.documents || [];
    docsList.innerHTML = "";

    if (!docs.length) {
      const empty = document.createElement("div");
      empty.className = "project-view-label";
      empty.style.color = "var(--text-faint)";
      empty.style.padding = "8px";
      empty.textContent = "אין מסמכים";
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
          title: "מחק מסמך",
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
        _deps.setStatus("מסמך הוסף ✓");
        _deps.render();
      } catch (e) {
        console.error("[history-view] Failed to add document", e);
        _deps.setStatus(e?.message || "שגיאה בהוספת מסמך", true);
      }
    });
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
     * }} deps
     */
    init(deps) { _deps = deps; },
    render,
    renderHistoryList,
    renderProjectList,
    renderProjectView,
    openProjectView,
    closeProjectView,
    openConversationView,
    closeConversationView,
    renderConversationMessages,
    updateNavMatch,
    updateCvFooter,
    openHiDropdown,
    closeHiDropdown,
    openProjectDropdown,
    syncCollapsibleSections,
    syncProjectInstructionsSection,
    getProjects,
    getAllProjects,
    getProjectById,
    getConversationProject,
    buildHistoryMessages,
    buildConversationInjectionText,
    buildProjectSectionText,
    formatTranscript,
    formatAge,
    dateGroup,
    extractSnippet,
    saveProjectView,
    addProject,
    renderProjectViewDocuments,
    openAddDocumentDialog,
    injectProjectDocuments,
    getDocumentIcon,
    getCodeProjects,
    createCodeProjectBookmark,
    rescanCodeProject,
    loadCodeProjectAll,
    openCodeProjectPicker,
    openCodeProjectDropdown,
    enableFilesForProject,
    setAllCodeDocsEnabled,
  };
})();
