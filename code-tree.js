// code-tree.js — interactive file tree for picking specific files out of a
// scanned code project (structure + selected files, as opposed to "load all").
// Renders INLINE into the project detail view's documents section (no modal),
// so the original tree structure and the dependency-linking option live
// together at the bottom of the open project. See CLAUDE.md.
// Exposes: window.__ccbCodeTree
//
// Public API:
//   init(deps)                  — { docHandler, getShadow, historyView, modals, loadBlocks,
//                                    saveBlocks, setStatus, render, getCtxWindow }
//   renderInline(project, mount) — (re)build the file tree inside `mount`
//                                  (an element inside #projectDocumentsList)
//   closeFilePreview()           — close the full-pane file preview if open
//                                  (wired to its back button + the panel's
//                                  Escape handler in content.js)
//   closeDepsManager()           — close the full-pane dependency manager if
//                                  open (same wiring pattern, via #dmBack +
//                                  Escape)

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
  let _searchCollapsedPaths = new Set(); // tracks per-folder collapse state during search, separate from normal browse mode
  // Collapse state for the pinned favorites section (2026-08-05) — same
  // per-project reset point as _collapsedPaths (see renderInline), default
  // expanded (false) on first view of a project.
  let _favoritesCollapsed = false;

  // "התאמה אישית" (custom) dependency-load picker state — see the full
  // comment block further down (right before dpComputeCandidates) for what
  // this picker actually shows and why. _dpPicked is purely local/in-memory:
  // it never touches project.documents until Save, and Save itself only
  // ever ADDS the checked paths (enableFilesForProject's default) — nothing
  // about this picker's own selection is persisted as a named/reusable
  // preset. Reset every time the picker opens (see openDepPicker).
  let _dpPicked = new Set();
  let _dpWired = false;

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
          node.children[part] = {
            children: {},
            path: pathSoFar,
            name: part,
            doc: isFile ? doc : null,
          };
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

  // Every folder path implied by a flat doc-name list (each "/"-separated
  // prefix except the filename itself) — used to seed _collapsedPaths so
  // every folder starts collapsed on first view of a project, without
  // building a full tree object just to walk it for directory nodes.
  function allFolderPaths(docs) {
    const paths = new Set();
    for (const doc of docs) {
      const parts = doc.name.split("/");
      let pathSoFar = "";
      for (let i = 0; i < parts.length - 1; i++) {
        pathSoFar = pathSoFar ? `${pathSoFar}/${parts[i]}` : parts[i];
        paths.add(pathSoFar);
      }
    }
    return paths;
  }

  // Same folder-path enumeration as allFolderPaths, but a folder is only
  // seeded into the "starts collapsed" set when NONE of its descendant files
  // (at any depth) are enabled — a folder already holding a selected file
  // starts expanded instead, so the user's existing selection is visible on
  // first view without manually expanding it (2026-08-05). "Has an enabled
  // descendant" is checked the same way collectDocs()'s tri-state checkbox
  // already treats "this folder has selected files" — recursively, over
  // every file under the path — just via a plain prefix match over the flat
  // doc-name list instead of walking a built tree, since that's all
  // allFolderPaths needs too.
  function initiallyCollapsedFolderPaths(docs) {
    const allPaths = allFolderPaths(docs);
    const collapsed = new Set();
    for (const path of allPaths) {
      const prefix = path + "/";
      const hasEnabled = docs.some(
        (d) => d.enabled && d.name.startsWith(prefix),
      );
      if (!hasEnabled) collapsed.add(path);
    }
    return collapsed;
  }

  // Builds one file row's DOM — shared by the scanned-tree file branch
  // (renderNode), the flat manually-added list (renderManualFilesSection),
  // and the pinned favorites section (renderFavoritesSection, 2026-08-05) —
  // so a file's row (checkbox/star/preview/deps/remove) stays identical
  // wherever it's rendered instead of drifting across separate copies.
  // `doc.isManuallyAdded` alone decides the remove button and the deps-menu
  // tooltip's manual-only note — not which section is doing the rendering,
  // since a favorited manually-added file still needs both when shown here.
  function buildFileRow(doc, { displayName = doc.name, displayTitle = doc.name } = {}) {
    const isManual = !!doc.isManuallyAdded;
    const row = document.createElement("div");
    row.className = "code-tree-row" + (isManual ? " code-tree-manual-row" : "");

    const spacer = document.createElement("span");
    spacer.className = "code-tree-spacer";
    row.appendChild(spacer);

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "code-tree-checkbox";
    checkbox.checked = !!doc.enabled;
    checkbox.addEventListener("change", () => {
      _deps.docHandler.toggleDocument(_project.id, doc.id, checkbox.checked);
      // A full top-level render (not just updateTokenCount()) — same pattern
      // as the regular-project flat document list's own checkbox — so the
      // footer inject button's enabled state (content.js#syncInjectDocsBtn)
      // picks up single-file toggles too, not just bulk changes.
      _deps.render();
    });
    row.appendChild(checkbox);

    const icon = document.createElement("span");
    icon.className = "code-tree-icon";
    icon.innerHTML = IC().file;
    row.appendChild(icon);

    const label = document.createElement("span");
    label.className = "code-tree-label";
    label.textContent = displayName;
    row.appendChild(label);
    row.title = displayTitle;

    const favBtn = document.createElement("button");
    favBtn.type = "button";
    favBtn.className =
      "code-tree-favorite-btn" + (doc.favorite ? " active" : "");
    favBtn.innerHTML = IC().star;
    favBtn.title = doc.favorite ? "הסר ממועדפים" : "הוסף למועדפים";
    favBtn.setAttribute("aria-label", favBtn.title);
    favBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const nowFavorite = !doc.favorite;
      _deps.docHandler.toggleFavorite(_project.id, doc.id, nowFavorite);
      // Force the favorites section open on ADD (2026-08-05 fix) — otherwise
      // a section the user had collapsed earlier (while it held other
      // favorites, or was toggled shut out of curiosity) stays collapsed
      // when a new file is starred, so the user never actually sees what
      // they just added. Only forces open on add, never on remove — removing
      // a favorite shouldn't fight a deliberate collapse.
      if (nowFavorite) _favoritesCollapsed = false;
      _deps.render();
    });

    const previewBtn = document.createElement("button");
    previewBtn.type = "button";
    previewBtn.className = "code-tree-preview-btn";
    previewBtn.innerHTML = IC().eye;
    previewBtn.title = "תצוגה מקדימה";
    previewBtn.setAttribute("aria-label", "תצוגה מקדימה");
    previewBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      void openPreview(doc);
    });

    const depsBtn = document.createElement("button");
    depsBtn.type = "button";
    depsBtn.className = "code-tree-deps-btn";
    depsBtn.innerHTML = IC().link;
    depsBtn.title = isManual
      ? "אפשרויות תלויות (ציון ידני בלבד — קובץ שנוסף ידנית אינו נסרק אוטומטית)"
      : "אפשרויות תלויות (ניתוח סטטי, best-effort)";
    depsBtn.setAttribute("aria-label", "אפשרויות תלויות");
    depsBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      openDepsMenu(doc, depsBtn);
    });

    // כפתורי הפעולה מקובצים יחד (לא כל אחד ישירות בשורה), כדי שיוכלו
    // להידחק זה לזה יותר מריווח ה-gap הרגיל של השורה, ולפנות רוחב נוסף
    // לטקסט השם — ראה .code-tree-file-actions ב-ui-styles.js. שם מחלקה שונה
    // בכוונה מ-.code-tree-actions הקיים (שורת "בחר הכל"/"נקה הכל" מעל העץ)
    // כדי לא להתנגש איתו.
    const fileActions = document.createElement("span");
    fileActions.className = "code-tree-file-actions";
    fileActions.appendChild(favBtn);
    fileActions.appendChild(previewBtn);
    fileActions.appendChild(depsBtn);

    if (isManual) {
      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "code-tree-preview-btn code-tree-remove-btn";
      removeBtn.innerHTML = IC().trash;
      removeBtn.title = "הסר קובץ";
      removeBtn.setAttribute("aria-label", "הסר קובץ");
      removeBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const ok = await _deps.modals.showConfirm({
          title: "הסרת קובץ",
          msg: `להסיר את "${doc.name}" מהפרויקט?`,
        });
        if (!ok) return;
        await _deps.docHandler.removeDocument(_project.id, doc.id);
        await _deps.docHandler.removeCodeContent(doc.id);
        if (doc.fileHandleId)
          window.__ccbFsHandles.remove(doc.fileHandleId).catch(() => {});
        _deps.render();
      });
      fileActions.appendChild(removeBtn);
    }
    row.appendChild(fileActions);

    row.addEventListener("click", (e) => {
      if (e.target === checkbox || fileActions.contains(e.target)) return;
      checkbox.checked = !checkbox.checked;
      checkbox.dispatchEvent(new Event("change"));
    });
    return row;
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

      if (isDir) {
        const row = document.createElement("div");
        row.className = "code-tree-row";
        row.style.marginInlineStart = `${depth * 14}px`;
        // During search (forceExpand=true), check _searchCollapsedPaths to see if the user
        // explicitly collapsed this folder despite the query; otherwise use _collapsedPaths.
        const activeSet = forceExpand ? _searchCollapsedPaths : _collapsedPaths;
        const collapsed = activeSet.has(child.path);

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
        checkbox.checked =
          dirDocs.length > 0 && enabledCount === dirDocs.length;
        checkbox.indeterminate =
          enabledCount > 0 && enabledCount < dirDocs.length;
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
          const set = forceExpand ? _searchCollapsedPaths : _collapsedPaths;
          if (set.has(child.path)) set.delete(child.path);
          else set.add(child.path);
          render();
        });
        container.appendChild(row);

        const childrenWrap = document.createElement("div");
        childrenWrap.className =
          "code-tree-children" + (collapsed ? " collapsed" : "");
        container.appendChild(childrenWrap);
        renderNode(child, childrenWrap, depth + 1, forceExpand);
      } else {
        // Basename-only label (indentation already shows the hierarchy) —
        // the full relative path still goes in the tooltip, and buildFileRow
        // defaults both to the doc's full name for its OTHER callers
        // (manual-files list, favorites section), which aren't nested in a
        // folder tree and need the full path visible.
        const fileRow = buildFileRow(child.doc, {
          displayName: name,
          displayTitle: child.path,
        });
        fileRow.style.marginInlineStart = `${depth * 14}px`;
        container.appendChild(fileRow);
      }
    }
  }

  function updateTokenCount() {
    if (!_tokenEl || !_project) return;
    // File count covers only actual code docs — the structure doc has its
    // own checkbox and label above the tree (see renderStructureRow), not a
    // path in the tree, so it shouldn't inflate "X קבצים נבחרים". The token
    // sum still spans every enabled doc (structure included, when the user
    // has it checked), because that is exactly what the footer inject sends.
    const enabled = (_project.documents || []).filter((d) => d.enabled);
    const codeCount = enabled.filter((d) => d.type === "code").length;
    const tokens = enabled.reduce(
      (sum, d) => sum + (d.estimatedTokens || 0),
      0,
    );
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

  /**
   * התאמת קובץ לשאילתת החיפוש, מודעת-תיקיות.
   *
   * חיפוש שם תיקייה מעלה את כל הקבצים שבתוכה: אם סגמנט תיקייה כלשהו
   * בנתיב מכיל את השאילתה, כל צאצאיו תואמים. בנוסף נשמרת ההתנהגות
   * הישנה של חיפוש חופשי בנתיב המלא, כדי שחיפוש חלקי של שם קובץ
   * (או של נתיב עם "/") ימשיך לעבוד בדיוק כמו קודם.
   *
   * @param {string} path נתיב יחסי, מופרד ב-"/"
   * @param {string} q שאילתה, כבר trimmed ו-lowercase
   */
  function matchesQuery(path, q) {
    const lower = path.toLowerCase();
    if (lower.includes(q)) return true;
    // "src/utils" — משווים סגמנט-מול-סגמנט, בכל היסט אפשרי בנתיב.
    // כל סגמנט נבדק ב-startsWith ולא ב-includes בכוונה: includes היה גורם
    // ל-"src/utils" לתפוס גם את "src/myUtilsHelper.js", בעוד startsWith
    // עדיין מאפשר הקלדה חלקית ("areas/adm" → "Areas/Admin/...").
    if (q.includes("/")) {
      const qParts = q.split("/").filter(Boolean);
      const parts = lower.split("/");
      for (let i = 0; i + qParts.length <= parts.length; i++) {
        if (qParts.every((qp, j) => parts[i + j].startsWith(qp))) return true;
      }
    }
    return false;
  }

  // The auto-generated project-structure doc (PROJECT_STRUCTURE.md) used to
  // be forced always-`enabled: true` and hidden from this tree entirely —
  // the user asked for it to be a real, visible choice instead, pinned above
  // the file tree (not inside the path hierarchy, since it isn't a scanned
  // file — it has no folder to sort into). Reuses the exact
  // toggleDocument()+render() pattern as a normal file row's checkbox, and
  // isn't affected by the search query (it's not part of what's being
  // searched for).
  function renderStructureRow(doc) {
    const row = document.createElement("div");
    row.className = "code-tree-row code-tree-structure-row";

    const spacer = document.createElement("span");
    spacer.className = "code-tree-spacer";
    row.appendChild(spacer);

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "code-tree-checkbox";
    checkbox.checked = !!doc.enabled;
    checkbox.setAttribute("aria-label", "כלול את מפת הפרויקט בהזרקה");
    checkbox.addEventListener("change", () => {
      _deps.docHandler.toggleDocument(_project.id, doc.id, checkbox.checked);
      _deps.render();
    });
    row.appendChild(checkbox);

    const icon = document.createElement("span");
    icon.className = "code-tree-icon";
    icon.innerHTML = IC().file;
    row.appendChild(icon);

    const label = document.createElement("span");
    label.className = "code-tree-label";
    label.textContent = "מפת הפרויקט (מבנה קבצים)";
    row.appendChild(label);
    row.title =
      "PROJECT_STRUCTURE.md — נוצר אוטומטית בכל סריקה, כולל את רשימת כל הקבצים והתיקיות בפרויקט";

    row.addEventListener("click", (e) => {
      if (e.target === checkbox) return;
      checkbox.checked = !checkbox.checked;
      checkbox.dispatchEvent(new Event("change"));
    });
    return row;
  }

  // Pinned "favorites" section (2026-08-05) — the user's own choice of
  // frequently-needed files, independent of the folder tree's path
  // hierarchy. Sits below the structure row and above the scanned tree, per
  // the user's explicit placement choice. Spans BOTH scanned and manually-
  // added files (doc.favorite is a plain boolean set from either section's
  // star button, via the shared buildFileRow) and deliberately does NOT
  // remove a favorited file from its normal tree/manual-list spot — this is
  // a duplicate view, not a move, per the user's explicit choice. Collapsible
  // like a folder (own _favoritesCollapsed flag, same collapse-btn/
  // .code-tree-children pattern a folder row uses) — hidden entirely when
  // there are no favorites yet, same as renderManualFilesSection's own
  // "only render if non-empty" pattern. Not affected by the search query,
  // matching renderStructureRow's precedent for a pinned, always-visible row.
  function renderFavoritesSection(container) {
    const favDocs = (_project.documents || []).filter(
      (d) => d.type === "code" && d.favorite,
    );
    if (!favDocs.length) return;

    // Wraps the header + list together so the separator (2026-08-05: moved
    // from directly under the header to the bottom of the whole favorites
    // block, per the user's explicit request) stays visible below the list
    // even when collapsed — it lives on this outer wrapper, not on the
    // header or on .code-tree-children (which is display:none when
    // collapsed and would take the separator down with it).
    const section = document.createElement("div");
    section.className = "code-tree-favorites-section";

    const header = document.createElement("div");
    header.className = "code-tree-row code-tree-favorites-header";

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "collapse-btn" + (_favoritesCollapsed ? " collapsed" : "");
    btn.innerHTML = IC().chevronRight;
    header.appendChild(btn);

    const icon = document.createElement("span");
    icon.className = "code-tree-icon";
    icon.innerHTML = IC().star;
    header.appendChild(icon);

    const label = document.createElement("span");
    label.className = "code-tree-label";
    label.textContent = `מועדפים (${favDocs.length})`;
    header.appendChild(label);

    header.addEventListener("click", () => {
      _favoritesCollapsed = !_favoritesCollapsed;
      render();
    });
    section.appendChild(header);

    const wrap = document.createElement("div");
    wrap.className =
      "code-tree-children" + (_favoritesCollapsed ? " collapsed" : "");
    const sorted = [...favDocs].sort((a, b) => a.name.localeCompare(b.name));
    for (const doc of sorted) wrap.appendChild(buildFileRow(doc));
    section.appendChild(wrap);

    container.appendChild(section);
  }

  // Re-renders only the tree body (folders/files) from the current _project +
  // _query, leaving the shell (search/actions) in place.
  function render() {
    if (!_bodyEl || !_project) return;
    _bodyEl.innerHTML = "";

    const structureDoc = (_project.documents || []).find(
      (d) => d.type === "structure",
    );
    if (structureDoc) _bodyEl.appendChild(renderStructureRow(structureDoc));

    renderFavoritesSection(_bodyEl);

    const allDocs = (_project.documents || []).filter((d) => d.type === "code");
    // Manually-added files (see addManualCodeFiles in document-handler.js)
    // aren't part of the scanned folder structure, so they're kept out of
    // buildTree()'s path hierarchy and rendered as a flat list below it
    // instead — see renderManualFilesSection.
    const scannedDocs = allDocs.filter((d) => !d.isManuallyAdded);
    const manualDocs = allDocs.filter((d) => d.isManuallyAdded);
    const q = _query.trim().toLowerCase();
    const filteredScanned = q
      ? scannedDocs.filter((d) => matchesQuery(d.name, q))
      : scannedDocs;
    const filteredManual = q
      ? manualDocs.filter((d) => matchesQuery(d.name, q))
      : manualDocs;

    if (!filteredScanned.length && !filteredManual.length) {
      const empty = document.createElement("div");
      empty.className = "project-view-label";
      empty.style.color = "var(--text-faint)";
      empty.style.padding = "8px";
      empty.textContent = q ? "אין קבצים תואמים" : "טרם נסרקו קבצים — לחץ רענן";
      _bodyEl.appendChild(empty);
      updateTokenCount();
      return;
    }

    if (filteredScanned.length) {
      const tree = buildTree(filteredScanned);
      renderNode(tree, _bodyEl, 0, !!q);
    }
    if (filteredManual.length)
      renderManualFilesSection(filteredManual, _bodyEl);

    updateTokenCount();
  }

  // Flat list of manually-added files, always after the scanned tree. Each
  // row mirrors a scanned file row (checkbox, preview, deps menu) plus a
  // remove button — removal here is immediate/explicit rather than the
  // scan-driven path-based cleanup that governs scanned files. The deps menu
  // works for manual files too, but only via manually-declared overrides
  // (project.depGraphOverrides, see the dependency manager) — buildGraph
  // itself is still only ever run over the scanned folder's `included` set,
  // so a manual file starts with zero auto-detected edges (see openDepsMenu's
  // isManuallyAdded-aware copy, which explains the "(0)" isn't a failure).
  function renderManualFilesSection(docs, container) {
    const label = document.createElement("div");
    label.className = "code-tree-manual-label";
    label.textContent = "קבצים שנוספו ידנית";
    container.appendChild(label);

    const sorted = [...docs].sort((a, b) => a.name.localeCompare(b.name));
    for (const doc of sorted) container.appendChild(buildFileRow(doc));
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

  // תצוגה מקדימה של קובץ — קריאה בלבד, נפתחת על כל שטח הצ'אט ולא כדיאלוג
  // קטן, כדי לתת מקום אמיתי לקרוא קובץ שלם לפני החלטה אם לכלול אותו.
  const FP_MAX_CHARS = 20000;

  // בונה את שורת ה-meta כרצף "קבוצות" — כל קבוצה מקבלת את כיוון ה-bidi
  // הנכון לשפה שלה במפורש (עברית="תווים" → rtl, אנגלית="tokens" → ltr),
  // לפי הנחיה מפורשת של המשתמש, במקום לכפות ltr אחיד על שתיהן כמו בניסיון
  // הקודם. .fp-meta-item שם unicode-bidi:isolate כך שכיוון הקבוצה לא דולף
  // מחוץ לה ולא מושפע מהשורה כולה.
  function renderMetaLine(container, groups) {
    if (!container) return;
    container.textContent = "";
    groups.forEach(({ dir, pieces }, i) => {
      if (i > 0) container.appendChild(document.createTextNode(" · "));
      const group = document.createElement("span");
      group.className = `fp-meta-item fp-meta-${dir}`;
      pieces.forEach((text) => {
        const piece = document.createElement("span");
        piece.className = "fp-meta-piece";
        piece.textContent = text;
        group.appendChild(piece);
      });
      container.appendChild(group);
    });
  }

  async function openPreview(doc, contentOverride = null) {
    if (!doc) return;
    const shadow = _deps.getShadow?.();
    if (!shadow) return;
    try {
      let content;
      if (typeof contentOverride === "string") {
        content = contentOverride;
      } else if (doc.type === "code") {
        content = (await _deps.docHandler.getCodeContents([doc.id])).get(
          doc.id,
        );
      } else {
        content = doc.content || null;
      }
      if (typeof content !== "string") {
        _deps.setStatus("לא נמצא תוכן לקובץ — ייתכן שנדרש רענון סריקה", true);
        return;
      }
      // נמדד כאן ולא נלקח מ-doc.estimatedTokens: אומדנים שנשמרו לפני מעבר
      // לטוקנייזר האמיתי עדיין נושאים את הערך ההיוריסטי הישן.
      const tokens = window.__ccbRawConfig.estimateTextTokens(content);
      const full = content;
      const shown = full.slice(0, FP_MAX_CHARS);

      // הכותרת: שם הקובץ הבודד (מודגש, במרכז, למעלה) + הנתיב המלא שלו
      // (כולל שם הקובץ עצמו, לא רק התיקייה) כשורה קטנה ועמומה מתחתיו.
      const fileName = doc.name.split("/").pop();
      shadow.getElementById("fpTitle").textContent = fileName;
      shadow.getElementById("fpPath").textContent = doc.name;
      // textContent, never innerHTML — arbitrary file content from the
      // user's own project, must never be parsed as markup.
      shadow.getElementById("fpBody").textContent = shown;

      // סדר קבוצות: מספר התווים קודם, טוקנים אחריו (כמו "100 תווים ·
      // 350 tokens"). כל קבוצה מתויגת עם כיוון ה-bidi השייך לשפתה בפועל —
      // rtl לעברית ("תווים"), ltr לאנגלית ("tokens") — ולא ltr כפוי על שתיהן.
      const fmt = (n) => n.toLocaleString("he-IL");
      const groups = [
        { dir: "rtl", pieces: [fmt(full.length), "תווים"] },
        { dir: "ltr", pieces: [fmt(tokens), "tokens"] },
      ];
      if (full.length > FP_MAX_CHARS) {
        groups.push({
          dir: "rtl",
          pieces: ["מוצגים", fmt(FP_MAX_CHARS), "תווים ראשונים"],
        });
      }
      renderMetaLine(shadow.getElementById("fpMeta"), groups);

      // This view, the dependency manager, its candidate picker, and the
      // onboarding guide are all full-pane takeovers of the same area —
      // closing the others before opening this one avoids two fixed,
      // same-z-index panels being open together.
      closeDepsManager();
      closeDepPicker();
      window.__ccbModals?.closeOnboarding?.();
      const view = shadow.getElementById("filePreviewView");
      view?.classList.add("cv-open");
      view?.setAttribute("aria-hidden", "false");
    } catch (e) {
      console.error("[ccb] file preview failed:", e);
      _deps.setStatus("שגיאה בטעינת הקובץ", true);
    }
  }

  function closeFilePreview() {
    const shadow = _deps.getShadow?.();
    if (!shadow) return;
    const view = shadow.getElementById("filePreviewView");
    view?.classList.remove("cv-open");
    view?.setAttribute("aria-hidden", "true");
    // הקובץ עשוי להיות גדול — לא משאירים אותו תלוי ב-DOM אחרי סגירה.
    const body = shadow.getElementById("fpBody");
    if (body) body.textContent = "";
  }

  // Static dependency graph (built at scan time, see dep-graph.js) — follows
  // this file's detected imports/references and enables every file reached,
  // in one bulk save. `mode` picks the direction/depth:
  //   "direct"       — this file's own outgoing edges only, one hop (no
  //     dependencies of dependencies).
  //   "dependencies" — transitive closure of what this file imports (no
  //     depth limit, cycle-safe) — i.e. "direct" plus everything indirect.
  //   "dependents"   — files that directly import this one (one hop only;
  //     transitive dependents of a low-level file would often pull in most
  //     of the project).
  //   "full"         — both: closure of dependencies plus direct dependents.
  // Bookmarks scanned before this feature existed have no depGraph yet —
  // build it now instead of silently behaving like a no-op. rescanCodeProject
  // reloads `blocks` from storage, which replaces the project object in
  // memory, so `_project` must be re-fetched afterward or it'd point at an
  // orphaned copy that never receives the new depGraph.
  //
  // A2: the scanned graph lives in its own `depGraph_<projectId>` storage key
  // rather than on the project block, so it has to be read in before any of
  // the synchronous graph consumers below run. Cached per project for the
  // lifetime of the view; invalidated in renderInline when the project
  // changes, and re-read after a rescan (which rewrites the key).
  let _rawGraph = null;
  let _rawGraphProjectId = null;

  async function loadRawGraph() {
    if (!_project) return false;
    if (_rawGraphProjectId === _project.id && _rawGraph) return true;
    _rawGraph = await _deps.loadDepGraph(_project.id);
    _rawGraphProjectId = _project.id;
    // A project scanned before the v2 migration may still carry the inline
    // copy; it stays authoritative until the migration moves it.
    if (!_rawGraph && _project.depGraph) _rawGraph = _project.depGraph;
    return !!_rawGraph;
  }

  function rawGraph() {
    return _rawGraph || _project?.depGraph || {};
  }

  function hasRawGraph() {
    return !!(_rawGraph || _project?.depGraph);
  }

  async function ensureDepGraph() {
    if (await loadRawGraph()) return;
    _deps.setStatus?.("בונה גרף תלויות...");
    await _deps.historyView.rescanCodeProject(_project.id);
    const refreshed = _deps.historyView.getProjectById(_project.id);
    if (refreshed) _project = refreshed;
    _rawGraph = null;
    _rawGraphProjectId = null;
    await loadRawGraph();
  }

  // The graph with any manual per-file edits (dependency manager, below)
  // applied on top — every reader of the graph (this menu's counts, "load
  // with dependencies", the manager itself) must go through this, not the raw
  // graph directly, or a user's manual edit would silently not show up
  // outside the screen that made it.
  function effectiveGraph() {
    return window.__ccbDepGraph.applyOverrides(
      rawGraph(),
      _project.depGraphOverrides,
    );
  }

  async function loadWithDependencies(doc, mode = "dependencies") {
    if (!_project || !doc) return;
    await ensureDepGraph();

    const graph = effectiveGraph();
    const loadIgnores = getLoadIgnores(doc.name);
    let closure, label;
    if (mode === "dependents") {
      closure = window.__ccbDepGraph.getDirectDependents(graph, doc.name);
      closure.add(doc.name);
      label = "תלויים";
    } else if (mode === "full") {
      closure = window.__ccbDepGraph.getFullContext(graph, doc.name);
      label = "הקשר מלא";
    } else if (mode === "direct") {
      closure = window.__ccbDepGraph.getDirectDependencies(graph, doc.name);
      closure.add(doc.name);
      label = "תלויות ישירות";
    } else {
      closure = window.__ccbDepGraph.getTransitiveClosure(graph, doc.name);
      label = "תלויות (כולל עקיפות)";
    }

    if (mode !== "dependents") {
      for (const ignored of loadIgnores) closure.delete(ignored);
    }

    // enableFilesForProject triggers a global render → renderInline rebuild.
    // It returns how many closure paths matched actual documents — with a
    // stale graph (files renamed/removed since the last scan) that can be
    // fewer than closure.size, and the status must not overstate it.
    const marked = await _deps.historyView.enableFilesForProject(
      _project.id,
      Array.from(closure),
    );

    if (closure.size <= 1) {
      _deps.setStatus?.(
        `לא זוהו קבצים נוספים (${label}) — ניתוח סטטי, לא כל קריאה ניתנת לזיהוי`,
      );
    } else if (marked < closure.size) {
      _deps.setStatus?.(
        `סומנו ${marked} מתוך ${closure.size} קבצים (${label}) — ייתכן שנדרש רענון סריקה`,
        true,
      );
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

  async function openDepsMenu(doc, btn) {
    closeDepsMenu();
    const dd = _deps.getShadow?.()?.getElementById("hiDropdown");
    if (!dd) return;
    // A2: pull the scanned graph in before computing the counts below.
    await loadRawGraph();
    const ic = window.__ccbTpl.IC;

    // הספירה מוצגת כאן — בתפריט הפעולה עצמו, לא כתג על שורת העץ — כי כאן
    // המשתמש בפועל מחליט מה להזריק, ולא רק סוקר את העץ. ללא גרף (טרם
    // נסרק) לא מציגים מספר בדוי; loadWithDependencies כבר יודע לסרוק
    // מחדש בעצמו במקרה הזה.
    const graph = hasRawGraph() ? effectiveGraph() : null;
    const loadIgnores = graph ? getLoadIgnores(doc.name) : null;
    const countLabel = (n) => (graph ? ` (${n})` : "");
    const dg = window.__ccbDepGraph;
    const directDepsCount = graph
      ? (() => {
          const set = dg.getDirectDependencies(graph, doc.name);
          for (const ignored of loadIgnores) set.delete(ignored);
          return set.size;
        })()
      : 0;
    const depsCount = graph
      ? (() => {
          const set = dg.getTransitiveClosure(graph, doc.name);
          for (const ignored of loadIgnores) set.delete(ignored);
          return set.size - 1;
        })()
      : 0;
    const dependentsCount = graph
      ? dg.getDirectDependents(graph, doc.name).size
      : 0;
    const fullCount = graph
      ? (() => {
          const set = dg.getFullContext(graph, doc.name);
          for (const ignored of loadIgnores) set.delete(ignored);
          return set.size - 1;
        })()
      : 0;

    const mkItem = (icon, label, onClick, tooltip) => {
      const item = document.createElement("div");
      item.className = "hd-item";
      item.innerHTML = `${icon} ${label}`;
      if (tooltip) item.title = tooltip;
      item.addEventListener("click", onClick);
      return item;
    };

    // "תלויות (כולל עקיפות)"/"תלויים"/"הקשר מלא" show the TRANSITIVE closure
    // (dependencies of dependencies, arbitrarily deep) — by design, since
    // clicking the item loads that whole chain into the chat. This is
    // deliberately larger than "ניהול תלויות"'s own list below, which only
    // ever shows this file's DIRECT edges (a dependency of a dependency isn't
    // something this file itself depends on) — "תלויות ישירות בלבד" above is
    // the one row here that DOES match that direct-only count exactly.
    // Tooltips spell this out — reported as confusing when the two numbers
    // didn't match ("3 outside, 2 direct inside").
    // Manual files never get scan-detected edges (buildGraph only sees the
    // scanned folder's `included` set) — a "(0)" here is a correct "nothing
    // declared yet", not a failed analysis. The suffix on each tooltip makes
    // that distinction explicit instead of leaving it to look like the deps
    // feature silently doesn't work for these files.
    const manualNote = doc.isManuallyAdded
      ? " (קובץ שנוסף ידנית — רק תלויות שסומנו ידנית ב'ניהול תלויות' יופיעו כאן)"
      : "";
    dd.innerHTML = "";
    dd.appendChild(
      mkItem(
        ic.link,
        `תלויות ישירות בלבד${countLabel(directDepsCount)}`,
        () => {
          closeDepsMenu();
          loadWithDependencies(doc, "direct");
        },
        "טוען רק את מה שהקובץ מייבא ישירות — לא תלויות של תלויות" + manualNote,
      ),
    );
    dd.appendChild(
      mkItem(
        ic.link,
        `תלויות (כולל עקיפות)${countLabel(depsCount)}`,
        () => {
          closeDepsMenu();
          loadWithDependencies(doc, "dependencies");
        },
        "טוען את כל שרשרת התלויות של הקובץ — כולל תלויות של תלויות, לא רק ישירות" +
          manualNote,
      ),
    );
    dd.appendChild(
      mkItem(
        ic.download,
        `תלויים${countLabel(dependentsCount)}`,
        () => {
          closeDepsMenu();
          loadWithDependencies(doc, "dependents");
        },
        "קבצים שתלויים ישירות בקובץ הזה" + manualNote,
      ),
    );
    dd.appendChild(
      mkItem(
        ic.context,
        `הקשר מלא${countLabel(fullCount)}`,
        () => {
          closeDepsMenu();
          loadWithDependencies(doc, "full");
        },
        "כל שרשרת התלויות (כולל עקיפות) יחד עם התלויים הישירים" + manualNote,
      ),
    );
    dd.appendChild(
      mkItem(
        ic.settings,
        "התאמה אישית",
        () => {
          closeDepsMenu();
          openDepPicker(doc);
        },
        "בחר בדיוק אילו מהתלויות (ישירות ועקיפות, אוטומטיות וידניות) של הקובץ הזה לטעון" +
          manualNote,
      ),
    );
    const sep = document.createElement("div");
    sep.className = "hd-sep";
    dd.appendChild(sep);
    dd.appendChild(
      mkItem(ic.pencil, "ניהול תלויות", () => {
        closeDepsMenu();
        openDepsManager(doc);
      }),
    );

    const rect = btn.getBoundingClientRect();
    _deps.historyView.positionHiDropdown(dd, rect);
    dd.classList.add("open");

    const onOutside = (e) => {
      if (!dd.contains(e.target) && e.target !== btn) closeDepsMenu();
    };
    document.addEventListener("click", onOutside, { capture: true });
    _depsMenuCleanup = () =>
      document.removeEventListener("click", onOutside, { capture: true });
  }

  // ============================================================
  // Dependency manager — per-file editor for a single file's dependency
  // edges. Opened from that file's own "אפשרויות תלויות" menu above
  // ("ניהול תלויות"), full-pane like the file preview view (#depManagerView,
  // same cv-shell takeover pattern). Outgoing dependencies are editable
  // (remove an existing edge, add a new one via a filtered picker over the
  // project's own code files); indirect dependencies now also have a per-
  // file root-only ignore toggle. Outgoing edge edits persist via
  // project.depGraphOverrides; the indirect ignore list persists separately
  // as project.depLoadIgnores so it only applies when THIS file is the load
  // root and never leaks upward to a parent that loads it directly.
  // ============================================================
  let _dmDoc = null;
  // File-map picker state (add-dependency section) — reset per file opened
  // (openDepsManager), so every file's manager starts with the map collapsed
  // and the search box empty, matching the main tree's per-project reset.
  let _dmAddQuery = "";
  let _dmExpandedPaths = new Set();

  // Returns the full doc objects (not just names) — refreshAddTree needs
  // isManuallyAdded to split scanned files (rendered as a folder tree) from
  // manual/external ones (rendered as their own flat section, see below).
  function codeDocs() {
    return (_project.documents || []).filter((d) => d.type === "code");
  }

  function dmEmptyRow(text) {
    const e = document.createElement("div");
    e.className = "project-view-label";
    e.style.cssText = "color:var(--text-faint);padding:4px 0;";
    e.textContent = text;
    return e;
  }

  // Files reachable only through this file's ACTIVE direct dependencies (a
  // dependency of a dependency) — the gap between the manager's own direct
  // list and the deps-menu's transitive "(N)" count, which confused the user
  // twice before this was surfaced in the manager itself. Traces each direct
  // dep's own transitive closure separately (rather than the whole file's
  // closure minus directDeps) so each indirect file can be tagged with which
  // direct dependency actually leads to it. Deliberately reads `directDeps`
  // fresh on every call instead of caching: if a direct edge gets toggled
  // off in the manager, its whole subtree stops being traversed here on the
  // very next render — an indirect file only reachable through it just
  // disappears, with no separate "cascade delete" bookkeeping needed.
  function computeIndirectDeps(graph, path, directDeps) {
    const dg = window.__ccbDepGraph;
    const result = new Map();
    for (const direct of directDeps) {
      const reached = dg.getTransitiveClosure(graph, direct);
      for (const f of reached) {
        if (f === path || f === direct || directDeps.includes(f)) continue;
        if (!result.has(f)) result.set(f, new Set());
        result.get(f).add(direct);
      }
    }
    return result;
  }

  function getLoadIgnores(path) {
    return new Set((_project?.depLoadIgnores || {})[path] || []);
  }

  async function setLoadIgnores(path, ignoredPaths) {
    if (!_project) return;
    await _deps.loadBlocks?.();
    const project = _deps.historyView.getProjectById(_project.id);
    if (!project) return;
    const next = Array.from(
      new Set(
        (ignoredPaths || []).map((p) => String(p || "").trim()).filter(Boolean),
      ),
    );
    const all = { ...(project.depLoadIgnores || {}) };
    if (next.length) all[path] = next;
    else delete all[path];
    if (Object.keys(all).length) project.depLoadIgnores = all;
    else delete project.depLoadIgnores;
    project.updated = Date.now();
    await _deps.saveBlocks?.();
    _project = project;
  }

  // Recursive renderer for the add-dependency file map (candidates only —
  // the current file and everything already listed as a dependency, whether
  // active or manually turned off, are excluded upstream in dmBuildAddTree).
  // Deliberately its own tree walker rather than reusing the main
  // renderNode(): that one is wired to doc.enabled checkboxes and bulk
  // folder-enable, neither of which applies here — a click on a file row
  // just adds one edge.
  function dmRenderTreeNode(
    node,
    container,
    depth,
    forceExpand,
    onFileClick,
    onToggle,
  ) {
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
        // Opposite default from the main tree: a fresh manager shows every
        // folder COLLAPSED (per the user's explicit request), so membership
        // in _dmExpandedPaths means "explicitly opened", not "explicitly
        // closed" — inverted from _collapsedPaths above.
        const expanded = forceExpand || _dmExpandedPaths.has(child.path);
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "collapse-btn" + (expanded ? "" : " collapsed");
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
          if (_dmExpandedPaths.has(child.path))
            _dmExpandedPaths.delete(child.path);
          else _dmExpandedPaths.add(child.path);
          onToggle();
        });
        container.appendChild(row);

        const childrenWrap = document.createElement("div");
        childrenWrap.className =
          "code-tree-children" + (expanded ? "" : " collapsed");
        container.appendChild(childrenWrap);
        dmRenderTreeNode(
          child,
          childrenWrap,
          depth + 1,
          forceExpand,
          onFileClick,
          onToggle,
        );
      } else {
        const spacer = document.createElement("span");
        spacer.className = "code-tree-spacer";
        row.appendChild(spacer);

        const icon = document.createElement("span");
        icon.className = "code-tree-icon";
        icon.innerHTML = IC().file;
        row.appendChild(icon);

        const label = document.createElement("span");
        label.className = "code-tree-label";
        label.textContent = name;
        row.appendChild(label);
        row.title = child.path;
        row.classList.add("dm-tree-file-row");

        row.addEventListener("click", () => onFileClick(child.path));
        container.appendChild(row);
      }
    }
  }

  // Flat, always-visible list of manually-added ("external") files at the
  // bottom of the add-dependency picker — see refreshAddTree's comment for
  // why these are kept out of the folder tree above rather than sorted into
  // it. Deliberately minimal rows (icon + name only, no checkbox/preview/
  // deps buttons) since this is a picker, not the main file tree — clicking
  // a row adds that file as a dependency edge, same as clicking a leaf in
  // the folder tree above.
  function renderAddTreeManualSection(docs, container) {
    const label = document.createElement("div");
    label.className = "code-tree-manual-label";
    label.textContent = "קבצים חיצוניים";
    container.appendChild(label);

    const sorted = [...docs].sort((a, b) => a.name.localeCompare(b.name));
    for (const doc of sorted) {
      const row = document.createElement("div");
      row.className = "code-tree-row dm-tree-file-row";
      row.title = doc.name;

      const spacer = document.createElement("span");
      spacer.className = "code-tree-spacer";
      row.appendChild(spacer);

      const icon = document.createElement("span");
      icon.className = "code-tree-icon";
      icon.innerHTML = IC().file;
      row.appendChild(icon);

      const label2 = document.createElement("span");
      label2.className = "code-tree-label";
      label2.textContent = doc.name;
      row.appendChild(label2);

      row.addEventListener("click", () => addDepEdge(doc.name));
      container.appendChild(row);
    }
  }

  function renderDepsManager() {
    const shadow = _deps.getShadow?.();
    if (!shadow || !_dmDoc) return;
    const titleEl = shadow.getElementById("dmTitle");
    const pathEl = shadow.getElementById("dmPath");
    const body = shadow.getElementById("dmBody");
    if (!body) return;
    titleEl.textContent = _dmDoc.name.split("/").pop();
    pathEl.textContent = _dmDoc.name;
    body.innerHTML = "";

    const graph = effectiveGraph();
    const path = _dmDoc.name;
    const effectiveDeps = graph[path] || [];
    const raw = rawGraph()[path] || [];
    const ov = (_project.depGraphOverrides &&
      _project.depGraphOverrides[path]) || { added: [], removed: [] };
    const loadIgnores = getLoadIgnores(path);
    // Every row worth showing: automatically-detected edges (raw, whether
    // currently on or manually turned off) plus manually-added edges. A
    // manually-added edge that gets turned off has no "automatic" origin to
    // remember, so it's simply absent from this union once removed — see
    // removeDepEdge's comment for why that's the correct behavior, per the
    // user's explicit distinction between the two kinds of edge.
    const allDeps = Array.from(new Set([...raw, ...ov.added]));

    const outHeader = document.createElement("div");
    outHeader.className = "dm-section-label";
    outHeader.textContent =
      "קבצים שהקובץ הזה תלוי בהם ישירות — סמן/בטל סימון כדי לכלול או להתעלם";
    outHeader.title =
      'רשימה זו כוללת תלויות ישירות בלבד. המספר בתפריט "תלויות" (ליד כל קובץ בעץ) גדול יותר בכוונה — הוא כולל גם תלויות של תלויות (עקיפות)';
    body.appendChild(outHeader);

    const outList = document.createElement("div");
    outList.className = "dm-dep-list";
    if (!allDeps.length) outList.appendChild(dmEmptyRow("אין תלויות"));
    for (const dep of allDeps) {
      const included = effectiveDeps.includes(dep);
      const row = document.createElement("div");
      row.className = "dm-dep-row" + (included ? "" : " dm-dep-excluded");
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.className = "dm-dep-checkbox";
      checkbox.checked = included;
      checkbox.title = included
        ? "הסר תלות"
        : "כלול תלות שהוסרה (זוהתה אוטומטית בסריקה)";
      checkbox.setAttribute("aria-label", checkbox.title);
      checkbox.addEventListener("change", () => {
        if (checkbox.checked) addDepEdge(dep);
        else removeDepEdge(dep);
      });
      const label = document.createElement("span");
      label.className = "dm-dep-name";
      label.textContent = dep;
      row.appendChild(checkbox);
      row.appendChild(label);
      // Tags the edge's origin so a greyed-out excluded row (which could be
      // either kind) and an included row both make clear whether unchecking
      // it will keep it around (automatic) or delete it for good (manual) —
      // per the user's request to make that distinction visible, not just
      // behavioral.
      if (raw.includes(dep)) {
        const tag = document.createElement("span");
        tag.className = "dm-dep-tag";
        tag.textContent = "אוטומטי";
        tag.title = "זוהה אוטומטית בסריקה";
        row.appendChild(tag);
      }
      outList.appendChild(row);
    }
    body.appendChild(outList);

    const indirectHeader = document.createElement("div");
    indirectHeader.className = "dm-section-label";
    indirectHeader.textContent = "קבצים שנטענים בעקיפין — תלות של תלות";
    indirectHeader.title =
      "מחושב אוטומטית מהתלויות הישירות הפעילות למעלה. אפשר לבטל סימון כדי להתעלם מהקובץ הזה רק כשהקובץ הנוכחי הוא שורש הטעינה; אם קובץ אחר יטען אותו ישירות, ההחרגה הזו לא תחול עליו.";
    body.appendChild(indirectHeader);

    const indirectMap = computeIndirectDeps(graph, path, effectiveDeps);
    const indirectList = document.createElement("div");
    indirectList.className = "dm-dep-list";
    if (!indirectMap.size) {
      indirectList.appendChild(dmEmptyRow("אין תלויות עקיפות"));
    } else {
      const sorted = Array.from(indirectMap.entries()).sort((a, b) =>
        a[0].localeCompare(b[0]),
      );
      for (const [file, origins] of sorted) {
        const row = document.createElement("div");
        const ignored = loadIgnores.has(file);
        row.className =
          "dm-dep-row dm-dep-indirect" + (ignored ? " dm-dep-excluded" : "");
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.className = "dm-dep-checkbox";
        checkbox.checked = !ignored;
        checkbox.title = ignored
          ? "כלול שוב בטעינה של הקובץ הזה בלבד"
          : "התעלם מהתלות הזו רק בטעינה של הקובץ הזה";
        checkbox.setAttribute("aria-label", checkbox.title);
        checkbox.addEventListener("change", () => {
          const next = new Set(loadIgnores);
          if (checkbox.checked) next.delete(file);
          else next.add(file);
          void setLoadIgnores(path, Array.from(next)).then(() =>
            renderDepsManager(),
          );
        });
        const label = document.createElement("span");
        label.className = "dm-dep-name";
        label.textContent = file;
        const reason = document.createElement("span");
        reason.className = "dm-dep-reason";
        const originNames = Array.from(origins).map((o) => o.split("/").pop());
        reason.textContent = `עקיף · דרך ${originNames.join(", ")}`;
        if (ignored)
          row.title = "הקובץ הזה מוחרג רק כשהקובץ הנוכחי נטען ישירות";
        row.appendChild(checkbox);
        row.appendChild(label);
        row.appendChild(reason);
        indirectList.appendChild(row);
      }
    }
    body.appendChild(indirectList);

    const addWrap = document.createElement("div");
    addWrap.className = "dm-add-wrap";
    const input = document.createElement("input");
    input.type = "text";
    input.className = "code-tree-search-input";
    input.placeholder = "הוסף תלות — חפש, או עיין במפת הקבצים למטה...";
    input.value = _dmAddQuery;

    const treeContainer = document.createElement("div");
    treeContainer.className = "dm-add-tree";

    // Rebuilds ONLY the file map (not the whole body) — folder expand/
    // collapse and re-adding after a click both go through this, so typing
    // in the search box above never loses focus/caret position, matching
    // the main inline tree's own search behavior.
    //
    // Manually-added files are excluded from the folder tree entirely and
    // rendered as their own flat "קבצים חיצוניים" section below it — same
    // split as the main inline tree (render()/renderManualFilesSection).
    // Without this, a manual file (a root-level leaf, no "/" in its name)
    // sorted alphabetically after every scanned top-level folder and could
    // sit below the picker's scroll cap with no visual marker, effectively
    // invisible while browsing (only surfaced by typing a matching search).
    function refreshAddTree() {
      treeContainer.innerHTML = "";
      const q = _dmAddQuery.trim().toLowerCase();
      const allCandidates = codeDocs().filter(
        (d) => d.name !== path && !allDeps.includes(d.name),
      );
      const scanned = allCandidates.filter((d) => !d.isManuallyAdded);
      const manual = allCandidates.filter((d) => d.isManuallyAdded);
      const filteredScanned = q
        ? scanned.filter((d) => matchesQuery(d.name, q))
        : scanned;
      const filteredManual = q
        ? manual.filter((d) => matchesQuery(d.name, q))
        : manual;

      if (!filteredScanned.length && !filteredManual.length) {
        treeContainer.appendChild(
          dmEmptyRow(q ? "אין קבצים תואמים" : "כל הקבצים כבר מופיעים כתלות"),
        );
        return;
      }

      if (filteredScanned.length) {
        const tree = buildTree(filteredScanned.map((d) => ({ name: d.name })));
        dmRenderTreeNode(
          tree,
          treeContainer,
          0,
          !!q,
          (p) => addDepEdge(p),
          refreshAddTree,
        );
      }
      if (filteredManual.length)
        renderAddTreeManualSection(filteredManual, treeContainer);
    }

    input.addEventListener("input", () => {
      _dmAddQuery = input.value || "";
      refreshAddTree();
    });

    addWrap.appendChild(input);
    addWrap.appendChild(treeContainer);
    body.appendChild(addWrap);
    refreshAddTree();

    const inHeader = document.createElement("div");
    inHeader.className = "dm-section-label";
    inHeader.textContent =
      "קבצים שתלויים בקובץ הזה — מחושב אוטומטית מהתלויות של הקבצים האחרים, לכן לא ניתן לערוך כאן; כדי להוסיף/להסיר קישור יש לפתוח את מסך ניהול התלויות של אותו קובץ אחר";
    body.appendChild(inHeader);

    const dependents = Array.from(
      window.__ccbDepGraph.getDirectDependents(graph, path),
    );
    const inList = document.createElement("div");
    inList.className = "dm-dep-list";
    if (!dependents.length) inList.appendChild(dmEmptyRow("אין תלויים"));
    for (const dep of dependents) {
      const row = document.createElement("div");
      row.className = "dm-dep-row dm-dep-readonly";
      row.textContent = dep;
      inList.appendChild(row);
    }
    body.appendChild(inList);
  }

  // A manual edit is stored relative to the RAW scanned graph, not the
  // effective one: removing an edge that only exists via an earlier "added"
  // override just un-adds it (vanishes for good — nothing automatic to
  // remember); removing a real scanned edge records it in "removed" instead
  // of deleting it, so it stays visible in the manager (greyed out, checkbox
  // unchecked) for the user to bring back later rather than disappearing.
  // Symmetric for adding — so re-adding a scanned edge the user had removed
  // just clears the removal instead of double-recording it.
  async function removeDepEdge(target) {
    const path = _dmDoc.name;
    const raw = rawGraph()[path] || [];
    const ov = (_project.depGraphOverrides &&
      _project.depGraphOverrides[path]) || { added: [], removed: [] };
    if (raw.includes(target)) {
      if (!ov.removed.includes(target)) ov.removed = [...ov.removed, target];
    } else {
      ov.added = ov.added.filter((p) => p !== target);
    }
    await _deps.historyView.setFileDependencyOverride(_project.id, path, ov);
    renderDepsManager();
  }

  async function addDepEdge(target) {
    const path = _dmDoc.name;
    if (!target || target === path) return;
    const raw = rawGraph()[path] || [];
    const ov = (_project.depGraphOverrides &&
      _project.depGraphOverrides[path]) || { added: [], removed: [] };
    if (raw.includes(target)) {
      ov.removed = ov.removed.filter((p) => p !== target);
    } else if (!ov.added.includes(target)) {
      ov.added = [...ov.added, target];
    }
    await _deps.historyView.setFileDependencyOverride(_project.id, path, ov);
    renderDepsManager();
  }

  async function openDepsManager(doc) {
    if (!_project || !doc) return;
    await ensureDepGraph();
    _dmDoc = doc;
    _dmAddQuery = "";
    _dmExpandedPaths = new Set();
    closeFilePreview();
    closeDepPicker();
    window.__ccbModals?.closeOnboarding?.();
    const shadow = _deps.getShadow?.();
    if (!shadow) return;
    const view = shadow.getElementById("depManagerView");
    view?.classList.add("cv-open");
    view?.setAttribute("aria-hidden", "false");
    renderDepsManager();
  }

  function closeDepsManager() {
    _dmDoc = null;
    const shadow = _deps.getShadow?.();
    if (!shadow) return;
    const view = shadow.getElementById("depManagerView");
    view?.classList.remove("cv-open");
    view?.setAttribute("aria-hidden", "true");
  }

  // ============================================================
  // "התאמה אישית" (custom) dependency-load picker — a full-pane checkbox
  // list of ONE file's own dependency candidates (opened from that file's
  // "אפשרויות תלויות" menu, "openDepsMenu" above), so the user can choose
  // exactly which of them to load this one time instead of the all-or-
  // nothing behavior of "תלויות ישירות בלבד"/"תלויות (כולל עקיפות)".
  //
  // Candidates are exactly what that file's own "ניהול תלויות" (dependency
  // manager) screen already shows — direct deps (auto-detected + manually-
  // declared, via effectiveGraph()) and indirect deps (computeIndirectDeps)
  // — NOT a browse-the-whole-project picker (that was the first version of
  // this feature, rejected by the user as redundant with the inline tree:
  // "מה זה שונה מסתם בחירה בעץ הקבצים??"). Dependents are deliberately
  // excluded — the user's ask was specifically about dependencies, and
  // dependents already have their own separate "תלויים" menu item. Nothing
  // here mutates project.depGraph/depGraphOverrides/depLoadIgnores — this is
  // a load-selection tool, not the dependency editor. Checkboxes start
  // pre-checked (per the user's explicit choice) so the picker reads as
  // "here's everything the other buttons would load — narrow it down" —
  // except an indirect file already on this path's root-only ignore list
  // starts unchecked, honoring that prior decision as the sensible default
  // while still letting the user override it for this one load. Save is
  // additive only (enableFilesForProject's default), identical to the other
  // 4 menu options — nothing here ever turns a file OFF, and the picked set
  // itself is never persisted as a reusable preset.
  // ============================================================
  let _dpDoc = null;

  // The two candidate lists, computed fresh each time the picker opens —
  // same source data as renderDepsManager's own direct/indirect sections,
  // reusing effectiveGraph()/computeIndirectDeps() rather than duplicating
  // that logic, so the two screens can never silently disagree about what
  // counts as a dependency of this file.
  function dpComputeCandidates(doc) {
    const graph = effectiveGraph();
    const path = doc.name;
    // Only currently-ACTIVE direct edges (post-override) — a dep the user
    // explicitly turned off in the manager is not offered here; "selected
    // automatically or manually" means currently counted as a dependency,
    // not everything ever detected.
    const effectiveDeps = graph[path] || [];
    const raw = rawGraph()[path] || [];
    const direct = effectiveDeps.map((dep) => ({
      path: dep,
      auto: raw.includes(dep),
    }));
    const indirectMap = computeIndirectDeps(graph, path, effectiveDeps);
    const indirect = Array.from(indirectMap.entries())
      .map(([file, origins]) => ({ path: file, origins }))
      .sort((a, b) => a.path.localeCompare(b.path));
    return { direct, indirect };
  }

  function dpRenderRow(candidatePath, tagEl) {
    const row = document.createElement("div");
    row.className = "dm-dep-row";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "dm-dep-checkbox";
    checkbox.checked = _dpPicked.has(candidatePath);
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) _dpPicked.add(candidatePath);
      else _dpPicked.delete(candidatePath);
      renderDepPicker();
    });
    row.appendChild(checkbox);

    const label = document.createElement("span");
    label.className = "dm-dep-name";
    label.textContent = candidatePath;
    row.appendChild(label);

    if (tagEl) row.appendChild(tagEl);

    row.addEventListener("click", (e) => {
      if (e.target === checkbox) return;
      checkbox.checked = !checkbox.checked;
      checkbox.dispatchEvent(new Event("change"));
    });
    return row;
  }

  function renderDepPicker() {
    const shadow = _deps.getShadow?.();
    const body = shadow?.getElementById("dpBody");
    const saveBtn = shadow?.getElementById("dpSaveBtn");
    const saveLabel = shadow?.getElementById("dpSaveLabel");
    if (!body || !_project || !_dpDoc) return;
    body.innerHTML = "";

    const { direct, indirect } = dpComputeCandidates(_dpDoc);

    const directHeader = document.createElement("div");
    directHeader.className = "dm-section-label";
    directHeader.textContent = "תלויות ישירות (אוטומטיות וידניות) — בחר מה לטעון";
    body.appendChild(directHeader);
    const directList = document.createElement("div");
    directList.className = "dm-dep-list";
    if (!direct.length) directList.appendChild(dmEmptyRow("אין תלויות ישירות"));
    for (const { path, auto } of direct) {
      let tag = null;
      if (auto) {
        tag = document.createElement("span");
        tag.className = "dm-dep-tag";
        tag.textContent = "אוטומטי";
        tag.title = "זוהה אוטומטית בסריקה";
      }
      directList.appendChild(dpRenderRow(path, tag));
    }
    body.appendChild(directList);

    const indirectHeader = document.createElement("div");
    indirectHeader.className = "dm-section-label";
    indirectHeader.textContent = "תלויות עקיפות — תלות של תלות";
    body.appendChild(indirectHeader);
    const indirectList = document.createElement("div");
    indirectList.className = "dm-dep-list";
    if (!indirect.length) {
      indirectList.appendChild(dmEmptyRow("אין תלויות עקיפות"));
    }
    for (const { path, origins } of indirect) {
      const reason = document.createElement("span");
      reason.className = "dm-dep-reason";
      const originNames = Array.from(origins).map((o) => o.split("/").pop());
      reason.textContent = `עקיף · דרך ${originNames.join(", ")}`;
      indirectList.appendChild(dpRenderRow(path, reason));
    }
    body.appendChild(indirectList);

    if (!direct.length && !indirect.length) {
      body.innerHTML = "";
      body.appendChild(dmEmptyRow("לקובץ זה אין תלויות מזוהות"));
    }

    if (saveLabel) {
      saveLabel.textContent = `שמור (${_dpPicked.size + 1} כולל קובץ המקור)`;
    }
  }

  // Wired once ever (not per-render) — #dpSaveBtn is static markup outside
  // #dpBody (see ui-template.js), so re-wiring it on every render would
  // stack duplicate listeners.
  function wireDepPickerOnce() {
    if (_dpWired) return;
    _dpWired = true;
    const shadow = _deps.getShadow?.();
    if (!shadow) return;
    const saveBtn = shadow.getElementById("dpSaveBtn");
    saveBtn?.addEventListener("click", () => void saveDepPicker());
    const selectAllBtn = shadow.getElementById("dpSelectAll");
    selectAllBtn?.addEventListener("click", () => {
      if (!_dpDoc) return;
      // Explicit "select all" always means literally everything currently
      // shown — including an indirect file that started unchecked because
      // it's on this path's load-ignore list. That default is a suggestion,
      // not a limit on what this one click can select.
      const { direct, indirect } = dpComputeCandidates(_dpDoc);
      _dpPicked = new Set([
        ...direct.map((d) => d.path),
        ...indirect.map((d) => d.path),
      ]);
      renderDepPicker();
    });
    const selectNoneBtn = shadow.getElementById("dpSelectNone");
    selectNoneBtn?.addEventListener("click", () => {
      _dpPicked = new Set();
      renderDepPicker();
    });
  }

  async function saveDepPicker() {
    if (!_project || !_dpDoc) return;
    const paths = [_dpDoc.name, ...Array.from(_dpPicked)];
    const marked = await _deps.historyView.enableFilesForProject(_project.id, paths);
    closeDepPicker();
    _deps.setStatus?.(`${marked} קבצים נוספו לרשימת הטעינה ✓`);
  }

  async function openDepPicker(doc) {
    if (!_project || !doc) return;
    await ensureDepGraph();
    _dpDoc = doc;
    const { direct, indirect } = dpComputeCandidates(doc);
    const loadIgnores = getLoadIgnores(doc.name);
    _dpPicked = new Set(direct.map((d) => d.path));
    for (const { path } of indirect) {
      if (!loadIgnores.has(path)) _dpPicked.add(path);
    }
    closeFilePreview();
    closeDepsManager();
    window.__ccbModals?.closeOnboarding?.();
    const shadow = _deps.getShadow?.();
    if (!shadow) return;
    wireDepPickerOnce();
    const titleEl = shadow.getElementById("dpTitle");
    const pathEl = shadow.getElementById("dpPath");
    if (titleEl) titleEl.textContent = doc.name.split("/").pop();
    if (pathEl) pathEl.textContent = doc.name;
    const view = shadow.getElementById("depPickerView");
    view?.classList.add("cv-open");
    view?.setAttribute("aria-hidden", "false");
    renderDepPicker();
  }

  function closeDepPicker() {
    _dpDoc = null;
    const shadow = _deps.getShadow?.();
    if (!shadow) return;
    const view = shadow.getElementById("depPickerView");
    view?.classList.remove("cv-open");
    view?.setAttribute("aria-hidden", "true");
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
      // Seeded per-folder (not left empty, and not "every folder" either —
      // 2026-08-05) so a folder starts collapsed on first view UNLESS it
      // already holds at least one enabled file, in which case it starts
      // expanded — membership in this set means collapsed (see renderNode),
      // so an empty set used to mean "nothing collapsed", i.e. everything
      // expanded.
      _collapsedPaths = initiallyCollapsedFolderPaths(
        (project.documents || []).filter(
          (d) => d.type === "code" && !d.isManuallyAdded,
        ),
      );
      _searchCollapsedPaths = new Set();
      _favoritesCollapsed = false;
      // A2: the cached scanned graph belongs to the previous project.
      _rawGraph = null;
      _rawGraphProjectId = null;
    }
    _project = project;
    _mountEl = mount;
    buildShell();
    render();
    // Warm the graph cache in the background so the per-file deps menu opens
    // without a visible wait. Every consumer still awaits it for correctness —
    // this only removes the latency in the common case.
    if (project.isCodeProject) loadRawGraph();
  }

  // ============================================================
  // Public API
  // ============================================================
  window.__ccbCodeTree = {
    init(deps) {
      _deps = deps;
    },
    renderInline,
    closeFilePreview,
    openDocumentPreview: openPreview,
    closeDepsManager,
    closeDepPicker,
  };
})();
