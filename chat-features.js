// chat-features.js — General Memory, conversation capture/save, manual injection, inline save button.
// Exposes: window.__ccbChat
//
// Public API (after init):
//   getGM() / renderGeneralMemory()
//   tryAutoInject()
//   injectSelected()
//   saveChat()
//   inlineReady() / startMsgObserver() / stopMsgObserver()

(() => {
  if (window.__ccbChatInstalled) return;
  window.__ccbChatInstalled = true;

  let _deps = null;
  const $el = (id) => _deps?.getShadow?.()?.getElementById(id);

  // ============================================================
  // General Memory
  // ============================================================
  function getGM() {
    const GM_ID = _deps.config.GM_ID;
    return (
      _deps.state.blocks[GM_ID] || {
        id: GM_ID,
        kind: "general_memory",
        title: "זיכרון כללי",
        content: "",
        autoLoad: false,
      }
    );
  }

  function renderGeneralMemory() {
    const card = $el("gmCard");
    if (!card) return;
    const GM_ID = _deps.config.GM_ID;
    const gm = getGM();
    const on = !!gm.autoLoad;
    const content = (gm.content || "").trim();
    const selectedForInject = _deps.state.selected.has(GM_ID);

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
      if (selectInput.checked) _deps.state.selected.add(GM_ID);
      else _deps.state.selected.delete(GM_ID);
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
    const toggleInput = document.createElement("input");
    toggleInput.type = "checkbox";
    toggleInput.checked = on;
    toggleInput.addEventListener("change", async () => {
      await _deps.loadBlocks();
      const g = getGM();
      g.autoLoad = toggleInput.checked;
      g.kind = "general_memory";
      g.id = GM_ID;
      if (!g.title) g.title = "זיכרון כללי";
      _deps.state.blocks[GM_ID] = g;
      await _deps.saveBlocks();
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
      _deps.openEdit(GM_ID, { title: "זיכרון כללי", content, tags: "" }),
    );

    header.appendChild(selectLabel);
    header.appendChild(toggleLabel);
    header.appendChild(title);
    header.appendChild(editBtn);
    wrap.appendChild(header);

    if (on) wrap.appendChild(badge);

    card.appendChild(wrap);
  }

  // ============================================================
  // GM auto-inject at conversation start
  // ============================================================
  async function tryAutoInject() {
    const gm = getGM();
    if (_deps.state.gmAutoInjected) return;
    if (!gm.autoLoad || !(gm.content || "").trim()) return;
    const MSG_SELECTORS = _deps.config.MSG_SELECTORS;
    let tries = 0;
    const poll = setInterval(() => {
      tries++;
      if (tries > 100) {
        clearInterval(poll);
        return;
      }
      const el = _deps.inject.findInput();
      if (!el) return;

      try {
        if (MSG_SELECTORS?.message) {
          const msgCount = document.querySelectorAll(MSG_SELECTORS.message).length;
          if (msgCount > 0) {
            clearInterval(poll);
            return;
          }
        }
      } catch {
        // ignore
      }
      clearInterval(poll);
      _deps.state.gmAutoInjected = true;
      const f = _deps.framing;
      _deps.inject.injectIntoInput(f.gmPre + gm.content + f.gmPost, "prepend");
      setTimeout(() => {
        const btn = document.querySelector(_deps.config.SEND_BUTTON_SELECTOR);
        if (btn) btn.click();
      }, 100);
    }, 100);
  }

  // ============================================================
  // Manual injection of selected context blocks
  // ============================================================
  function injectSelected() {
    const state = _deps.state;
    if (state.selected.size === 0) {
      _deps.setStatus("בחר בלוקים תחילה", true);
      return;
    }
    const GM_ID = _deps.config.GM_ID;
    const orderedIds = state.selected.has(GM_ID)
      ? [GM_ID, ...[...state.selected].filter((id) => id !== GM_ID)]
      : [...state.selected];
    const ordered = orderedIds
      .map((id) => (id === GM_ID ? state.blocks[id] || getGM() : state.blocks[id]))
      .filter(Boolean);

    const isGmOnly = ordered.length === 1 && ordered[0]?.id === GM_ID;
    const f = _deps.framing;
    const blocksBody = ordered
      .map((b) => "## " + (b.title || (b.id === GM_ID ? "זיכרון כללי" : "")) + "\n" + b.content)
      .join("\n\n");
    const text = isGmOnly
      ? f.gmPre + blocksBody + f.gmPost
      : f.manualPre + blocksBody + "\n\n---\n\n" + f.manualPost;
    const r = _deps.inject.injectIntoInput(text, "prepend");
    if (r.ok) {
      _deps.setStatus("הוזרק ✓");
      setTimeout(() => {
        const btn = document.querySelector(_deps.config.SEND_BUTTON_SELECTOR);
        if (btn) btn.click();
        else _deps.setStatus("לא נמצא כפתור שליחה", true);
      }, 100);
    } else {
      _deps.setStatus(r.error || "נכשל", true);
    }
  }

  // ============================================================
  // Conversation capture + save chat
  // ============================================================
  function findScrollableAncestor() {
    const MSG_SELECTORS = _deps.config.MSG_SELECTORS;
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
    const MSG_SELECTORS = _deps.config.MSG_SELECTORS;
    const container = document.querySelector(MSG_SELECTORS.messageList);
    if (!container) return [];
    const nodes = container.querySelectorAll(MSG_SELECTORS.message);
    const messages = [];
    for (const n of nodes) {
      const text = MSG_SELECTORS.messageText(n) || "";
      if (!text.trim()) continue;
      if (text.includes("[[CCB:INJECTED]]")) continue;
      let role = "user";
      if (MSG_SELECTORS.aiMessageMatch && MSG_SELECTORS.aiMessageMatch(n)) {
        role = "ai";
      } else if (MSG_SELECTORS.userMessageMatch && MSG_SELECTORS.userMessageMatch(n)) {
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
    const block = _deps.state.blocks[id];
    if (!block) return false;
    block.messages = messages;
    block.updated = Date.now();
    return true;
  }

  async function scrollAndCaptureAll() {
    const MSG_SELECTORS = _deps.config.MSG_SELECTORS;
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
      const r = _deps.inject.injectIntoInput(_deps.framing.summaryPrompt, "replace");
      if (r.ok) {
        setTimeout(() => {
          const btn = document.querySelector(_deps.config.SEND_BUTTON_SELECTOR);
          if (btn) btn.click();
          else _deps.setStatus("לא נמצא כפתור שליחה", true);
        }, 100);
      } else {
        _deps.setStatus(r.error || "נכשל", true);
      }
      return;
    }

    _deps.setStatus("גולל לתחילה…");
    await scrollAndCaptureAll();
    const messages = captureConversation();
    if (!messages.length) {
      _deps.setStatus("לא נמצאו הודעות — ודא MSG_SELECTORS", true);
      return;
    }

    await _deps.loadBlocks();

    const state = _deps.state;
    if (state.lastInjectedConversationId && state.blocks[state.lastInjectedConversationId]) {
      const block = state.blocks[state.lastInjectedConversationId];
      const existing = Array.isArray(block.messages) ? block.messages : [];
      const merged = appendConversationMessages(existing, messages);
      upsertConversationMessages(state.lastInjectedConversationId, merged);
      await _deps.saveBlocks();
      _deps.setStatus("השיחה עודכנה ✓");
      _deps.render();
      return;
    }

    const now = new Date();
    const defaultTitle =
      "שיחה — " +
      now.toLocaleDateString("he-IL") +
      " " +
      now.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
    const chosenTitle = await _deps.modals.showPrompt({
      title: "שם לשיחה",
      defaultValue: defaultTitle,
    });
    if (chosenTitle === null) {
      _deps.setStatus("");
      return;
    }

    const currentProject = _deps.historyView.getProjectById(state.currentProjectId);
    const projectId = currentProject ? state.currentProjectId : null;

    const id = "b_" + Date.now() + "_conv";
    state.blocks[id] = {
      id,
      title: chosenTitle,
      messages,
      kind: "conversation",
      projectId,
      updated: Date.now(),
    };
    state.lastInjectedConversationId = id;
    await _deps.saveBlocks();
    _deps.setStatus("השיחה נשמרה ✓");
    _deps.render();
  }

  // ============================================================
  // Inline save button (per AI message)
  // ============================================================
  const SAVE_BTN_FLAG = "__ccbSaveBtn";
  let msgObserver = null;

  function inlineReady() {
    const sel = _deps.config.MSG_SELECTORS;
    return (
      sel &&
      sel.messageList &&
      sel.message &&
      typeof sel.aiMessageMatch === "function" &&
      typeof sel.messageText === "function"
    );
  }

  function decorateMessage(node) {
    if (!node || node[SAVE_BTN_FLAG]) return;
    const sel = _deps.config.MSG_SELECTORS;
    if (!sel.aiMessageMatch(node)) return;
    node[SAVE_BTN_FLAG] = true;
    const btn = document.createElement("button");
    btn.textContent = "💾 שמור לבנק";
    btn.style.cssText =
      "all:revert;margin:4px;padding:2px 8px;font-size:12px;" +
      "border:1px solid #ccc;border-radius:4px;background:#fff;" +
      "cursor:pointer;font-family:system-ui,sans-serif;";
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      await _deps.loadBlocks();
      _deps.mountUI();
      await _deps.setPanelOpen(true);
      const text = sel.messageText(node) || "";
      _deps.openEdit(null, { content: text });
    });
    node.appendChild(btn);
  }

  function startMsgObserver() {
    if (!inlineReady() || msgObserver) return;
    const sel = _deps.config.MSG_SELECTORS;
    const container = document.querySelector(sel.messageList);
    if (!container) return;
    container.querySelectorAll(sel.message).forEach(decorateMessage);
    msgObserver = new MutationObserver((muts) => {
      for (const m of muts) {
        m.addedNodes.forEach((n) => {
          if (n.nodeType !== 1) return;
          if (n.matches?.(sel.message)) decorateMessage(n);
          n.querySelectorAll?.(sel.message).forEach(decorateMessage);
        });
      }
    });
    msgObserver.observe(container, { childList: true, subtree: true });
  }

  function stopMsgObserver() {
    msgObserver?.disconnect();
    msgObserver = null;
  }

  // ============================================================
  // Public API
  // ============================================================
  window.__ccbChat = {
    /**
     * @param {{
     *   getShadow: () => ShadowRoot,
     *   state: object,
     *   config: { GM_ID, SEND_BUTTON_SELECTOR, MSG_SELECTORS, ... },
     *   framing: object,
     *   inject: { findInput, injectIntoInput },
     *   modals: object,
     *   historyView: object,
     *   loadBlocks, saveBlocks, setStatus, render, updateInjectBtn,
     *   openEdit, mountUI, setPanelOpen,
     * }} deps
     */
    init(deps) { _deps = deps; },
    getGM,
    renderGeneralMemory,
    tryAutoInject,
    injectSelected,
    saveChat,
    inlineReady,
    startMsgObserver,
    stopMsgObserver,
  };
})();
