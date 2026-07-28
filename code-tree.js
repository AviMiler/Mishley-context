// code-tree.js — interactive file tree for picking specific files out of a
// scanned code project (structure + selected files, as opposed to "load all").
// Renders INLINE into the project detail view's documents section (no modal),
// so the original tree structure and the dependency-linking option live
// together at the bottom of the open project. See CLAUDE.md.
// Exposes: window.__ccbCodeTree
//
// Public API:
//   init(deps)                  — { docHandler, getShadow, historyView, setStatus,
//                                    render, getCtxWindow }
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

        const previewBtn = document.createElement("button");
        previewBtn.type = "button";
        previewBtn.className = "code-tree-preview-btn";
        previewBtn.innerHTML = IC().eye;
        previewBtn.title = "תצוגה מקדימה";
        previewBtn.setAttribute("aria-label", "תצוגה מקדימה");
        previewBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          void openPreview(child.doc);
        });

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

        // שני כפתורי הפעולה מקובצים יחד (לא כל אחד ישירות בשורה), כדי
        // שיוכלו להידחק זה לזה יותר מריווח ה-gap הרגיל של השורה, ולפנות
        // רוחב נוסף לטקסט השם — ראה .code-tree-file-actions ב-ui-styles.js.
        // שם מחלקה שונה בכוונה מ-.code-tree-actions הקיים (שורת "בחר
        // הכל"/"נקה הכל" מעל העץ) כדי לא להתנגש איתו.
        const fileActions = document.createElement("span");
        fileActions.className = "code-tree-file-actions";
        fileActions.appendChild(previewBtn);
        fileActions.appendChild(depsBtn);
        row.appendChild(fileActions);

        row.addEventListener("click", (e) => {
          if (e.target === checkbox || e.target === depsBtn || e.target === previewBtn) return;
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

  // Re-renders only the tree body (folders/files) from the current _project +
  // _query, leaving the shell (search/actions) in place.
  function render() {
    if (!_bodyEl || !_project) return;
    _bodyEl.innerHTML = "";

    const docs = (_project.documents || []).filter((d) => d.type === "code");
    const q = _query.trim().toLowerCase();
    const filtered = q ? docs.filter((d) => matchesQuery(d.name, q)) : docs;

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

  // תצוגה מקדימה של קובץ — קריאה בלבד, נפתחת על כל שטח הצ'אט (כמו תצוגת
  // שיחה היסטורית ב-history-view.js#openConversationView) ולא כדיאלוג קטן,
  // כדי לתת מקום אמיתי לקרוא קובץ שלם לפני החלטה אם לכלול אותו.
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

  async function openPreview(doc) {
    if (!doc) return;
    const shadow = _deps.getShadow?.();
    if (!shadow) return;
    try {
      const map = await _deps.docHandler.getCodeContents([doc.id]);
      const content = map.get(doc.id);
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
        groups.push({ dir: "rtl", pieces: ["מוצגים", fmt(FP_MAX_CHARS), "תווים ראשונים"] });
      }
      renderMetaLine(shadow.getElementById("fpMeta"), groups);

      // This view, the conversation preview, and the dependency manager are
      // all full-pane takeovers of the same area — closing the others before
      // opening this one avoids two fixed, same-z-index panels being open
      // together.
      _deps.historyView?.closeConversationView?.();
      closeDepsManager();
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
  // in one bulk save. `mode` picks the direction:
  //   "dependencies" — transitive closure of what this file imports (no
  //     depth limit, cycle-safe).
  //   "dependents"   — files that directly import this one (one hop only;
  //     transitive dependents of a low-level file would often pull in most
  //     of the project).
  //   "full"         — both: closure of dependencies plus direct dependents.
  // Bookmarks scanned before this feature existed have no depGraph yet —
  // build it now instead of silently behaving like a no-op. rescanCodeProject
  // reloads `blocks` from storage, which replaces the project object in
  // memory, so `_project` must be re-fetched afterward or it'd point at an
  // orphaned copy that never receives the new depGraph.
  async function ensureDepGraph() {
    if (_project.depGraph) return;
    _deps.setStatus?.("בונה גרף תלויות...");
    await _deps.historyView.rescanCodeProject(_project.id);
    const refreshed = _deps.historyView.getProjectById(_project.id);
    if (refreshed) _project = refreshed;
  }

  // The graph with any manual per-file edits (dependency manager, below)
  // applied on top — every reader of the graph (this menu's counts, "load
  // with dependencies", the manager itself) must go through this, not
  // _project.depGraph directly, or a user's manual edit would silently not
  // show up outside the screen that made it.
  function effectiveGraph() {
    return window.__ccbDepGraph.applyOverrides(_project.depGraph || {}, _project.depGraphOverrides);
  }

  async function loadWithDependencies(doc, mode = "dependencies") {
    if (!_project || !doc) return;
    await ensureDepGraph();

    const graph = effectiveGraph();
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

    // הספירה מוצגת כאן — בתפריט הפעולה עצמו, לא כתג על שורת העץ — כי כאן
    // המשתמש בפועל מחליט מה להזריק, ולא רק סוקר את העץ. ללא גרף (טרם
    // נסרק) לא מציגים מספר בדוי; loadWithDependencies כבר יודע לסרוק
    // מחדש בעצמו במקרה הזה.
    const graph = _project.depGraph ? effectiveGraph() : null;
    const countLabel = (n) => (graph ? ` (${n})` : "");
    const dg = window.__ccbDepGraph;
    const depsCount = graph ? dg.getTransitiveClosure(graph, doc.name).size - 1 : 0;
    const dependentsCount = graph ? dg.getDirectDependents(graph, doc.name).size : 0;
    const fullCount = graph ? dg.getFullContext(graph, doc.name).size - 1 : 0;

    const mkItem = (icon, label, onClick, tooltip) => {
      const item = document.createElement("div");
      item.className = "hd-item";
      item.innerHTML = `${icon} ${label}`;
      if (tooltip) item.title = tooltip;
      item.addEventListener("click", onClick);
      return item;
    };

    // These counts are the TRANSITIVE closure (dependencies of dependencies,
    // arbitrarily deep) — by design, since clicking the item loads that whole
    // chain into the chat. This is deliberately larger than "ניהול תלויות"'s
    // own list below, which only ever shows this file's DIRECT edges (a
    // dependency of a dependency isn't something this file itself depends
    // on). Tooltips spell this out — reported as confusing when the two
    // numbers didn't match ("3 outside, 2 direct inside").
    dd.innerHTML = "";
    dd.appendChild(mkItem(ic.link, `תלויות${countLabel(depsCount)}`, () => { closeDepsMenu(); loadWithDependencies(doc, "dependencies"); }, "טוען את כל שרשרת התלויות של הקובץ — כולל תלויות של תלויות, לא רק ישירות"));
    dd.appendChild(mkItem(ic.download, `תלויים${countLabel(dependentsCount)}`, () => { closeDepsMenu(); loadWithDependencies(doc, "dependents"); }, "קבצים שתלויים ישירות בקובץ הזה"));
    dd.appendChild(mkItem(ic.context, `הקשר מלא${countLabel(fullCount)}`, () => { closeDepsMenu(); loadWithDependencies(doc, "full"); }, "כל שרשרת התלויות (כולל עקיפות) יחד עם התלויים הישירים"));
    const sep = document.createElement("div");
    sep.className = "hd-sep";
    dd.appendChild(sep);
    dd.appendChild(mkItem(ic.pencil, "ניהול תלויות", () => { closeDepsMenu(); openDepsManager(doc); }));

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
  // Dependency manager — per-file editor for a single file's dependency
  // edges. Opened from that file's own "אפשרויות תלויות" menu above
  // ("ניהול תלויות"), full-pane like the file preview view (#depManagerView,
  // same cv-shell takeover pattern). Outgoing dependencies are editable
  // (remove an existing edge, add a new one via a filtered picker over the
  // project's own code files); incoming dependents are read-only — they're
  // derived from other files' outgoing edges, so editing them only makes
  // sense at the source file. Edits persist via
  // historyView.setFileDependencyOverride to project.depGraphOverrides,
  // which rescanCodeProject never touches, so a manual choice here survives
  // (and keeps overriding the scanned default after) every future rescan.
  // ============================================================
  let _dmDoc = null;
  // File-map picker state (add-dependency section) — reset per file opened
  // (openDepsManager), so every file's manager starts with the map collapsed
  // and the search box empty, matching the main tree's per-project reset.
  let _dmAddQuery = "";
  let _dmExpandedPaths = new Set();

  function codeDocPaths() {
    return (_project.documents || []).filter((d) => d.type === "code").map((d) => d.name);
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

  // Recursive renderer for the add-dependency file map (candidates only —
  // the current file and everything already listed as a dependency, whether
  // active or manually turned off, are excluded upstream in dmBuildAddTree).
  // Deliberately its own tree walker rather than reusing the main
  // renderNode(): that one is wired to doc.enabled checkboxes and bulk
  // folder-enable, neither of which applies here — a click on a file row
  // just adds one edge.
  function dmRenderTreeNode(node, container, depth, forceExpand, onFileClick, onToggle) {
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
          if (_dmExpandedPaths.has(child.path)) _dmExpandedPaths.delete(child.path);
          else _dmExpandedPaths.add(child.path);
          onToggle();
        });
        container.appendChild(row);

        const childrenWrap = document.createElement("div");
        childrenWrap.className = "code-tree-children" + (expanded ? "" : " collapsed");
        container.appendChild(childrenWrap);
        dmRenderTreeNode(child, childrenWrap, depth + 1, forceExpand, onFileClick, onToggle);
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
    const raw = (_project.depGraph || {})[path] || [];
    const ov = (_project.depGraphOverrides && _project.depGraphOverrides[path]) || { added: [], removed: [] };
    // Every row worth showing: automatically-detected edges (raw, whether
    // currently on or manually turned off) plus manually-added edges. A
    // manually-added edge that gets turned off has no "automatic" origin to
    // remember, so it's simply absent from this union once removed — see
    // removeDepEdge's comment for why that's the correct behavior, per the
    // user's explicit distinction between the two kinds of edge.
    const allDeps = Array.from(new Set([...raw, ...ov.added]));

    const outHeader = document.createElement("div");
    outHeader.className = "dm-section-label";
    outHeader.textContent = "קבצים שהקובץ הזה תלוי בהם ישירות — סמן/בטל סימון כדי לכלול או להתעלם";
    outHeader.title = "רשימה זו כוללת תלויות ישירות בלבד. המספר בתפריט \"תלויות\" (ליד כל קובץ בעץ) גדול יותר בכוונה — הוא כולל גם תלויות של תלויות (עקיפות)";
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
      checkbox.title = included ? "הסר תלות" : "כלול תלות שהוסרה (זוהתה אוטומטית בסריקה)";
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
    indirectHeader.title = "מחושב אוטומטית מהתלויות הישירות הפעילות למעלה; לא ניתן לערוך כאן. אם תבטל סימון לתלות ישירה, כל קובץ שהגיע רק דרכה ייעלם מהרשימה הזו";
    body.appendChild(indirectHeader);

    const indirectMap = computeIndirectDeps(graph, path, effectiveDeps);
    const indirectList = document.createElement("div");
    indirectList.className = "dm-dep-list";
    if (!indirectMap.size) {
      indirectList.appendChild(dmEmptyRow("אין תלויות עקיפות"));
    } else {
      const sorted = Array.from(indirectMap.entries()).sort((a, b) => a[0].localeCompare(b[0]));
      for (const [file, origins] of sorted) {
        const row = document.createElement("div");
        row.className = "dm-dep-row dm-dep-readonly dm-dep-indirect";
        const label = document.createElement("span");
        label.className = "dm-dep-name";
        label.textContent = file;
        const reason = document.createElement("span");
        reason.className = "dm-dep-reason";
        const originNames = Array.from(origins).map((o) => o.split("/").pop());
        reason.textContent = `עקיף · דרך ${originNames.join(", ")}`;
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
    function refreshAddTree() {
      treeContainer.innerHTML = "";
      const q = _dmAddQuery.trim().toLowerCase();
      const candidates = codeDocPaths().filter((n) => n !== path && !allDeps.includes(n));
      const filtered = q ? candidates.filter((n) => matchesQuery(n, q)) : candidates;
      if (!filtered.length) {
        treeContainer.appendChild(dmEmptyRow(q ? "אין קבצים תואמים" : "כל הקבצים כבר מופיעים כתלות"));
        return;
      }
      const tree = buildTree(filtered.map((n) => ({ name: n })));
      dmRenderTreeNode(tree, treeContainer, 0, !!q, (p) => addDepEdge(p), refreshAddTree);
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

    const dependents = Array.from(window.__ccbDepGraph.getDirectDependents(graph, path));
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
    const raw = (_project.depGraph || {})[path] || [];
    const ov = (_project.depGraphOverrides && _project.depGraphOverrides[path]) || { added: [], removed: [] };
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
    const raw = (_project.depGraph || {})[path] || [];
    const ov = (_project.depGraphOverrides && _project.depGraphOverrides[path]) || { added: [], removed: [] };
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
    _deps.historyView?.closeConversationView?.();
    closeFilePreview();
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
    closeFilePreview,
    closeDepsManager,
  };
})();
