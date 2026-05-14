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
//   openPromptsEditor() / closePromptsEditor()
//   savePromptsEditor() / resetPromptsEditor(key)

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

      const picker = document.createElement("div");
      picker.className = "project-picker";

      if (allowClear) {
        const clearBtn = document.createElement("button");
        clearBtn.type = "button";
        clearBtn.className =
          "project-picker-item" + (currentId === null ? " active" : "");
        clearBtn.textContent = "ללא פרויקט";
        clearBtn.addEventListener("click", () => done(null));
        picker.appendChild(clearBtn);
      }

      for (const project of projects) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className =
          "project-picker-item" + (currentId === project.id ? " active" : "");
        btn.textContent = project.title;
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
    overlay.classList.add("show");
  }

  function closeSettings() {
    const overlay = $el("settingsOverlay");
    if (overlay) overlay.classList.remove("show");
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

    if (!manualIntro || !gmIntro) {
      _deps.setStatus("הוראות לפני הקונטקסט לא יכולות להיות ריקות", true);
      return;
    }

    const payload = { manualIntro, manualOutro, gmIntro, gmOutro, convIntro, convOutro, projIntro, projOutro };

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
    if (key === "framingAll") {
      refreshManual();
      refreshGm();
      refreshConv();
      refreshProj();
    } else if (key === "framingManual") {
      refreshManual();
    } else if (key === "framingGm") {
      refreshGm();
    } else if (key === "framingConv") {
      refreshConv();
    } else if (key === "framingProj") {
      refreshProj();
    }
    _deps.setStatus("הפרומפט אופס ✓");
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
     *   getProjects: () => Array,
     * }} deps
     */
    init(deps) { _deps = deps; },
    showConfirm,
    showChoice,
    showPrompt,
    showProjectPicker,
    openSettings,
    closeSettings,
    openPromptsEditor,
    closePromptsEditor,
    savePromptsEditor,
    resetPromptsEditor,
  };
})();
