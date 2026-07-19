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

    /* ── Header ── */
    .sidebar-header {
      padding: 12px 18px;
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
      gap: 8px;
      margin-bottom: 12px;
    }
    .title-wrap {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      text-align: center;
    }
    .sidebar-title {
      font-family: var(--font-en);
      font-size: 18px;
      font-weight: 700;
      letter-spacing: -0.01em;
      color: var(--text-strong);
      display: block;
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

    /* ── Tabs ── */
    .tabs {
      position: relative;
      display: flex;
      border-top: 1px solid var(--border-subtle);
      border-bottom: 1px solid var(--border-subtle);
    }
    .tab {
      flex: 1; display: flex; align-items: center; justify-content: center; gap: 5px;
      padding: 10px 8px; font-size: 12px; font-weight: 500; cursor: pointer;
      color: var(--text-ghost); user-select: none;
      transition: color var(--t-fast);
    }
    .tab.active { color: var(--text-strong); font-weight: 600; }
    .tab:hover:not(.active) { color: var(--text-body); }
    .tab-indicator {
      position: absolute; bottom: -1px;
      height: 2px;
      background: var(--text-strong); border-radius: 2px;
      transition: left var(--t-medium), width var(--t-medium);
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

    /* ── History: project filter row (shown when a project is active) ── */
    .history-project-filter-row {
      display: flex; align-items: center; justify-content: space-between; gap: 8px;
      padding: 6px 18px; flex-shrink: 0;
      font-size: 11px; color: var(--text-ghost);
    }
    .hi-showall-toggle {
      display: flex; align-items: center; gap: 4px;
      cursor: pointer; white-space: nowrap;
      font-size: 11px; color: var(--text-mute);
    }
    .hi-showall-toggle input { cursor: pointer; }

    /* ── Tab panes ── */
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
    #pane-history #historyList {
      overflow: visible;
      flex: none;
    }

    /* ── Search row ── */
    .context-toolbar {
      display: flex; gap: 8px; padding: 14px 18px 10px; align-items: center;
    }
    #historyToolbar {
      flex-direction: column;
      gap: 8px;
      align-items: stretch;
    }
    #pane-context .context-toolbar {
      flex-shrink: 0;
    }
    .search-wrap { flex: 1; position: relative; }
    #search, #searchHistory, .code-tree-search-input {
      width: 100%; height: 36px;
      padding: 0 32px 0 10px;
      border: 1px solid var(--border-input); border-radius: var(--r-input);
      font-size: 13px; font-family: var(--font-he);
      background: var(--bg-card); outline: none; color: var(--text-strong);
      transition: border-color var(--t-fast);
      -webkit-appearance: none; appearance: none;
    }
    #search:focus, #searchHistory:focus, .code-tree-search-input:focus { border-color: var(--text-faint); }
    #search::placeholder, #searchHistory::placeholder, .code-tree-search-input::placeholder { color: var(--text-ghost); }
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
    #addProjectBtn, #addCodeProjectBtn, #projectEditBtn {
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
    #addProjectBtn:hover, #addCodeProjectBtn:hover, #projectEditBtn:hover { background: var(--bg-tag); }
    #historySection {
      flex: 0;
      min-height: 0;
    }
    #historySection.collapsed #historyList {
      display: none;
    }
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
    .hi-search-toggle {
      display: flex; gap: 4px;
      background: var(--bg-clear); border-radius: var(--r-input);
      padding: 3px;
    }
    .hi-toggle-btn {
      flex: 1; height: 28px; border: none; border-radius: 7px;
      font-size: 12px; font-family: var(--font-he); cursor: pointer;
      background: transparent; color: var(--text-mute);
      transition: background var(--t-fast), color var(--t-fast);
      display: flex; align-items: center; justify-content: center;
      padding: 0 8px; white-space: nowrap; line-height: 1;
    }
    .hi-toggle-btn.active {
      background: var(--bg-card); color: var(--text-strong);
      box-shadow: 0 1px 3px rgba(0,0,0,.08);
    }
    .search-icon {
      position: absolute; right: 10px; top: 50%; transform: translateY(-50%);
      color: var(--text-ghost); pointer-events: none;
      display: flex; align-items: center;
    }
    #addBtn {
      width: 36px; height: 36px; flex-shrink: 0;
      border: 1px solid var(--border-input); background: var(--text-strong);
      border-radius: var(--r-input); cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      color: var(--bg-app); font-size: 18px; font-family: var(--font-he);
      transition: background var(--t-fast);
    }
    #addBtn:hover { background: #2a2622; }

    /* ── Block list ── */
    #list, #historyList {
      min-height: 0;
      padding: 4px 18px 14px;
      display: flex; flex-direction: column; gap: 8px;
    }
    #list {
      flex: 1;
    }
    #historyList {
      overflow: visible;
      flex: none;
    }

    /* ── Block card ── */
    .block {
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

    /* Card body */
    .block-main { flex: 1; min-width: 0; }
    .block-head {
      display: flex; align-items: baseline; justify-content: space-between;
      gap: 8px; margin-bottom: 8px;
    }
    .block-title {
      font-size: 14px; font-weight: 600; color: var(--text-strong);
      letter-spacing: -0.005em; word-break: break-word;
    }
    .block-meta {
      font-size: 11px; color: var(--text-ghost); white-space: nowrap;
      font-variant-numeric: tabular-nums; flex-shrink: 0;
    }
    .block-tags { display: flex; flex-wrap: wrap; gap: 4px; }
    .tag {
      font-size: 11px; padding: 3px 8px;
      background: var(--bg-tag); color: var(--text-mute);
      border-radius: var(--r-tag); font-weight: 500;
    }

    .block-preview {
      font-size: 12px; color: var(--text-ghost); line-height: 1.5;
      margin-top: 6px; word-break: break-word;
    }

    .date-group-label {
      font-size: 11px; font-weight: 600; color: var(--text-ghost);
      text-transform: uppercase; letter-spacing: 0.04em;
      padding: 8px 2px 4px; margin-top: 4px;
    }
    .date-group-label:first-child { margin-top: 0; }

    /* ── History list items ── */
    #historyList { gap: 2px; }
    .hi-item {
      display: flex; align-items: center;
      padding: 8px 10px; border-radius: var(--r-input);
      cursor: pointer; position: relative;
      transition: background var(--t-fast);
      gap: 8px;
    }
    .hi-item:hover { background: var(--bg-tag); }
    .hi-head {
      display: flex; align-items: center; gap: 8px;
      width: 100%;
      min-width: 0;
    }
    .hi-item.pinned .hi-title::before {
      content: '📌 '; font-size: 11px;
    }
    /* Active conversation indicator — the conversation currently bound to
       state.currentConversationId (where auto-save is writing to). */
    .hi-item.active {
      background: rgba(44, 122, 123, 0.08);
    }
    .hi-item.active:hover { background: rgba(44, 122, 123, 0.14); }
    .hi-item.active .hi-title {
      font-weight: 600;
      color: #1f5557;
    }
    .hi-active-dot {
      flex-shrink: 0;
      width: 8px; height: 8px;
      border-radius: 50%;
      background: #2c7a7b;
    }
    /* Viewing indicator — the conversation whose preview panel is open. */
    .hi-item.viewing {
      background: rgba(90, 74, 66, 0.08);
    }
    .hi-item.viewing:hover { background: rgba(90, 74, 66, 0.14); }
    .hi-item.viewing.active {
      background: rgba(44, 122, 123, 0.10);
    }
    .hi-viewing-dot {
      flex-shrink: 0;
      width: 8px; height: 8px;
      border-radius: 50%;
      background: #3d2f2b;
    }
    .hi-title {
      flex: 1; font-size: 13px; color: var(--text-strong);
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .hi-item.search-content {
      align-items: stretch;
      flex-direction: column;
      gap: 4px;
    }
    .hi-item.search-content .hi-title {
      white-space: nowrap;
    }
    .hi-snippet-row {
      display: flex; align-items: flex-start; gap: 6px;
      min-width: 0;
    }
    .hi-match-role {
      font-size: 10px; color: var(--text-ghost);
      margin-left: 4px; flex-shrink: 0; margin-top: 1px;
    }
    .hi-snippet {
      flex: 1;
      font-size: 11px; color: var(--text-ghost); line-height: 1.4;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      min-width: 0;
    }
    .hi-snippet mark {
      background: #fef08a; color: var(--text-strong);
      border-radius: 2px; padding: 0 1px;
    }
    .hi-project-tag {
      font-size: 10px;
      padding: 1px 6px;
      border-radius: var(--r-tag);
      background: var(--bg-tag);
      color: var(--text-mute);
      white-space: nowrap;
      flex-shrink: 0;
      min-width: 0;
      max-width: 42%;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .hi-menu-btn {
      width: 26px; height: 26px; flex-shrink: 0;
      border: none; background: none; border-radius: 6px;
      cursor: pointer; color: var(--text-faint);
      display: flex; align-items: center; justify-content: center;
      font-size: 16px; line-height: 1;
      opacity: 0; transition: opacity var(--t-fast), background var(--t-fast);
    }
    .hi-item:hover .hi-menu-btn { opacity: 1; }
    .hi-menu-btn:hover { background: var(--bg-clear); color: var(--text-strong); }

    /* ── Dropdown menu ── */
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

    .empty {
      padding: 40px 10px; text-align: center;
      color: var(--text-ghost); font-size: 13px; line-height: 1.6;
      white-space: pre-line;
    }

    /* Ensure project-related names respect RTL and truncate instead of expanding */
    .project-accordion-toggle, .project-picker-item {
      direction: rtl;
    }
    .project-accordion-toggle {
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
    .project-picker {
      display: flex;
      flex-direction: column;
      gap: 6px;
      margin-top: 8px;
      max-height: 240px;
      overflow-y: auto;
    }
    .project-picker-item {
      width: 100%;
      text-align: right;
      border: 1px solid var(--border-input);
      background: var(--bg-card);
      border-radius: 10px;
      padding: 8px 10px;
      font-family: var(--font-he);
      cursor: pointer;
      color: var(--text-body);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .project-picker-item:hover,
    .project-picker-item.active {
      background: var(--bg-tag);
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
    .gm-title { font-weight: 600; font-size: 14px; flex: 1; color: var(--text-strong); white-space: nowrap; }
    .auto-badge {
      display: inline-block; margin-top: 6px;
      font-size: 11px; padding: 2px 7px;
      background: var(--bg-tag); color: var(--text-mute);
      border-radius: var(--r-tag); font-weight: 500; white-space: nowrap;
    }
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
    #summarizeBtnHistory {
      flex: 1; height: 38px; border: none;
      background: var(--text-strong); color: var(--bg-app);
      border-radius: var(--r-input);
      font-size: 13px; font-weight: 600; font-family: var(--font-he);
      cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px;
      transition: background var(--t-fast);
    }
    #summarizeBtnHistory:hover { background: #2a2622; }
    #injectBtn {
      flex: 1.4; height: 38px; border: none;
      background: var(--text-strong); color: var(--bg-app);
      border-radius: var(--r-input);
      font-size: 13px; font-weight: 600; font-family: var(--font-he);
      cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px;
      transition: background var(--t-fast);
    }
    #injectBtn:hover:not(:disabled) { background: #2a2622; }
    #injectBtn:disabled { background: var(--bg-clear); color: var(--text-ghost); cursor: not-allowed; }
    #injectDocsBtn {
      height: 38px; padding: 0 12px; border: 1.5px solid var(--border-strong);
      background: var(--bg-card); color: var(--text-body);
      border-radius: var(--r-input);
      font-size: 13px; font-weight: 600; font-family: var(--font-he);
      cursor: pointer; display: flex; align-items: center; gap: 6px; white-space: nowrap;
      transition: background var(--t-fast);
    }
    #injectDocsBtn:hover { background: var(--bg-hover); }

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

    /* ── Conversation Preview Panel ── */
    #conversationView {
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
    #conversationView.cv-open { display: flex; }
    .cv-shell {
      display: flex;
      flex-direction: column;
      flex: 1;
      min-height: 0;
      overflow: hidden;
    }

    /* Header */
    .cv-header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px 18px 10px;
      border-bottom: 1px solid var(--border-subtle);
      flex-shrink: 0;
    }
    #cvBack {
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
    #cvBack:hover { background: rgba(0,0,0,.04); color: var(--text-strong); }
    #cvBack svg { transform: rotate(180deg); }
    .cv-title-wrap { flex: 1; min-width: 0; }
    #cvTitle {
      font-size: 15px;
      font-weight: 700;
      color: var(--text-strong);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      direction: rtl;
    }
    .cv-meta {
      font-size: 11px;
      color: var(--text-ghost);
      margin-top: 2px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      direction: rtl;
    }

    /* Search */
    .cv-search-wrap {
      position: relative;
      padding: 8px 18px;
      border-bottom: 1px solid var(--border-subtle);
      flex-shrink: 0;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    #cvSearch {
      flex: 1;
      height: 32px;
      padding: 0 30px 0 8px;
      border: 1px solid var(--border-input);
      border-radius: var(--r-input);
      font-size: 13px;
      font-family: var(--font-he);
      background: var(--bg-card);
      outline: none;
      color: var(--text-strong);
      transition: border-color var(--t-fast);
      -webkit-appearance: none;
      appearance: none;
    }
    #cvSearch:focus { border-color: var(--text-faint); }
    #cvSearch::placeholder { color: var(--text-ghost); }
    .cv-search-icon {
      position: absolute;
      right: 26px;
      top: 50%;
      transform: translateY(-50%);
      color: var(--text-ghost);
      pointer-events: none;
      display: flex;
      align-items: center;
    }
    .cv-search-count {
      font-size: 11px;
      color: var(--text-ghost);
      white-space: nowrap;
      font-variant-numeric: tabular-nums;
      min-width: 32px;
      text-align: center;
    }
    .cv-nav-btn {
      width: 24px;
      height: 24px;
      border: 1px solid var(--border-input);
      background: var(--bg-card);
      border-radius: 6px;
      cursor: pointer;
      color: var(--text-faint);
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .cv-nav-btn:not(:disabled):hover { color: var(--text-strong); background: var(--bg-tag); }
    .cv-nav-btn:disabled { opacity: 0.35; cursor: default; }
    .cv-nav-btn svg { width: 11px; height: 11px; }
    /* prev = points right (→), next = points left (←) */
    #cvNavPrev svg { transform: rotate(180deg); }

    /* Messages */
    .cv-messages {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      overflow-x: hidden;
      padding: 14px 18px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .cv-msg {
      display: flex;
      flex-direction: column;
      gap: 3px;
      max-width: 88%;
      position: relative;
      transition: opacity var(--t-fast);
      cursor: pointer;
    }
    .cv-msg.cv-msg-user { align-self: flex-end; align-items: flex-end; }
    .cv-msg.cv-msg-ai { align-self: flex-start; align-items: flex-start; }
    .cv-msg.cv-dim { opacity: 0.2; }
    .cv-msg.cv-deselected { opacity: 0.35; }
    /* Brief highlight when navigating to a specific message from a
       content-search result in the History list. */
    .cv-msg.cv-msg-flash > .cv-msg-bubble {
      animation: cv-msg-flash-anim 1.2s ease-out;
    }
    @keyframes cv-msg-flash-anim {
      0%   { box-shadow: 0 0 0 3px rgba(44, 122, 123, 0.55); }
      100% { box-shadow: 0 0 0 3px rgba(44, 122, 123, 0); }
    }
    .cv-msg-role {
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: var(--text-ghost);
      padding: 0 6px;
      display: flex;
      align-items: center;
      gap: 5px;
    }
    .cv-msg-user .cv-msg-role { flex-direction: row-reverse; }
    .cv-msg-check {
      width: 13px;
      height: 13px;
      border-radius: 3px;
      border: 1.5px solid var(--border-input);
      background: transparent;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      transition: background var(--t-fast), border-color var(--t-fast), box-shadow var(--t-fast);
    }
    .cv-msg:hover .cv-msg-check {
      border-color: var(--text-faint);
      box-shadow: 0 0 0 2px var(--border-subtle);
    }
    .cv-msg.cv-selected .cv-msg-check {
      background: var(--text-strong);
      border-color: var(--text-strong);
      box-shadow: none;
    }
    .cv-msg-check-icon {
      display: none;
      width: 9px;
      height: 9px;
    }
    .cv-msg.cv-selected .cv-msg-check-icon {
      display: block;
      color: var(--bg-app);
    }
    .cv-msg-bubble {
      background: var(--bg-card);
      border: 1px solid var(--border-subtle);
      border-radius: 12px;
      padding: 9px 13px;
      font-size: 13px;
      line-height: 1.55;
      color: var(--text-body);
      word-break: break-word;
      white-space: pre-wrap;
      transition: border-color var(--t-fast);
    }
    .cv-msg-user .cv-msg-bubble {
      background: var(--text-strong);
      color: var(--bg-app);
      border-color: var(--text-strong);
      border-radius: 12px 12px 12px 4px;
    }
    .cv-msg-ai .cv-msg-bubble { border-radius: 12px 12px 4px 12px; }
    .cv-msg.cv-selected .cv-msg-bubble { border-color: var(--text-faint); }

    /* Search highlights */
    .cv-msg-bubble mark {
      background: #fef08a;
      color: var(--text-strong);
      border-radius: 2px;
      padding: 0 1px;
    }
    .cv-msg-user .cv-msg-bubble mark { background: #fbbf24; color: #1c1917; }
    .cv-msg-bubble mark.cv-match-active { background: #f97316; color: #fff; }

    /* Selection bar */
    .cv-sel-bar {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 7px 18px;
      border-top: 1px solid var(--border-subtle);
      background: var(--bg-app);
      flex-shrink: 0;
    }
    .cv-sel-btn {
      height: 26px;
      padding: 0 10px;
      border: 1px solid var(--border-input);
      background: var(--bg-card);
      border-radius: var(--r-input);
      font-size: 12px;
      font-family: var(--font-he);
      cursor: pointer;
      color: var(--text-body);
      transition: background var(--t-fast);
    }
    .cv-sel-btn:hover { background: var(--bg-tag); }
    .cv-sel-count {
      margin-right: auto;
      font-size: 11px;
      color: var(--text-ghost);
      font-variant-numeric: tabular-nums;
    }

    /* Project toggle bar */
    .cv-project-bar {
      padding: 8px 18px;
      border-top: 1px solid var(--border-subtle);
      background: var(--bg-app);
      flex-shrink: 0;
    }
    .cv-project-toggle {
      display: flex;
      align-items: center;
      gap: 8px;
      cursor: pointer;
      user-select: none;
      font-size: 12px;
      color: var(--text-body);
    }
    .cv-project-label {
      font-weight: 500;
    }

    /* Footer */
    .cv-footer {
      padding: 10px 18px 14px;
      border-top: 1px solid var(--border-subtle);
      background: var(--bg-app);
      flex-shrink: 0;
      display: flex;
      flex-direction: row;
      gap: 8px;
    }
    .cv-load-btn, .cv-continue-btn {
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
    }
    .cv-load-btn {
      background: var(--text-strong);
      color: var(--bg-app);
    }
    .cv-load-btn:hover:not(:disabled) { background: #2a2622; }
    .cv-load-btn:disabled {
      background: var(--bg-clear);
      color: var(--text-ghost);
      cursor: not-allowed;
    }
    .cv-continue-btn {
      background: #2c7a7b;
      color: #fff;
    }
    .cv-continue-btn:hover { background: #1f5557; }
    /* When the viewed conversation is already the active one, the same DOM
       button is repurposed as a non-clickable status label. */
    .cv-continue-btn.is-active-label {
      background: rgba(44, 122, 123, 0.10);
      color: #1f5557;
      cursor: default;
      pointer-events: none;
      font-weight: 600;
      box-shadow: inset 0 0 0 1px rgba(44, 122, 123, 0.35);
    }
    .cv-continue-btn.is-active-label:hover {
      background: rgba(44, 122, 123, 0.10);
    }
    .cv-continue-btn.is-active-label > svg { display: none; }
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
    .settings-box {
      position: absolute;
      background: var(--bg-card);
      border: 1px solid var(--border-strong);
      border-radius: 18px;
      box-shadow: 0 8px 24px rgba(0,0,0,.12), 0 2px 8px rgba(0,0,0,.08);
      padding: 14px;
      width: 270px;
      transform: translateY(6px);
      transition: transform .15s;
    }
    .settings-overlay.show .settings-box { transform: translateY(0); }
    .settings-head {
      display: flex; align-items: center; justify-content: space-between;
      gap: 10px; margin-bottom: 12px;
    }
    .setting-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 10px;
      padding: 10px 12px;
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
      font-size: 13px;
      font-weight: 500;
      color: var(--text-strong);
      line-height: 1.2;
    }
    .setting-row-sub {
      font-size: 11px;
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
    .settings-title {
      font-size: 14px; font-weight: 600; color: var(--text-strong);
    }
    .settings-close {
      width: 26px; height: 26px; border: none; background: none; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      color: var(--text-faint); border-radius: 6px;
    }
    .settings-close:hover { background: rgba(0,0,0,.04); color: var(--text-strong); }
    .settings-list { display: flex; flex-direction: column; gap: 4px; }
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
    .doc-item {
      display: flex; align-items: center; gap: 8px; padding: 8px;
      background: var(--bg-app); border-radius: 4px; margin-bottom: 6px;
      border: 1px solid var(--border-light);
    }
    .doc-item-checkbox { width: 16px; height: 16px; cursor: pointer; }
    .doc-item-icon { width: 20px; height: 20px; color: var(--text-faint); flex-shrink: 0; }
    .doc-item-info { flex: 1; min-width: 0; }
    .doc-item-name { font-size: 12px; font-weight: 500; color: var(--text-body); word-break: break-word; }
    .doc-item-meta { font-size: 11px; color: var(--text-faint); margin-top: 2px; }
    .doc-item-preview { font-size: 11px; color: var(--text-faint); margin-top: 4px; padding-top: 4px; border-top: 1px solid var(--border-light); max-height: 40px; overflow: hidden; }
    .doc-item-delete { width: 20px; height: 20px; color: #c53030; cursor: pointer; opacity: 0.6; transition: opacity var(--t-fast); flex-shrink: 0; }
    .doc-item-delete:hover { opacity: 1; }

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

    /* Code project file tree — rendered inline inside the open project's
       documents section (#projectDocumentsList), owned by code-tree.js. */
    .code-tree-actions { display: flex; align-items: center; gap: 14px; margin-bottom: 10px; }
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
    .code-tree-row .collapse-btn { width: 14px; height: 14px; }
    .code-tree-row .collapse-btn svg { width: 10px; height: 10px; }
    .code-tree-spacer { width: 14px; flex-shrink: 0; }
    .code-tree-checkbox { width: 14px; height: 14px; cursor: pointer; flex-shrink: 0; }
    .code-tree-icon { color: var(--text-faint); flex-shrink: 0; display: flex; }
    .code-tree-icon svg { width: 13px; height: 13px; }
    .code-tree-label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-body); }
    .code-tree-deps-btn {
      width: 18px; height: 18px; flex-shrink: 0; border: none; background: none;
      color: var(--text-faint); cursor: pointer; border-radius: 4px;
      display: flex; align-items: center; justify-content: center;
      opacity: 0.55; transition: opacity var(--t-fast), background var(--t-fast), color var(--t-fast);
    }
    .code-tree-row:hover .code-tree-deps-btn { opacity: 1; }
    .code-tree-deps-btn:hover { background: var(--bg-clear); color: var(--text-strong); }
    .code-tree-children { display: flex; flex-direction: column; }
    .code-tree-children.collapsed { display: none; }
    .code-tree-link-btn {
      background: none; border: none; padding: 0; cursor: pointer;
      color: var(--text-faint); font-size: 11px; font-family: var(--font-he);
      text-decoration: underline;
    }
    .code-tree-link-btn:hover { color: var(--text-strong); }
    .code-tree-token-count { color: var(--text-ghost); }

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
  `;
})();
