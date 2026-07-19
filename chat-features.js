// chat-features.js — General Memory, conversation capture/save, manual injection.
// Exposes: window.__ccbChat
//
// Public API (after init):
//   getGM() / renderGeneralMemory()
//   tryAutoInject()
//   injectSelected()
//   saveChat()
//   startMsgObserver() / stopMsgObserver()

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
  let _autoInjectObserver = null;

  // Active project (global selection) whose INSTRUCTIONS auto-load at
  // conversation start alongside GM — gated by project.autoLoad, mirroring
  // GM's own toggle. Missing autoLoad (older/new projects) defaults to ON,
  // matching the toggle's default checked state (history-view.js#renderProjectContext).
  // Deliberately instructions-only (project.content), NOT
  // buildProjectSectionText: that also inlines every enabled document,
  // which for a code project is tens of thousands of tokens. Documents
  // stay behind the explicit footer "מסמכים" button (#injectDocsBtn).
  function _getActiveProjectInstructions() {
    const project = _deps.historyView?.getProjectById?.(_deps.state.currentProjectId);
    if (!project || project.autoLoad === false) return null;
    const content = (project.content || "").trim();
    if (!content) return null;
    return "## " + project.title + "\n" + content;
  }

  // What would be auto-injected right now: GM (if autoLoad + content) and the
  // active project's instructions. Recomputed at inject time, not at
  // tryAutoInject time — the MutationObserver below has no timeout, so the
  // user can switch project or edit GM between the call and the actual
  // injection. Reading late keeps us honest about the current selection.
  function _autoInjectPayload() {
    const gm = getGM();
    const hasGm = !!(gm.autoLoad && (gm.content || "").trim());
    const projectInstructions = _getActiveProjectInstructions();
    const f = _deps.framing;
    const parts = [];
    if (hasGm) parts.push(f.gmPre + gm.content + f.gmPost);
    if (projectInstructions) parts.push(f.projPre + projectInstructions + f.projPost);
    return { text: parts.join("\n\n"), hasGm, hasProject: !!projectInstructions };
  }

  function _doInject() {
    if (_deps.state.gmAutoInjected) return;
    const { text, hasGm, hasProject } = _autoInjectPayload();
    if (!text) return;
    _deps.state.gmAutoInjected = true;
    _deps.inject.injectIntoInput(text, "prepend");
    console.debug("[ccb] auto-injected (fresh chat detected)", { hasGm, hasProject });
    setTimeout(() => {
      const btn = document.querySelector(_deps.config.SEND_BUTTON_SELECTOR);
      if (btn) btn.click();
    }, 100);
  }

  async function tryAutoInject() {
    if (_deps.state.gmAutoInjected) return;
    if (!_autoInjectPayload().text) return;
    const MSG_SELECTORS = _deps.config.MSG_SELECTORS;
    const NEW_CHAT_BTN_SELECTOR = _deps.config.NEW_CHAT_BTN_SELECTOR;

    // Cancel any previous pending observer
    if (_autoInjectObserver) {
      _autoInjectObserver.disconnect();
      _autoInjectObserver = null;
    }

    function getMsgCount() {
      if (!MSG_SELECTORS?.message) return 0;
      try {
        return document.querySelectorAll(MSG_SELECTORS.message).length;
      } catch { return 0; }
    }

    // True when chat UI is loaded enough to inject (input exists)
    function chatReady() {
      return !!_deps.inject.findInput();
    }

    // Action when chat is ready: if existing messages and we have a
    // new-chat button, click it (the watcher will call us again with a
    // clean chat). Otherwise inject into the current empty chat.
    function actWhenReady() {
      if (_deps.state.gmAutoInjected) return;
      const msgCount = getMsgCount();
      if (msgCount > 0) {
        if (NEW_CHAT_BTN_SELECTOR) {
          const newChatBtn = document.querySelector(NEW_CHAT_BTN_SELECTOR);
          if (newChatBtn) {
            console.debug("[ccb] tryAutoInject: existing chat detected → clicking 'new chat'");
            newChatBtn.click();
            return; // watcher resets state and calls us again
          }
        }
        // No new-chat button — bail. Don't pollute an in-progress chat.
        console.debug("[ccb] tryAutoInject: messages present, no new-chat btn — skipping");
        return;
      }
      _doInject();
    }

    // If chat is already loaded — act immediately
    if (chatReady()) {
      actWhenReady();
      return;
    }

    // Otherwise watch DOM until chat UI appears (login screen → chat).
    // No timeout — slow-loading sites can take minutes.
    _autoInjectObserver = new MutationObserver(() => {
      if (_deps.state.gmAutoInjected) {
        _autoInjectObserver.disconnect();
        _autoInjectObserver = null;
        return;
      }
      if (!chatReady()) return;
      _autoInjectObserver.disconnect();
      _autoInjectObserver = null;
      // Wait a tick to let messages render in (so getMsgCount is accurate)
      setTimeout(actWhenReady, 300);
    });
    _autoInjectObserver.observe(document.body, { childList: true, subtree: true });
    console.debug("[ccb] tryAutoInject: waiting for chat UI via MutationObserver");
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
      .map((b) => {
        const title = b.title || (b.id === GM_ID ? "זיכרון כללי" : "");
        let body = "## " + title + "\n" + (b.content || "");
        if (b.kind === "project" && _deps.docHandler) {
          const enabledDocs = _deps.docHandler.getEnabledDocuments(b.id);
          const textDocs = enabledDocs.filter(d => d.content);
          const fileDocs = enabledDocs.filter(d => !d.content && d.hasBlob);
          if (textDocs.length > 0) {
            body += "\n\n<documents>\n";
            for (const doc of textDocs) {
              body += `\n**${doc.name}** (${doc.estimatedTokens} tokens)\n---\n`;
              const maxChars = 10000;
              body += doc.content.length > maxChars
                ? doc.content.slice(0, maxChars) + "\n... [truncated]"
                : doc.content;
              body += "\n";
            }
            body += "</documents>";
          }
          if (fileDocs.length > 0) {
            body += `\n\n[קבצים מצורפים: ${fileDocs.map(d => d.name).join(", ")}]`;
          }
        }
        return body;
      })
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

  // AI auto-responses that the framing prompts request after each injection.
  // We strip them from capture so they don't accumulate inside saved blocks
  // across multiple continuations.
  const INJECTION_AUTORESPONSES = new Set([
    "Context loaded.",
    "Context loaded",
    "Transcript loaded.",
    "Transcript loaded",
    "Project guidelines loaded.",
    "Project guidelines loaded",
  ]);

  function captureConversation() {
    const MSG_SELECTORS = _deps.config.MSG_SELECTORS;
    const container = document.querySelector(MSG_SELECTORS.messageList);
    if (!container) return [];
    const nodes = container.querySelectorAll(MSG_SELECTORS.message);
    const messages = [];
    for (const n of nodes) {
      const text = MSG_SELECTORS.messageText(n) || "";
      const trimmed = text.trim();
      if (!trimmed) continue;
      if (trimmed.includes("[[CCB:INJECTED]]")) continue;
      let role = "user";
      if (MSG_SELECTORS.aiMessageMatch && MSG_SELECTORS.aiMessageMatch(n)) {
        role = "ai";
      } else if (MSG_SELECTORS.userMessageMatch && MSG_SELECTORS.userMessageMatch(n)) {
        role = "user";
      }
      // Skip the AI's canned response to an injection ("Context loaded." etc.).
      // captureConversation already filters the injection itself by marker,
      // but the AI's reply is just a normal short message — without this
      // filter it would slip into the saved block and re-inject on every
      // future continuation, growing endlessly.
      if (role === "ai" && INJECTION_AUTORESPONSES.has(trimmed)) continue;
      messages.push({ role, text: trimmed });
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
    // captureConversation filters the injection USER-QUERY itself (by the
    // [[CCB:INJECTED]] marker) but cannot detect the AI's auto-response to
    // it ("Context loaded.", "Transcript loaded.") since that's just a
    // normal AI message. Trim any leading AI messages — a real exchange
    // always starts with a user turn. If no user turn exists, this is
    // injection-only noise; skip the save entirely.
    const firstUserIdx = messages.findIndex((m) => m && m.role === "user");
    if (firstUserIdx === -1) return false;
    messages = firstUserIdx > 0 ? messages.slice(firstUserIdx) : messages;
    await _deps.loadBlocks();
    const state = _deps.state;

    if (
      state.currentConversationId &&
      state.blocks[state.currentConversationId]
    ) {
      const block = state.blocks[state.currentConversationId];
      // If this is a "continuation" (user clicked "המשך שיחה"), the saved
      // block's historical messages are NOT in the live DOM. Prepend the
      // snapshot taken at binding time so we never overwrite history with
      // just the post-continuation turn.
      const base = Array.isArray(state.continuationBase)
        ? state.continuationBase
        : [];
      const fullMessages = base.length > 0 ? [...base, ...messages] : messages;

      const prev = Array.isArray(block.messages) ? block.messages : [];
      if (
        prev.length === fullMessages.length &&
        prev[prev.length - 1]?.text ===
          fullMessages[fullMessages.length - 1]?.text
      ) {
        return false; // no change
      }
      block.messages = fullMessages;
      block.messageCount = fullMessages.length;
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
    if (!canCapture()) {
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

  // Force-flush: cancel any pending throttled save and run one now.
  // Returns the captured messages (after [[CCB:INJECTED]] filtering) so the
  // caller can decide whether anything real exists.
  async function flushAutoSave() {
    if (autoSaveTimer) {
      clearTimeout(autoSaveTimer);
      autoSaveTimer = null;
    }
    if (!canCapture()) return { messages: [], wrote: false };
    const messages = captureConversation();
    if (!messages.length) return { messages: [], wrote: false };
    const wrote = await persistConversation(messages);
    return { messages, wrote };
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
    if (!canCapture()) return;
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
  let msgObserver = null;

  function canCapture() {
    const sel = _deps.config.MSG_SELECTORS;
    return !!(sel && sel.messageList && sel.message);
  }

  let msgObserverContainer = null;
  let msgObserverRetryTimer = null;

  function startMsgObserver() {
    if (!canCapture()) return;
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
          if (n.matches?.(sel.message) || n.querySelectorAll?.(sel.message).length) {
            sawChange = true;
          }
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
     *   openEdit,
     * }} deps
     */
    init(deps) { _deps = deps; },
    getGM,
    renderGeneralMemory,
    tryAutoInject,
    injectSelected,
    saveChat,
    flushAutoSave,
    startMsgObserver,
    stopMsgObserver,
  };
})();
