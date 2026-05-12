// prompts.js — loads editable prompt overrides from storage and applies them to window.__ccbRawConfig.
// Must run after config.js and before content.js.

(() => {
  if (window.__ccbPromptsInstalled) return;
  window.__ccbPromptsInstalled = true;

  const STORAGE_KEY = "ccb_prompts";

  // Locked structural markers — never editable
  const INJECTED_MARKER = "[[CCB:INJECTED]]\n";
  const CONTEXT_OPEN = "<context>\n";
  const CONTEXT_CLOSE = "\n</context>\n\n";
  const MEMORY_OPEN = "<memory>\n";
  const MEMORY_CLOSE = "\n</memory>\n\n";
  const CONV_OPEN = "<transcript>\n";
  const CONV_CLOSE = "\n</transcript>\n\n";
  const PROJ_OPEN = "<project>\n";
  const PROJ_CLOSE = "\n</project>\n\n";

  const raw = window.__ccbRawConfig;
  if (!raw) return;

  const norm = (s) => String(s || "").replace(/\r\n/g, "\n");

  // Strip locked start marker and trailing open-tag to get the editable intro
  const extractIntro = (full, openTag) => {
    let s = norm(full);
    if (s.startsWith(INJECTED_MARKER)) s = s.slice(INJECTED_MARKER.length);
    if (openTag && s.endsWith(openTag)) s = s.slice(0, -openTag.length);
    return s;
  };

  // Strip locked close-tag prefix to get the editable outro
  const extractOutro = (full, closeTag) => {
    let s = norm(full);
    if (closeTag && s.startsWith(closeTag)) s = s.slice(closeTag.length);
    return s;
  };

  const splitSummaryPrompt = (full) => {
    const lines = norm(full).split("\n");
    if (lines.length <= 2) return { body: norm(full).trimEnd(), suffix: "" };
    const suffix = lines.slice(-2).join("\n");
    const body = lines.slice(0, -2).join("\n").trimEnd();
    return { body, suffix };
  };

  // ─── Defaults ────────────────────────────────────────────────────────────────

  const manualIntroDefault = raw.FRAMING_MANUAL_PRE
    ? extractIntro(raw.FRAMING_MANUAL_PRE, CONTEXT_OPEN)
    : extractIntro(raw.FRAMING || "", "");

  const manualOutroDefault = raw.FRAMING_MANUAL_POST
    ? extractOutro(raw.FRAMING_MANUAL_POST, CONTEXT_CLOSE)
    : "";

  const gmIntroDefault = raw.FRAMING_GM_PRE
    ? extractIntro(raw.FRAMING_GM_PRE, MEMORY_OPEN)
    : extractIntro(raw.FRAMING_GM || raw.FRAMING || "", "");

  const gmOutroDefault = raw.FRAMING_GM_POST
    ? extractOutro(raw.FRAMING_GM_POST, MEMORY_CLOSE)
    : "";

  const convIntroDefault = raw.FRAMING_CONV_PRE
    ? extractIntro(raw.FRAMING_CONV_PRE, CONV_OPEN)
    : "";

  const convOutroDefault = raw.FRAMING_CONV_POST
    ? extractOutro(raw.FRAMING_CONV_POST, CONV_CLOSE)
    : "";

  const projIntroDefault = raw.FRAMING_PROJ_PRE
    ? extractIntro(raw.FRAMING_PROJ_PRE, PROJ_OPEN)
    : "";

  const projOutroDefault = raw.FRAMING_PROJ_POST
    ? extractOutro(raw.FRAMING_PROJ_POST, PROJ_CLOSE)
    : "";

  const { body: summaryBodyDefault, suffix: SUMMARY_SUFFIX } =
    splitSummaryPrompt(norm(raw.SUMMARY_PROMPT));

  // ─── State ───────────────────────────────────────────────────────────────────

  const state = {
    manualIntro: manualIntroDefault,
    manualOutro: manualOutroDefault,
    gmIntro: gmIntroDefault,
    gmOutro: gmOutroDefault,
    convIntro: convIntroDefault,
    convOutro: convOutroDefault,
    projIntro: projIntroDefault,
    projOutro: projOutroDefault,
    summaryBody: summaryBodyDefault,
  };

  // ─── Apply ───────────────────────────────────────────────────────────────────

  const applyToRawConfig = () => {
    // Wrappers (PRE wraps open, POST wraps close)
    raw.FRAMING_MANUAL_PRE = INJECTED_MARKER + state.manualIntro + CONTEXT_OPEN;
    raw.FRAMING_MANUAL_POST = CONTEXT_CLOSE + state.manualOutro;

    raw.FRAMING_GM_PRE = INJECTED_MARKER + state.gmIntro + MEMORY_OPEN;
    raw.FRAMING_GM_POST = MEMORY_CLOSE + state.gmOutro;

    raw.FRAMING_CONV_PRE = INJECTED_MARKER + state.convIntro + CONV_OPEN;
    raw.FRAMING_CONV_POST = CONV_CLOSE + state.convOutro;

    raw.FRAMING_PROJ_PRE = INJECTED_MARKER + state.projIntro + PROJ_OPEN;
    raw.FRAMING_PROJ_POST = PROJ_CLOSE + state.projOutro;

    raw.FRAMING_MANUAL = INJECTED_MARKER + state.manualIntro;
    raw.FRAMING_GM = INJECTED_MARKER + state.gmIntro;
    raw.FRAMING = raw.FRAMING_MANUAL;

    const body = state.summaryBody.trimEnd();
    raw.SUMMARY_PROMPT = body + (SUMMARY_SUFFIX ? "\n" + SUMMARY_SUFFIX : "");
  };

  // ─── Storage load ─────────────────────────────────────────────────────────

  let readyResolve = null;
  const ready = new Promise((resolve) => { readyResolve = resolve; });

  chrome.storage.local.get(STORAGE_KEY, (data) => {
    const stored = data?.[STORAGE_KEY] || {};

    // Current schema
    if (typeof stored.manualIntro === "string")  state.manualIntro  = stored.manualIntro;
    if (typeof stored.manualOutro === "string")  state.manualOutro  = stored.manualOutro;
    if (typeof stored.gmIntro === "string")        state.gmIntro       = stored.gmIntro;
    if (typeof stored.gmOutro === "string")        state.gmOutro       = stored.gmOutro;
    if (typeof stored.convIntro === "string")      state.convIntro     = stored.convIntro;
    if (typeof stored.convOutro === "string")      state.convOutro     = stored.convOutro;
    if (typeof stored.projIntro === "string")      state.projIntro     = stored.projIntro;
    if (typeof stored.projOutro === "string")      state.projOutro     = stored.projOutro;
    if (typeof stored.summaryBody === "string")   state.summaryBody  = stored.summaryBody;

    // Backward-compat: old schema had framingBodies: { manual, gm }
    if (!stored.manualIntro) {
      const fb = stored.framingBodies || stored.framing;
      if (fb && typeof fb === "object") {
        if (typeof fb.manual  === "string") state.manualIntro  = fb.manual;
        if (typeof fb.gm      === "string") state.gmIntro       = fb.gm;
      } else if (typeof stored.framingBody === "string") {
        state.manualIntro  = stored.framingBody;
        state.gmIntro       = stored.framingBody;
      }
    }

    applyToRawConfig();
    readyResolve?.();
  });

  // ─── API ──────────────────────────────────────────────────────────────────

  window.__ccbPromptsAPI = {
    ready,

    getEditable() {
      return {
        manualIntro:   state.manualIntro,
        manualOutro:   state.manualOutro,
        gmIntro:        state.gmIntro,
        gmOutro:        state.gmOutro,
        convIntro:      state.convIntro,
        convOutro:      state.convOutro,
        projIntro:      state.projIntro,
        projOutro:      state.projOutro,
        summaryBody:   state.summaryBody,
      };
    },

    getLocked() {
      return {
        injectedMarker:  INJECTED_MARKER.trimEnd(),
        contextOpen:     CONTEXT_OPEN.trim(),
        contextClose:    CONTEXT_CLOSE.trim(),
        memoryOpen:      MEMORY_OPEN.trim(),
        memoryClose:     MEMORY_CLOSE.trim(),
        convOpen:        CONV_OPEN.trim(),
        convClose:       CONV_CLOSE.trim(),
        projOpen:        PROJ_OPEN.trim(),
        projClose:       PROJ_CLOSE.trim(),
        summarySuffix:   SUMMARY_SUFFIX,
      };
    },

    async save({ manualIntro, manualOutro, gmIntro, gmOutro, convIntro, convOutro, projIntro, projOutro, summaryBody }) {
      if (typeof manualIntro   === "string") state.manualIntro   = manualIntro;
      if (typeof manualOutro   === "string") state.manualOutro   = manualOutro;
      if (typeof gmIntro       === "string") state.gmIntro       = gmIntro;
      if (typeof gmOutro       === "string") state.gmOutro       = gmOutro;
      if (typeof convIntro     === "string") state.convIntro     = convIntro;
      if (typeof convOutro     === "string") state.convOutro     = convOutro;
      if (typeof projIntro     === "string") state.projIntro     = projIntro;
      if (typeof projOutro     === "string") state.projOutro     = projOutro;
      if (typeof summaryBody   === "string") state.summaryBody   = summaryBody;
      applyToRawConfig();
      await new Promise((resolve) =>
        chrome.storage.local.set({
          [STORAGE_KEY]: {
            manualIntro:   state.manualIntro,
            manualOutro:   state.manualOutro,
            gmIntro:       state.gmIntro,
            gmOutro:       state.gmOutro,
            convIntro:     state.convIntro,
            convOutro:     state.convOutro,
            projIntro:     state.projIntro,
            projOutro:     state.projOutro,
            summaryBody:   state.summaryBody,
          },
        }, resolve),
      );
    },

    async reset(key) {
      const stored = await new Promise((resolve) =>
        chrome.storage.local.get(STORAGE_KEY, (d) => resolve(d?.[STORAGE_KEY] || {})),
      );

      const resetMap = {
        manualIntro:   manualIntroDefault,
        manualOutro:   manualOutroDefault,
        gmIntro:       gmIntroDefault,
        gmOutro:       gmOutroDefault,
        convIntro:     convIntroDefault,
        convOutro:     convOutroDefault,
        projIntro:     projIntroDefault,
        projOutro:     projOutroDefault,
        summaryBody:   summaryBodyDefault,
      };

      const keysToReset = key === "framingAll"
        ? ["manualIntro", "manualOutro", "gmIntro", "gmOutro", "convIntro", "convOutro", "projIntro", "projOutro"]
        : key === "framingManual"  ? ["manualIntro",  "manualOutro"]
        : key === "framingGm"      ? ["gmIntro", "gmOutro"]
        : key === "framingConv"    ? ["convIntro", "convOutro"]
        : key === "framingProj"    ? ["projIntro", "projOutro"]
        : key === "summary"        ? ["summaryBody"]
        : resetMap[key] !== undefined ? [key]
        : [];

      for (const k of keysToReset) {
        state[k] = resetMap[k];
        delete stored[k];
      }
      // Clean up old schema keys on full reset
      if (key === "framingAll") {
        delete stored.framingBodies;
        delete stored.framing;
        delete stored.framingBody;
      }

      applyToRawConfig();
      await new Promise((resolve) =>
        chrome.storage.local.set({ [STORAGE_KEY]: stored }, resolve),
      );
    },
  };
})();
