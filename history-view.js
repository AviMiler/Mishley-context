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
//   getProjects() / getProjectById(id) / getConversationProject(b)
//   buildHistoryMessages(b) / buildConversationInjectionText(messages, block, opts) / buildProjectSectionText(block)
//   formatTranscript(messages) / formatAge(ts) / dateGroup(ts) / extractSnippet(text, q, fromIndex)
//   saveProjectView()
//   addProject()

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
    return "## " + project.title + "\n" + (content || "") + "\n\n";
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
    const projectsSection = $el("projectsSection");
    const historySection = $el("historySection");
    const projectsBtn = $el("projectsCollapseBtn");
    const historyBtn = $el("historyCollapseBtn");

    if (projectsSection)
      projectsSection.classList.toggle("collapsed", state.projectsCollapsed);
    if (historySection)
      historySection.classList.toggle("collapsed", state.historyCollapsed);
    if (projectsBtn) {
      projectsBtn.classList.toggle("collapsed", state.projectsCollapsed);
      projectsBtn.title = state.projectsCollapsed ? "פתח פרויקטים" : "סגור פרויקטים";
      projectsBtn.setAttribute(
        "aria-label",
        state.projectsCollapsed ? "פתח פרויקטים" : "סגור פרויקטים",
      );
    }
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
    } = {},
  ) {
    const isActive = _deps.state.currentConversationId === b.id;
    const row = document.createElement("div");
    row.className =
      "hi-item" +
      (b.pinned ? " pinned" : "") +
      (kind === "message" ? " search-content" : "") +
      (isActive ? " active" : "");

    const head = document.createElement("div");
    head.className = "hi-head";

    if (isActive) {
      const activeDot = document.createElement("span");
      activeDot.className = "hi-active-dot";
      activeDot.title = "השיחה הפעילה";
      head.appendChild(activeDot);
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

    row.addEventListener("click", () =>
      openConversationView(b, { openedFromProject }),
    );

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

  // ============================================================
  // Project view
  // ============================================================
  function updateHistoryLayoutForProjectView() {
    const inProject = !!getProjectById(_deps.state.currentProjectId);
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
    updateHistoryLayoutForProjectView();

    const view = $el("projectView");
    if (!view) return;
    if (!project) {
      _deps.state.currentProjectId = null;
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
      if (projectCheckbox) projectCheckbox.checked = !!openedFromProject;
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
        msg: 'למחוק את "' + project.title + '"? השיחות לא יימחקו, רק השיוך.',
        confirmLabel: "מחק",
        danger: true,
      });
      if (!ok) return;
      await _deps.loadBlocks();
      delete _deps.state.blocks[project.id];
      for (const b of Object.values(_deps.state.blocks)) {
        if (b.kind === "conversation" && b.projectId === project.id) {
          delete b.projectId;
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
  };
})();
