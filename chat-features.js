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

  // Persist current conversation: update bound block, or create a new one
  // bound to this page-load. Returns true if anything was written.
  async function persistConversation(messages) {
    if (!messages || !messages.length) return false;
    await _deps.loadBlocks();
    const state = _deps.state;

    if (
      state.currentConversationId &&
      state.blocks[state.currentConversationId]
    ) {
      const block = state.blocks[state.currentConversationId];
      const prev = Array.isArray(block.messages) ? block.messages : [];
      if (
        prev.length === messages.length &&
        prev[prev.length - 1]?.text === messages[messages.length - 1]?.text
      ) {
        return false; // no change
      }
      block.messages = messages;
      block.messageCount = messages.length;
      block.updated = Date.now();
      await _deps.saveBlocks();
      return true;
    }

    const now = new Date();
    const autoTitle =
      "שיחה — " +
      now.toLocaleDateString("he-IL") +
      " " +
      now.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
    const currentProject = _deps.historyView.getProjectById(state.currentProjectId);
    const projectId = currentProject ? state.currentProjectId : null;
    const id = "b_" + Date.now() + "_conv";
    state.blocks[id] = {
      id,
      title: autoTitle,
      messages,
      kind: "conversation",
      projectId,
      updated: Date.now(),
      messageCount: messages.length,
      savedAt: Date.now(),
    };
    state.currentConversationId = id;
    await _deps.saveBlocks();
    return true;
  }

  // Manual "save chat" — does a full scroll-to-top capture (to pick up
  // lazy-loaded older messages) then persists.
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
    const wrote = await persistConversation(messages);
    _deps.setStatus(wrote ? "השיחה נשמרה ✓ (ניתן לשנות שם)" : "אין שינויים");
    _deps.render();
  }

  // Auto-save — light: no scroll, just capture what's currently in the DOM.
  // Trailing throttle: first change schedules a save in AUTO_SAVE_INTERVAL_MS;
  // additional changes during that window are coalesced (timer NOT reset).
  // After the save fires, the next change schedules a fresh save. This way
  // during long AI streams we persist every ~2.5s instead of waiting for the
  // stream to fully stop.
  let autoSaveTimer = null;
  const AUTO_SAVE_INTERVAL_MS = 2500;
  function scheduleAutoSave() {
    if (!inlineReady()) return;
    if (autoSaveTimer) return;
    autoSaveTimer = setTimeout(async () => {
      autoSaveTimer = null;
      try {
        const messages = captureConversation();
        if (!messages.length) return;
        const wrote = await persistConversation(messages);
        if (wrote) {
          console.debug("[ccb] auto-saved", messages.length, "msgs");
          _deps.render?.();
        }
      } catch (e) {
        console.error("[ccb] auto-save failed:", e);
      }
    }, AUTO_SAVE_INTERVAL_MS);
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

  let msgObserverContainer = null;
  let msgObserverRetryTimer = null;

  function startMsgObserver() {
    if (!inlineReady()) return;
    const sel = _deps.config.MSG_SELECTORS;
    const container = document.querySelector(sel.messageList);

    // If we already observe the same live container, nothing to do.
    if (msgObserver && msgObserverContainer === container && container) return;

    // Container changed (or appeared/disappeared) — tear down old observer first.
    if (msgObserver) {
      msgObserver.disconnect();
      msgObserver = null;
      msgObserverContainer = null;
    }

    if (!container) {
      // Container not in DOM yet — retry. Gemini renders the chat shell async,
      // so we keep polling until it appears.
      if (msgObserverRetryTimer) return;
      msgObserverRetryTimer = setTimeout(() => {
        msgObserverRetryTimer = null;
        startMsgObserver();
      }, 500);
      return;
    }

    msgObserverContainer = container;
    container.querySelectorAll(sel.message).forEach(decorateMessage);
    if (container.querySelector(sel.message)) scheduleAutoSave();

    msgObserver = new MutationObserver((muts) => {
      let sawChange = false;
      for (const m of muts) {
        if (m.type === "characterData") {
          sawChange = true;
          continue;
        }
        m.addedNodes.forEach((n) => {
          if (n.nodeType !== 1) return;
          if (n.matches?.(sel.message)) {
            decorateMessage(n);
            sawChange = true;
          }
          n.querySelectorAll?.(sel.message).forEach((node) => {
            decorateMessage(node);
            sawChange = true;
          });
        });
      }
      if (sawChange) scheduleAutoSave();
    });
    msgObserver.observe(container, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    console.debug("[ccb] msg observer attached to", sel.messageList);
  }

  function stopMsgObserver() {
    if (msgObserverRetryTimer) {
      clearTimeout(msgObserverRetryTimer);
      msgObserverRetryTimer = null;
    }
    msgObserver?.disconnect();
    msgObserver = null;
    msgObserverContainer = null;
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
