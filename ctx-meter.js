// ctx-meter.js — Context window usage indicator
// Loaded before content.js via manifest.
// Exports: window.__ccbCtxMeter
//
// Public API:
//   init(deps)          — wire up to content.js internals (call once after mountUI)
//   update()            — recalculate and redraw the meter
//   watchConversation() — start MutationObserver on the chat message list
//   watchFileInputs()   — start tracking <input type="file"> elements on the page
//   openFilesDropdown(anchor) — show per-file token breakdown dropdown
//   renderFilesDropdown(dd)   — populate an existing dropdown element
//   cleanup()           — disconnect all observers, clear state

(() => {
  "use strict";

  // ============================================================
  // Module-level state
  // ============================================================
  let _deps = null;

  let uploadedFiles = [];
  let queuedInjectFiles = [];
  const trackedFileInputs = new Map();
  const watchedFileInputs = new WeakSet();
  let fileInputObserver = null;
  let fileInputObservedRoot = null;
  let ctxMeterObserver = null;
  let ctxMeterObservedRoot = null;

  // ============================================================
  // Lazy accessors (shadow DOM is created after init)
  // ============================================================
  const $shadow = () => _deps?.getShadow?.();
  const $el = (id) => $shadow()?.getElementById(id);
  const MSG_SEL = () => _deps?.MSG_SELECTORS;
  const CHARS_PT = () => _deps?.CHARS_PER_TOKEN ?? 3.5;
  const CTX_WIN = () => _deps?.getCtxWindow?.() ?? 128000;

  // ============================================================
  // Token estimation
  // ============================================================
  // Chars→tokens goes through the shared Hebrew-aware estimator in config.js
  // (Hebrew runs ~2 chars/token vs ~3.5 for English/code — a flat divisor
  // made the meter undercount Hebrew conversations by ~40%). Fallback keeps
  // the old flat ratio if config is somehow absent.
  function estimateTextTokens(text) {
    const shared = window.__ccbRawConfig?.estimateTextTokens;
    return shared ? shared(text) : Math.ceil((text || "").length / CHARS_PT());
  }

  // Per-message memo, keyed on the message element (WeakMap — entries die with
  // the DOM node, so navigating away can't leak them).
  //
  // This exists for a specific performance reason: the site selectors'
  // messageText() reads `.innerText`, which is layout-dependent and therefore
  // forces a synchronous reflow. estimateTokens() runs on every conversation
  // mutation, so without a memo, every DOM change during a streaming response
  // re-read (and re-scanned) EVERY message in the chat — cost proportional to
  // the whole conversation, paid many times a second, growing as the chat
  // grows. That is the "gets slower the longer I use it, a browser restart
  // fixes it for a while" symptom.
  //
  // `textContent.length` is the change detector because, unlike innerText, it
  // does not depend on layout. Only messages whose length actually changed pay
  // for the innerText read + token scan; a stable message costs one cheap
  // property read. An edit that preserves the exact length is missed, which is
  // acceptable for a length-derived estimate.
  const msgTokenCache = new WeakMap();

  function measureMessage(node, sel) {
    const rawLen = node.textContent?.length || 0;
    const cached = msgTokenCache.get(node);
    if (cached && cached.rawLen === rawLen) return cached;

    const textNode =
      typeof sel.messageText === "function" ? sel.messageText(node) : node;
    const text =
      typeof textNode === "string"
        ? textNode.trim()
        : (textNode?.textContent || textNode?.innerText || "").trim();
    const entry = {
      rawLen,
      chars: text.length,
      tokens: text ? estimateTextTokens(text) : 0,
    };
    msgTokenCache.set(node, entry);
    return entry;
  }

  function estimateTokens() {
    const sel = MSG_SEL();
    if (!sel?.message) return { chars: 0, count: 0, tokens: 0 };
    let chars = 0,
      count = 0,
      tokens = 0;
    document.querySelectorAll(sel.message).forEach((n) => {
      const entry = measureMessage(n, sel);
      if (!entry.chars) return;
      chars += entry.chars;
      count++;
      tokens += entry.tokens;
    });
    return { chars, count, tokens };
  }

  // Per-file estimation is delegated to document-handler.js — the canonical
  // copy of the text/binary heuristics (this module used to carry a
  // near-identical fork, and the two drifted apart: different return shapes,
  // different extension lists). Reading window.__ccbDocHandler at call time
  // is load-order-safe even though ctx-meter.js loads first in the manifest:
  // estimates only run from user file events, long after every content
  // script is installed. (Same established cross-module pattern as
  // document-handler calling window.__ccbCtxMeter.queueFilesForInjection.)
  async function estimateFileTokens(file) {
    if (!file) return null;
    const docHandler = window.__ccbDocHandler;
    const tokens = docHandler
      ? await docHandler.estimateFileTokens(file)
      : Math.ceil((file.size || 0) / 50); // last-resort if doc-handler is missing
    return { name: file.name, tokens, size: file.size || 0 };
  }

  // ============================================================
  // File input tracking
  // ============================================================
  function syncUploadedFiles() {
    uploadedFiles = [...trackedFileInputs.values()]
      .flatMap((entry) => entry.files || [])
      .filter(Boolean);
    updateCtxMeter();
  }

  async function syncFileInput(input) {
    if (!input) return;
    const state =
      trackedFileInputs.get(input) ||
      trackedFileInputs.set(input, { version: 0, files: [] }).get(input);
    const nextVersion = (state.version || 0) + 1;
    state.version = nextVersion;
    trackedFileInputs.set(input, state);

    const files = Array.from(input.files || []);
    if (!files.length) {
      state.files = [];
      syncUploadedFiles();
      return;
    }

    const nextFiles = [];
    for (const file of files) {
      try {
        const entry = await estimateFileTokens(file);
        if (entry) nextFiles.push(entry);
      } catch (e) {
        console.error("[ctx-meter] Failed to estimate file tokens", e);
        nextFiles.push({
          name: file.name,
          tokens: Math.ceil((file.size || 0) / 50), // crude size-based last resort
          size: file.size || 0,
        });
      }
    }

    const current = trackedFileInputs.get(input);
    if (!current || current.version !== nextVersion) return;
    current.files = nextFiles;
    trackedFileInputs.set(input, current);
    syncUploadedFiles();
  }

  // Applies any files queued via queueFilesForInjection() to a freshly
  // discovered file input, merging with whatever the input already holds.
  function flushQueuedFiles(input) {
    if (!queuedInjectFiles.length) return;
    const dt = new DataTransfer();
    if (input.files?.length) Array.from(input.files).forEach((f) => dt.items.add(f));
    queuedInjectFiles.forEach((f) => dt.items.add(f));
    input.files = dt.files;
    queuedInjectFiles = [];
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function attachFileInput(input) {
    if (!input || watchedFileInputs.has(input)) {
      if (input && !trackedFileInputs.has(input))
        trackedFileInputs.set(input, { version: 0, files: [] });
      return;
    }
    watchedFileInputs.add(input);
    if (!trackedFileInputs.has(input))
      trackedFileInputs.set(input, { version: 0, files: [] });
    input.addEventListener("change", () => {
      void syncFileInput(input);
    });
    if (queuedInjectFiles.length) flushQueuedFiles(input);
    if (input.files?.length) void syncFileInput(input);
  }

  // Stores files to be attached to the chat's file input the moment one
  // appears in the DOM (watchFileInputs' MutationObserver picks it up via
  // attachFileInput -> flushQueuedFiles). Used when injectFilesToChat runs
  // before the page has mounted its upload input yet.
  function queueFilesForInjection(files) {
    if (!files?.length) return;
    queuedInjectFiles = queuedInjectFiles.concat(files);
    const existing = document.querySelector('input[type="file"]');
    if (existing) flushQueuedFiles(existing);
  }

  function detachFileInput(input) {
    if (!input || !trackedFileInputs.has(input)) return;
    trackedFileInputs.delete(input);
    syncUploadedFiles();
  }

  function scanFileInputs(root) {
    if (!root) return;
    if (root.matches?.('input[type="file"]')) attachFileInput(root);
    root.querySelectorAll?.('input[type="file"]').forEach(attachFileInput);
  }

  function pruneFileInputs(root) {
    if (!root) return;
    if (root.matches?.('input[type="file"]')) detachFileInput(root);
    root.querySelectorAll?.('input[type="file"]').forEach(detachFileInput);
  }

  function watchFileInputs() {
    if (fileInputObserver && fileInputObservedRoot === document.body) return;
    if (fileInputObserver) {
      fileInputObserver.disconnect();
      fileInputObserver = null;
      fileInputObservedRoot = null;
    }
    if (!document.body) return;
    fileInputObservedRoot = document.body;
    scanFileInputs(document.body);
    fileInputObserver = new MutationObserver((muts) => {
      for (const m of muts) {
        m.addedNodes.forEach((n) => {
          if (n.nodeType === 1) scanFileInputs(n);
        });
        m.removedNodes.forEach((n) => {
          if (n.nodeType === 1) pruneFileInputs(n);
        });
      }
    });
    fileInputObserver.observe(document.body, { childList: true, subtree: true });
  }

  // ============================================================
  // Conversation watching
  // ============================================================
  // A streaming AI response mutates the DOM continuously, and the observer
  // below watches the whole subtree — so mutation bursts are coalesced into one
  // recompute instead of recomputing per mutation. `setTimeout`, deliberately
  // NOT `requestAnimationFrame`: rAF is suspended while the tab is
  // backgrounded, which would freeze the meter for anyone who switched tabs
  // mid-response (the progress indicator in content.js avoids rAF for the same
  // reason). Leading-edge suppressed, trailing-edge fires — the meter is an
  // ambient readout, so lagging a fraction of a second is invisible.
  const CTX_METER_THROTTLE_MS = 400;
  // Explicit null check, not truthiness: a timer id of 0 is falsy, which would
  // let every mutation in a burst schedule its own update.
  let ctxMeterThrottleTimer = null;

  function scheduleCtxMeterUpdate() {
    if (ctxMeterThrottleTimer !== null) return;
    ctxMeterThrottleTimer = setTimeout(() => {
      ctxMeterThrottleTimer = null;
      updateCtxMeter();
    }, CTX_METER_THROTTLE_MS);
  }

  function watchConversation() {
    const sel = MSG_SEL();
    const rootSel = sel?.container || sel?.messageList;
    if (!rootSel) return;
    const root = document.querySelector(rootSel);
    if (!root || root === ctxMeterObservedRoot) return;
    ctxMeterObserver?.disconnect();
    ctxMeterObservedRoot = root;
    ctxMeterObserver = new MutationObserver(scheduleCtxMeterUpdate);
    ctxMeterObserver.observe(root, { childList: true, subtree: true });
    updateCtxMeter();
  }

  // ============================================================
  // Files dropdown
  // ============================================================
  function renderFilesDropdown(dd) {
    if (!dd) return;
    dd.innerHTML = "";
    dd.style.minWidth = "220px";
    dd.style.maxWidth = "360px";
    dd.classList.add("ctx-files-dropdown");

    if (!uploadedFiles.length) {
      const empty = document.createElement("div");
      empty.className = "hd-item";
      empty.textContent = "אין קבצים מצורפים";
      dd.appendChild(empty);
      return;
    }

    const fmt = (n) => n.toLocaleString("he-IL");
    const total = uploadedFiles.reduce((sum, f) => sum + (f.tokens || 0), 0);

    const summary = document.createElement("div");
    summary.className = "hd-item";
    summary.style.cursor = "default";
    summary.style.justifyContent = "space-between";
    const summaryLabel = document.createElement("span");
    summaryLabel.textContent = `${uploadedFiles.length} קבצים`;
    const summaryTokens = document.createElement("span");
    summaryTokens.className = "ctx-file-tokens";
    summaryTokens.textContent = `+${fmt(total)} Tokens`;
    summary.append(summaryLabel, summaryTokens);
    dd.appendChild(summary);

    const sep = document.createElement("div");
    sep.className = "hd-sep";
    dd.appendChild(sep);

    [...uploadedFiles]
      .sort((a, b) => (b.tokens || 0) - (a.tokens || 0))
      .forEach((file) => {
        const item = document.createElement("div");
        item.className = "hd-item ctx-file-item";
        item.style.cursor = "default";
        const name = document.createElement("span");
        name.className = "ctx-file-name";
        name.textContent = file.name;
        const tokens = document.createElement("span");
        tokens.className = "ctx-file-tokens";
        tokens.textContent = fmt(file.tokens || 0);
        item.append(name, tokens);
        dd.appendChild(item);
      });
  }

  function openFilesDropdown(anchor) {
    if (!uploadedFiles.length) return;
    _deps?.closeDropdown?.();
    const dd = $el("hiDropdown");
    if (!dd) return;

    renderFilesDropdown(dd);
    dd.dataset.menuType = "files";

    const rect = anchor.getBoundingClientRect();
    dd.style.top = rect.bottom + 6 + "px";
    dd.style.left = rect.left + "px";
    dd.classList.add("open");

    const onOutside = (e) => {
      if (!dd.contains(e.target) && e.target !== anchor)
        _deps?.closeDropdown?.();
    };
    document.addEventListener("click", onOutside, { capture: true });
    _deps?.setDropdownCleanup?.(() =>
      document.removeEventListener("click", onOutside, { capture: true }),
    );
  }

  // ============================================================
  // Meter update
  // ============================================================
  function updateCtxMeter() {
    if (!$shadow()) return;
    const fill = $el("ccb-ctx-fill");
    const countEl = $el("ccb-ctx-count");
    const pctEl = $el("ccb-ctx-pct");
    const filesRow = $el("ccb-files-row");
    const filesLabel = $el("ccb-files-label");
    const filesTokens = $el("ccb-files-tokens");
    if (!fill || !countEl || !pctEl) return;

    const { chars, count, tokens } = estimateTokens();
    const fileTokens = uploadedFiles.reduce((sum, f) => sum + (f.tokens || 0), 0);
    const windowTokens = CTX_WIN();
    const totalTokens = tokens + fileTokens;
    const pct =
      windowTokens > 0 ? Math.min((totalTokens / windowTokens) * 100, 100) : 0;
    const remaining = Math.max(windowTokens - totalTokens, 0);

    fill.style.width = pct.toFixed(1) + "%";
    fill.className =
      "ctx-bar-fill" +
      (pct > 90 ? " crit" : pct > 75 ? " high" : pct > 50 ? " warn" : "");

    const fmt = (n) => n.toLocaleString("he-IL");
    countEl.textContent = `${fmt(totalTokens)} / ${fmt(windowTokens)}`;
    pctEl.textContent = `${pct.toFixed(1).replace(/\.0$/, "")}%`;

    const expandedEl = $el("ccb-ctx-expanded");
    if (expandedEl && expandedEl.style.display !== "none") {
      expandedEl.innerHTML = "";
      const addRow = (label, value) => {
        const r = document.createElement("div");
        r.className = "row";
        const l = document.createElement("div");
        l.className = "label";
        l.textContent = label;
        const v = document.createElement("div");
        v.className = "value";
        v.textContent = value;
        r.append(l, v);
        expandedEl.appendChild(r);
      };
      addRow("הודעות", fmt(count));
      addRow("תווים", fmt(chars));
      addRow("טוקנים מהודעות", fmt(tokens));
      if (uploadedFiles.length) {
        const fileSummary = uploadedFiles
          .map((f) => `${f.name} (${fmt(f.tokens || 0)})`)
          .join(", ");
        addRow("קבצים", `${fileSummary} (+${fmt(fileTokens)} Tokens)`);
      }
      addRow("סה״כ טוקנים", fmt(totalTokens));
      addRow("נותרו", fmt(remaining));
    }

    if (filesRow && filesLabel && filesTokens) {
      filesRow.style.display = uploadedFiles.length ? "" : "none";
      filesLabel.textContent = `${uploadedFiles.length} ${uploadedFiles.length === 1 ? "קובץ" : "קבצים"}`;
      filesTokens.textContent = `+${fmt(fileTokens)} Tokens`;
    }

    const dd = $el("hiDropdown");
    if (dd?.classList.contains("open") && dd.dataset.menuType === "files") {
      renderFilesDropdown(dd);
    }
  }

  // ============================================================
  // Cleanup
  // ============================================================
  function cleanup() {
    ctxMeterObserver?.disconnect();
    ctxMeterObserver = null;
    ctxMeterObservedRoot = null;
    clearTimeout(ctxMeterThrottleTimer);
    ctxMeterThrottleTimer = null;
    fileInputObserver?.disconnect();
    fileInputObserver = null;
    fileInputObservedRoot = null;
    trackedFileInputs.clear();
    uploadedFiles = [];
    queuedInjectFiles = [];
  }

  // ============================================================
  // Public API
  // ============================================================
  window.__ccbCtxMeter = {
    /**
     * Wire up to content.js. Call once after mountUI() creates the shadow DOM.
     * @param {{ getShadow: () => ShadowRoot, MSG_SELECTORS: object,
     *           CHARS_PER_TOKEN: number, CTX_WINDOW_DEFAULT: number,
     *           getCtxWindow: () => number,
     *           closeDropdown: () => void,
     *           setDropdownCleanup: (fn: () => void) => void }} deps
     */
    init(deps) {
      _deps = deps;
    },
    update: updateCtxMeter,
    watchConversation,
    watchFileInputs,
    openFilesDropdown,
    renderFilesDropdown,
    cleanup,
    getUploadedFiles: () => uploadedFiles,
    queueFilesForInjection,
  };
})();
