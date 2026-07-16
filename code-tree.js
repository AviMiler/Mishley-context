// code-tree.js — interactive file tree for picking specific files out of a
// scanned code project (structure + selected files, as opposed to "load all").
// Exposes: window.__ccbCodeTree
//
// Public API:
//   init(deps)        — { docHandler, getShadow, historyView, setStatus }
//   open(project)      — opens the tree modal for a code project block
//   close()

(() => {
  if (window.__ccbCodeTreeInstalled) return;
  window.__ccbCodeTreeInstalled = true;

  let _deps = null;
  let _project = null;
  let _query = "";
  let _collapsedPaths = new Set();
  let _wired = false;

  const $el = (id) => _deps?.getShadow?.()?.getElementById(id);
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
          updateTokenCount();
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
    const el = $el("codeTreeTokenCount");
    if (!el || !_project) return;
    const enabled = (_project.documents || []).filter((d) => d.enabled);
    const tokens = enabled.reduce((sum, d) => sum + (d.estimatedTokens || 0), 0);
    el.textContent = `${enabled.length} מסמכים נבחרים · ${tokens} tokens`;
  }

  function render() {
    const body = $el("codeTreeBody");
    if (!body || !_project) return;
    body.innerHTML = "";

    const docs = (_project.documents || []).filter((d) => d.type === "code");
    const q = _query.trim().toLowerCase();
    const filtered = q ? docs.filter((d) => d.name.toLowerCase().includes(q)) : docs;

    const tree = buildTree(filtered);
    renderNode(tree, body, 0, !!q);
    updateTokenCount();
  }

  function setAllEnabled(enabled) {
    if (!_project) return;
    _deps.historyView.setAllCodeDocsEnabled(_project.id, enabled).then(render);
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

    await _deps.historyView.enableFilesForProject(_project.id, Array.from(closure));
    render();

    if (closure.size <= 1) {
      _deps.setStatus?.(`לא זוהו קבצים נוספים (${label}) — ניתוח סטטי, לא כל קריאה ניתנת לזיהוי`);
    } else {
      _deps.setStatus?.(`סומנו ${closure.size} קבצים (${label}) ✓`);
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
    const dd = $el("hiDropdown");
    if (!dd) return;
    const IC = window.__ccbTpl.IC;

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
    dd.appendChild(mkItem(IC.link, "תלויות", "dependencies"));
    dd.appendChild(mkItem(IC.download, "תלויים", "dependents"));
    dd.appendChild(mkItem(IC.context, "הקשר מלא", "full"));

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
  // Open / close
  // ============================================================
  function wireOnce() {
    if (_wired) return;
    _wired = true;

    $el("codeTreeSearch").addEventListener("input", (e) => {
      _query = e.target.value || "";
      render();
    });
    $el("codeTreeSelectAllBtn").addEventListener("click", () => setAllEnabled(true));
    $el("codeTreeClearAllBtn").addEventListener("click", () => setAllEnabled(false));
    $el("codeTreeCloseBtn").addEventListener("click", () => close());
    $el("codeTreeInjectBtn").addEventListener("click", () => {
      _deps.historyView.injectProjectDocuments();
    });
  }

  function open(project) {
    if (!project) return;
    _project = project;
    _query = "";
    _collapsedPaths = new Set();

    wireOnce();

    const title = $el("codeTreeTitle");
    if (title) title.textContent = `בחירת קבצים · ${project.title}`;
    const search = $el("codeTreeSearch");
    if (search) search.value = "";

    render();
    const overlay = $el("codeTreeOverlay");
    overlay?.classList.add("show");
    overlay?.setAttribute("aria-hidden", "false");
  }

  function close() {
    closeDepsMenu();
    const overlay = $el("codeTreeOverlay");
    overlay?.classList.remove("show");
    overlay?.setAttribute("aria-hidden", "true");
    _project = null;
  }

  // ============================================================
  // Public API
  // ============================================================
  window.__ccbCodeTree = {
    init(deps) { _deps = deps; },
    open,
    close,
  };
})();
