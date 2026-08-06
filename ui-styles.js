// ui-styles.js — Shadow DOM CSS. Loaded before content.js.
window.__ccbCSS = (() => {
  const w = window.__ccbRawConfig.SIDEBAR_WIDTH;
  return `
    @import url('https://fonts.googleapis.com/css2?family=Heebo:wght@400;500;600;700&family=Inter:wght@400;500;600;700&display=swap');

    :host, * { box-sizing: border-box; }

    /* ── Design tokens ── */
    :host {
      --bg-app:        #fafaf9;
      --bg-card:       #ffffff;
      --bg-tag:        #f5f4f0;
      --bg-clear:      #e7e5e0;
      --border-subtle: #f0eeea;
      --border-input:  #ebe8e2;
      --border-strong: #d6d3d0;
      --text-strong:   #1c1917;
      --text-body:     #44403c;
      --text-mute:     #57534e;
      --text-faint:    #78716c;
      --text-ghost:    #a8a29e;
      --r-frame: 16px;
      --r-card:  12px;
      --r-input: 10px;
      --r-tag:   6px;
      --r-check: 5px;
      --r-pill:  999px;
      --font-he: "Heebo", system-ui, sans-serif;
      --font-en: "Inter", system-ui, sans-serif;
      --t-fast:   .15s;
      --t-medium: .25s cubic-bezier(.2,.7,.3,1);
    }

    /* FAB — רצועה דקה תמיד גלויה בצד שמאל */
    .fab {
      position: fixed; top: 50%; left: 0;
      transform: translateY(-50%);
      width: 22px; height: 52px;
      background: var(--text-strong); color: var(--bg-app); border: none;
      border-radius: 0 8px 8px 0;
      box-shadow: 2px 0 8px rgba(0,0,0,.18);
      cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      font-family: var(--font-he); font-size: 13px;
      transition: width var(--t-fast), left var(--t-fast);
      z-index: 2; pointer-events: auto;
    }
    .fab:hover { width: 28px; background: #2a2622; }
    .fab.hidden { left: -32px; pointer-events: none; }

    /* Message navigation (2026-08-06) — two floating arrows, fixed near the
       bottom-left of the viewport (page-fixed, like the FAB, not scoped to
       the panel), stepping through the host page's own chat messages.
       Always visible per the user's explicit choice — including while the
       panel is open, unlike the FAB (which hides then) — so it shifts right
       to just past the panel's own edge instead. #msgNav is a sibling of
       .panel further down this same template (after #quickCmdMenu), so a
       plain CSS sibling combinator reacts to the pre-existing #panel.open
       toggle with no extra JS wiring needed. */
    .msg-nav {
      position: fixed; bottom: 16px; left: 16px; z-index: 3;
      display: flex; flex-direction: column; gap: 6px;
      pointer-events: auto;
      transition: left var(--t-fast);
    }
    #panel.open ~ .msg-nav { left: calc(${w}px + 16px); }
    .msg-nav-btn {
      width: 34px; height: 34px; border-radius: 50%; border: none;
      background: var(--text-strong); color: var(--bg-app); cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      box-shadow: 2px 0 8px rgba(0,0,0,.18);
      transition: opacity var(--t-fast), background var(--t-fast);
    }
    .msg-nav-btn:hover:not(:disabled) { background: #2a2622; }
    .msg-nav-btn:disabled { opacity: 0.35; cursor: default; }
    .msg-nav-btn svg { width: 14px; height: 14px; }

    /* Sidebar */
    .panel {
      position: fixed; top: 0; left: 0;
      width: ${w}px; height: 100vh;
      background: var(--bg-app);
      border-right: 1px solid var(--border-subtle);
      box-shadow: 0 0 0 1px rgba(15,23,42,.04), 2px 0 12px rgba(0,0,0,.06);
      font-family: var(--font-he);
      font-size: 13px; direction: rtl; color: var(--text-strong);
      display: flex; flex-direction: column;
      overflow: hidden;
      transform: translateX(-100%);
      transition: transform var(--t-medium);
      z-index: 2; pointer-events: auto;
    }
    .panel.open { transform: translateX(0); }
    /* Pushed down by the sessions tab strip's height (40px, must match
       .sessions-tabstrip below and sessions.js's STRIP_HEIGHT) whenever it's
       mounted — .panel lives in the same shadow root as the strip, so it
       isn't reached by push.js#pushTop's host-page style injection and would
       otherwise render its own header right underneath the strip. The class
       is added once by sessions.js#init at the top level only (never inside
       a session iframe, where no strip is shown). */
    :host(.ccb-strip-active) .panel { top: 40px; height: calc(100vh - 40px); }

    /* ── Header ──
       No title text anymore (2026-07-28, at the user's request — the
       "משלי" wordmark was removed) — this row is just the close/settings
       icon buttons now, so padding/margin are trimmed to the buttons'
       own 28px height instead of leaving room a title used to need.
       Same day, second request: the tabs moved INTO this row too, flanked
       by the two buttons on either side, instead of sitting in a separate
       row below — .sidebar-title-row is now the header's only row, so its
       old margin-bottom (spacing before that second row) is gone. */
    .sidebar-header {
      padding: 8px 18px;
      background: var(--bg-app);
      border-bottom: 1px solid var(--border-subtle);
      flex-shrink: 0;
      display: flex;
      flex-direction: column;
      gap: 0;
    }
    .sidebar-title-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
    }
    #settingsBtn {
      width: 28px;
      height: 28px;
      flex-shrink: 0;
      border: none;
      background: none;
      padding: 0;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--text-faint);
      border-radius: 6px;
      transition: color var(--t-fast), background var(--t-fast);
    }
    #settingsBtn:hover {
      color: var(--text-strong);
      background: rgba(0,0,0,.04);
    }
    .sidebar-subtitle {
      font-size: 12px;
      color: var(--text-ghost);
      margin-top: 2px;
      display: block;
    }
    #closeBtn {
      width: 28px;
      height: 28px;
      flex-shrink: 0;
      background: none;
      border: none;
      cursor: pointer;
      color: var(--text-faint);
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 16px;
      transition: background var(--t-fast), color var(--t-fast);
    }
    #closeBtn:hover {
      background: rgba(0,0,0,.04);
      color: var(--text-strong);
    }

    .ctx-meter {
      padding: 8px 18px 10px;
      border-bottom: 1px solid var(--border-subtle);
      background: var(--bg-app);
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .ctx-meter-info {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      direction: ltr;
      font-size: 10px;
      color: var(--text-ghost);
    }
    .ctx-label {
      font-size: 11px;
      font-weight: 600;
      color: var(--text-ghost);
      letter-spacing: 0.04em;
      white-space: nowrap;
      transition: color var(--t-fast);
    }
    .ctx-count {
      font-size: 10px;
      font-variant-numeric: tabular-nums;
      color: var(--text-ghost);
      white-space: nowrap;
      margin-right: auto;
    }
    .ctx-meter-bottom {
      display: flex;
      align-items: center;
      gap: 8px;
      direction: ltr;
    }
    .ctx-bar-track {
      flex: 1;
      height: 6px;
      border-radius: 3px;
      background: var(--border-subtle);
      overflow: hidden;
      cursor: help;
      direction: ltr;
    }
    .ctx-bar-fill {
      height: 100%;
      border-radius: 3px;
      width: 0%;
      background: linear-gradient(90deg, #22c55e, #4ade80);
      transition: width 0.4s ease, background 0.4s ease;
    }
    .ctx-bar-fill.warn { background: linear-gradient(90deg, #f59e0b, #fbbf24); }
    .ctx-bar-fill.high { background: linear-gradient(90deg, #f97316, #fb923c); }
    .ctx-bar-fill.crit {
      background: linear-gradient(90deg, #ef4444, #f87171);
      animation: ctx-pulse 1.5s ease-in-out infinite;
    }
    .ctx-pct {
      min-width: 42px;
      font-size: 10px;
      color: var(--text-ghost);
      text-align: right;
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }
    .ctx-files {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding-top: 1px;
      direction: ltr;
      font-size: 10px;
      color: var(--text-ghost);
      cursor: pointer;
      user-select: none;
    }
    .ctx-files:hover { color: var(--text-mute); }
    .ctx-files-icon { flex-shrink: 0; }
    .ctx-files-label {
      min-width: 0;
      flex: 1;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .ctx-files-tokens {
      flex-shrink: 0;
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }
    @keyframes ctx-pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.7; }
    }

    /* ── Global project bar (always visible above both tabs) ── */
    .global-project-bar {
      display: flex; align-items: center; gap: 6px;
      padding: 10px 18px;
      border-bottom: 1px solid var(--border-subtle);
      background: var(--bg-app);
      flex-shrink: 0;
    }
    .global-project-bar .project-select-wrap { flex: 1; min-width: 0; position: relative; }

    /* ── Persistent scan/load progress indicator (below the project bar,
          so it stays visible from either tab for the whole operation) ── */
    .scan-progress {
      padding: 8px 18px 10px;
      border-bottom: 1px solid var(--border-subtle);
      background: var(--bg-app);
      flex-shrink: 0;
    }
    .scan-progress-top {
      display: flex; align-items: center; justify-content: space-between; gap: 8px;
      margin-bottom: 6px;
    }
    .scan-progress-phase {
      font-size: 11px;
      font-weight: 600;
      color: var(--text-strong);
      white-space: nowrap;
    }
    .scan-progress-count {
      font-size: 10px;
      color: var(--text-ghost);
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }
    .scan-progress-track {
      height: 6px;
      border-radius: 3px;
      background: var(--border-subtle);
      overflow: hidden;
      direction: ltr;
    }
    .scan-progress-fill {
      height: 100%;
      width: 0%;
      border-radius: 3px;
      background: linear-gradient(90deg, #3b82f6, #60a5fa);
      transition: width 0.2s linear;
    }
    /* Discovery phase has no known total yet — an indeterminate sweep instead
       of a fill that would otherwise sit at 0% and look stuck. */
    .scan-progress-fill.indeterminate {
      width: 35%;
      transition: none;
      animation: scan-sweep 1.1s ease-in-out infinite;
    }
    @keyframes scan-sweep {
      0%   { transform: translateX(-100%); }
      100% { transform: translateX(340%); }
    }
    .scan-progress-fill.done { background: linear-gradient(90deg, #22c55e, #4ade80); }
    .scan-progress-fill.error { background: linear-gradient(90deg, #ef4444, #f87171); }
    /* dir="ltr" (set on the element) keeps path separators in reading order
       inside this otherwise-RTL panel. Long paths are shortened in JS to their
       last segments rather than via text-overflow, so the file name — the
       informative end — is what survives, not the repo root. */
    .scan-progress-current {
      margin-top: 5px;
      font-size: 10px;
      color: var(--text-ghost);
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      text-align: left;
      min-height: 12px;
    }

    /* ── Panes ──
       .tab-pane/.tab-scroll kept their names after the History tab was
       retired (2026-08-04): #pane-context is the only pane now, but the
       .panel.editing rule further down still uses the class to hide it
       behind the edit form. */
    .tab-pane { display: none; flex-direction: column; flex: 1; min-height: 0; overflow: hidden; }
    .tab-pane.active { display: flex; }
    .tab-scroll {
      flex: 1; min-height: 0;
      overflow-y: auto; overflow-x: hidden;
    }
    #pane-context #list {
      overflow: visible;
      flex: none;
    }

    /* ── Search row ── */
    .context-toolbar {
      display: flex; gap: 8px; padding: 14px 18px 10px; align-items: center;
    }
    .search-wrap { flex: 1; position: relative; }
    #search, .code-tree-search-input, .scan-settings-search-input {
      width: 100%; height: 36px;
      padding: 0 32px 0 10px;
      border: 1px solid var(--border-input); border-radius: var(--r-input);
      font-size: 13px; font-family: var(--font-he);
      background: var(--bg-card); outline: none; color: var(--text-strong);
      transition: border-color var(--t-fast);
      -webkit-appearance: none; appearance: none;
    }
    #search:focus, .code-tree-search-input:focus, .scan-settings-search-input:focus { border-color: var(--text-faint); }
    #search::placeholder, .code-tree-search-input::placeholder, .scan-settings-search-input::placeholder { color: var(--text-ghost); }
    .section-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 18px 4px;
      flex-shrink: 0;
    }
    .section-head-left {
      display: flex;
      align-items: center;
      gap: 6px;
      min-width: 0;
    }
    .section-head-right {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-shrink: 0;
    }
    .section-label {
      font-size: 11px;
      font-weight: 600;
      color: var(--text-ghost);
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .collapse-btn {
      width: 18px;
      height: 18px;
      border: none;
      background: none;
      padding: 0;
      cursor: pointer;
      color: var(--text-faint);
      display: flex;
      align-items: center;
      justify-content: center;
      line-height: 1;
      flex-shrink: 0;
    }
    .collapse-btn:hover { color: var(--text-strong); }
    .collapse-btn svg {
      width: 12px;
      height: 12px;
      transition: transform var(--t-fast);
      transform-origin: center;
    }
    .collapse-btn.collapsed svg { transform: rotate(0deg); }
    .collapse-btn:not(.collapsed) svg { transform: rotate(-90deg); }
    #addProjectBtn, #addCodeProjectBtn, #projectEditBtn, #addBtn {
      width: 22px;
      height: 22px;
      border: 1px solid var(--border-input);
      background: var(--bg-card);
      border-radius: 5px;
      cursor: pointer;
      color: var(--text-mute);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0;
      flex-shrink: 0;
    }
    #addProjectBtn:hover, #addCodeProjectBtn:hover, #projectEditBtn:hover, #addBtn:hover { background: var(--bg-tag); }
    #blocksSection.collapsed #blocksSectionBody {
      display: none;
    }
    .project-documents-list.collapsed {
      display: none;
    }
    .project-select {
      display: flex;
      align-items: center;
      gap: 8px;
      width: 100%;
      box-sizing: border-box;
      padding: 8px 10px;
      border-radius: var(--r-input);
      background: var(--bg-card);
      border: 1px solid var(--border-subtle);
      color: var(--text-strong);
      font-family: var(--font-he);
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      text-align: right;
      transition: background var(--t-fast), border-color var(--t-fast);
    }
    .project-select:hover { background: var(--bg-tag); }
    .project-select:focus { outline: none; border-color: var(--text-faint); }
    .project-select-icon {
      display: flex; flex-shrink: 0; color: var(--text-faint);
      width: 13px; height: 13px;
    }
    .project-select-label {
      flex: 1; min-width: 0;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .project-select-chevron {
      display: flex; flex-shrink: 0; color: var(--text-faint);
      width: 12px; height: 12px;
      transition: transform var(--t-fast);
    }
    .project-select-chevron svg { width: 12px; height: 12px; transform: rotate(-90deg); }
    #projectSelectBtn[aria-expanded="true"] .project-select-chevron svg { transform: rotate(90deg); }
    .project-select-dropdown {
      display: none;
      position: absolute;
      top: calc(100% + 4px);
      right: 0;
      left: 0;
      z-index: 5;
      background: var(--bg-card);
      border: 1px solid var(--border-subtle);
      border-radius: var(--r-card);
      box-shadow: 0 4px 16px rgba(15,23,42,.08), 0 0 0 1px rgba(15,23,42,.02);
      max-height: 280px;
      overflow-y: auto;
      padding: 6px;
    }
    .project-select-dropdown.open { display: block; }
    .project-select-item {
      display: flex; align-items: center; gap: 8px;
      width: 100%; box-sizing: border-box;
      border: none; background: none;
      padding: 8px 10px; border-radius: var(--r-input);
      font-family: var(--font-he); font-size: 13px; color: var(--text-body);
      text-align: right; cursor: pointer;
    }
    .project-select-item:hover { background: var(--bg-tag); }
    .project-select-item.active { background: var(--bg-tag); color: var(--text-strong); font-weight: 600; }
    .project-select-item .project-select-item-icon {
      display: flex; flex-shrink: 0; color: var(--text-faint);
      width: 13px; height: 13px;
    }
    .project-select-item .project-select-item-title {
      flex: 1; min-width: 0;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .doc-refresh-btn {
      width: 22px; height: 22px; flex-shrink: 0; border: none; background: none;
      color: var(--text-faint); cursor: pointer; border-radius: 5px;
      display: flex; align-items: center; justify-content: center;
    }
    .doc-refresh-btn:hover { background: var(--bg-tag); color: var(--text-strong); }
    .search-icon {
      position: absolute; right: 10px; top: 50%; transform: translateY(-50%);
      color: var(--text-ghost); pointer-events: none;
      display: flex; align-items: center;
    }

    /* ── Block list ── */
    #list {
      min-height: 0;
      padding: 4px 18px 14px;
      display: flex; flex-direction: column; gap: 8px;
      flex: 1;
    }

    /* ── Context hints (no project / project selected) ── */
    .context-hint {
      padding: 6px 10px; margin-bottom: 8px;
      background: var(--bg-tag);
      border: 1px solid var(--border-subtle);
      border-radius: 6px;
      font-size: 11px;
      color: var(--text-faint);
    }
    .hint-text { margin: 0; }

    /* ── Block card ── */
    /* Checkbox and title share one line (the checkbox is a direct flex child
       next to .block-main, same layout as .card-top). */
    .block {
      display: flex; align-items: flex-start; gap: 10px;
      background: var(--bg-card);
      border: 1px solid var(--border-subtle);
      border-radius: var(--r-card);
      padding: 12px 14px; cursor: pointer;
      transition: border-color var(--t-fast), box-shadow var(--t-fast), background var(--t-fast);
    }
    .block:hover { background: #fdfdfc; border-color: #e8e5df; }
    .block.selected {
      border-color: var(--border-strong);
      box-shadow: 0 1px 2px rgba(15,23,42,.04), 0 0 0 1px rgba(28,25,23,.04);
    }
    .card-top { display: flex; align-items: flex-start; gap: 10px; }

    /* Custom checkbox */
    .cb-wrap { position: relative; flex-shrink: 0; width: 18px; height: 18px; margin-top: 2px; }
    .cb-wrap input[type="checkbox"] {
      opacity: 0; position: absolute; inset: 0; width: 100%; height: 100%;
      margin: 0; cursor: pointer; z-index: 1;
    }
    .cb-box {
      width: 18px; height: 18px;
      border: 1.5px solid var(--border-strong); border-radius: var(--r-check);
      background: var(--bg-card);
      display: flex; align-items: center; justify-content: center;
      transition: background var(--t-fast), border-color var(--t-fast);
      pointer-events: none;
    }
    .cb-wrap input:checked + .cb-box {
      background: var(--text-strong); border-color: var(--text-strong);
    }
    .cb-check { display: none; }
    .cb-wrap input:checked + .cb-box .cb-check { display: block; }
    .cb-wrap input:disabled { cursor: not-allowed; }
    .cb-wrap input:disabled + .cb-box { opacity: .4; }

    /* Card body */
    .block-main { flex: 1; min-width: 0; }
    /* flex-start (not space-between): the project tag sits right beside the
       title, not stretched to the row's far edge. .block-head is always the
       sole line of a row now (the tags feature that used to add a second
       row below was retired 2026-07-28), so every row is exactly one
       title-row tall. */
    .block-head {
      display: flex; align-items: baseline; justify-content: flex-start;
      gap: 8px;
    }
    .block-title {
      font-size: 13px; font-weight: 600; color: var(--text-strong);
      letter-spacing: -0.005em; word-break: break-word;
    }

    .block-preview {
      font-size: 12px; color: var(--text-ghost); line-height: 1.5;
      margin-top: 6px; word-break: break-word;
    }

    /* ── Dropdown menu ──
       #hiDropdown is the shared floating-menu host: the project bar's
       rename/delete menu (history-view.js#openProjectDropdown), the code
       tree's per-file deps menu (code-tree.js), and the context meter's
       files dropdown all render into it. The "hi" prefix is a leftover
       from the History rows it was first built for (retired 2026-08-04). */
    #hiDropdown {
      position: fixed;
      background: var(--bg-card);
      border: 1px solid var(--border-strong);
      border-radius: var(--r-card);
      box-shadow: 0 4px 16px rgba(0,0,0,.12), 0 1px 4px rgba(0,0,0,.06);
      padding: 4px;
      min-width: 160px;
      z-index: 20;
      display: none;
      overflow-y: auto;
      max-height: 100vh;
    }
    #hiDropdown.open { display: block; }
    #hiDropdown.ctx-files-dropdown {
      min-width: 220px;
      max-width: 360px;
      max-height: 260px;
      overflow-y: auto;
    }
    .hd-item {
      display: flex; align-items: center; gap: 8px;
      padding: 8px 10px; border-radius: 8px;
      font-size: 13px; font-family: var(--font-he);
      color: var(--text-body); cursor: pointer;
      transition: background var(--t-fast);
    }
    .hd-item:hover { background: var(--bg-tag); }
    .hd-item.danger { color: #c53030; }
    .hd-item.danger:hover { background: #fff5f5; }
    .hd-sep {
      height: 1px; background: var(--border-subtle); margin: 4px 0;
    }
    .ctx-file-item {
      justify-content: space-between;
      gap: 12px;
    }
    .ctx-file-name {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      flex: 1;
    }
    .ctx-file-tokens {
      flex-shrink: 0;
      color: var(--text-faint);
      font-variant-numeric: tabular-nums;
    }
    .ctx-meter-header {
      display: flex; align-items: center; gap: 6px;
      cursor: pointer; user-select: none; padding: 0;
    }
    .ctx-meter-header:hover .ctx-label { color: var(--text-strong); }
    .ctx-meter-header:hover .collapse-btn { color: var(--text-strong); }
    .ctx-meter-header[aria-expanded="true"] .collapse-btn { transform: none; }
    .ctx-meter-header[aria-expanded="true"] .collapse-btn svg { transform: rotate(-90deg); }
    .ctx-meter-header[aria-expanded="false"] .collapse-btn svg { transform: rotate(0deg); }
    .ctx-expanded {
      padding: 8px 0 2px; font-size: 12px; color: var(--text-body);
      border-top: 1px solid var(--border-subtle); margin-top: 8px;
    }
    .ctx-expanded .row { display:flex; justify-content: space-between; align-items: center; padding: 3px 0; }
    .ctx-expanded .row .label { color: var(--text-mute); }
    .ctx-expanded .row .value { font-variant-numeric: tabular-nums; color: var(--text-strong); font-weight: 500; }

    /* Ensure project-related names respect RTL and truncate instead of expanding */
    .project-accordion-toggle {
      direction: rtl;
      width: 100%;
      display: flex;
      align-items: center;
      gap: 6px;
      border: none;
      background: none;
      cursor: pointer;
      color: var(--text-strong);
      font-family: var(--font-he);
      font-size: 13px;
      font-weight: 600;
      padding: 0 2px;
      text-align: right;
    }
    .project-accordion-arrow {
      width: 16px;
      height: 16px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      color: var(--text-faint);
      flex-shrink: 0;
    }
    .project-view-label {
      font-size: 11px;
      font-weight: 600;
      color: var(--text-ghost);
      text-transform: uppercase;
      letter-spacing: 0.04em;
      padding: 0 2px;
    }
    /* Rows reuse .project-select-item (the global project dropdown's own
       styling — flex row, hover/active highlight, truncating title span) —
       see ui-modals.js#showProjectPicker. */
    .project-picker {
      display: flex;
      flex-direction: column;
      margin-top: 8px;
      padding: 6px;
      border: 1px solid var(--border-subtle);
      border-radius: var(--r-card);
      background: var(--bg-app);
      max-height: 280px;
      overflow-y: auto;
    }

    /* ── Footer ── */
    footer {
      padding: 12px 18px 16px; background: var(--bg-app);
      border-top: 1px solid var(--border-subtle);
      display: flex; gap: 8px; flex-shrink: 0;
    }
    .panel.editing footer { display: none; }
    .panel.editing .tab-pane { display: none !important; }

    /* ── General Memory pinned card ── */
    .gm-card {
      margin: 10px 18px 2px;
      background: var(--bg-card);
      border: 1px solid var(--border-subtle);
      border-radius: var(--r-card);
      padding: 12px 14px;
      flex-shrink: 0;
    }
    .gm-header {
      display: flex; align-items: center; gap: 8px;
    }
    .gm-select { margin-top: 1px; }
    /* overflow/ellipsis: the badge (now inline beside the title, not on its
       own row below — 2026-07-28) needs guaranteed room at the row's end
       even when the title is long. */
    .gm-title {
      font-weight: 600; font-size: 13px; flex: 1; color: var(--text-strong);
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .auto-badge {
      display: inline-block; flex-shrink: 0;
      font-size: 11px; padding: 2px 7px;
      background: var(--bg-tag); color: var(--text-mute);
      border-radius: var(--r-tag); font-weight: 500; white-space: nowrap;
    }
    /* Live mode badge (GM + project-instructions cards) — clickable, flips
       the global auto-inject mode (start-of-conversation vs every message). */
    .auto-badge-live { cursor: pointer; }
    .auto-badge-live:hover { background: var(--bg-hover, var(--bg-tag)); color: var(--text-strong); }
    .gm-edit-btn {
      height: 26px; padding: 0 10px; flex-shrink: 0;
      border: 1px solid var(--border-input); background: var(--bg-card);
      border-radius: var(--r-input); font-size: 12px; font-family: var(--font-he);
      cursor: pointer; color: var(--text-body);
      transition: background var(--t-fast);
    }
    .gm-edit-btn:hover { background: #faf8f4; }

    /* GM + project-instructions cards: the whole card opens the edit form on
       click (toggle/checkbox stop propagation before it reaches here) */
    #gmCard .gm-card, #projectInstructionsCard .gm-card {
      cursor: pointer;
      transition: border-color var(--t-fast), background var(--t-fast);
    }
    #gmCard .gm-card:hover, #projectInstructionsCard .gm-card:hover {
      background: #fdfdfc; border-color: #e8e5df;
    }

    /* Toggle switch */
    .toggle { position: relative; width: 36px; height: 20px; flex-shrink: 0; cursor: pointer; }
    .toggle input { opacity: 0; width: 0; height: 0; position: absolute; }
    .toggle-track {
      position: absolute; inset: 0;
      background: var(--bg-clear); border-radius: 999px;
      transition: background .2s;
    }
    .toggle input:checked + .toggle-track { background: var(--text-strong); }
    .toggle-track::after {
      content: ''; position: absolute;
      width: 14px; height: 14px; border-radius: 50%;
      background: white; top: 3px; left: 3px;
      transition: transform .2s;
      box-shadow: 0 1px 3px rgba(0,0,0,.2);
    }
    .toggle input:checked + .toggle-track::after { transform: translateX(16px); }

    /* Toast */
    #toast {
      position: absolute; bottom: 70px; left: 50%; transform: translateX(-50%);
      background: var(--text-strong); color: var(--bg-app);
      padding: 7px 14px; border-radius: var(--r-pill);
      font-size: 12px; font-weight: 500; white-space: nowrap;
      opacity: 0; pointer-events: none;
      transition: opacity .2s;
    }
    #toast.show { opacity: 1; }
    #toast.error { background: #c53030; }
    /* Both footer actions are the same size — they're peer actions ("load
       prompts" / "load documents"), so neither gets visual priority. */
    #injectBtn {
      flex: 1; height: 38px; border: none;
      background: var(--text-strong); color: var(--bg-app);
      border-radius: var(--r-input);
      font-size: 13px; font-weight: 600; font-family: var(--font-he);
      cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px;
      transition: background var(--t-fast);
    }
    #injectBtn:hover:not(:disabled) { background: #2a2622; }
    #injectBtn:disabled { background: var(--bg-clear); color: var(--text-ghost); cursor: not-allowed; }
    #injectDocsBtn {
      flex: 1; height: 38px; padding: 0 12px; border: 1.5px solid var(--border-strong);
      background: var(--bg-card); color: var(--text-body);
      border-radius: var(--r-input);
      font-size: 13px; font-weight: 600; font-family: var(--font-he);
      cursor: pointer; display: flex; align-items: center; justify-content: center;
      gap: 6px; white-space: nowrap;
      transition: background var(--t-fast);
    }
    #injectDocsBtn:hover:not(:disabled) { background: var(--bg-hover); }
    #injectDocsBtn:disabled { background: var(--bg-clear); color: var(--text-ghost); border-color: var(--border-subtle); cursor: not-allowed; }
    /* Not a flex:1 peer like the two above — it only ever shows up after a
       manual injection happened, so it doesn't compete with them for width
       when hidden (the common case). min-width (not a fixed width) so the
       stack-depth count-pill (2+ pending undos) can grow the button instead
       of overflowing it. */
    #undoInjectBtn {
      flex: 0 0 auto; min-width: 38px; height: 38px; padding: 0 8px;
      border: 1.5px solid var(--border-strong);
      background: var(--bg-card); color: var(--text-body);
      border-radius: var(--r-input);
      cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px;
      transition: background var(--t-fast);
    }
    #undoInjectBtn:hover { background: var(--bg-hover); }

    .count-pill {
      font-size: 11px; padding: 1px 7px;
      background: rgba(255,255,255,.18); border-radius: 999px;
      font-variant-numeric: tabular-nums;
    }
    #status { display: none; }

    /* ── Confirm dialog ── */
    .dialog-overlay {
      position: absolute; inset: 0;
      background: rgba(28,25,23,.35);
      backdrop-filter: blur(2px);
      display: flex; align-items: center; justify-content: center;
      z-index: 10; padding: 24px;
      opacity: 0; pointer-events: none;
      transition: opacity .15s;
    }
    .dialog-overlay.show { opacity: 1; pointer-events: auto; }
    .dialog-box {
      background: var(--bg-card);
      border: 1px solid var(--border-strong);
      border-radius: var(--r-card);
      box-shadow: 0 8px 24px rgba(0,0,0,.12), 0 2px 8px rgba(0,0,0,.08);
      padding: 20px 18px 16px;
      width: 100%; max-width: 240px;
      transform: translateY(6px);
      transition: transform .15s;
    }
    .dialog-overlay.show .dialog-box { transform: translateY(0); }
    .dialog-title {
      font-size: 14px; font-weight: 600; color: var(--text-strong);
      margin-bottom: 6px; text-align: right;
    }
    .dialog-msg {
      font-size: 12px; color: var(--text-mute); line-height: 1.5;
      text-align: right; margin-bottom: 16px;
    }
    .dialog-input {
      width: 100%; box-sizing: border-box; margin-bottom: 12px;
      padding: 8px 10px; border: 1px solid var(--border-input); border-radius: 6px;
      font-size: 13px; font-family: inherit; direction: rtl;
      background: var(--bg-card); color: var(--text-strong);
    }
    .dialog-input:focus { outline: 2px solid var(--text-strong); border-color: transparent; }
    .dialog-btns { display: flex; flex-direction: column; gap: 8px; }
    .dialog-confirm {
      height: 36px; border: none;
      background: var(--text-strong); color: var(--bg-app);
      border-radius: var(--r-input); font-size: 13px; font-weight: 600;
      font-family: var(--font-he); cursor: pointer;
      transition: background var(--t-fast);
    }

    /* ── Full-pane takeover views — the file preview (#filePreviewView), the
       per-file dependency manager (#depManagerView), its candidate picker
       (#depPickerView), and the onboarding guide (#onboardingView). Same
       takeover layout, different body. The cv- class prefix throughout is
       a leftover from the conversation preview this pattern started as
       (retired 2026-08-04). ── */
    #filePreviewView, #depManagerView, #depPickerView, #onboardingView {
      position: fixed;
      top: 0;
      left: ${w}px;
      right: 0;
      height: 100vh;
      background: var(--bg-app);
      font-family: var(--font-he);
      font-size: 13px;
      direction: rtl;
      color: var(--text-strong);
      z-index: 5;
      display: none;
      flex-direction: column;
      pointer-events: auto;
    }
    #filePreviewView.cv-open, #depManagerView.cv-open, #depPickerView.cv-open, #onboardingView.cv-open { display: flex; }
    /* Dependency manager body — Hebrew section labels stay RTL (inherited),
       file paths within rows are forced LTR (source paths, not UI text). */
    .dm-body-wrap { direction: rtl; }
    .dm-section-label {
      font-size: 11px; color: var(--text-ghost); margin: 14px 0 6px; font-weight: 600;
    }
    .dm-dep-list { display: flex; flex-direction: column; gap: 4px; }
    .dm-dep-row {
      display: flex; align-items: center; justify-content: flex-start;
      gap: 8px; padding: 6px 8px; border-radius: 6px; background: var(--bg-tag);
      direction: ltr; text-align: left; font-size: 12px;
    }
    .dm-dep-row.dm-dep-readonly { color: var(--text-mute); }
    .dm-dep-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .dm-dep-checkbox { flex-shrink: 0; cursor: pointer; }
    /* An automatically-detected edge the user turned off: stays in the list
       (never deleted outright) so it can be switched back on later, rather
       than making the user retype it in the add-picker below. */
    .dm-dep-row.dm-dep-excluded { opacity: 0.55; }
    .dm-dep-row.dm-dep-excluded .dm-dep-name { text-decoration: line-through; }
    /* Marks a row as scanned-in (vs. manually added) — the same distinction
       that decides whether unchecking it keeps the row around (automatic)
       or deletes it outright (manual), made visible rather than only
       behavioral. Hebrew text inside the row's LTR direction, so isolated
       explicitly per the bidi convention used elsewhere in this file. */
    .dm-dep-tag {
      flex-shrink: 0; margin-inline-start: auto; font-size: 10px; padding: 1px 6px;
      background: var(--bg-card); border: 1px solid var(--border-light);
      border-radius: var(--r-tag); color: var(--text-faint); font-weight: 500;
      direction: rtl; unicode-bidi: isolate; white-space: nowrap;
    }
    /* Indirect (transitive-only) dependencies — read-only, since editing an
       edge that actually belongs to a DIFFERENT file's outgoing list doesn't
       make sense from here (same reasoning as the dependents section). The
       reason text ("עקיף · דרך X") is isolated bidi like .dm-dep-tag, and
       pushed to the row's far end via auto margin so name and reason don't
       crowd each other on a long path. */
    .dm-dep-row.dm-dep-indirect { font-style: italic; }
    .dm-dep-reason {
      flex-shrink: 0; margin-inline-start: auto; font-size: 10px; color: var(--text-ghost);
      direction: rtl; unicode-bidi: isolate; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      max-width: 45%;
    }
    .dm-add-wrap { margin-top: 8px; position: relative; }
    /* File-map picker for adding a dependency — same row language as the
       inline code tree (.code-tree-row/-icon/-label/collapse-btn), but its
       own collapse state that defaults every folder CLOSED (see
       _dmExpandedPaths in code-tree.js), unlike the main tree's default-open. */
    .dm-add-tree {
      margin-top: 6px; max-height: 240px; overflow-y: auto;
      border: 1px solid var(--border-light); border-radius: 6px; padding: 6px;
    }
    .dm-tree-file-row { cursor: pointer; }
    .dm-tree-file-row:hover { background: var(--bg-tag); }
    /* File preview body — read-only file content, monospace, LTR regardless
       of the panel's own RTL (source code direction, not UI language). */
    .fp-body-wrap { flex: 1; min-height: 0; overflow: auto; padding: 14px 18px; }
    .fp-body {
      margin: 0; direction: ltr; text-align: left;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 12px; line-height: 1.55; color: var(--text-body);
      white-space: pre; tab-size: 2;
    }
    .cv-shell {
      display: flex;
      flex-direction: column;
      flex: 1;
      min-height: 0;
      overflow: hidden;
    }

    /* ── Onboarding guide (#onboardingView) — static reference content, all
       sections collapsed by default. Reuses .section-header/.section-label
       and .collapse-btn/.collapsed (same chevron rotation as #blocksSection)
       instead of new per-row CSS. ── */
    .ob-dismiss-row {
      padding: 8px 18px;
      border-bottom: 1px solid var(--border-subtle);
      flex-shrink: 0;
    }
    .ob-dismiss-label {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
      color: var(--text-faint);
      cursor: pointer;
    }
    .ob-body-wrap { padding: 0; }
    .ob-header-subtitle {
      margin-top: 2px;
      color: var(--text-ghost);
      font-size: 11px;
      font-weight: 400;
    }
    .ob-welcome {
      margin: 14px 14px 10px;
      padding: 16px;
      border: 1px solid var(--border-input);
      border-radius: 12px;
      background: linear-gradient(135deg, var(--bg-card), var(--bg-tag));
    }
    .ob-welcome-kicker {
      color: var(--text-faint);
      font-size: 10px;
      font-weight: 700;
      letter-spacing: .06em;
      text-transform: uppercase;
    }
    .ob-welcome h2 {
      margin: 4px 0 6px;
      color: var(--text-strong);
      font-size: 16px;
      line-height: 1.3;
    }
    .ob-welcome > p {
      margin: 0;
      color: var(--text-body);
      font-size: 12px;
      line-height: 1.55;
    }
    .ob-steps {
      display: flex;
      flex-direction: column;
      gap: 9px;
      padding: 0;
      margin: 14px 0 0;
      list-style: none;
    }
    .ob-steps li { display: flex; align-items: flex-start; gap: 9px; }
    .ob-step-number {
      display: inline-flex;
      flex: 0 0 20px;
      width: 20px;
      height: 20px;
      align-items: center;
      justify-content: center;
      border-radius: 50%;
      background: var(--text-strong);
      color: var(--bg-card);
      font-size: 11px;
      font-weight: 700;
      line-height: 1;
    }
    .ob-steps b { color: var(--text-strong); font-size: 12px; }
    .ob-steps small { display: block; margin-top: 1px; color: var(--text-body); font-size: 11.5px; line-height: 1.45; }
    .ob-concepts {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 6px;
      padding: 0 14px 14px;
    }
    .ob-concepts > div {
      min-width: 0;
      padding: 9px 8px;
      border: 1px solid var(--border-subtle);
      border-radius: 9px;
      background: var(--bg-card);
    }
    .ob-concepts b { display: block; color: var(--text-strong); font-size: 11px; }
    .ob-concepts span { display: block; margin-top: 3px; color: var(--text-faint); font-size: 10.5px; line-height: 1.4; }
    .ob-section-label {
      padding: 0 18px 8px;
      color: var(--text-ghost);
      font-size: 10px;
      font-weight: 700;
      letter-spacing: .04em;
    }
    .ob-section { border-bottom: 1px solid var(--border-subtle); }
    .ob-section:last-child { border-bottom: none; }
    .ob-section-header { cursor: pointer; transition: background var(--t-fast); }
    .ob-section-header:hover { background: var(--bg-tag); }
    .ob-section-icon { display: flex; align-items: center; color: var(--text-faint); }
    .ob-section-body {
      padding: 2px 18px 14px 42px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .ob-section.collapsed .ob-section-body { display: none; }
    .ob-item { font-size: 12.5px; line-height: 1.5; color: var(--text-body); }
    .ob-item b { color: var(--text-strong); font-weight: 600; }

    /* Header */
    .cv-header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px 18px 10px;
      border-bottom: 1px solid var(--border-subtle);
      flex-shrink: 0;
    }
    #fpBack, #dmBack, #dpBack, #obClose {
      width: 30px;
      height: 30px;
      border: none;
      background: none;
      border-radius: 8px;
      cursor: pointer;
      color: var(--text-faint);
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    #fpBack:hover, #dmBack:hover, #dpBack:hover, #obClose:hover { background: rgba(0,0,0,.04); color: var(--text-strong); }
    /* #dmBack was missing from the rule above entirely, so it rendered with
       the browser's default button chrome (bordered square) — reported as
       "ugly". Also moves it to the opposite side of the header from
       #fpBack: row-reverse puts the first DOM child (the button) at
       the RTL end (left) instead of the RTL start (right), swapping places
       with .cv-title-wrap. */
    #depManagerView .cv-header { flex-direction: row-reverse; }
    .cv-title-wrap { flex: 1; min-width: 0; }
    /* File preview header: the bare filename is the emphasized, centered
       focal point on top, with its full path (including the filename
       itself) as a small dim line below it. Both are LTR — file paths/names
       read left-to-right regardless of the panel's own RTL, same reasoning
       as .fp-body below. */
    .fp-title-wrap { text-align: center; }
    .fp-title {
      font-size: 15px; font-weight: 700; color: var(--text-strong);
      direction: ltr; white-space: nowrap; overflow: hidden;
      text-overflow: ellipsis;
    }
    .fp-path {
      font-size: 11px; color: var(--text-ghost); direction: ltr;
      margin-top: 1px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .fp-meta {
      font-size: 11px; color: var(--text-ghost); direction: ltr;
      margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    /* Each metric ("N תווים", "N tokens") is its own isolated flex group so
       its direction can't leak into/out of the rest of the line. Direction
       is set per group to match its actual language — rtl for the Hebrew
       "תווים" label, ltr for the English "tokens" label — rather than
       forcing ltr on both (an earlier attempt that didn't hold up). */
    .fp-meta-item {
      display: inline-flex; align-items: baseline; gap: 3px;
      unicode-bidi: isolate;
    }
    .fp-meta-item.fp-meta-rtl { direction: rtl; }
    .fp-meta-item.fp-meta-ltr { direction: ltr; }

    /* Sticky footer + primary action button for a full-pane takeover view.
       Named for the conversation view they started in (retired 2026-08-04);
       the surviving user is #depPickerView's save button (#dpSaveBtn). */
    .cv-footer {
      padding: 10px 18px 14px;
      border-top: 1px solid var(--border-subtle);
      background: var(--bg-app);
      flex-shrink: 0;
      display: flex;
      flex-direction: row;
      gap: 8px;
    }
    .cv-load-btn {
      width: 100%;
      height: 40px;
      border: none;
      border-radius: var(--r-input);
      font-size: 13px;
      font-weight: 600;
      font-family: var(--font-he);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      transition: background var(--t-fast);
      background: var(--text-strong);
      color: var(--bg-app);
    }
    .cv-load-btn:hover:not(:disabled) { background: #2a2622; }
    .cv-load-btn:disabled {
      background: var(--bg-clear);
      color: var(--text-ghost);
      cursor: not-allowed;
    }

    .dialog-confirm:hover { background: #2a2622; }
    .dialog-confirm.danger { background: #c53030; }
    .dialog-confirm.danger:hover { background: #9b2c2c; }
    .dialog-cancel {
      height: 36px;
      border: 1px solid var(--border-input); background: var(--bg-card);
      color: var(--text-body); border-radius: var(--r-input);
      font-size: 13px; font-weight: 500; font-family: var(--font-he); cursor: pointer;
      transition: background var(--t-fast);
    }
    .dialog-cancel:hover { background: #faf8f4; }

    /* ── Settings modal ── */
    .settings-overlay {
      position: absolute; inset: 0;
      background: transparent;
      display: block;
      z-index: 11;
      opacity: 0; pointer-events: none;
      transition: opacity .15s;
    }
    .settings-overlay.show { opacity: 1; pointer-events: auto; }
    /* Spans the panel's full width (2026-07-28, at the user's request — was
       a narrow 270px popover anchored under #settingsBtn) via left/right
       instead of a fixed width, so ui-modals.js#openSettings only needs to
       compute the top offset anymore; horizontal position is fixed by CSS. */
    .settings-box {
      position: absolute;
      left: 12px; right: 12px;
      background: var(--bg-card);
      border: 1px solid var(--border-strong);
      border-radius: 18px;
      box-shadow: 0 8px 24px rgba(0,0,0,.12), 0 2px 8px rgba(0,0,0,.08);
      padding: 14px;
      transform: translateY(6px);
      transition: transform .15s;
      /* max-height is set inline per-open (ui-modals.js#openSettings) to the
         space actually available below the box's computed top, since .panel
         is a fixed 100vh/overflow:hidden — without this, a tall settings
         list silently clips instead of scrolling. */
      overflow-y: auto;
    }
    .settings-overlay.show .settings-box { transform: translateY(0); }
    .settings-head {
      display: flex; align-items: center; justify-content: space-between;
      gap: 10px; margin-bottom: 12px;
    }
    /* Font sizes and padding tightened 2026-07-28 (at the user's request,
       alongside the box widening above) so these bordered "card" rows read
       as compact and organized rather than the box's biggest elements. */
    .setting-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 8px;
      padding: 8px 10px;
      border: 1px solid var(--border-subtle);
      border-radius: 14px;
      background: var(--bg-app);
    }
    .setting-row-label {
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
    }
    .setting-row-title {
      font-size: 12px;
      font-weight: 500;
      color: var(--text-strong);
      line-height: 1.2;
    }
    .setting-row-sub {
      font-size: 10px;
      color: var(--text-ghost);
      line-height: 1.2;
    }
    .setting-row input[type="number"] {
      width: 92px;
      height: 32px;
      border: 1px solid var(--border-input);
      border-radius: 10px;
      padding: 0 10px;
      font-family: var(--font-en);
      font-size: 13px;
      color: var(--text-strong);
      background: var(--bg-card);
      outline: none;
      text-align: center;
    }
    .setting-row input[type="number"]:focus {
      border-color: var(--text-faint);
      box-shadow: 0 0 0 2px rgba(28,25,23,.08);
    }
    .setting-row select {
      width: 118px;
      height: 32px;
      border: 1px solid var(--border-input);
      border-radius: 10px;
      padding: 0 8px;
      font-size: 13px;
      color: var(--text-strong);
      background: var(--bg-card);
      outline: none;
      cursor: pointer;
    }
    .setting-row select:focus {
      border-color: var(--text-faint);
      box-shadow: 0 0 0 2px rgba(28,25,23,.08);
    }
    .settings-title {
      font-size: 14px; font-weight: 600; color: var(--text-strong);
    }
    .settings-close {
      width: 26px; height: 26px; border: none; background: none; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      color: var(--text-faint); border-radius: 6px;
    }
    .settings-close:hover { background: rgba(0,0,0,.04); color: var(--text-strong); }
    /* margin-bottom (2026-07-28): the reordered settings box now has TWO
       .settings-list groups with .setting-row cards sandwiched between them
       (scan/prompts buttons, then the 4 setting-rows, then guide/backup
       buttons) — each .setting-row supplies its own trailing margin, but a
       .settings-list needs one too now that it's no longer only ever the
       box's last child. */
    .settings-list { display: flex; flex-direction: column; gap: 4px; margin-bottom: 8px; }
    .settings-item {
      width: 100%;
      display: flex; align-items: center; gap: 12px;
      padding: 10px 12px; border: none; background: transparent;
      border-radius: 14px; cursor: pointer; text-align: right;
      transition: background var(--t-fast);
    }
    .settings-item:hover { background: #f5f4f0; }
    .settings-item-icon {
      width: 24px; height: 24px; flex-shrink: 0;
      display: flex; align-items: center; justify-content: center;
      color: var(--text-body);
    }
    .settings-item-text {
      display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1;
    }
    .settings-item-title {
      font-size: 13px; font-weight: 500; color: var(--text-strong);
      line-height: 1.2;
    }
    .settings-item-sub {
      font-size: 11px; color: var(--text-ghost); line-height: 1.3;
    }

    /* ── Prompts editor modal ── */
    .panel:has(.prompts-overlay.show) { overflow: visible; }
    .prompts-overlay {
      position: absolute;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: rgba(28,25,23,.45);
      backdrop-filter: blur(3px);
      z-index: 10000;
      opacity: 0;
      pointer-events: none;
      transition: opacity .2s;
    }
    .prompts-overlay.show { opacity: 1; pointer-events: auto; }
    .prompts-box {
      position: absolute;
      top: 0;
      left: ${w}px;
      width: calc(100vw - ${w}px);
      height: 100vh;
      background: var(--bg-app);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      border-right: 1px solid var(--border-subtle);
    }
    .prompts-head {
      padding: 18px 24px 14px;
      border-bottom: 1px solid var(--border-subtle);
      background: var(--bg-card);
      flex-shrink: 0;
    }
    .prompts-title {
      font-size: 16px;
      font-weight: 700;
      color: var(--text-strong);
      text-align: right;
    }
    .prompts-body {
      padding: 20px 24px 10px;
      overflow-y: auto;
      flex: 1;
      min-height: 0;
    }
    .prompts-section { margin-bottom: 20px; }
    .prompts-section-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 10px;
    }
    .prompts-section-title {
      font-size: 13px;
      font-weight: 700;
      color: var(--text-strong);
      letter-spacing: .3px;
    }
    .prompts-label {
      font-size: 11px;
      color: var(--text-ghost);
      margin: 10px 0 4px;
    }
    .prompts-sublabel {
      font-size: 11px;
      color: var(--text-mute);
      margin: 8px 0 4px;
      font-weight: 500;
    }
    .prompts-locked {
      border: 1px solid var(--border-input);
      background: var(--bg-tag);
      border-radius: var(--r-input);
      padding: 8px 12px;
      font-size: 11px;
      color: var(--text-mute);
      direction: ltr;
      text-align: left;
      white-space: pre-wrap;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    }
    .prompts-locked-tag {
      text-align: center;
      font-size: 11px;
      padding: 5px 10px;
      margin: 6px 0;
      color: var(--text-ghost);
      background: var(--bg-tag);
      border-radius: 6px;
      border: 1px dashed var(--border-input);
    }
    .prompts-box textarea {
      width: 100%;
      min-height: 90px;
      resize: vertical;
      padding: 10px 12px;
      border: 1px solid var(--border-input);
      border-radius: var(--r-input);
      font-size: 12px;
      line-height: 1.6;
      font-family: var(--font-he);
      background: var(--bg-card);
      color: var(--text-strong);
      outline: none;
      transition: border-color .15s, box-shadow .15s;
      box-sizing: border-box;
      direction: ltr;
      text-align: left;
    }
    .prompts-box textarea:focus {
      border-color: var(--text-faint);
      box-shadow: 0 0 0 2px rgba(28,25,23,.08);
    }
    .prompts-subsection {
      margin-top: 14px;
      padding: 12px 14px;
      background: var(--bg-card);
      border: 1px solid var(--border-subtle);
      border-radius: 10px;
    }
    .prompts-subhead {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      margin-bottom: 8px;
    }
    .prompts-subtitle {
      font-size: 12px;
      font-weight: 600;
      color: var(--text-body);
    }
    .prompts-footer {
      padding: 14px 24px 18px;
      border-top: 1px solid var(--border-subtle);
      background: var(--bg-card);
      display: flex;
      gap: 10px;
      flex-shrink: 0;
    }
    .prompts-save {
      flex: 1;
      height: 40px;
      border: none;
      background: var(--text-strong);
      color: var(--bg-app);
      border-radius: var(--r-input);
      font-size: 14px;
      font-weight: 600;
      font-family: var(--font-he);
      cursor: pointer;
      transition: background var(--t-fast);
    }
    .prompts-save:hover { background: #2a2622; }
    .prompts-cancel {
      flex: 1;
      height: 40px;
      border: 1px solid var(--border-input);
      background: var(--bg-card);
      color: var(--text-body);
      border-radius: var(--r-input);
      font-size: 14px;
      font-weight: 500;
      font-family: var(--font-he);
      cursor: pointer;
      transition: background var(--t-fast);
    }
    .prompts-cancel:hover { background: #faf8f4; }
    .prompts-reset {
      height: 26px;
      padding: 0 10px;
      border: 1px solid var(--border-input);
      background: var(--bg-card);
      color: var(--text-body);
      border-radius: 999px;
      font-size: 11px;
      font-weight: 500;
      font-family: var(--font-he);
      cursor: pointer;
      transition: background var(--t-fast);
      white-space: nowrap;
    }
    .prompts-reset:hover { background: var(--bg-tag); }

    /* ── Edit form ── */
    #editView {
      display: none; flex-direction: column; flex: 1; min-height: 0;
      overflow-y: auto; padding: 18px; background: var(--bg-app);
    }
    .panel.editing #editView { display: flex; }
    .edit-project-tag {
      display: flex; align-items: center; gap: 6px;
      padding: 5px 10px; margin-bottom: 4px;
      background: var(--bg-clear); color: var(--text-mute);
      border-radius: var(--r-input); font-size: 12px; font-weight: 500;
      width: fit-content; max-width: 100%;
    }
    .edit-project-tag svg { flex-shrink: 0; width: 12px; height: 12px; }
    #editProjectTagText {
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    #editView label {
      display: block; font-size: 12px; color: var(--text-mute);
      margin-top: 12px; margin-bottom: 4px; font-weight: 500;
    }
    #editView input, #editView textarea {
      width: 100%; padding: 8px 10px;
      border: 1px solid var(--border-input); border-radius: var(--r-input);
      font-size: 13px; font-family: var(--font-he); outline: none;
      color: var(--text-strong); background: var(--bg-card);
      transition: border-color var(--t-fast);
    }
    #editView input:focus, #editView textarea:focus {
      border-color: var(--text-faint);
      box-shadow: 0 0 0 2px rgba(28,25,23,.08);
    }
    #editView textarea { resize: vertical; min-height: 160px; }
    #editButtons { display: flex; gap: 8px; margin-top: 16px; }
    #saveBtn {
      flex: 1; height: 36px; border: none;
      background: var(--text-strong); color: var(--bg-app);
      border-radius: var(--r-input); font-size: 13px; font-weight: 600;
      font-family: var(--font-he); cursor: pointer;
      transition: background var(--t-fast);
    }
    #saveBtn:hover { background: #2a2622; }
    #cancelBtn {
      flex: 1; height: 36px;
      border: 1px solid var(--border-input); background: var(--bg-card);
      color: var(--text-body); border-radius: var(--r-input);
      font-size: 13px; font-weight: 500; font-family: var(--font-he); cursor: pointer;
      transition: background var(--t-fast);
    }
    #cancelBtn:hover { background: #faf8f4; }
    #deleteBtn {
      height: 36px; padding: 0 14px;
      border: 1px solid #fed7d7; background: var(--bg-card);
      color: #c53030; border-radius: var(--r-input);
      font-size: 13px; font-family: var(--font-he); cursor: pointer;
      transition: background var(--t-fast);
    }
    #deleteBtn:hover { background: #fff5f5; }
    .edit-status { font-size: 12px; text-align: center; min-height: 18px; margin-top: 8px; }

    /* Document management */
    .project-documents-list { padding: 8px 18px 14px; }
    /* Regular-project documents use the same compact row system as code
       files; only folders and dependency controls are absent. */
    .regular-document-row { min-width: 0; }
    .regular-document-info { display: block; }
    .regular-document-name { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .regular-document-meta {
      display: block; margin-top: 2px; color: var(--text-ghost);
      font-size: 10px; font-weight: 400; direction: ltr; text-align: right;
    }
    .regular-document-snippet { display: none; }
    .regular-document-delete {
      width: 20px; height: 20px; flex-shrink: 0; border: none; background: none;
      color: #c53030; cursor: pointer; border-radius: 4px; display: flex;
      align-items: center; justify-content: center; opacity: .55;
      transition: opacity var(--t-fast), background var(--t-fast);
    }
    .regular-document-delete svg { width: 14px; height: 14px; }
    .regular-document-row:hover .regular-document-delete { opacity: 1; }
    .regular-document-delete:hover { background: #fff1f1; }

    .doc-dialog { max-width: 500px; }
    .doc-tabs {
      display: flex; gap: 0; border-bottom: 1px solid var(--border-light);
      margin-bottom: 16px;
    }
    .doc-tab {
      padding: 10px 16px; background: transparent; border: none;
      color: var(--text-faint); cursor: pointer; font-size: 13px; font-weight: 500;
      border-bottom: 2px solid transparent; transition: all var(--t-fast);
      font-family: var(--font-he);
    }
    .doc-tab.active {
      color: var(--text-body); border-bottom-color: var(--text-body);
    }
    .doc-tab-content { display: none; padding: 0 4px; }
    .doc-tab-content.active { display: block; }

    .doc-drop-zone {
      border: 2px dashed var(--border-input); border-radius: 8px; padding: 24px;
      text-align: center; cursor: pointer; transition: all var(--t-fast);
      color: var(--text-faint); display: flex; flex-direction: column; align-items: center; gap: 8px;
      font-family: var(--font-he);
    }
    .doc-drop-zone:hover { border-color: var(--text-body); color: var(--text-body); }
    .doc-drop-zone svg { width: 32px; height: 32px; }

    .doc-preview-info { margin-top: 12px; padding: 12px; background: var(--bg-card); border-radius: 4px; }
    .doc-tokens { font-size: 11px; color: var(--text-faint); margin-top: 8px; }

    .doc-paste-textarea {
      min-height: 150px; width: 100%; padding: 8px;
      border: 1px solid var(--border-input); border-radius: var(--r-input);
      font-family: var(--font-he); font-size: 13px;
      background: var(--bg-card); color: var(--text-strong);
      outline: none; resize: vertical;
    }
    .doc-paste-textarea:focus { border-color: var(--text-faint); }
    .doc-url-input {
      width: 100%; padding: 8px; margin-bottom: 8px;
      border: 1px solid var(--border-input); border-radius: var(--r-input);
      font-family: var(--font-he); font-size: 13px;
      background: var(--bg-card); color: var(--text-strong);
      outline: none;
    }
    .doc-url-input:focus { border-color: var(--text-faint); }
    .doc-url-input:last-child { margin-bottom: 0; }

    /* Ignore-patterns dialog (project.ignorePatterns) — files/folders excluded
       from scanCodeProject(), edited via #codeProjectIgnoreBtn next to the
       documents header's refresh button. */
    .ignore-patterns-hint { font-size: 11px; color: var(--text-faint); margin-bottom: 10px; }
    .ignore-patterns-add-row { display: flex; gap: 8px; margin-bottom: 12px; }
    .ignore-patterns-add-row .doc-url-input { margin-bottom: 0; }
    .ignore-patterns-add-row .gm-edit-btn { flex-shrink: 0; }
    .ignore-patterns-list { max-height: 220px; overflow-y: auto; margin-bottom: 4px; }
    .ignore-patterns-empty { font-size: 12px; color: var(--text-faint); padding: 8px 2px; }
    .ignore-pattern-row {
      display: flex; align-items: center; justify-content: space-between; gap: 8px;
      padding: 6px 8px; background: var(--bg-app); border-radius: 4px; margin-bottom: 6px;
      border: 1px solid var(--border-light);
    }
    .ignore-pattern-name { font-size: 12px; color: var(--text-body); word-break: break-all; }
    .ignore-pattern-remove {
      width: 20px; height: 20px; flex-shrink: 0; display: flex; align-items: center; justify-content: center;
      color: #c53030; opacity: 0.6; cursor: pointer; background: transparent; border: none; padding: 0;
      transition: opacity var(--t-fast);
    }
    .ignore-pattern-remove:hover { opacity: 1; }

    /* Storage-usage dialog (#storageInfoOverlay, D3) — total + per-prefix
       byte breakdown, plus the manual orphan-sweep trigger. */
    .storage-info-body { margin-bottom: 12px; }
    .storage-info-loading, .storage-info-unavailable {
      font-size: 12px; color: var(--text-faint); padding: 8px 2px;
    }
    .storage-info-row {
      display: flex; align-items: center; justify-content: space-between; gap: 8px;
      padding: 6px 8px; background: var(--bg-app); border-radius: 4px; margin-bottom: 6px;
      border: 1px solid var(--border-light); font-size: 12px;
    }
    .storage-info-row.storage-info-total { font-weight: 600; color: var(--text-strong); }
    .storage-info-row-label { color: var(--text-body); }
    .storage-info-row-value { color: var(--text-faint); direction: ltr; }
    .storage-info-sweep-result { font-size: 11px; color: var(--text-faint); margin-top: 6px; }

    /* Global scan-settings dialog (#scanSettingsOverlay) — the editable
       versions of document-handler.js's built-in scan rules, applying to every
       code project. Reuses the .ignore-patterns-* chip-list styling above for
       each of its three lists; only the multi-section shell is new. The body
       scrolls (4 sections don't fit a short viewport) while the title/hint and
       the button row stay pinned. */
    .scan-settings-dialog { display: flex; flex-direction: column; max-height: 85vh; }
    .scan-settings-body { overflow-y: auto; flex: 1; min-height: 0; margin-bottom: 12px; }
    .scan-settings-section { margin-bottom: 18px; }
    .scan-settings-section:last-child { margin-bottom: 0; }
    .scan-settings-label {
      font-size: 12px; font-weight: 600; color: var(--text-strong);
      text-align: right; margin-bottom: 4px;
    }
    /* Each list is shorter here than in the single-list per-project dialog,
       so several sections stay reachable without a huge scroll. */
    .scan-settings-body .ignore-patterns-list { max-height: 140px; }
    .scan-settings-section .setting-row { margin: 0; }
    /* Search box that filters each chip list live — a smaller, less
       prominent variant of the same #search input (36px felt oversized
       stacked between the add-row and a short list). */
    .scan-settings-search-wrap { margin-bottom: 8px; }
    .scan-settings-search-input { height: 30px; font-size: 12px; padding: 0 28px 0 8px; }

    /* Code project file tree — rendered inline inside the open project's
       documents section (#projectDocumentsList), owned by code-tree.js. */
    .code-tree-actions { display: flex; align-items: center; gap: 14px; margin-bottom: 10px; }
    /* .dp-actions reuses .code-tree-actions/.code-tree-link-btn verbatim for
       the custom deps picker's "בחר הכל"/"נקה הכל" pair, but sits directly
       inside .cv-shell (a full-pane view) rather than the inline tree's own
       padded mount container, so it needs its own horizontal padding to
       match the header/search bars above/below it. */
    .dp-actions { padding: 10px 18px 0; margin-bottom: 0; }
    .code-tree-search-wrap { margin-bottom: 10px; }
    .code-tree-body {
      border: 1px solid var(--border-light); border-radius: 6px; padding: 6px;
    }
    .code-tree-node { font-size: 12px; }
    .code-tree-row {
      display: flex; align-items: center; gap: 6px; padding: 3px 4px;
      border-radius: 4px; cursor: pointer;
    }
    .code-tree-row:hover { background: var(--bg-tag); }
    /* Pinned above the file tree, not part of the path hierarchy — a thin
       separator marks it as a distinct entry rather than "the first file". */
    .code-tree-structure-row { border-bottom: 1px solid var(--border-subtle); margin-bottom: 4px; padding-bottom: 6px; }
    .code-tree-row .collapse-btn { width: 14px; height: 14px; }
    .code-tree-row .collapse-btn svg { width: 10px; height: 10px; }
    .code-tree-spacer { width: 14px; flex-shrink: 0; }
    .code-tree-checkbox { width: 14px; height: 14px; cursor: pointer; flex-shrink: 0; }
    .code-tree-icon { color: var(--text-faint); flex-shrink: 0; display: flex; }
    .code-tree-icon svg { width: 13px; height: 13px; }
    .code-tree-label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-body); }
    /* Groups the preview + deps buttons on a file row together, tighter than
       the row's own 6px gap, and pulled flush past BOTH the row's own 4px
       inline padding AND the containing .code-tree-body's 6px padding (-10px
       total — canceling only the row's padding left a visible 6px strip of
       unused space before the tree's border, reported as still too much) —
       reclaims that width for the label. Distinct name from .code-tree-actions
       (the "בחר הכל"/"נקה הכל" toolbar above the tree) so the two rules don't
       collide. */
    .code-tree-file-actions {
      /* 2026-08-06: gap tightened 3px→0 — button hitboxes themselves stay at
         their original size (20px/14px icon) per user feedback: shrinking
         the buttons was the wrong fix, only the gap between them should
         shrink. */
      display: flex; align-items: center; gap: 0; flex-shrink: 0;
      margin-inline-end: -10px;
    }
    .code-tree-deps-btn, .code-tree-preview-btn {
      width: 20px; height: 20px; flex-shrink: 0; border: none; background: none;
      color: var(--text-faint); cursor: pointer; border-radius: 4px;
      display: flex; align-items: center; justify-content: center;
      opacity: 0.55; transition: opacity var(--t-fast), background var(--t-fast), color var(--t-fast);
    }
    .code-tree-deps-btn svg, .code-tree-preview-btn svg { width: 14px; height: 14px; }
    .code-tree-row:hover .code-tree-deps-btn, .code-tree-row:hover .code-tree-preview-btn { opacity: 1; }
    .code-tree-deps-btn:hover, .code-tree-preview-btn:hover { background: var(--bg-clear); color: var(--text-strong); }
    /* Favorite-toggle star (2026-08-05) — same sizing/hover-reveal as the
       preview/deps buttons it sits beside in .code-tree-file-actions, plus
       an "active" (favorited) state that stays visible even without a hover
       and fills the star gold instead of only outlining it. */
    .code-tree-favorite-btn {
      width: 20px; height: 20px; flex-shrink: 0; border: none; background: none;
      color: var(--text-faint); cursor: pointer; border-radius: 4px;
      display: flex; align-items: center; justify-content: center;
      opacity: 0.55; transition: opacity var(--t-fast), background var(--t-fast), color var(--t-fast);
    }
    .code-tree-favorite-btn svg { width: 14px; height: 14px; }
    .code-tree-row:hover .code-tree-favorite-btn { opacity: 1; }
    .code-tree-favorite-btn:hover { background: var(--bg-clear); color: var(--text-strong); }
    .code-tree-favorite-btn.active { opacity: 1; color: #d99a00; }
    .code-tree-favorite-btn.active svg polygon { fill: currentColor; }
    .code-tree-children { display: flex; flex-direction: column; }
    .code-tree-children.collapsed { display: none; }
    /* Pinned favorites section (2026-08-05) — below the structure row, above
       the scanned tree, collapsible via the same .collapse-btn/
       .code-tree-children pattern a folder row uses. The separator sits on
       the OUTER section wrapper (below the whole header+list block, per the
       user's explicit request), not on the header itself — same visual
       language as .code-tree-structure-row's separator, just positioned at
       the bottom of the section instead of directly under its header. */
    .code-tree-favorites-section { border-bottom: 1px solid var(--border-subtle); margin-bottom: 4px; padding-bottom: 6px; }
    /* Manually-added files (addManualCodeFiles) — a flat list below the
       scanned tree, separated by a small uppercase label, same visual
       language as .code-tree-structure-row's separator above the tree. */
    .code-tree-manual-label {
      margin: 8px 0 4px; padding-top: 6px;
      border-top: 1px solid var(--border-subtle);
      color: var(--text-ghost); font-size: 10px; font-weight: 700; letter-spacing: .03em;
    }
    .code-tree-remove-btn:hover { background: #fff1f1; color: #c53030; }
    .code-tree-link-btn {
      background: none; border: none; padding: 0; cursor: pointer;
      color: var(--text-faint); font-size: 11px; font-family: var(--font-he);
      text-decoration: underline;
    }
    .code-tree-link-btn:hover { color: var(--text-strong); }
    .code-tree-token-count { color: var(--text-ghost); cursor: default; transition: color var(--t-fast); }
    .code-tree-token-count:hover { color: var(--text-mute); }
    .code-tree-budget {
      display: flex; align-items: center; gap: 8px;
      direction: ltr; padding: 0 4px 6px;
    }
    .code-tree-budget .ctx-bar-track { cursor: default; }

    /* ── Context tab: project's own text-block list (inside project view) ── */
    .ctx-proj-empty {
      padding: 8px 14px; font-size: 12px;
      color: var(--text-ghost); font-style: italic;
    }

    /* Project name tag shown on blocks that belong to a project */
    .ctx-proj-tag {
      display: inline-block; padding: 1px 6px;
      background: var(--bg-clear); color: var(--text-faint);
      border-radius: 4px; font-size: 10px; font-weight: 500;
      margin-right: 4px; vertical-align: middle;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      max-width: 80px;
    }

    /* ── Quick-command menu (Phase 4.2) ──
       position:fixed and a sibling of .panel (not nested inside it) — same
       reasoning as #filePreviewView/#depManagerView: fixed
       descendants stay pinned to the viewport regardless of ancestor layout
       as long as no ancestor establishes its own containing block, and this
       menu is positioned via the CHAT PAGE's own input rect (getBoundingClientRect
       in chat-features.js), which can be anywhere on screen — not relative to
       our sidebar at all. */
    #quickCmdMenu {
      position: fixed; z-index: 2147483000; pointer-events: auto;
      max-height: 240px; overflow-y: auto;
      background: var(--bg-card); border: 1px solid var(--border-strong);
      border-radius: var(--r-input); box-shadow: 0 8px 24px rgba(0,0,0,.18);
      font-family: var(--font-he); font-size: 13px;
    }
    .quick-cmd-item {
      display: flex; align-items: center; gap: 8px;
      padding: 7px 10px; cursor: pointer;
    }
    .quick-cmd-item.active, .quick-cmd-item:hover { background: var(--bg-hover); }
    .quick-cmd-trigger {
      direction: ltr; font-weight: 600; color: var(--text-strong);
      white-space: nowrap;
    }
    .quick-cmd-title {
      color: var(--text-mute); overflow: hidden; text-overflow: ellipsis;
      white-space: nowrap;
    }
    .quick-cmd-empty {
      padding: 10px; color: var(--text-ghost); font-style: italic; font-size: 12px;
    }

    /* ── Persistent sessions tab strip (#sessionsView) ──
       Reworked 2026-08-06 (same day as first ship) from a FAB-triggered
       full-viewport takeover into an always-visible top strip — real user
       feedback after trying the takeover live was that switching
       conversations shouldn't mean "leaving and re-entering" anything. Now
       #sessionsView is ALWAYS mounted (no open/closed state of its own) and
       only as tall as its own tabstrip — push.js#pushTop shifts the site's
       own content down by that height once, permanently, at sessions.js's
       init, so the strip never overlaps real content. Only
       .sessions-frame-container (the layer that shows the selected SESSION
       iframe, not the native tab) is a full-viewport cover, and only while
       a non-native tab is active — see sessions.js#switchSession/render.
       Sits above literally everything else this shadow root renders,
       including #quickCmdMenu (2147483000), so the strip is always
       reachable and an active session's cover always dominates the screen
       while shown. */
    #sessionsView {
      position: fixed; top: 0; left: 0; right: 0; z-index: 2147483001;
      display: flex; flex-direction: column;
      font-family: var(--font-he); font-size: 13px; direction: rtl;
      color: var(--text-strong);
      pointer-events: none; /* wrapper itself must not block the page below the strip — children opt in */
    }
    .sessions-tabstrip {
      display: flex; align-items: center; gap: 6px;
      height: 40px; padding: 0 10px; flex-shrink: 0; box-sizing: border-box;
      border-bottom: 1px solid var(--border-subtle);
      background: var(--bg-card);
      pointer-events: auto;
    }
    /* Chrome-style structure: tabs sit adjacent along the strip's bottom
       edge, top corners rounded, the active one taller/lighter so it reads
       as "merged" with the content below — same colors/font as the rest of
       the panel (--bg-tag/--text-mute/--font-he), only the SHAPE changed
       from the original isolated pill buttons. */
    .sessions-tabs {
      display: flex; align-items: flex-end; gap: 2px; flex: 0 1 auto; min-width: 0;
      height: 100%; overflow-x: auto;
    }
    /* Fixed width for every tab (native + sessions) so the strip has a
       stable, predictable rhythm regardless of title length — long titles
       ellipsize via .sessions-tab-label instead of growing the tab. */
    .sessions-tab {
      display: flex; align-items: center; gap: 4px;
      width: 150px; flex: 0 0 150px; box-sizing: border-box;
      height: 30px; margin-top: 8px; padding: 0 10px;
      border: 1px solid var(--border-input); border-bottom: none;
      border-radius: 8px 8px 0 0; background: var(--bg-tag);
      color: var(--text-mute); font-family: var(--font-he); font-size: 12px;
      cursor: pointer; flex-shrink: 0; position: relative;
      transition: background var(--t-fast), color var(--t-fast);
    }
    .sessions-tab:hover { background: var(--bg-clear); }
    /* Dark fill for the active tab — the same high-contrast
       background:var(--text-strong)/color:var(--bg-app) pairing already used
       for every other "selected" state in this panel (e.g. .fab, dropdown
       active rows), swapped in here after the original bg-app/text-strong
       pairing read as too subtle against the tabstrip's own bg-card. */
    .sessions-tab.active {
      height: 31px; margin-top: 7px; z-index: 1;
      background: var(--text-strong); color: var(--bg-app);
      border-color: var(--text-strong);
    }
    .sessions-tab-label {
      flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .sessions-tab-edit, .sessions-tab-refresh, .sessions-tab-close {
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0; width: 14px; height: 14px; border-radius: 50%;
      opacity: .7;
    }
    .sessions-tab-edit:hover, .sessions-tab-refresh:hover, .sessions-tab-close:hover {
      opacity: 1; background: var(--bg-clear);
    }
    .sessions-tab-edit svg, .sessions-tab-refresh svg, .sessions-tab-close svg { width: 9px; height: 9px; }
    /* Inline rename input — replaces .sessions-tab-label in place, same box
       so the tab doesn't reflow while editing. */
    .sessions-tab-input {
      flex: 1; min-width: 0; border: 1px solid var(--border-strong);
      border-radius: 4px; padding: 1px 4px; font-family: var(--font-he);
      font-size: 12px; background: var(--bg-app); color: var(--text-strong);
    }
    .sessions-add-btn {
      flex-shrink: 0; width: 30px; height: 30px; border: none;
      background: var(--bg-tag); color: var(--text-mute); border-radius: 8px;
      display: flex; align-items: center; justify-content: center; cursor: pointer;
    }
    .sessions-add-btn:hover { background: var(--bg-clear); color: var(--text-strong); }
    /* Out of #sessionsView's flex flow (position:fixed of its own) so the
       wrapper's intrinsic height stays just the tabstrip's 40px when this is
       hidden — only takes up (and covers) the rest of the viewport while a
       non-native tab is actually selected. See sessions.js#render. */
    .sessions-frame-container {
      display: none; position: fixed; top: 40px; left: 0; right: 0; bottom: 0;
      background: var(--bg-app); pointer-events: auto;
    }
    .sessions-frame-container.sfc-active { display: block; }
    .sessions-iframe {
      position: absolute; inset: 0; width: 100%; height: 100%; border: 0;
    }
    .sessions-empty-hint {
      position: absolute; inset: 0;
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      gap: 8px; color: var(--text-ghost); text-align: center; padding: 24px;
    }
    .sessions-empty-hint > div:first-child { color: var(--text-faint); }
    .sessions-empty-sub { max-width: 320px; font-size: 12px; color: var(--text-ghost); }
  `;
})();
