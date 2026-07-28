// ui-modals.js — generic modal/overlay UI: dialogs, settings popover, prompts editor.
// Pure UI primitives — business logic (export/import, etc.) stays in content.js.
// Exposes: window.__ccbModals
//
// Public API (after init):
//   showConfirm({title, msg, confirmLabel, danger?}) → Promise<bool>
//   showChoice({title, msg, primaryLabel, secondaryLabel}) → Promise<"primary"|"secondary"|undefined>
//   showPrompt({title, defaultValue?}) → Promise<string|null>
//   showProjectPicker({title, currentId, allowClear}) → Promise<id|null|undefined>
//   openSettings() / closeSettings()
//   openScanSettings() / closeScanSettings() / saveScanSettings() / resetScanSettingsToDefaults()
//   openPromptsEditor() / closePromptsEditor()
//   savePromptsEditor() / resetPromptsEditor(key)
//   openOnboarding() / closeOnboarding()

(() => {
  if (window.__ccbModalsInstalled) return;
  window.__ccbModalsInstalled = true;

  let _deps = null;
  const $el = (id) => _deps?.getShadow?.()?.getElementById(id);

  // ============================================================
  // Dialogs
  // ============================================================
  function showConfirm({ title, msg, confirmLabel, danger = false }) {
    return new Promise((resolve) => {
      $el("dialogTitle").textContent = title;
      $el("dialogMsg").textContent = msg;
      $el("dialogConfirm").textContent = confirmLabel;
      $el("dialogConfirm").className =
        "dialog-confirm" + (danger ? " danger" : "");
      $el("dialogCancel").textContent = "ביטול";
      const overlay = $el("dialogOverlay");
      overlay.classList.add("show");

      let settled = false;
      const done = (result) => {
        if (settled) return;
        settled = true;
        overlay.classList.remove("show");
        resolve(result);
      };
      $el("dialogConfirm").addEventListener("click", () => done(true), {
        once: true,
      });
      $el("dialogCancel").addEventListener("click", () => done(false), {
        once: true,
      });
    });
  }

  function showChoice({ title, msg, primaryLabel, secondaryLabel }) {
    return new Promise((resolve) => {
      $el("dialogTitle").textContent = title;
      $el("dialogMsg").textContent = msg;
      $el("dialogConfirm").textContent = primaryLabel;
      $el("dialogConfirm").className = "dialog-confirm";
      $el("dialogCancel").textContent = secondaryLabel;
      const overlay = $el("dialogOverlay");
      overlay.classList.add("show");

      let settled = false;
      const done = (result) => {
        if (settled) return;
        settled = true;
        overlay.classList.remove("show");
        resolve(result);
      };
      $el("dialogConfirm").addEventListener("click", () => done("primary"), {
        once: true,
      });
      $el("dialogCancel").addEventListener("click", () => done("secondary"), {
        once: true,
      });
    });
  }

  function showPrompt({ title, defaultValue = "" }) {
    return new Promise((resolve) => {
      $el("dialogTitle").textContent = title;
      $el("dialogMsg").textContent = "";
      $el("dialogConfirm").textContent = "שמור";
      $el("dialogConfirm").className = "dialog-confirm";
      $el("dialogCancel").textContent = "ביטול";
      const input = $el("dialogInput");
      input.value = defaultValue;
      input.style.display = "block";
      const overlay = $el("dialogOverlay");
      overlay.classList.add("show");
      setTimeout(() => {
        input.focus();
        input.select();
      }, 50);

      let settled = false;
      const done = (result) => {
        if (settled) return;
        settled = true;
        input.style.display = "none";
        overlay.classList.remove("show");
        resolve(result);
      };
      $el("dialogConfirm").addEventListener(
        "click",
        () => done(input.value.trim() || defaultValue),
        { once: true },
      );
      $el("dialogCancel").addEventListener("click", () => done(null), {
        once: true,
      });
      input.addEventListener(
        "keydown",
        (e) => {
          if (e.key === "Enter") done(input.value.trim() || defaultValue);
          if (e.key === "Escape") done(null);
        },
        { once: true },
      );
    });
  }

  async function showProjectPicker({
    title = "שייך לפרויקט",
    currentId = null,
    allowClear = true,
  } = {}) {
    await _deps.loadBlocks();
    const projects = _deps.getProjects();
    if (!projects.length) return null;

    return new Promise((resolve) => {
      const overlay = $el("dialogOverlay");
      const dlgTitle = $el("dialogTitle");
      const dlgMsg = $el("dialogMsg");
      const confirm = $el("dialogConfirm");
      const cancel = $el("dialogCancel");
      const input = $el("dialogInput");

      dlgTitle.textContent = title;
      dlgMsg.innerHTML = "";
      input.style.display = "none";
      confirm.style.display = "none";
      cancel.textContent = "ביטול";
      overlay.classList.add("show");

      // Reuses the same flat-row/hover/active styling and folder icon as the
      // global project selector's own dropdown (renderProjectSelectItems in
      // history-view.js) — one visual language for "pick a project" across
      // the app, instead of a separate bordered-button look.
      const picker = document.createElement("div");
      picker.className = "project-picker";
      const IC = window.__ccbTpl?.IC;

      if (allowClear) {
        const clearBtn = document.createElement("button");
        clearBtn.type = "button";
        clearBtn.className =
          "project-select-item" + (currentId === null ? " active" : "");
        const clearTitle = document.createElement("span");
        clearTitle.className = "project-select-item-title";
        clearTitle.textContent = "ללא פרויקט";
        clearBtn.appendChild(clearTitle);
        clearBtn.addEventListener("click", () => done(null));
        picker.appendChild(clearBtn);
      }

      for (const project of projects) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className =
          "project-select-item" + (currentId === project.id ? " active" : "");
        if (project.isCodeProject && IC) {
          const itemIcon = document.createElement("span");
          itemIcon.className = "project-select-item-icon";
          itemIcon.innerHTML = IC.folder;
          btn.appendChild(itemIcon);
        }
        const itemTitle = document.createElement("span");
        itemTitle.className = "project-select-item-title";
        itemTitle.textContent = project.title;
        btn.appendChild(itemTitle);
        btn.addEventListener("click", () => done(project.id));
        picker.appendChild(btn);
      }

      dlgMsg.appendChild(picker);

      let settled = false;
      const cleanup = () => {
        dlgMsg.innerHTML = "";
        confirm.style.display = "";
        input.style.display = "none";
        overlay.classList.remove("show");
      };
      const done = (result) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(result);
      };

      cancel.addEventListener("click", () => done(undefined), { once: true });
      overlay.addEventListener(
        "click",
        (e) => {
          if (e.target === overlay) done(undefined);
        },
        { once: true },
      );
    });
  }

  // ============================================================
  // Settings popover
  // ============================================================
  async function openSettings() {
    const overlay = $el("settingsOverlay");
    const box = $el("settingsBox");
    const btn = $el("settingsBtn");
    if (!overlay || !box || !btn) return;
    const panelRect = $el("panel").getBoundingClientRect();
    const btnRect = btn.getBoundingClientRect();
    const left = btnRect.left - panelRect.left;
    const top = btnRect.bottom - panelRect.top + 10;
    box.style.left = Math.max(12, Math.min(left, panelRect.width - 282)) + "px";
    box.style.top = Math.max(12, top) + "px";
    await _deps.loadCtxWindow();
    const input = $el("ccb-ctx-size");
    if (input) input.value = String(Math.round(_deps.getCtxWindow() / 1000));
    await _deps.loadDocMaxChars?.();
    const docInput = $el("ccb-doc-max-chars");
    if (docInput) docInput.value = String(Math.round((_deps.getDocMaxChars?.() || 50000) / 1000));
    await _deps.loadAutoInjectMode?.();
    const gmModeSelect = $el("ccb-auto-inject-mode-gm");
    if (gmModeSelect) gmModeSelect.value = _deps.getAutoInjectMode?.("gm") || "start";
    const projectModeSelect = $el("ccb-auto-inject-mode-project");
    if (projectModeSelect) projectModeSelect.value = _deps.getAutoInjectMode?.("project") || "start";
    overlay.classList.add("show");
  }

  function closeSettings() {
    const overlay = $el("settingsOverlay");
    if (overlay) overlay.classList.remove("show");
  }

  // ============================================================
  // Global code-project scan settings (#scanSettingsOverlay)
  //
  // The editable form of document-handler.js's built-in scan rules: which
  // folders/files are skipped, which extensions are scanned, and the per-file
  // size cap. Applies to EVERY code project (the per-project ignore list in
  // history-view.js#openIgnorePatternsDialog is a separate, additional layer).
  //
  // Edits are held in this module-scoped draft until Save, so "reset to
  // defaults" and closing without saving both behave predictably.
  // ============================================================
  let _scanDraft = null;
  // Per-list live filter text — display-only, never touches _scanDraft.
  // Reset on every openScanSettings() so reopening the dialog starts clean.
  let _scanSearch = {};

  const SCAN_LIST_FIELDS = [
    { key: "denyDirs", listId: "scanDenyDirsList", inputId: "scanDenyDirsInput", addBtnId: "scanDenyDirsAddBtn", searchId: "scanDenyDirsSearch" },
    { key: "denyFilenames", listId: "scanDenyFilesList", inputId: "scanDenyFilesInput", addBtnId: "scanDenyFilesAddBtn", searchId: "scanDenyFilesSearch" },
    { key: "codeExtensions", listId: "scanExtList", inputId: "scanExtInput", addBtnId: "scanExtAddBtn", searchId: "scanExtSearch" },
  ];

  // Same chip-row markup as history-view.js#renderIgnorePatternsList — the two
  // dialogs are deliberately visually identical, but each module renders its
  // own (no shared render helper exists between them today).
  //
  // The search box filters what's SHOWN, not the underlying data — a chip's
  // remove button always splices _scanDraft[field.key] by its true index
  // (captured via forEach on the unfiltered array before the query check), so
  // removing a filtered-in item can't accidentally delete the wrong entry.
  function renderScanList(field) {
    const list = $el(field.listId);
    if (!list) return;
    const values = _scanDraft?.[field.key] || [];
    const query = (_scanSearch[field.key] || "").trim().toLowerCase();
    list.innerHTML = "";

    if (!values.length) {
      const empty = document.createElement("div");
      empty.className = "ignore-patterns-empty";
      empty.textContent = "הרשימה ריקה";
      list.appendChild(empty);
      return;
    }

    let shown = 0;
    values.forEach((value, idx) => {
      if (query && !value.toLowerCase().includes(query)) return;
      shown++;
      const row = document.createElement("div");
      row.className = "ignore-pattern-row";
      const name = document.createElement("span");
      name.className = "ignore-pattern-name";
      name.textContent = value;
      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "ignore-pattern-remove";
      removeBtn.innerHTML = window.__ccbTpl.IC.x;
      removeBtn.setAttribute("aria-label", "הסר");
      removeBtn.onclick = () => {
        _scanDraft[field.key].splice(idx, 1);
        renderScanList(field);
      };
      row.appendChild(name);
      row.appendChild(removeBtn);
      list.appendChild(row);
    });

    if (!shown) {
      const empty = document.createElement("div");
      empty.className = "ignore-patterns-empty";
      empty.textContent = "אין תוצאות מתאימות לחיפוש";
      list.appendChild(empty);
    }
  }

  function renderScanSettings() {
    SCAN_LIST_FIELDS.forEach(renderScanList);
    const sizeInput = $el("scanMaxSizeInput");
    if (sizeInput) sizeInput.value = String(_scanDraft?.maxFileSizeKb ?? 200);
  }

  async function openScanSettings() {
    const overlay = $el("scanSettingsOverlay");
    if (!overlay) return;
    await _deps.loadScanSettings?.();

    // Deep-ish copy: the arrays must not alias state.scanSettings, or editing
    // the draft would mutate live settings even if the user never saves.
    const current = _deps.getScanSettings?.() || _deps.getDefaultScanSettings();
    _scanDraft = {
      denyDirs: [...(current.denyDirs || [])],
      denyFilenames: [...(current.denyFilenames || [])],
      codeExtensions: [...(current.codeExtensions || [])],
      maxFileSizeKb: current.maxFileSizeKb,
    };
    _scanSearch = {};

    renderScanSettings();
    overlay.classList.add("show");

    // Clone each interactive element to strip listeners left over from a prior
    // open — same approach as history-view.js#openIgnorePatternsDialog.
    SCAN_LIST_FIELDS.forEach((field) => {
      const searchInput = $el(field.searchId).cloneNode(true);
      $el(field.searchId).replaceWith(searchInput);
      searchInput.value = "";
      searchInput.addEventListener("input", () => {
        _scanSearch[field.key] = searchInput.value || "";
        renderScanList(field);
      });

      const input = $el(field.inputId).cloneNode(true);
      $el(field.inputId).replaceWith(input);
      input.value = "";
      const addFromInput = () => {
        const raw = input.value.trim();
        if (!raw) return;
        raw.split(",").map((s) => s.trim()).filter(Boolean).forEach((v) => {
          // Extensions are stored bare ("js"), so a typed ".js" still matches.
          const val = field.key === "codeExtensions" ? v.replace(/^\./, "").toLowerCase() : v;
          if (val && !_scanDraft[field.key].includes(val)) _scanDraft[field.key].push(val);
        });
        input.value = "";
        // Clear any active search — otherwise an item just added could be
        // immediately hidden by a filter the user typed into a different box.
        _scanSearch[field.key] = "";
        searchInput.value = "";
        renderScanList(field);
        input.focus();
      };
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") { e.preventDefault(); addFromInput(); }
      });
      const addBtn = $el(field.addBtnId).cloneNode(true);
      $el(field.addBtnId).replaceWith(addBtn);
      addBtn.addEventListener("click", addFromInput);
    });

    const saveBtn = $el("scanSettingsSaveBtn").cloneNode(true);
    $el("scanSettingsSaveBtn").replaceWith(saveBtn);
    saveBtn.addEventListener("click", () => void saveScanSettings());

    const resetBtn = $el("scanSettingsResetBtn").cloneNode(true);
    $el("scanSettingsResetBtn").replaceWith(resetBtn);
    resetBtn.addEventListener("click", resetScanSettingsToDefaults);

    const closeBtn = $el("scanSettingsCloseBtn").cloneNode(true);
    $el("scanSettingsCloseBtn").replaceWith(closeBtn);
    closeBtn.addEventListener("click", closeScanSettings);
  }

  function closeScanSettings() {
    const overlay = $el("scanSettingsOverlay");
    if (overlay) overlay.classList.remove("show");
    _scanDraft = null;
    _scanSearch = {};
  }

  // In-memory only — the user still has to press Save to persist.
  function resetScanSettingsToDefaults() {
    _scanDraft = _deps.getDefaultScanSettings();
    // Clear any active search filters too — otherwise the just-restored
    // defaults could appear to be "missing" behind a stale query.
    _scanSearch = {};
    SCAN_LIST_FIELDS.forEach((field) => {
      const input = $el(field.searchId);
      if (input) input.value = "";
    });
    renderScanSettings();
    _deps.setStatus("שוחזרו ברירות המחדל — לחץ שמור");
  }

  async function saveScanSettings() {
    if (!_scanDraft) return;
    const sizeInput = $el("scanMaxSizeInput");
    const size = Number(sizeInput?.value);
    if (!Number.isFinite(size) || size < 1) {
      _deps.setStatus("גודל קובץ מקסימלי חייב להיות מספר חיובי", true);
      return;
    }
    if (!_scanDraft.codeExtensions.length) {
      _deps.setStatus("חייבת להיות לפחות סיומת קובץ אחת לסריקה", true);
      return;
    }
    await _deps.saveScanSettings({ ..._scanDraft, maxFileSizeKb: size });
    closeScanSettings();
    _deps.setStatus("ההגדרות נשמרו — יחולו בסריקה הבאה ✓");
  }

  // ============================================================
  // Prompts editor
  // ============================================================
  function openPromptsEditor() {
    const api = window.__ccbPromptsAPI;
    if (!api) {
      _deps.setStatus("מערכת פרומפטים לא נטענה", true);
      return;
    }

    const editable = api.getEditable();
    const locked = api.getLocked ? api.getLocked() : null;
    if ($el("promptFramingLocked"))
      $el("promptFramingLocked").textContent = locked?.injectedMarker || "[[CCB:INJECTED]]";
    if ($el("promptFramingManualIntro"))
      $el("promptFramingManualIntro").value = editable.manualIntro || "";
    if ($el("promptFramingManualOutro"))
      $el("promptFramingManualOutro").value = editable.manualOutro || "";
    if ($el("promptFramingGmIntro"))
      $el("promptFramingGmIntro").value = editable.gmIntro || "";
    if ($el("promptFramingGmOutro"))
      $el("promptFramingGmOutro").value = editable.gmOutro || "";
    if ($el("promptFramingConvIntro"))
      $el("promptFramingConvIntro").value = editable.convIntro || "";
    if ($el("promptFramingConvOutro"))
      $el("promptFramingConvOutro").value = editable.convOutro || "";
    if ($el("promptFramingProjIntro"))
      $el("promptFramingProjIntro").value = editable.projIntro || "";
    if ($el("promptFramingProjOutro"))
      $el("promptFramingProjOutro").value = editable.projOutro || "";
    if ($el("promptFramingDocsIntro"))
      $el("promptFramingDocsIntro").value = editable.docsIntro || "";
    if ($el("promptFramingDocsOutro"))
      $el("promptFramingDocsOutro").value = editable.docsOutro || "";
    if ($el("promptFramingEveryIntro"))
      $el("promptFramingEveryIntro").value = editable.everyIntro || "";
    if ($el("promptFramingEveryOutro"))
      $el("promptFramingEveryOutro").value = editable.everyOutro || "";

    const overlay = $el("promptsOverlay");
    overlay?.classList.add("show");
    overlay?.setAttribute("aria-hidden", "false");
    closeSettings();
    setTimeout(() => $el("promptFramingManualIntro")?.focus(), 10);
  }

  function closePromptsEditor() {
    const overlay = $el("promptsOverlay");
    overlay?.classList.remove("show");
    overlay?.setAttribute("aria-hidden", "true");
  }

  async function savePromptsEditor() {
    const api = window.__ccbPromptsAPI;
    if (!api) return;
    const manualIntro  = ($el("promptFramingManualIntro")?.value  || "").trim();
    const manualOutro  = ($el("promptFramingManualOutro")?.value  || "").trim();
    const gmIntro      = ($el("promptFramingGmIntro")?.value      || "").trim();
    const gmOutro      = ($el("promptFramingGmOutro")?.value      || "").trim();
    const convIntro    = ($el("promptFramingConvIntro")?.value    || "").trim();
    const convOutro    = ($el("promptFramingConvOutro")?.value    || "").trim();
    const projIntro    = ($el("promptFramingProjIntro")?.value    || "").trim();
    const projOutro    = ($el("promptFramingProjOutro")?.value    || "").trim();
    const docsIntro    = ($el("promptFramingDocsIntro")?.value    || "").trim();
    const docsOutro    = ($el("promptFramingDocsOutro")?.value    || "").trim();
    const everyIntro   = ($el("promptFramingEveryIntro")?.value   || "").trim();
    const everyOutro   = ($el("promptFramingEveryOutro")?.value   || "").trim();

    if (!manualIntro || !gmIntro) {
      _deps.setStatus("הוראות לפני הפרומפטים השמורים ולפני הזיכרון לא יכולות להיות ריקות", true);
      return;
    }

    const payload = { manualIntro, manualOutro, gmIntro, gmOutro, convIntro, convOutro, projIntro, projOutro, docsIntro, docsOutro, everyIntro, everyOutro };

    await api.save(payload);
    _deps.refreshPromptsFromRawConfig();
    closePromptsEditor();
    _deps.setStatus("הפרומפטים עודכנו ✓");
  }

  async function resetPromptsEditor(key) {
    const api = window.__ccbPromptsAPI;
    if (!api) return;
    await api.reset(key);
    _deps.refreshPromptsFromRawConfig();
    const editable = api.getEditable();
    const refreshManual = () => {
      if ($el("promptFramingManualIntro")) $el("promptFramingManualIntro").value = editable.manualIntro || "";
      if ($el("promptFramingManualOutro")) $el("promptFramingManualOutro").value = editable.manualOutro || "";
    };
    const refreshGm = () => {
      if ($el("promptFramingGmIntro")) $el("promptFramingGmIntro").value = editable.gmIntro || "";
      if ($el("promptFramingGmOutro")) $el("promptFramingGmOutro").value = editable.gmOutro || "";
    };
    const refreshConv = () => {
      if ($el("promptFramingConvIntro")) $el("promptFramingConvIntro").value = editable.convIntro || "";
      if ($el("promptFramingConvOutro")) $el("promptFramingConvOutro").value = editable.convOutro || "";
    };
    const refreshProj = () => {
      if ($el("promptFramingProjIntro")) $el("promptFramingProjIntro").value = editable.projIntro || "";
      if ($el("promptFramingProjOutro")) $el("promptFramingProjOutro").value = editable.projOutro || "";
    };
    const refreshDocs = () => {
      if ($el("promptFramingDocsIntro")) $el("promptFramingDocsIntro").value = editable.docsIntro || "";
      if ($el("promptFramingDocsOutro")) $el("promptFramingDocsOutro").value = editable.docsOutro || "";
    };
    const refreshEvery = () => {
      if ($el("promptFramingEveryIntro")) $el("promptFramingEveryIntro").value = editable.everyIntro || "";
      if ($el("promptFramingEveryOutro")) $el("promptFramingEveryOutro").value = editable.everyOutro || "";
    };
    if (key === "framingAll") {
      refreshManual();
      refreshGm();
      refreshConv();
      refreshProj();
      refreshDocs();
      refreshEvery();
    } else if (key === "framingManual") {
      refreshManual();
    } else if (key === "framingGm") {
      refreshGm();
    } else if (key === "framingConv") {
      refreshConv();
    } else if (key === "framingProj") {
      refreshProj();
    } else if (key === "framingDocs") {
      refreshDocs();
    } else if (key === "framingEvery") {
      refreshEvery();
    }
    _deps.setStatus("הפרומפט אופס ✓");
  }

  // ============================================================
  // Onboarding guide (#onboardingView) — static, full-pane reference content.
  // "Seen" state (whether the guide should keep auto-opening on panel open)
  // lives in content.js (getOnboardingSeen/setOnboardingSeen), same split as
  // ctxWindow/docMaxChars: this module only owns the DOM/interaction.
  // ============================================================
  let _onboardingWired = false;

  function markOnboardingSeen() {
    void _deps.setOnboardingSeen?.(true);
    const checkbox = $el("obDismissCheckbox");
    if (checkbox) checkbox.checked = true;
  }

  // Wired once (module-level guard, same idea as _scanDraft's lifecycle) —
  // the guide's content is fully static, so there's nothing to re-render on
  // every open, just the collapse/scroll/checkbox listeners.
  function wireOnboardingOnce() {
    if (_onboardingWired) return;
    _onboardingWired = true;

    const body = $el("obBody");
    body?.addEventListener("click", (e) => {
      const header = e.target.closest(".ob-section-header");
      if (!header) return;
      const section = header.closest(".ob-section");
      const chevron = header.querySelector(".collapse-btn");
      const collapsed = !section.classList.contains("collapsed");
      section.classList.toggle("collapsed", collapsed);
      chevron?.classList.toggle("collapsed", collapsed);
    });

    // Reaching the bottom counts as genuinely having read through the guide
    // — same dismissal effect as ticking "don't show again" below, per the
    // user's explicit choice. A plain close (X/Escape) deliberately does not
    // set this, so the guide keeps auto-opening until one of these happens.
    body?.addEventListener("scroll", () => {
      if (body.scrollHeight - body.scrollTop - body.clientHeight < 24) {
        markOnboardingSeen();
      }
    });

    $el("obDismissCheckbox")?.addEventListener("change", (e) => {
      void _deps.setOnboardingSeen?.(e.target.checked);
    });
  }

  function openOnboarding() {
    const view = $el("onboardingView");
    if (!view) return;

    // Same fixed, same-z-index takeover area as the conversation/file-preview/
    // dependency-manager views — never show more than one at once.
    window.__ccbHistoryView?.closeConversationView?.();
    window.__ccbCodeTree?.closeFilePreview?.();
    window.__ccbCodeTree?.closeDepsManager?.();

    wireOnboardingOnce();
    const checkbox = $el("obDismissCheckbox");
    if (checkbox) checkbox.checked = !!_deps.getOnboardingSeen?.();

    view.classList.add("cv-open");
    view.setAttribute("aria-hidden", "false");
    const body = $el("obBody");
    if (body) body.scrollTop = 0;
  }

  function closeOnboarding() {
    const view = $el("onboardingView");
    if (!view) return;
    view.classList.remove("cv-open");
    view.setAttribute("aria-hidden", "true");
  }

  // ============================================================
  // Public API
  // ============================================================
  window.__ccbModals = {
    /**
     * @param {{
     *   getShadow: () => ShadowRoot,
     *   setStatus: (msg: string, isError?: boolean) => void,
     *   refreshPromptsFromRawConfig: () => void,
     *   loadBlocks: () => Promise<void>,
     *   loadCtxWindow: () => Promise<void>,
     *   getCtxWindow: () => number,
     *   loadAutoInjectMode: () => Promise<void>,
     *   getAutoInjectMode: (source: "gm" | "project") => "start" | "every",
     *   getProjects: () => Array, // ALL projects (regular + code) — showProjectPicker lists both
     *   loadScanSettings: () => Promise<void>,
     *   getScanSettings: () => object,        // live global code-project scan rules
     *   saveScanSettings: (next) => Promise<object>,
     *   getDefaultScanSettings: () => object, // built-in defaults, for "reset to defaults"
     *   getOnboardingSeen: () => boolean,
     *   setOnboardingSeen: (seen: boolean) => Promise<void>,
     * }} deps
     */
    init(deps) { _deps = deps; },
    showConfirm,
    showChoice,
    showPrompt,
    showProjectPicker,
    openSettings,
    closeSettings,
    openScanSettings,
    closeScanSettings,
    saveScanSettings,
    resetScanSettingsToDefaults,
    openPromptsEditor,
    closePromptsEditor,
    savePromptsEditor,
    resetPromptsEditor,
    openOnboarding,
    closeOnboarding,
  };
})();
