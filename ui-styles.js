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
      padding: 18px 18px 0;
      background: var(--bg-app);
      border-bottom: 1px solid var(--border-subtle);
      flex-shrink: 0;
    }
    .sidebar-title-row {
      display: flex; align-items: flex-start; gap: 12px;
      margin-bottom: 14px;
    }
    .title-wrap { flex: 1; text-align: right; }
    .sidebar-title {
      font-family: var(--font-en); font-size:30px; font-weight: 600;
      letter-spacing: -0.01em; color: var(--text-strong);
      display: block;
    }
    #settingsBtn {
      width: 22px; height: 22px; flex-shrink: 0;
      border: none; background: none; padding: 0; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      color: var(--text-ghost); border-radius: 6px;
      transition: color var(--t-fast), background var(--t-fast);
    }
    #settingsBtn:hover { color: var(--text-mute); background: rgba(0,0,0,.04); }
    .sidebar-subtitle {
      font-size: 12px; color: var(--text-ghost); margin-top: 2px; display: block;
    }
    #closeBtn {
      width: 30px; height: 30px; flex-shrink: 0;
      background: none; border: none; cursor: pointer;
      color: var(--text-faint); border-radius: 8px;
      display: flex; align-items: center; justify-content: center;
      font-size: 16px; transition: background var(--t-fast), color var(--t-fast);
    }
    #closeBtn:hover { background: rgba(0,0,0,.04); color: var(--text-strong); }

    /* ── Tabs ── */
    .tabs {
      position: relative; display: flex;
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

    /* ── Tab panes ── */
    .tab-pane { display: none; flex-direction: column; flex: 1; min-height: 0; overflow: hidden; }
    .tab-pane.active { display: flex; }

    /* Coming soon */
    .coming-soon {
      flex: 1; display: flex; flex-direction: column;
      align-items: center; justify-content: center;
      color: var(--text-ghost); gap: 8px; padding: 20px;
    }
    .coming-soon .cs-icon { color: var(--text-ghost); }
    .coming-soon .cs-label { font-size: 13px; font-weight: 600; color: var(--text-faint); }
    .coming-soon .cs-sub { font-size: 12px; color: var(--text-ghost); }

    /* ── Search row ── */
    .context-toolbar {
      display: flex; gap: 8px; padding: 14px 18px 10px; align-items: center; flex-shrink: 0;
    }
    .search-wrap { flex: 1; position: relative; }
    #search, #searchHistory {
      width: 100%; height: 36px;
      padding: 0 32px 0 10px;
      border: 1px solid var(--border-input); border-radius: var(--r-input);
      font-size: 13px; font-family: var(--font-he);
      background: var(--bg-card); outline: none; color: var(--text-strong);
      transition: border-color var(--t-fast);
      -webkit-appearance: none; appearance: none;
    }
    #search:focus, #searchHistory:focus { border-color: var(--text-faint); }
    #search::placeholder, #searchHistory::placeholder { color: var(--text-ghost); }
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
      flex: 1; overflow-y: auto; min-height: 0;
      padding: 4px 18px 14px;
      display: flex; flex-direction: column; gap: 8px;
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

    .empty {
      padding: 40px 10px; text-align: center;
      color: var(--text-ghost); font-size: 13px; line-height: 1.6;
      white-space: pre-line;
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
    .gm-preview {
      font-size: 12px; color: var(--text-ghost); line-height: 1.5;
      margin-top: 8px; word-break: break-word;
    }
    .gm-edit-btn {
      height: 26px; padding: 0 10px; flex-shrink: 0;
      border: 1px solid var(--border-input); background: var(--bg-card);
      border-radius: var(--r-input); font-size: 12px; font-family: var(--font-he);
      cursor: pointer; color: var(--text-body);
      transition: background var(--t-fast);
    }
    .gm-edit-btn:hover { background: #faf8f4; }

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
    #summarizeBtn {
      flex: 1; height: 38px;
      border: 1px solid var(--border-input); background: var(--bg-card);
      color: var(--text-body); border-radius: var(--r-input);
      font-size: 13px; font-weight: 500; font-family: var(--font-he);
      cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px;
      transition: background var(--t-fast);
    }
    #summarizeBtn:hover { background: #faf8f4; }
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
      padding: 8px 10px; border: 1px solid var(--border); border-radius: 6px;
      font-size: 13px; font-family: inherit; direction: rtl;
      background: var(--bg); color: var(--text);
    }
    .dialog-input:focus { outline: 2px solid var(--accent); border-color: transparent; }
    .dialog-btns { display: flex; flex-direction: column; gap: 8px; }
    .dialog-confirm {
      height: 36px; border: none;
      background: var(--text-strong); color: var(--bg-app);
      border-radius: var(--r-input); font-size: 13px; font-weight: 600;
      font-family: var(--font-he); cursor: pointer;
      transition: background var(--t-fast);
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

    /* ── Edit form ── */
    #editView {
      display: none; flex-direction: column; flex: 1; min-height: 0;
      overflow-y: auto; padding: 18px; background: var(--bg-app);
    }
    .panel.editing #editView { display: flex; }
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
  `;
})();
