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
  function estimateTokens() {
    const sel = MSG_SEL();
    if (!sel?.message) return { chars: 0, count: 0, tokens: 0 };
    const nodes = document.querySelectorAll(sel.message);
    let chars = 0,
      count = 0;
    nodes.forEach((n) => {
      const textNode =
        typeof sel.messageText === "function" ? sel.messageText(n) : n;
      const text =
        typeof textNode === "string"
          ? textNode.trim()
          : (textNode?.textContent || textNode?.innerText || "").trim();
      if (!text) return;
      chars += text.length;
      count++;
    });
    return { chars, count, tokens: Math.ceil(chars / CHARS_PT()) };
  }

  function isLikelyTextFile(file) {
    const name = (file?.name || "").toLowerCase();
    const type = (file?.type || "").toLowerCase();
    return (
      type.startsWith("text/") ||
      type === "application/json" ||
      type === "application/xml" ||
      type === "image/svg+xml" ||
      /\.(txt|md|markdown|py|js|ts|jsx|tsx|json|csv|xml|html|htm|css|scss|sass|less|java|c|cpp|h|hpp|rs|go|rb|sh|yaml|yml|sql|ini|toml|env|log)$/i.test(
        name,
      )
    );
  }

  // Classify file by extension/MIME and return realistic token estimate.
  // Numbers based on typical LLM tokenization rates per format:
  //   - Images: vision models charge ~85-1600 per image depending on size
  //   - PDFs:   varies wildly with embedded media; heuristic: size/50
  //   - Office: heavily compressed XML + images — actual text is small fraction
  //   - Archives: size ratio of actual files unpredictable
  async function estimateBinaryTokens(file) {
    const name = (file?.name || "").toLowerCase();
    const type = (file?.type || "").toLowerCase();
    const size = file?.size || 0;

    // ─────────────────────────────────────────────────────────────────────
    // Images — vision token cost is roughly flat per image
    // ─────────────────────────────────────────────────────────────────────
    if (type.startsWith("image/") || /\.(jpe?g|png|gif|webp|bmp|tiff?|heic|heif|svg)$/i.test(name)) {
      if (size < 100 * 1024) return 85;      // small
      if (size < 500 * 1024) return 400;     // medium
      if (size < 2 * 1024 * 1024) return 1100; // large
      return 1600;                            // very large
    }

    // ─────────────────────────────────────────────────────────────────────
    // Documents & Spreadsheets
    // ─────────────────────────────────────────────────────────────────────

    // PDF — text + fonts + embedded images
    if (type === "application/pdf" || /\.pdf$/i.test(name)) {
      return Math.ceil(size / 50);
    }

    // PowerPoint — mostly images + layout, minimal text
    if (/\.(pptx?|odp)$/i.test(name) || type.includes("presentation")) {
      return Math.ceil(size / 200);
    }

    // Word documents — text-heavy, compressed format
    if (/\.(docx?|odt|rtf)$/i.test(name) || type.includes("wordprocessingml") || type.includes("msword")) {
      return Math.ceil(size / 100);
    }

    // Excel / Sheets — structured data, compressed
    if (/\.(xlsx?|ods|csv)$/i.test(name) || type.includes("spreadsheet") || type.includes("ms-excel")) {
      return Math.ceil(size / 120);
    }

    // ─────────────────────────────────────────────────────────────────────
    // Media (Audio/Video) — transcribed by Claude
    // ─────────────────────────────────────────────────────────────────────
    if (type.startsWith("audio/") || /\.(mp3|wav|m4a|ogg|flac|aac|wma)$/i.test(name)) {
      return Math.ceil(size / 100);
    }

    if (type.startsWith("video/") || /\.(mp4|mov|avi|mkv|webm|m4v|flv|wmv|3gp)$/i.test(name)) {
      return Math.ceil(size / 200);
    }

    // ─────────────────────────────────────────────────────────────────────
    // Archives & Compressed — size is unpredictable
    // ─────────────────────────────────────────────────────────────────────
    if (/\.(zip|rar|7z|tar|gz|bz2|xz)$/i.test(name) ||
        type.includes("zip") || type.includes("compressed") || type.includes("archive")) {
      // Very conservative: we don't know what's inside
      return Math.ceil(size / 300);
    }

    // ─────────────────────────────────────────────────────────────────────
    // Markup & Code — human-readable, mostly text
    // ─────────────────────────────────────────────────────────────────────
    if (/\.(html?|xml|svg|yaml|yml|toml|ini|conf|cfg)$/i.test(name) ||
        type === "application/xml" || type === "text/xml" || type === "image/svg+xml") {
      // Treat as text-like (slightly less efficient than plain text due to overhead)
      const text = await file.text().catch(() => "");
      return Math.ceil(text.length / (CHARS_PT() * 1.2));
    }

    // ─────────────────────────────────────────────────────────────────────
    // Fallback — conservative estimate
    // ─────────────────────────────────────────────────────────────────────
    return Math.ceil(size / 50);
  }

  async function estimateFileTokens(file) {
    if (!file) return null;
    if (isLikelyTextFile(file)) {
      const text = await file.text();
      return {
        name: file.name,
        tokens: Math.ceil(text.length / CHARS_PT()),
        size: file.size || 0,
      };
    }
    return {
      name: file.name,
      tokens: await estimateBinaryTokens(file),
      size: file.size || 0,
    };
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
          tokens: await estimateBinaryTokens(file),
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
    if (input.files?.length) void syncFileInput(input);
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
  function watchConversation() {
    const sel = MSG_SEL();
    const rootSel = sel?.container || sel?.messageList;
    if (!rootSel) return;
    const root = document.querySelector(rootSel);
    if (!root || root === ctxMeterObservedRoot) return;
    ctxMeterObserver?.disconnect();
    ctxMeterObservedRoot = root;
    ctxMeterObserver = new MutationObserver(() => updateCtxMeter());
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
    fileInputObserver?.disconnect();
    fileInputObserver = null;
    fileInputObservedRoot = null;
    trackedFileInputs.clear();
    uploadedFiles = [];
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
  };
})();
