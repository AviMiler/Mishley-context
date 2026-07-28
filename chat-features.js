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
    wrap.addEventListener("click", () =>
      _deps.openEdit(GM_ID, { title: "זיכרון כללי", content, tags: "" }),
    );

    const header = document.createElement("div");
    header.className = "gm-header";

    const selectLabel = document.createElement("label");
    selectLabel.className = "cb-wrap gm-select";
    selectLabel.addEventListener("click", (e) => e.stopPropagation());
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
    toggleLabel.addEventListener("click", (e) => e.stopPropagation());
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

    // Live mode badge: reflects WHEN GM auto-loads (conversation start vs
    // every message) and clicking it flips GM's OWN mode — independent of the
    // project-instructions card's mode (history-view.js#renderProjectInstructionsCard),
    // split into separate settings 2026-07-22.
    const badge = document.createElement("span");
    badge.className = "auto-badge auto-badge-live";
    const everyMode = _deps.getAutoInjectMode?.("gm") === "every";
    badge.textContent = everyMode ? "נטען בכל הודעה" : "נטען בתחילת שיחה";
    badge.title = "לחץ למעבר בין טעינה בתחילת שיחה לטעינה בכל הודעה";
    badge.addEventListener("click", async (e) => {
      e.stopPropagation();
      await _deps.setAutoInjectMode?.("gm", everyMode ? "start" : "every");
      _deps.render();
    });
    if (!on) badge.style.display = "none";

    header.appendChild(selectLabel);
    header.appendChild(toggleLabel);
    header.appendChild(title);
    wrap.appendChild(header);

    if (on) wrap.appendChild(badge);

    card.appendChild(wrap);
  }

  // ============================================================
  // GM auto-inject at conversation start
  // ============================================================

  // Active project (global selection) whose INSTRUCTIONS auto-load at
  // conversation start alongside GM — gated by project.autoLoad, mirroring
  // GM's own toggle. Missing autoLoad (older/new projects) defaults to ON,
  // matching the toggle's default checked state (history-view.js#renderProjectContext).
  // Deliberately instructions-only (project.content) — never the enabled
  // documents, which for a code project can be tens of thousands of tokens.
  // Documents stay behind the explicit footer "קבצים" button (#injectDocsBtn).
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
  //
  // Each source is ALSO gated on its own mode being "start" (the default) —
  // a source whose mode is "every" rides on per-message sends instead
  // (buildPerMessagePrefix below) and must NOT also fire here, or it would
  // both duplicate and waste a "Context loaded." exchange. The two sources
  // are independent (2026-07-22 split): GM can be "every" while project
  // instructions stay "start", or vice versa.
  function _autoInjectPayload() {
    const gm = getGM();
    const hasGm =
      _deps.getAutoInjectMode?.("gm") !== "every" &&
      !!(gm.autoLoad && (gm.content || "").trim());
    const projectInstructions =
      _deps.getAutoInjectMode?.("project") !== "every"
        ? _getActiveProjectInstructions()
        : null;
    const f = _deps.framing;
    const parts = [];
    if (hasGm) parts.push(f.gmPre + gm.content + f.gmPost);
    if (projectInstructions) parts.push(f.projPre + projectInstructions + f.projPost);
    return { text: parts.join("\n\n"), hasGm, hasProject: !!projectInstructions };
  }

  // ============================================================
  // Per-message auto-inject ("בכל הודעה" mode)
  //
  // GM and the active project's instructions each have their OWN mode
  // (2026-07-22 split — previously one shared setting for both). Whichever
  // source(s) are set to "every" get PREPENDED to the user's own message at
  // send time instead of being injected once at conversation start. Send is
  // intercepted in the CAPTURE phase (send-button click / Enter in the chat
  // input) and the input is rewritten with the framed context in front,
  // letting the site's own handler send the combined text — see
  // _interceptSend below for why this is mutate-and-let-through, not
  // block-and-replay.
  // ============================================================
  const CTX_END_MARKER = "[[CCB:CTX-END]]";

  function _isGmEveryMode() {
    return _deps.getAutoInjectMode?.("gm") === "every";
  }
  function _isProjectEveryMode() {
    return _deps.getAutoInjectMode?.("project") === "every";
  }
  // Cheap gate for the interceptor: is there ANY source that needs
  // per-message handling right now? Checked first, before the more expensive
  // send-target detection, since this runs on every click/keydown page-wide.
  function _hasEveryModeSource() {
    return _isGmEveryMode() || _isProjectEveryMode();
  }

  // The framed context prefix for one outgoing message, or "" when there is
  // nothing to attach. Each source is included only when ITS OWN mode is
  // "every" (a "start"-mode source is handled once at conversation start by
  // _autoInjectPayload instead), wrapped in the per-message FRAMING_EVERY
  // pair — no canned "Reply only with X" auto-response, since the user's
  // real request follows in the same message.
  function buildPerMessagePrefix() {
    const gm = getGM();
    const hasGm = _isGmEveryMode() && !!(gm.autoLoad && (gm.content || "").trim());
    const projectInstructions = _isProjectEveryMode() ? _getActiveProjectInstructions() : null;
    if (!hasGm && !projectInstructions) return "";
    const parts = [];
    if (hasGm) parts.push("<memory>\n" + gm.content + "\n</memory>");
    if (projectInstructions) parts.push("<project>\n" + projectInstructions + "\n</project>");
    const f = _deps.framing;
    return f.everyPre + parts.join("\n\n") + f.everyPost;
  }

  // True while one of OUR OWN programmatic send clicks (e.g. saveChat's
  // summary-prompt send) is in flight, so the capture listener doesn't wrap
  // it with per-message context.
  let _sendBypass = false;

  // Is this click target part of the send control? Resolved from the TARGET
  // upward — never via document.querySelector — because the page may hold
  // several elements matching SEND_BUTTON_SELECTOR (Gemini swaps mic/send
  // icons and keeps stale copies), and querySelector's first match isn't
  // necessarily the one that was clicked (real bug, 2026-07-22: mouse-click
  // sends went out unprefixed because the comparison anchored on the wrong
  // icon). Two cases: the click landed on/inside the icon itself, or on the
  // hosting <button>'s padding around it.
  function _isSendClick(target) {
    if (!target || typeof target.closest !== "function") return false;
    const sel = _deps.config.SEND_BUTTON_SELECTOR;
    try {
      if (target.closest(sel)) return true;
      const btn = target.closest("button, [role='button']");
      if (btn && btn.querySelector(sel)) return true;
      // Heuristic fallback — the exact-structure checks above kept missing on
      // Gemini (its send control isn't a plain <button> wrapping the icon the
      // selector names). Any ancestor whose class mentions "send" counts:
      // Gemini uses send-button-icon/send-button-container, the internal site
      // uses send-button. A rare false positive merely prepends the context
      // to the input (visible, idempotent, still sent with the message) — it
      // can never block a send.
      if (target.closest('[class*="send" i]')) return true;
      return false;
    } catch {
      return false;
    }
  }

  function _interceptSend(e) {
    if (_sendBypass || !_hasEveryModeSource()) return;

    const input = _deps.inject.findInput();
    if (!input) return;

    let isSend = false;
    if (e.type === "keydown") {
      isSend =
        e.key === "Enter" && !e.shiftKey && !e.isComposing &&
        (e.target === input || input.contains(e.target));
    } else {
      // pointerdown / mousedown / click on the send control. Prepending at
      // pointerdown mirrors Enter's keydown timing: it fires before the
      // click event that actually triggers the site's send, so the input is
      // already mutated when the send handler reads it. (An earlier version
      // also prepended on hover — pointerover — but that put the context in
      // the input on every stray mouse pass, which the user rejected; hover
      // was only ever needed while send DETECTION was broken, not timing.)
      // The [[CCB:CTX]] marker check above makes the series idempotent.
      isSend = _isSendClick(e.target);
      // Temporary diagnostic (visible at default console level) for the
      // mouse-path detection failures — press/click only, hover is too noisy.
      if (!isSend && (e.type === "pointerdown" || e.type === "click")) {
        const t = e.target;
        console.log(
          "[ccb-debug] pointer not detected as send:",
          e.type, t?.tagName, String(t?.className || "").slice(0, 120),
        );
      }
    }
    if (!isSend) return;

    const current = input.isContentEditable ? input.innerText || "" : input.value || "";
    if (!current.trim()) return; // nothing to send — let the site ignore it
    // Already carries an injection (a manual "טען פרומפטים"/conversation load,
    // or a previous prepend whose send didn't go through) — don't wrap twice.
    if (current.includes("[[CCB:CTX]]") || current.includes("[[CCB:INJECTED]]")) return;

    const prefix = buildPerMessagePrefix();
    if (!prefix) return;

    // Prepend synchronously and let the ORIGINAL event proceed — the site's
    // own handler then sends the combined text itself. Deliberately NOT
    // block-and-replay (preventDefault + programmatic re-click): on Gemini
    // the send listener is bound to the inner icon, not the wrapping
    // <button>, so a synthetic click on the wrong element silently sent
    // nothing (real bug, 2026-07-22 — Enter added the context but needed a
    // second Enter to send; mouse clicks did nothing at all). The site's own
    // handler demonstrably reads the mutated input fine: setInputValue
    // dispatches its input events synchronously during the capture phase, so
    // the page framework's model is up to date before the site's send handler
    // (target/bubble phase) runs.
    _deps.inject.injectIntoInput(prefix, "prepend");
    // Which event won the race to prepend. console.log, not console.debug —
    // debug is hidden at the console's default level, which made the earlier
    // diagnostic invisible exactly when it was needed.
    console.log("[ccb] per-message context prepended via", e.type);
  }

  let _sendHooksInstalled = false;

  // Installed once per page load; inert unless at least one source's mode is
  // "every" (checked live on every event via _hasEveryModeSource, so flipping
  // either source's mode needs no listener churn).
  function installSendInterceptor() {
    if (_sendHooksInstalled) return;
    _sendHooksInstalled = true;
    // On WINDOW, capture phase — in the capture phase window listeners run
    // BEFORE document listeners, so even a site that delegates its send
    // handling at document-capture level (registered before this content
    // script) can't read the input ahead of the prepend. The ladder starts
    // at pointerdown — the press itself, mirroring Enter's keydown timing:
    // it precedes the click that fires the site's send, so the input is
    // mutated before the send handler reads it. (2026-07-22: a hover-based
    // pointerover trigger was tried and reverted — it filled the input on
    // every stray mouse pass; the misses that motivated it were detection
    // bugs, not timing.) mousedown/click are same-gesture fallbacks, and the
    // [[CCB:CTX]] marker check makes the series idempotent.
    for (const type of ["pointerdown", "mousedown", "click"]) {
      window.addEventListener(type, _interceptSend, true);
    }
    window.addEventListener("keydown", _interceptSend, true);
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

  // Once the input exists, we still have to wait for the chat to actually be
  // EMPTY before injecting. Both entry points that reset auto-inject state —
  // content.js's new-chat click delegation and its ccb:urlchange handler — run
  // in the capture phase, i.e. BEFORE the site has begun tearing down the
  // previous conversation, so the old chat's message nodes are still in the
  // DOM at that instant. Judging "is this chat empty?" from that snapshot was
  // the bug behind "one click on 'new chat' doesn't auto-inject, two clicks
  // do": the first click saw stale messages, concluded it was sitting in an
  // existing conversation, re-clicked new-chat (which changed nothing, since
  // the app was already switching), and gave up — by the second click the DOM
  // had settled and the same check passed.
  const AUTO_INJECT_POLL_MS = 150;
  // Grace period for an in-flight SPA transition to drop the old messages
  // before we conclude the user is genuinely sitting in an existing chat.
  const AUTO_INJECT_SETTLE_MS = 2500;
  // Overall cap on the "waiting for an empty chat" phase only — waiting for
  // the chat UI itself to mount stays untimed (slow/login-gated sites).
  const AUTO_INJECT_TIMEOUT_MS = 10000;

  let _autoInjectPollTimer = null;
  let _autoInjectReadyAt = 0;
  let _autoInjectClickedNewChat = false;

  function stopAutoInjectPoll() {
    // Explicit null check — a timer id of 0 is falsy.
    if (_autoInjectPollTimer !== null) {
      clearTimeout(_autoInjectPollTimer);
      _autoInjectPollTimer = null;
    }
  }

  function getMsgCount() {
    const sel = _deps.config.MSG_SELECTORS;
    if (!sel?.message) return 0;
    try {
      return document.querySelectorAll(sel.message).length;
    } catch { return 0; }
  }

  function autoInjectTick() {
    _autoInjectPollTimer = null;
    if (_deps.state.gmAutoInjected) return;

    // Phase 1 — chat UI not mounted yet. Untimed, as before.
    if (!_deps.inject.findInput()) {
      _autoInjectPollTimer = setTimeout(autoInjectTick, AUTO_INJECT_POLL_MS);
      return;
    }

    // Phase 2 — input is up; wait for the conversation to be empty.
    if (!_autoInjectReadyAt) _autoInjectReadyAt = Date.now();
    const waited = Date.now() - _autoInjectReadyAt;

    if (getMsgCount() === 0) {
      _doInject();
      return;
    }

    if (waited >= AUTO_INJECT_TIMEOUT_MS) {
      console.debug("[ccb] tryAutoInject: gave up waiting for an empty chat");
      return;
    }

    // Still not empty after the grace period → this really is an existing
    // conversation (e.g. a refresh restored it), so ask for a new chat. Only
    // ever once per attempt: the click re-enters content.js's delegated
    // handler, which calls tryAutoInject() again, and without this flag the
    // two would bounce clicks off each other.
    if (waited >= AUTO_INJECT_SETTLE_MS && !_autoInjectClickedNewChat) {
      const selector = _deps.config.NEW_CHAT_BTN_SELECTOR;
      const newChatBtn = selector ? document.querySelector(selector) : null;
      if (!newChatBtn) {
        // No way to reach a clean chat — don't pollute an in-progress one.
        console.debug("[ccb] tryAutoInject: messages present, no new-chat btn — skipping");
        return;
      }
      console.debug("[ccb] tryAutoInject: existing chat detected → clicking 'new chat'");
      _autoInjectClickedNewChat = true;
      newChatBtn.click();
    }

    _autoInjectPollTimer = setTimeout(autoInjectTick, AUTO_INJECT_POLL_MS);
  }

  async function tryAutoInject() {
    if (_deps.state.gmAutoInjected) return;
    // No blanket "every mode" bail here — GM and project instructions each
    // have their own mode now, so one source can be "every" (handled by
    // buildPerMessagePrefix on send) while the other is "start" (handled
    // here). _autoInjectPayload() already excludes any "every"-mode source,
    // so this naturally no-ops once every remaining source is either absent
    // or itself in "every" mode.
    if (!_autoInjectPayload().text) return;

    // Re-entrancy: our own programmatic new-chat click calls this again. That
    // must restart the poll but NOT restart its clock or clear the
    // already-clicked flag, or the attempt could never time out.
    const resuming = _autoInjectPollTimer !== null;
    stopAutoInjectPoll();
    if (!resuming) {
      _autoInjectReadyAt = 0;
      _autoInjectClickedNewChat = false;
    }
    autoInjectTick();
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
        // A kind:"project" block reaches here when its instructions card is
        // ticked — instructions (b.content) ONLY, never its enabled documents.
        // Documents keep their own explicit footer button ("טען קבצים"),
        // since a code project's files run to tens of thousands of tokens.
        return "## " + title + "\n" + (b.content || "");
      })
      .join("\n\n");
    const text = isGmOnly
      ? f.gmPre + blocksBody + f.gmPost
      : f.manualPre + blocksBody + "\n\n---\n\n" + f.manualPost;
    _deps.recordInjectionBegin();
    const r = _deps.inject.injectIntoInput(text, "prepend");
    if (r.ok) {
      _deps.recordInjectionEnd();
      // Deliberately not auto-sending — same convention as
      // injectProjectDocuments()/cvLoadBtn: the user reviews/edits/sends
      // themselves.
      _deps.setStatus("הוזרק — ניתן לערוך ולשלוח ✓");
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
    "Files loaded.",
    "Files loaded",
  ]);

  function captureConversation() {
    const MSG_SELECTORS = _deps.config.MSG_SELECTORS;
    const container = document.querySelector(MSG_SELECTORS.messageList);
    if (!container) return [];
    const nodes = container.querySelectorAll(MSG_SELECTORS.message);
    const messages = [];
    for (const n of nodes) {
      const text = MSG_SELECTORS.messageText(n) || "";
      let trimmed = text.trim();
      if (!trimmed) continue;
      // Per-message injection prefix: unlike [[CCB:INJECTED]] (a standalone
      // injection message, dropped whole), the CTX block is glued in front of
      // the user's REAL message — strip the prefix, keep the rest.
      const ctxEnd = trimmed.indexOf(CTX_END_MARKER);
      if (ctxEnd !== -1) {
        trimmed = trimmed.slice(ctxEnd + CTX_END_MARKER.length).trim();
        if (!trimmed) continue;
      }
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
    if (!canCapture()) {
      const r = _deps.inject.injectIntoInput(_deps.framing.summaryPrompt, "replace");
      if (r.ok) {
        setTimeout(() => {
          const btn = document.querySelector(_deps.config.SEND_BUTTON_SELECTOR);
          // Bypass the per-message interceptor — the summary prompt is a
          // standalone instruction, not a user message to wrap with context.
          _sendBypass = true;
          try {
            if (btn) btn.click();
            else _deps.setStatus("לא נמצא כפתור שליחה", true);
          } finally {
            _sendBypass = false;
          }
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
     *   recordInjectionBegin: () => void, recordInjectionEnd: () => void,
     *   getAutoInjectMode: (source: "gm" | "project") => "start" | "every",
     *   setAutoInjectMode: (source: "gm" | "project", mode) => Promise<string>,
     * }} deps
     */
    init(deps) {
      _deps = deps;
      installSendInterceptor();
    },
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
