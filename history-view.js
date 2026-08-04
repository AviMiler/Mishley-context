// history-view.js — active project (global selection) + project documents.
// Exposes: window.__ccbHistoryView
//
// Named for the History tab it was originally built around; that feature was
// retired 2026-08-04 and this module is now purely the project world. The
// filename is kept rather than renamed so the manifest's load order, every
// cross-module `_deps.historyView` reference, and the git history of a
// 2000-line file all stay intact.
//
// Public API (after init):
//   render()                          — full re-render of project selector + project context
//   renderProjectSelect()              — custom dropdown trigger label/icon (not a native <select>)
//   toggleProjectSelectDropdown() / closeProjectSelectDropdown()
//   renderProjectContext()            — instructions card + documents section for the active project
//   loadActiveProjectId() / setActiveProjectId(id) — persisted (chrome.storage) global project selection
//   positionHiDropdown(dd, anchorRect) / closeHiDropdown() — shared floating-menu host
//   openProjectDropdown(project, menuBtn) — rename / delete
//   syncProjectDocumentsSection()
//   getProjects() / getAllProjects() / getProjectById(id)
//   formatAge(ts)
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

  // ============================================================
  // Date utilities
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

  // Renders the project-instructions card exactly like chat-features.js#renderGeneralMemory:
  // a select-for-inject checkbox + autoLoad toggle + title + (when on) an
  // "auto-badge" all sharing one header row, and the WHOLE card clickable
  // to open the shared block-edit form (openEdit) — no dedicated edit
  // button, no inline accordion/textarea, and (since 2026-07-19) no
  // separate "load instructions" button in the section header: ticking the
  // checkbox and pressing the footer "טען פרומפטים" is the manual-load
  // path, same as for GM.
  function renderProjectInstructionsCard(project) {
    const card = $el("projectInstructionsCard");
    if (!card) return;
    const on = project.autoLoad !== false; // missing autoLoad defaults to ON
    const everyMode = _deps.getAutoInjectMode?.("project") === "every";
    // Manual injection ("טען פרומפטים") is redundant once every-mode is
    // already prepending the project's instructions to every send — and
    // combined with it, would duplicate that content in the next message
    // (the trade-off accepted when the every-mode send guard was fixed, see
    // DECISIONS.md). Drop any stale selection made before the mode switched
    // to "every", so it can't linger and get included next time
    // injectSelected() runs.
    if (everyMode) _deps.state.selected.delete(project.id);
    const selectedForInject = _deps.state.selected.has(project.id);

    card.innerHTML = "";
    const wrap = document.createElement("div");
    wrap.className = "gm-card";
    wrap.addEventListener("click", () => _deps.openEdit(project.id));

    const header = document.createElement("div");
    header.className = "gm-header";

    const selectLabel = document.createElement("label");
    selectLabel.className = "cb-wrap gm-select";
    selectLabel.title = everyMode
      ? "במצב 'נטען בכל הודעה' אין צורך בטעינה ידנית — התוכן מוזרק אוטומטית לכל הודעה"
      : "סמן כדי לטעון את ההנחיות עם 'טען פרומפטים'";
    selectLabel.addEventListener("click", (e) => e.stopPropagation());
    const selectInput = document.createElement("input");
    selectInput.type = "checkbox";
    selectInput.checked = selectedForInject;
    selectInput.disabled = everyMode;
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
    toggleLabel.title = "טעינה אוטומטית של הנחיות הפרויקט";
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

    // Live mode badge — same pattern as the GM card's (chat-features.js
    // #renderGeneralMemory), but reads/flips the PROJECT's own mode
    // (ccb_autoInjectModeProject) — independent of GM's since the 2026-07-22
    // split, so e.g. GM can ride every message while this stays start-only.
    const badge = document.createElement("span");
    badge.className = "auto-badge auto-badge-live";
    badge.textContent = everyMode ? "נטען בכל הודעה" : "נטען בתחילת שיחה";
    badge.title = "לחץ למעבר בין טעינה בתחילת שיחה לטעינה בכל הודעה";
    badge.addEventListener("click", async (e) => {
      e.stopPropagation();
      await _deps.setAutoInjectMode?.("project", everyMode ? "start" : "every");
      _deps.render();
    });
    if (!on) badge.style.display = "none";

    // Badge sits inline in the header, beside the title — not on a row of
    // its own below (2026-07-28) — so the card is always exactly one
    // title-row tall regardless of autoLoad state.
    header.appendChild(selectLabel);
    header.appendChild(toggleLabel);
    header.appendChild(title);
    header.appendChild(badge);
    wrap.appendChild(header);

    card.appendChild(wrap);
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
        : projects.length ? "ללא פרויקט" : "אין פרויקטים עדיין";
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
      // A2: the graph goes to its own `depGraph_<projectId>` key, not onto the
      // block. It only ever changes on a scan, so keeping it inline meant
      // every unrelated saveBlocks() re-serialized megabytes of path strings.
      await _deps.saveDepGraph(id, await window.__ccbDepGraph.buildGraph(included));
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
      // A2 — see createCodeProjectBookmark. Written on scan only.
      await _deps.saveDepGraph(proj.id, await window.__ccbDepGraph.buildGraph(included));
      if (proj.depGraph) delete proj.depGraph; // strip any pre-v2 inline copy
      const graphMs = Date.now() - graphStartedAt;
      const { removedManualFiles } = await _deps.docHandler.syncCodeProjectDocuments(
        proj, included, dirHandle.name, _deps.setProgress,
      );
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
      let statusMsg = `נסרקו ${counts.included} קבצים ✓`;
      if (removedManualFiles?.length) statusMsg += " · " + removedManualFilesMessage(removedManualFiles);
      _deps.setStatus(statusMsg, !!removedManualFiles?.length);
      console.log("[ccb-timing] rescanCodeProject", {
        filesIncluded: counts.included,
        manualFilesRemoved: removedManualFiles?.length || 0,
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

  // Short, capped summary for a rescan's "manually-added file is no longer
  // readable" notification — never lets a large batch of removed files blow
  // up the status toast.
  function removedManualFilesMessage(names) {
    const shown = names.slice(0, 3).join(", ");
    const extra = names.length > 3 ? ` ועוד ${names.length - 3}` : "";
    return `⚠️ הוסרו קבצים שנוספו ידנית (לא נגישים יותר): ${shown}${extra}`;
  }

  // Manual file picking for code projects — lets the user attach individual
  // files the folder scan wouldn't otherwise find (outside the bookmarked
  // folder, or filtered out by extension/ignore rules), on top of the
  // scanned tree. Must run from a real user gesture (button click) — that's
  // what showOpenFilePicker() requires.
  async function addManualCodeFiles(projectId) {
    if (!window.showOpenFilePicker) {
      _deps.setStatus("הדפדפן לא תומך בבחירת קבצים", true);
      return;
    }
    let handles;
    try {
      handles = await window.showOpenFilePicker({ multiple: true });
    } catch (e) {
      return; // user cancelled the picker
    }
    if (!handles?.length) return;
    _deps.setStatus("מוסיף קבצים...");
    try {
      const { added } = await _deps.docHandler.addManualCodeFiles(projectId, handles);
      _deps.setStatus(added ? `נוספו ${added} קבצים ✓` : "לא נוספו קבצים", !added);
    } catch (e) {
      console.error("[history-view] Failed to add manual code files", e);
      _deps.setStatus("שגיאה בהוספת קבצים", true);
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

  // Persists a manual per-file dependency edit made in code-tree.js's
  // dependency manager. Stored on project.depGraphOverrides, SEPARATE from
  // project.depGraph — rescanCodeProject overwrites depGraph wholesale on
  // every scan, so a user's manual add/remove must live somewhere the scan
  // never touches in order to survive a rescan. Deliberately does not call
  // loadBlocks() first (unlike rescanCodeProject) — `project` is already the
  // live in-memory object (same reference code-tree.js holds), and reloading
  // from storage here would swap that reference out from under it.
  async function setFileDependencyOverride(projectId, path, override) {
    const project = getProjectById(projectId);
    if (!project) return;
    if (!project.depGraphOverrides) project.depGraphOverrides = {};
    project.depGraphOverrides[path] = override;
    project.updated = Date.now();
    await _deps.saveBlocks();
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

  // Shared by both delete flows: delete the project's own text blocks (their
  // lifecycle is tied to the project).
  function unlinkProjectChildren(projectId) {
    for (const b of Object.values(_deps.state.blocks)) {
      if (b.projectId !== projectId) continue;
      if (!b.kind) {
        _deps.state.selected?.delete(b.id);
        delete _deps.state.blocks[b.id];
      }
    }
  }

  async function deleteRegularProject(project) {
    const ok = await _deps.modals.showConfirm({
      title: "מחיקת פרויקט",
      msg: 'למחוק את "' + project.title + '"? הבלוקים של הפרויקט יימחקו.',
      confirmLabel: "מחק",
      danger: true,
    });
    if (!ok) return;
    await _deps.loadBlocks();
    delete _deps.state.blocks[project.id];
    unlinkProjectChildren(project.id);
    if (_deps.state.currentProjectId === project.id) await setActiveProjectId(null);
    await _deps.saveBlocks();
    // A2: a regular project has no scanned graph, but one may exist from
    // before it was converted — removing a key that isn't there is a no-op.
    await _deps.removeDepGraph(project.id);
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
    // A2: the scanned graph lives in its own key and would otherwise outlive
    // the project it belongs to.
    await _deps.removeDepGraph(project.id);
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
    positionHiDropdown(dd, rect);
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
      const addFileBtn = $el("codeProjectAddFileBtn");
      if (addFileBtn) {
        addFileBtn.style.display = project.isCodeProject ? "flex" : "none";
        addFileBtn.onclick = () => addManualCodeFiles(project.id);
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
  // Shared floating-menu host (#hiDropdown)
  // ============================================================
  // Positions #hiDropdown (a fixed/floating dropdown menu) relative to an anchor
  // button, clamping its top so it never extends below the panel. Reused by all
  // call sites (project selector menu, deps menu in code-tree.js, the context
  // meter's files dropdown) to prevent the menu from running off-screen bottom,
  // matching the pattern already used by ui-modals.js#openSettings for the
  // settings popover.
  function positionHiDropdown(dd, anchorRect) {
    if (!dd) return;
    const panelRect = _deps.getShadow?.()?.getElementById("panel")?.getBoundingClientRect?.();
    if (!panelRect) {
      // Fallback: no panel available, just position at anchor top (least bad option)
      dd.style.top = anchorRect.top + "px";
      dd.style.left = anchorRect.right + 6 + "px";
      return;
    }
    // Clamp top so the menu never goes below the panel's bottom (12px margin)
    const minTop = 12;
    const maxTop = Math.max(minTop, panelRect.height - 12 - (dd.offsetHeight || 200));
    const top = Math.min(anchorRect.top, maxTop);
    dd.style.top = top + "px";
    dd.style.left = anchorRect.right + 6 + "px";
    // Set maxHeight to fill remaining space below the computed top
    const maxHeight = Math.max(60, panelRect.height - top - 12);
    dd.style.maxHeight = maxHeight + "px";
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
    if (_deps.state.hiDropdownCleanup) {
      _deps.state.hiDropdownCleanup();
      _deps.state.hiDropdownCleanup = null;
    }
  }

  // ============================================================
  // Render orchestrator (project-side of full render)
  // Timing/operation log only — counts, never block/file content.
  // This is the step every scan/inject flow ends with (`_deps.render()`),
  // and it previously had zero timing — a slow render here looked
  // identical to "nothing happening" in the console.
  // ============================================================
  function render() {
    const startedAt = Date.now();
    const t1 = Date.now();
    renderProjectSelect();
    const projectSelectMs = Date.now() - t1;
    const t2 = Date.now();
    renderProjectContext();
    const projectContextMs = Date.now() - t2;
    console.log("[ccb-timing] history-view.render", {
      totalBlocks: Object.keys(_deps.state.blocks || {}).length,
      projectSelectMs, projectContextMs,
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
      // long non-code doc was cut at maxChars. Uses { fast: true } — this is
      // the same "one estimate per file" shape as scanCodeProject's per-file
      // pass (document-handler.js), and a code project can have hundreds of
      // enabled files: running the exact BPE tokenizer per file here was
      // measured as the actual cause of "loading files into chat is slow"
      // (2026-07-27) — synchronous, un-yielding, ~240x the heuristic cost,
      // unlike scanCodeProject which was already fixed. The final injection
      // total below stays exact by design; only this per-file label is an
      // approximation.
      body += `\n**${doc.name}** (${_deps.docHandler.estimateTokens(injected, { fast: true })} tokens)\n---\n`;
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
    const r = _deps.injectTracked(text, "prepend");
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
    // reuse its compact row language, without the folder/dependency layer.
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

    const listBody = document.createElement("div");
    listBody.className = "code-tree-body regular-documents-body";
    docs.forEach((doc) => {
      const item = document.createElement("div");
      item.className = "code-tree-row regular-document-row";
      item.title = doc.name;

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.className = "code-tree-checkbox";
      checkbox.checked = doc.enabled;
      checkbox.addEventListener("change", () => {
        _deps.docHandler.toggleDocument(project.id, doc.id, checkbox.checked);
        _deps.render();
      });

      const icon = document.createElement("span");
      icon.className = "code-tree-icon";
      icon.innerHTML = getDocumentIcon(doc.type);

      const info = document.createElement("div");
      info.className = "code-tree-label regular-document-info";

      const name = document.createElement("div");
      name.className = "regular-document-name";
      name.textContent = doc.name;

      const meta = document.createElement("div");
      meta.className = "regular-document-meta";
      meta.textContent = `${doc.estimatedTokens} tokens · ${formatAge(doc.added)}`;

      if (doc.preview) {
        const preview = document.createElement("div");
        preview.className = "regular-document-snippet";
        preview.textContent = doc.preview;
        info.appendChild(preview);
      }

      info.insertBefore(meta, info.firstChild);
      info.insertBefore(name, info.firstChild);

      const previewBtn = document.createElement("button");
      previewBtn.type = "button";
      previewBtn.className = "code-tree-preview-btn";
      previewBtn.innerHTML = window.__ccbTpl.IC.eye;
      previewBtn.title = "תצוגה מקדימה";
      previewBtn.setAttribute("aria-label", "תצוגה מקדימה");
      previewBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const content = await _deps.docHandler.getOrExtractContent(project.id, doc.id);
        if (typeof content !== "string") {
          _deps.setStatus("אין תוכן טקסטואלי זמין לתצוגה מקדימה", true);
          return;
        }
        void window.__ccbCodeTree.openDocumentPreview(doc, content);
      });

      const deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.className = "regular-document-delete";
      deleteBtn.title = "מחק קובץ";
      deleteBtn.setAttribute("aria-label", "מחק קובץ");
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

      const actions = document.createElement("span");
      actions.className = "code-tree-file-actions";
      actions.append(previewBtn, deleteBtn);
      item.append(checkbox, icon, info, actions);
      item.addEventListener("click", (e) => {
        if (e.target === checkbox || previewBtn.contains(e.target) || deleteBtn.contains(e.target)) return;
        checkbox.checked = !checkbox.checked;
        checkbox.dispatchEvent(new Event("change"));
      });
      listBody.appendChild(item);
    });

    docsList.appendChild(listBody);
    appendDocsBudgetBar(docsList, docs);
  }

  // אותו פס תקציב שעץ הקבצים של פרויקט קוד מציג (code-tree.js), כאן עבור
  // רשימת הקבצים השטוחה של פרויקט רגיל — אותן מחלקות ורמות סף כמו מד
  // ההקשר הראשי, כדי שכל שלושת המקומות ייראו זהה.
  function appendDocsBudgetBar(mount, docs) {
    const windowTokens = _deps.getCtxWindow?.() || 0;
    if (!windowTokens) return;
    const tokens = docs
      .filter((d) => d.enabled)
      .reduce((sum, d) => sum + (d.estimatedTokens || 0), 0);
    const pct = Math.min(100, (tokens / windowTokens) * 100);

    const wrap = document.createElement("div");
    wrap.className = "code-tree-budget";
    wrap.title = `${tokens.toLocaleString("he-IL")} מתוך ${windowTokens.toLocaleString("he-IL")} טוקנים בחלון ההקשר`;

    const track = document.createElement("div");
    track.className = "ctx-bar-track";
    const fill = document.createElement("div");
    fill.className =
      "ctx-bar-fill" +
      (pct > 90 ? " crit" : pct > 75 ? " high" : pct > 50 ? " warn" : "");
    fill.style.width = pct.toFixed(1) + "%";
    track.appendChild(fill);

    const pctEl = document.createElement("span");
    pctEl.className = "ctx-pct";
    pctEl.textContent = `${pct.toFixed(1).replace(/\.0$/, "")}%`;

    wrap.appendChild(track);
    wrap.appendChild(pctEl);
    mount.appendChild(wrap);
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
    uploadPreview.style.display = "none";
    $el("docPasteTokens").textContent = "";

    overlay.classList.add("show");

    function closeDialog() {
      overlay.classList.remove("show");
      fileInput.value = "";
      pasteContent.value = "";
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
     *   injectTracked: (text, mode) => { ok, error? }, // Phase 4.1 undo stack — drop-in for inject.injectIntoInput
     *   getAutoInjectMode: (source: "gm" | "project") => "start" | "every",
     *   setAutoInjectMode: (source: "gm" | "project", mode) => Promise<string>,
     * }} deps
     */
    init(deps) { _deps = deps; },
    render,
    renderProjectSelect,
    toggleProjectSelectDropdown,
    closeProjectSelectDropdown,
    renderProjectContext,
    loadActiveProjectId,
    setActiveProjectId,
    closeHiDropdown,
    positionHiDropdown,
    openProjectDropdown,
    syncProjectDocumentsSection,
    getProjects,
    getAllProjects,
    getProjectById,
    formatAge,
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
    setFileDependencyOverride,
  };
})();
