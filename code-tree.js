// code-tree.js — interactive file tree for picking specific files out of a
// scanned code project (structure + selected files, as opposed to "load all").
// Renders INLINE into the project detail view's documents section (no modal),
// so the original tree structure and the dependency-linking option live
// together at the bottom of the open project. See CLAUDE.md.
// Exposes: window.__ccbCodeTree
//
// Public API:
//   init(deps)                  — { docHandler, getShadow, historyView, setStatus, render }
//   renderInline(project, mount) — (re)build the file tree inside `mount`
//                                  (an element inside #projectDocumentsList)

(() => {
  if (window.__ccbCodeTreeInstalled) return;
  window.__ccbCodeTreeInstalled = true;

  let _deps = null;
  let _project = null;
  let _mountEl = null;
  let _bodyEl = null;
  let _tokenEl = null;
  let _budgetEl = null;
  let _budgetFillEl = null;
  let _budgetPctEl = null;
  let _query = "";
  let _collapsedPaths = new Set();

  const IC = () => window.__ccbTpl.IC;

  // ============================================================
  // Tree building
  // ============================================================
  // Builds a nested { children: { name: node } } tree from flat relative
  // paths. A node with a `doc` is a file; one without is a folder.
  function buildTree(docs) {
    const root = { children: {} };
    for (const doc of docs) {
      const parts = doc.name.split("/");
      let node = root;
      let pathSoFar = "";
      parts.forEach((part, i) => {
        pathSoFar = pathSoFar ? `${pathSoFar}/${part}` : part;
        const isFile = i === parts.length - 1;
        if (!node.children[part]) {
          node.children[part] = { children: {}, path: pathSoFar, name: part, doc: isFile ? doc : null };
        } else if (isFile) {
          node.children[part].doc = doc;
        }
        node = node.children[part];
      });
    }
    return root;
  }

  // Flattens every file doc under a directory node (recursive).
  function collectDocs(node, out = []) {
    for (const name of Object.keys(node.children)) {
      const child = node.children[name];
      if (child.doc) out.push(child.doc);
      else collectDocs(child, out);
    }
    return out;
  }

  function renderNode(node, container, depth, forceExpand) {
    const names = Object.keys(node.children).sort((a, b) => {
      const aIsDir = !node.children[a].doc;
      const bIsDir = !node.children[b].doc;
      if (aIsDir !== bIsDir) return aIsDir ? -1 : 1;
      return a.localeCompare(b);
    });

    for (const name of names) {
      const child = node.children[name];
      const isDir = !child.doc;
      const row = document.createElement("div");
      row.className = "code-tree-row";
      row.style.marginInlineStart = `${depth * 14}px`;

      if (isDir) {
        const collapsed = !forceExpand && _collapsedPaths.has(child.path);

        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "collapse-btn" + (collapsed ? " collapsed" : "");
        btn.innerHTML = IC().chevronRight;
        row.appendChild(btn);

        // Select the entire folder (all descendant files) at once — reuses
        // the same bulk enableFilesForProject() path as "load with
        // dependencies", one saveBlocks() call regardless of folder size.
        const dirDocs = collectDocs(child);
        const enabledCount = dirDocs.filter((d) => d.enabled).length;
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.className = "code-tree-checkbox";
        checkbox.checked = dirDocs.length > 0 && enabledCount === dirDocs.length;
        checkbox.indeterminate = enabledCount > 0 && enabledCount < dirDocs.length;
        checkbox.setAttribute("aria-label", `בחר את כל הקבצים בתיקייה ${name}`);
        checkbox.addEventListener("click", (e) => e.stopPropagation());
        checkbox.addEventListener("change", () => {
          _deps.historyView.enableFilesForProject(
            _project.id,
            dirDocs.map((d) => d.name),
            checkbox.checked,
          );
        });
        row.appendChild(checkbox);

        const icon = document.createElement("span");
        icon.className = "code-tree-icon";
        icon.innerHTML = IC().folder;
        row.appendChild(icon);

        const label = document.createElement("span");
        label.className = "code-tree-label";
        label.textContent = name;
        row.appendChild(label);

        row.addEventListener("click", () => {
          if (_collapsedPaths.has(child.path)) _collapsedPaths.delete(child.path);
          else _collapsedPaths.add(child.path);
          render();
        });
        container.appendChild(row);

        const childrenWrap = document.createElement("div");
        childrenWrap.className = "code-tree-children" + (collapsed ? " collapsed" : "");
        container.appendChild(childrenWrap);
        renderNode(child, childrenWrap, depth + 1, forceExpand);
      } else {
        const spacer = document.createElement("span");
        spacer.className = "code-tree-spacer";
        row.appendChild(spacer);

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.className = "code-tree-checkbox";
        checkbox.checked = !!child.doc.enabled;
        checkbox.addEventListener("change", () => {
          _deps.docHandler.toggleDocument(_project.id, child.doc.id, checkbox.checked);
          // A full top-level render (not just updateTokenCount()) — same
          // pattern as the regular-project flat document list's own
          // checkbox (history-view.js) — so the footer inject button's
          // enabled state (content.js#syncInjectDocsBtn) picks up single-file
          // toggles too, not just folder-level/select-all bulk changes.
          _deps.render();
        });
        row.appendChild(checkbox);

        const icon = document.createElement("span");
        icon.className = "code-tree-icon";
        icon.innerHTML = IC().file;
        row.appendChild(icon);

        const label = document.createElement("span");
        label.className = "code-tree-label";
        label.textContent = name;
        row.appendChild(label);
        row.title = child.path;

        const depsBtn = document.createElement("button");
        depsBtn.type = "button";
        depsBtn.className = "code-tree-deps-btn";
        depsBtn.innerHTML = IC().link;
        depsBtn.title = "אפשרויות תלויות (ניתוח סטטי, best-effort)";
        depsBtn.setAttribute("aria-label", "אפשרויות תלויות");
        depsBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          openDepsMenu(child.doc, depsBtn);
        });
        row.appendChild(depsBtn);

        row.addEventListener("click", (e) => {
          if (e.target === checkbox || e.target === depsBtn) return;
          checkbox.checked = !checkbox.checked;
          checkbox.dispatchEvent(new Event("change"));
        });
        container.appendChild(row);
      }
    }
  }

  function updateTokenCount() {
    if (!_tokenEl || !_project) return;
    // File count covers only user-selectable code docs — the always-enabled
    // structure doc made a fresh project read "1 קבצים נבחרים" with nothing
    // ticked. The token sum still spans every enabled doc (structure
    // included), because that is exactly what the footer inject sends.
    const enabled = (_project.documents || []).filter((d) => d.enabled);
    const codeCount = enabled.filter((d) => d.type === "code").length;
    const tokens = enabled.reduce((sum, d) => sum + (d.estimatedTokens || 0), 0);
    _tokenEl.textContent = `${codeCount} קבצים נבחרים · ${tokens.toLocaleString("he-IL")} tokens`;
    updateBudgetBar(tokens);
  }

  // פס התקציב מציג את הבחירה הנוכחית מול חלון ההקשר, לפני ההזרקה — אותן
  // מחלקות ורמות סף בדיוק כמו מד ההקשר הראשי (ctx-meter.js), כדי ששני
  // המקומות שמדברים על "כמה נשאר בחלון" ייראו ויתנהגו זהה.
  function updateBudgetBar(tokens) {
    if (!_budgetEl) return;
    const windowTokens = _deps.getCtxWindow?.() || 0;
    if (!windowTokens) {
      _budgetEl.style.display = "none";
      return;
    }
    _budgetEl.style.display = "";
    const pct = Math.min(100, (tokens / windowTokens) * 100);
    _budgetFillEl.style.width = pct.toFixed(1) + "%";
    _budgetFillEl.className =
      "ctx-bar-fill" +
      (pct > 90 ? " crit" : pct > 75 ? " high" : pct > 50 ? " warn" : "");
    _budgetPctEl.textContent = `${pct.toFixed(1).replace(/\.0$/, "")}%`;
    _budgetEl.title = `${tokens.toLocaleString("he-IL")} מתוך ${windowTokens.toLocaleString("he-IL")} טוקנים בחלון ההקשר`;
  }

  // Re-renders only the tree body (folders/files) from the current _project +
  // _query, leaving the shell (search/actions) in place.
  function render() {
    if (!_bodyEl || !_project) return;
    _bodyEl.innerHTML = "";

    const docs = (_project.documents || []).filter((d) => d.type === "code");
    const q = _query.trim().toLowerCase();
    const filtered = q ? docs.filter((d) => d.name.toLowerCase().includes(q)) : docs;

    if (!filtered.length) {
      const empty = document.createElement("div");
      empty.className = "project-view-label";
      empty.style.color = "var(--text-faint)";
      empty.style.padding = "8px";
      empty.textContent = q ? "אין קבצים תואמים" : "טרם נסרקו קבצים — לחץ רענן";
      _bodyEl.appendChild(empty);
      updateTokenCount();
      return;
    }

    const tree = buildTree(filtered);
    renderNode(tree, _bodyEl, 0, !!q);
    updateTokenCount();
  }

  function setAllEnabled(enabled) {
    if (!_project) return;
    // setAllCodeDocsEnabled triggers a global render, which re-invokes
    // renderInline and rebuilds the tree from fresh state.
    _deps.historyView.setAllCodeDocsEnabled(_project.id, enabled);
  }

  // ============================================================
  // Inline shell (search + select-all/clear-all + token count + body)
  // ============================================================
  function buildShell() {
    _mountEl.innerHTML = "";

    const search = document.createElement("div");
    search.className = "search-wrap code-tree-search-wrap";
    const input = document.createElement("input");
    input.type = "search";
    input.className = "code-tree-search-input";
    input.placeholder = "חיפוש לפי נתיב...";
    input.setAttribute("aria-label", "חיפוש קבצים");
    input.value = _query;
    input.addEventListener("input", (e) => {
      _query = e.target.value || "";
      render();
    });
    const searchIcon = document.createElement("span");
    searchIcon.className = "search-icon";
    searchIcon.innerHTML = IC().search;
    search.appendChild(input);
    search.appendChild(searchIcon);
    _mountEl.appendChild(search);

    const actions = document.createElement("div");
    actions.className = "code-tree-actions";
    const selectAll = document.createElement("button");
    selectAll.type = "button";
    selectAll.className = "code-tree-link-btn";
    selectAll.textContent = "בחר הכל";
    selectAll.addEventListener("click", () => setAllEnabled(true));
    const clearAll = document.createElement("button");
    clearAll.type = "button";
    clearAll.className = "code-tree-link-btn";
    clearAll.textContent = "נקה הכל";
    clearAll.addEventListener("click", () => setAllEnabled(false));
    _tokenEl = document.createElement("span");
    _tokenEl.className = "code-tree-token-count";
    actions.appendChild(selectAll);
    actions.appendChild(clearAll);
    actions.appendChild(_tokenEl);
    _mountEl.appendChild(actions);

    _budgetEl = document.createElement("div");
    _budgetEl.className = "code-tree-budget";
    _budgetFillEl = document.createElement("div");
    _budgetFillEl.className = "ctx-bar-fill";
    const track = document.createElement("div");
    track.className = "ctx-bar-track";
    track.appendChild(_budgetFillEl);
    _budgetPctEl = document.createElement("span");
    _budgetPctEl.className = "ctx-pct";
    _budgetEl.appendChild(track);
    _budgetEl.appendChild(_budgetPctEl);
    _mountEl.appendChild(_budgetEl);

    _bodyEl = document.createElement("div");
    _bodyEl.className = "code-tree-body";
    _mountEl.appendChild(_bodyEl);
  }

  // Static dependency graph (built at scan time, see dep-graph.js) — follows
  // this file's detected imports/references and enables every file reached,
  // in one bulk save. `mode` picks the direction:
  //   "dependencies" — transitive closure of what this file imports (no
  //     depth limit, cycle-safe).
  //   "dependents"   — files that directly import this one (one hop only;
  //     transitive dependents of a low-level file would often pull in most
  //     of the project).
  //   "full"         — both: closure of dependencies plus direct dependents.
  async function loadWithDependencies(doc, mode = "dependencies") {
    if (!_project || !doc) return;

    // Bookmarks scanned before this feature existed have no depGraph yet —
    // build it now instead of silently behaving like a no-op. rescanCodeProject
    // reloads `blocks` from storage, which replaces the project object in
    // memory, so `_project` must be re-fetched afterward or it'd point at an
    // orphaned copy that never receives the new depGraph.
    if (!_project.depGraph) {
      _deps.setStatus?.("בונה גרף תלויות...");
      await _deps.historyView.rescanCodeProject(_project.id);
      const refreshed = _deps.historyView.getProjectById(_project.id);
      if (refreshed) _project = refreshed;
    }

    const graph = _project.depGraph || {};
    let closure, label;
    if (mode === "dependents") {
      closure = window.__ccbDepGraph.getDirectDependents(graph, doc.name);
      closure.add(doc.name);
      label = "תלויים";
    } else if (mode === "full") {
      closure = window.__ccbDepGraph.getFullContext(graph, doc.name);
      label = "הקשר מלא";
    } else {
      closure = window.__ccbDepGraph.getTransitiveClosure(graph, doc.name);
      label = "תלויות";
    }

    // enableFilesForProject triggers a global render → renderInline rebuild.
    // It returns how many closure paths matched actual documents — with a
    // stale graph (files renamed/removed since the last scan) that can be
    // fewer than closure.size, and the status must not overstate it.
    const marked = await _deps.historyView.enableFilesForProject(_project.id, Array.from(closure));

    if (closure.size <= 1) {
      _deps.setStatus?.(`לא זוהו קבצים נוספים (${label}) — ניתוח סטטי, לא כל קריאה ניתנת לזיהוי`);
    } else if (marked < closure.size) {
      _deps.setStatus?.(`סומנו ${marked} מתוך ${closure.size} קבצים (${label}) — ייתכן שנדרש רענון סריקה`, true);
    } else {
      _deps.setStatus?.(`סומנו ${marked} קבצים (${label}) ✓`);
    }
  }

  // ============================================================
  // Per-file "deps" menu — direction picker for loadWithDependencies.
  // Reuses the shared #hiDropdown host element (history-view.js owns its
  // DOM lifecycle) but tracks its own outside-click cleanup, since this
  // module has no access to history-view's internal _deps.state.
  // ============================================================
  let _depsMenuCleanup = null;

  function closeDepsMenu() {
    if (_depsMenuCleanup) {
      _depsMenuCleanup();
      _depsMenuCleanup = null;
    }
    _deps.historyView.closeHiDropdown();
  }

  function openDepsMenu(doc, btn) {
    closeDepsMenu();
    const dd = _deps.getShadow?.()?.getElementById("hiDropdown");
    if (!dd) return;
    const ic = window.__ccbTpl.IC;

    const mkItem = (icon, label, mode) => {
      const item = document.createElement("div");
      item.className = "hd-item";
      item.innerHTML = `${icon} ${label}`;
      item.addEventListener("click", () => {
        closeDepsMenu();
        loadWithDependencies(doc, mode);
      });
      return item;
    };

    dd.innerHTML = "";
    dd.appendChild(mkItem(ic.link, "תלויות", "dependencies"));
    dd.appendChild(mkItem(ic.download, "תלויים", "dependents"));
    dd.appendChild(mkItem(ic.context, "הקשר מלא", "full"));

    const rect = btn.getBoundingClientRect();
    dd.style.top = rect.top + "px";
    dd.style.left = rect.right + 6 + "px";
    dd.classList.add("open");

    const onOutside = (e) => {
      if (!dd.contains(e.target) && e.target !== btn) closeDepsMenu();
    };
    document.addEventListener("click", onOutside, { capture: true });
    _depsMenuCleanup = () => document.removeEventListener("click", onOutside, { capture: true });
  }

  // ============================================================
  // Public entry — render the tree inline into `mount`.
  // ============================================================
  function renderInline(project, mount) {
    if (!project || !mount) return;
    // Reset per-view state only when switching to a different project, so
    // search text / collapsed folders survive a same-project re-render.
    if (!_project || _project.id !== project.id) {
      _query = "";
      _collapsedPaths = new Set();
    }
    _project = project;
    _mountEl = mount;
    buildShell();
    render();
  }

  // ============================================================
  // Public API
  // ============================================================
  window.__ccbCodeTree = {
    init(deps) { _deps = deps; },
    renderInline,
  };
})();
