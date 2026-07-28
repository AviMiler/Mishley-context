// ui-template.js — SVG icons and Shadow DOM HTML template. Loaded before content.js.
window.__ccbTpl = (() => {
  const IC = {
    menu: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>`,
    menuDots: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="5" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="12" cy="19" r="1.2"/></svg>`,
    x: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
    chevronRight: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>`,
    context: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="12" y2="16"/></svg>`,
    clock: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
    search: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`,
    plus: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
    msg: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`,
    upload: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/></svg>`,
    download: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`,
    cs: `<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
    settings: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1 1 0 0 0 .2 1.1l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1 1 0 0 0-1.1-.2 1 1 0 0 0-.6.9V20a2 2 0 1 1-4 0v-.2a1 1 0 0 0-.6-.9 1 1 0 0 0-1.1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1 1 0 0 0 .2-1.1 1 1 0 0 0-.9-.6H4a2 2 0 1 1 0-4h.2a1 1 0 0 0 .9-.6 1 1 0 0 0-.2-1.1l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1 1 0 0 0 1.1.2 1 1 0 0 0 .6-.9V4a2 2 0 1 1 4 0v.2a1 1 0 0 0 .6.9 1 1 0 0 0 1.1-.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1 1 0 0 0-.2 1.1 1 1 0 0 0 .9.6H20a2 2 0 1 1 0 4h-.2a1 1 0 0 0-.9.6Z"/></svg>`,
    trash: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>`,
    pencil: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`,
    file: `<svg width="12" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>`,
    inject: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>`,
    folder: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/></svg>`,
    refresh: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>`,
    link: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`,
    ban: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>`,
    eye: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>`,
    undo: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/></svg>`,
    help: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.5 9a2.5 2.5 0 0 1 4.6-1.4c.6.9.4 1.8-.3 2.5-.8.8-1.3 1.2-1.3 2.4"/><line x1="12" y1="17" x2="12" y2="17.01"/></svg>`,
  };

  const PANEL_HTML = `
    <button class="fab" id="fab" title="משלי קוד (Ctrl+Shift+L)">${IC.menu}</button>
    <div class="panel" id="panel">

      <div class="sidebar-header">
        <div class="sidebar-title-row">
          <button id="closeBtn" title="סגור" aria-label="סגור">${IC.x}</button>
          <button id="settingsBtn" title="אפשרויות מתקדמות" aria-label="אפשרויות מתקדמות">${IC.settings}</button>
        </div>
        <div class="tabs" role="tablist">
          <div class="tab active" data-tab="context" role="tab" aria-selected="true">${IC.context} Context</div>
          <div class="tab" data-tab="history" role="tab" aria-selected="false">${IC.clock} שיחות אחרונות</div>
          <div class="tab-indicator" id="tabIndicator"></div>
        </div>
      </div>

      <div class="global-project-bar" id="globalProjectBar">
        <div class="project-select-wrap">
          <button id="projectSelectBtn" type="button" class="project-select" aria-haspopup="listbox" aria-expanded="false">
            <span id="projectSelectIcon" class="project-select-icon" style="display:none">${IC.folder}</span>
            <span id="projectSelectLabel" class="project-select-label"></span>
            <span class="project-select-chevron">${IC.chevronRight}</span>
          </button>
          <div id="projectSelectDropdown" class="project-select-dropdown" role="listbox" aria-hidden="true"></div>
        </div>
        <button id="addProjectBtn" type="button" aria-label="פרויקט חדש" title="פרויקט חדש">${IC.plus}</button>
        <button id="addCodeProjectBtn" type="button" aria-label="פרויקט קוד חדש" title="פרויקט קוד חדש">${IC.folder}</button>
        <button id="projectEditBtn" type="button" aria-label="ניהול פרויקט" title="ניהול פרויקט" style="display:none">${IC.menuDots}</button>
      </div>

      <div class="scan-progress" id="scanProgress" style="display:none" role="status" aria-live="polite">
        <div class="scan-progress-top">
          <span class="scan-progress-phase" id="scanProgressPhase"></span>
          <span class="scan-progress-count" id="scanProgressCount"></span>
        </div>
        <div class="scan-progress-track">
          <div class="scan-progress-fill" id="scanProgressFill"></div>
        </div>
        <div class="scan-progress-current" id="scanProgressCurrent" dir="ltr"></div>
      </div>

      <div class="tab-pane active" id="pane-context">
        <div class="tab-scroll">
        <div class="ctx-meter" id="ccb-ctx-meter">
          <div class="ctx-meter-header" id="ccb-ctx-expand" role="button" aria-expanded="false" tabindex="0">
            <button type="button" class="collapse-btn collapsed" tabindex="-1" aria-hidden="true">${IC.chevronRight}</button>
            <span class="ctx-label">Context window</span>
            <span class="ctx-count" id="ccb-ctx-count">—</span>
          </div>
          <div class="ctx-meter-bottom">
            <div class="ctx-bar-track">
              <div class="ctx-bar-fill" id="ccb-ctx-fill"></div>
            </div>
            <span class="ctx-pct" id="ccb-ctx-pct">0%</span>
          </div>
          <div id="ccb-ctx-expanded" class="ctx-expanded" style="display:none" aria-hidden="true"></div>
          <div class="ctx-files" id="ccb-files-row" style="display:none" role="button" aria-label="קבצים מצורפים">
            <span class="ctx-files-icon">📎</span>
            <span class="ctx-files-label" id="ccb-files-label">0 קבצים</span>
            <span class="ctx-files-tokens" id="ccb-files-tokens"></span>
          </div>
        </div>

        <div id="blocksSection">
          <div class="section-header">
            <div class="section-head-left">
              <button id="blocksCollapseBtn" type="button" class="collapse-btn" aria-label="סגור פרומפטים" title="סגור פרומפטים">${IC.chevronRight}</button>
              <span class="section-label">פרומפטים להזרקה</span>
            </div>
            <div class="section-head-right">
              <button id="addBtn" type="button" title="בלוק חדש" aria-label="הוסף בלוק חדש">${IC.plus}</button>
            </div>
          </div>
          <div id="blocksSectionBody">
            <div id="gmCard"></div>

            <div id="projectInstructionsCard" style="display:none"></div>

            <div id="list"></div>
          </div>
        </div>

        <div id="projectDocumentsCard" style="display:none">
          <div class="section-header">
            <div class="section-head-left">
              <button id="projectDocumentsToggle" type="button" class="collapse-btn" aria-label="סגור או פתח קבצים" title="סגור או פתח קבצים">${IC.chevronRight}</button>
              <span class="section-label">קבצים</span>
            </div>
            <div class="section-head-right">
              <button id="codeProjectIgnoreBtn" type="button" class="doc-refresh-btn" aria-label="קבצים/תיקיות להתעלמות" title="קבצים/תיקיות להתעלמות" style="display:none">${IC.ban}</button>
              <button id="codeProjectRefreshBtn" type="button" class="doc-refresh-btn" aria-label="רענן" title="רענן" style="display:none">${IC.refresh}</button>
              <button id="projectAddDocumentBtn" type="button" class="gm-edit-btn">${IC.plus} הוסף</button>
            </div>
          </div>
          <div id="projectDocumentsList" class="project-documents-list"></div>
        </div>

        </div><!-- /tab-scroll -->
        <footer id="footerContext">
          <button id="injectBtn" disabled>${IC.upload} טען פרומפטים</button>
          <button id="injectDocsBtn" style="display:none">${IC.inject} טען קבצים</button>
          <button id="undoInjectBtn" style="display:none" title="בטל הזרקה (קבצים ופרומפטים)" aria-label="בטל הזרקה">${IC.undo}</button>
        </footer>
      </div>

      <div class="tab-pane" id="pane-history">
        <div class="tab-scroll">
        <div class="context-toolbar" id="historyToolbar" style="flex-direction:column; gap:8px;">
          <div class="hi-search-toggle">
            <button class="hi-toggle-btn active" id="toggleSearchTitle">חיפוש שיחה</button>
            <button class="hi-toggle-btn" id="toggleSearchContent">חיפוש בתוכן</button>
          </div>
          <div class="search-wrap">
            <input id="searchHistory" type="search" placeholder="חיפוש בשיחות..." aria-label="חיפוש בשיחות">
            <span class="search-icon">${IC.search}</span>
          </div>
        </div>

        <div id="historyProjectFilterRow" class="history-project-filter-row" style="display:none">
          <span id="historyProjectFilterLabel"></span>
          <label class="hi-showall-toggle">
            <input type="checkbox" id="historyShowAll">
            הצג את כל השיחות
          </label>
        </div>

        <div id="historySection">
          <div class="section-header">
            <div class="section-head-left">
              <button id="historyCollapseBtn" type="button" class="collapse-btn" aria-label="סגור שיחות אחרונות" title="סגור שיחות אחרונות">${IC.chevronRight}</button>
              <span class="section-label">שיחות אחרונות</span>
            </div>
          </div>
          <div id="historyList"></div>
        </div>
        </div><!-- /tab-scroll -->
      </div>

      <div id="hiDropdown"></div>
      <div id="toast"></div>

      <div class="dialog-overlay" id="dialogOverlay">
        <div class="dialog-box">
          <div class="dialog-title" id="dialogTitle"></div>
          <div class="dialog-msg" id="dialogMsg"></div>
          <input class="dialog-input" id="dialogInput" type="text" style="display:none" />
          <div class="dialog-btns">
            <button class="dialog-confirm" id="dialogConfirm"></button>
            <button class="dialog-cancel" id="dialogCancel"></button>
          </div>
        </div>
      </div>

      <div class="dialog-overlay" id="addDocumentOverlay">
        <div class="dialog-box doc-dialog">
          <div class="dialog-title">הוסף קובץ</div>
          <div class="doc-tabs">
            <button class="doc-tab active" data-tab="upload">העלאה</button>
            <button class="doc-tab" data-tab="paste">הדבקה</button>
            <button class="doc-tab" data-tab="url">קישור</button>
          </div>
          <div class="doc-tab-content active" id="docTabUpload">
            <div class="doc-drop-zone" id="docDropZone">
              <span>${IC.upload} גרור קבצים או לחץ להעלאה</span>
              <input type="file" id="docFileInput" style="display:none" />
            </div>
            <div id="docUploadPreview" style="display:none">
              <div class="doc-preview-info">
                <div><strong id="docPreviewName"></strong></div>
                <div id="docPreviewTokens" class="doc-tokens"></div>
              </div>
            </div>
          </div>
          <div class="doc-tab-content" id="docTabPaste">
            <textarea id="docPasteContent" class="doc-paste-textarea" placeholder="הדבק תוכן כאן..."></textarea>
            <div id="docPasteTokens" class="doc-tokens"></div>
          </div>
          <div class="doc-tab-content" id="docTabUrl">
            <input type="text" id="docUrlInput" class="doc-url-input" placeholder="https://example.com/document.pdf" />
            <input type="text" id="docUrlName" class="doc-url-input" placeholder="שם הקובץ (אופציונלי)" />
          </div>
          <div class="dialog-btns">
            <button class="dialog-confirm" id="docAddBtn">הוסף</button>
            <button class="dialog-cancel" id="docCancelBtn">ביטול</button>
          </div>
        </div>
      </div>

      <div class="dialog-overlay" id="ignorePatternsOverlay">
        <div class="dialog-box doc-dialog">
          <div class="dialog-title">קבצים ותיקיות להתעלמות</div>
          <div class="ignore-patterns-hint">הקלד שם קובץ או תיקייה (אפשר * ככלל-חלק, ואפשר כמה מופרדים בפסיק) ולחץ הוסף.</div>
          <div class="ignore-patterns-add-row">
            <input type="text" id="ignorePatternInput" class="doc-url-input" placeholder="לדוגמה: legacy, *.spec.js" />
            <button id="ignorePatternAddBtn" type="button" class="gm-edit-btn">${IC.plus} הוסף</button>
          </div>
          <div id="ignorePatternsList" class="ignore-patterns-list"></div>
          <div class="dialog-btns">
            <button class="dialog-confirm" id="ignorePatternsSaveBtn">שמור וסרוק מחדש</button>
            <button class="dialog-cancel" id="ignorePatternsCloseBtn">סגור</button>
          </div>
        </div>
      </div>

      <div class="dialog-overlay" id="scanSettingsOverlay">
        <div class="dialog-box doc-dialog scan-settings-dialog">
          <div class="dialog-title">קבצים לסריקת פרויקטי קוד</div>
          <div class="ignore-patterns-hint">
            הכללים כאן חלים על <strong>כל</strong> פרויקטי הקוד וקובעים אילו קבצים נסרקים.
            כל פרויקט יכול להוסיף החרגות משלו דרך כפתור ההתעלמות שבראש רשימת הקבצים.
            שינויים ייכנסו לתוקף בסריקה/רענון הבא של כל פרויקט.
          </div>

          <div class="scan-settings-body">
            <div class="scan-settings-section">
              <div class="scan-settings-label">תיקיות להחרגה</div>
              <div class="ignore-patterns-hint">תיקיות שלא ייסרקו כלל (כולל כל מה שבתוכן).</div>
              <div class="ignore-patterns-add-row">
                <input type="text" id="scanDenyDirsInput" class="doc-url-input" placeholder="לדוגמה: node_modules, dist" />
                <button id="scanDenyDirsAddBtn" type="button" class="gm-edit-btn">${IC.plus} הוסף</button>
              </div>
              <div class="search-wrap scan-settings-search-wrap">
                <input type="search" id="scanDenyDirsSearch" class="scan-settings-search-input" placeholder="חיפוש ברשימה..." aria-label="חיפוש בתיקיות להחרגה" />
                <span class="search-icon">${IC.search}</span>
              </div>
              <div id="scanDenyDirsList" class="ignore-patterns-list"></div>
            </div>

            <div class="scan-settings-section">
              <div class="scan-settings-label">קבצים להחרגה</div>
              <div class="ignore-patterns-hint">שמות קבצים או תבניות עם * (לדוגמה tsconfig*.json).</div>
              <div class="ignore-patterns-add-row">
                <input type="text" id="scanDenyFilesInput" class="doc-url-input" placeholder="לדוגמה: package.json, *.min.js" />
                <button id="scanDenyFilesAddBtn" type="button" class="gm-edit-btn">${IC.plus} הוסף</button>
              </div>
              <div class="search-wrap scan-settings-search-wrap">
                <input type="search" id="scanDenyFilesSearch" class="scan-settings-search-input" placeholder="חיפוש ברשימה..." aria-label="חיפוש בקבצים להחרגה" />
                <span class="search-icon">${IC.search}</span>
              </div>
              <div id="scanDenyFilesList" class="ignore-patterns-list"></div>
            </div>

            <div class="scan-settings-section">
              <div class="scan-settings-label">סיומות קבצים לסריקה</div>
              <div class="ignore-patterns-hint">רק קבצים עם הסיומות האלה ייסרקו. ללא נקודה.</div>
              <div class="ignore-patterns-add-row">
                <input type="text" id="scanExtInput" class="doc-url-input" placeholder="לדוגמה: js, ts, cs" />
                <button id="scanExtAddBtn" type="button" class="gm-edit-btn">${IC.plus} הוסף</button>
              </div>
              <div class="search-wrap scan-settings-search-wrap">
                <input type="search" id="scanExtSearch" class="scan-settings-search-input" placeholder="חיפוש ברשימה..." aria-label="חיפוש בסיומות" />
                <span class="search-icon">${IC.search}</span>
              </div>
              <div id="scanExtList" class="ignore-patterns-list"></div>
            </div>

            <div class="scan-settings-section">
              <div class="setting-row">
                <div class="setting-row-label">
                  <span class="setting-row-title">גודל קובץ מקסימלי</span>
                  <span class="setting-row-sub">KB — קבצים גדולים יותר מדולגים</span>
                </div>
                <input id="scanMaxSizeInput" type="number" min="1" max="10240" step="10" value="200" />
              </div>
            </div>
          </div>

          <div class="dialog-btns">
            <button class="dialog-confirm" id="scanSettingsSaveBtn">שמור</button>
            <button class="dialog-cancel" id="scanSettingsResetBtn">אפס לברירת מחדל</button>
            <button class="dialog-cancel" id="scanSettingsCloseBtn">סגור</button>
          </div>
        </div>
      </div>

      <div class="settings-overlay" id="settingsOverlay">
        <div class="settings-box" id="settingsBox">
          <div class="settings-head">
            <div class="settings-title">אפשרויות מתקדמות</div>
            <button class="settings-close" id="settingsCloseBtn" aria-label="סגור">${IC.x}</button>
          </div>
          <div class="setting-row">
            <div class="setting-row-label">
              <span class="setting-row-title">Context window</span>
              <span class="setting-row-sub">K Toekn</span>
            </div>
            <input id="ccb-ctx-size" type="number" min="4" max="2048" step="4" value="128" />
          </div>
          <div class="setting-row">
            <div class="setting-row-label">
              <span class="setting-row-title">מגבלת תווים למסמך</span>
              <span class="setting-row-sub">אלפי תווים — קבצי קוד ומבנה הפרויקט אינם מוגבלים</span>
            </div>
            <input id="ccb-doc-max-chars" type="number" min="1" max="1000" step="5" value="50" />
          </div>
          <div class="setting-row">
            <div class="setting-row-label">
              <span class="setting-row-title">מתי לטעון זיכרון כללי</span>
              <span class="setting-row-sub">אוטומטית</span>
            </div>
            <select id="ccb-auto-inject-mode-gm">
              <option value="start">בתחילת שיחה</option>
              <option value="every">בכל הודעה</option>
            </select>
          </div>
          <div class="setting-row">
            <div class="setting-row-label">
              <span class="setting-row-title">מתי לטעון הנחיות פרויקט</span>
              <span class="setting-row-sub">אוטומטית, לפרויקט הפעיל</span>
            </div>
            <select id="ccb-auto-inject-mode-project">
              <option value="start">בתחילת שיחה</option>
              <option value="every">בכל הודעה</option>
            </select>
          </div>
          <div class="settings-list">
            <button class="settings-item" id="exportBackupBtn" type="button">
              <span class="settings-item-icon">${IC.download}</span>
              <span class="settings-item-text">
                <span class="settings-item-title">ייצוא גיבוי</span>
                <span class="settings-item-sub">מוריד את כל הבלוקים לקובץ JSON</span>
              </span>
            </button>
            <button class="settings-item" id="importBackupBtn" type="button">
              <span class="settings-item-icon">${IC.upload}</span>
              <span class="settings-item-text">
                <span class="settings-item-title">ייבוא גיבוי</span>
                <span class="settings-item-sub">טוען קובץ JSON ומחליף את הבלוקים</span>
              </span>
            </button>
            <button class="settings-item" id="editPromptsBtn" type="button">
              <span class="settings-item-icon">${IC.pencil}</span>
              <span class="settings-item-text">
                <span class="settings-item-title">עריכת פרומפטים</span>
                <span class="settings-item-sub">מסגרות הזרקה (FRAMING)</span>
              </span>
            </button>
            <button class="settings-item" id="scanSettingsBtn" type="button">
              <span class="settings-item-icon">${IC.ban}</span>
              <span class="settings-item-text">
                <span class="settings-item-title">קבצים לסריקת פרויקטי קוד</span>
                <span class="settings-item-sub">תיקיות/קבצים להחרגה, סיומות, גודל מקסימלי</span>
              </span>
            </button>
            <button class="settings-item" id="openOnboardingBtn" type="button">
              <span class="settings-item-icon">${IC.help}</span>
              <span class="settings-item-text">
                <span class="settings-item-title">מדריך שימוש</span>
                <span class="settings-item-sub">כל הפיצ'רים של התוסף בקצרה</span>
              </span>
            </button>
          </div>
        </div>
      </div>

      <div class="prompts-overlay" id="promptsOverlay" aria-hidden="true">
        <div class="prompts-box">
          <div class="prompts-head">
            <div class="prompts-title">עריכת פרומפטים</div>
          </div>

          <div class="prompts-body">
            <div class="prompts-section">
              <div class="prompts-section-head">
                <div class="prompts-section-title">FRAMING</div>
                <button id="resetFramingBtn" type="button" class="prompts-reset">איפוס הכל</button>
              </div>
              <div class="prompts-label">Prefix נעול (קוד)</div>
              <div id="promptFramingLocked" class="prompts-locked"></div>

              <!-- 1) Manual injection -->
              <div class="prompts-subsection">
                <div class="prompts-subhead">
                  <div class="prompts-subtitle">1) טעינה ידנית</div>
                  <button id="resetFramingManualBtn" type="button" class="prompts-reset">איפוס</button>
                </div>
                <div class="prompts-sublabel">הוראות לפני הפרומפטים השמורים</div>
                <textarea id="promptFramingManualIntro" spellcheck="false"></textarea>
                <div class="prompts-locked prompts-locked-tag">&lt;context&gt; … &lt;/context&gt;</div>
                <div class="prompts-sublabel">הוראות אחרי הפרומפטים השמורים</div>
                <textarea id="promptFramingManualOutro" spellcheck="false"></textarea>
              </div>

              <!-- 2) GM auto-inject -->
              <div class="prompts-subsection">
                <div class="prompts-subhead">
                  <div class="prompts-subtitle">2) זיכרון כללי</div>
                  <button id="resetFramingGmBtn" type="button" class="prompts-reset">איפוס</button>
                </div>
                <div class="prompts-sublabel">הוראות לפני הזיכרון</div>
                <textarea id="promptFramingGmIntro" spellcheck="false"></textarea>
                <div class="prompts-locked prompts-locked-tag">&lt;memory&gt; … &lt;/memory&gt;</div>
                <div class="prompts-sublabel">הוראות אחרי הזיכרון</div>
                <textarea id="promptFramingGmOutro" spellcheck="false"></textarea>
              </div>

              <!-- 3) Conversation wrapper -->
              <div class="prompts-subsection">
                <div class="prompts-subhead">
                  <div class="prompts-subtitle">3) מעטפת שיחה</div>
                  <button id="resetFramingConvBtn" type="button" class="prompts-reset">איפוס</button>
                </div>
                <div class="prompts-sublabel">הוראות לפני השיחה</div>
                <textarea id="promptFramingConvIntro" spellcheck="false"></textarea>
                <div class="prompts-locked prompts-locked-tag">&lt;transcript&gt; … &lt;/transcript&gt;</div>
                <div class="prompts-sublabel">הוראות אחרי השיחה</div>
                <textarea id="promptFramingConvOutro" spellcheck="false"></textarea>
              </div>

              <!-- 4) Project instructions wrapper -->
              <div class="prompts-subsection">
                <div class="prompts-subhead">
                  <div class="prompts-subtitle">4) מעטפת הנחיות פרויקט</div>
                  <button id="resetFramingProjBtn" type="button" class="prompts-reset">איפוס</button>
                </div>
                <div class="prompts-sublabel">הוראות לפני ההנחיות</div>
                <textarea id="promptFramingProjIntro" spellcheck="false"></textarea>
                <div class="prompts-locked prompts-locked-tag">&lt;project&gt; … &lt;/project&gt;</div>
                <div class="prompts-sublabel">הוראות אחרי ההנחיות</div>
                <textarea id="promptFramingProjOutro" spellcheck="false"></textarea>
              </div>

              <!-- 5) File-injection wrapper -->
              <div class="prompts-subsection">
                <div class="prompts-subhead">
                  <div class="prompts-subtitle">5) מעטפת הזרקת קבצים</div>
                  <button id="resetFramingDocsBtn" type="button" class="prompts-reset">איפוס</button>
                </div>
                <div class="prompts-sublabel">הוראות לפני הקבצים</div>
                <textarea id="promptFramingDocsIntro" spellcheck="false"></textarea>
                <div class="prompts-locked prompts-locked-tag">&lt;documents&gt; … &lt;/documents&gt;</div>
                <div class="prompts-sublabel">הוראות אחרי הקבצים</div>
                <textarea id="promptFramingDocsOutro" spellcheck="false"></textarea>
              </div>

              <!-- 6) Per-message context wrapper (auto-inject mode: every message) -->
              <div class="prompts-subsection">
                <div class="prompts-subhead">
                  <div class="prompts-subtitle">6) מעטפת טעינה בכל הודעה</div>
                  <button id="resetFramingEveryBtn" type="button" class="prompts-reset">איפוס</button>
                </div>
                <div class="prompts-sublabel">הוראות לפני הקונטקסט</div>
                <textarea id="promptFramingEveryIntro" spellcheck="false"></textarea>
                <div class="prompts-locked prompts-locked-tag">&lt;memory&gt; / &lt;project&gt; … הודעת המשתמש אחרי [[CCB:CTX-END]]</div>
                <div class="prompts-sublabel">הוראות אחרי הקונטקסט</div>
                <textarea id="promptFramingEveryOutro" spellcheck="false"></textarea>
              </div>
            </div>
          </div>

          <div class="prompts-footer">
            <button id="savePromptsBtn" type="button" class="prompts-save">שמור</button>
            <button id="cancelPromptsBtn" type="button" class="prompts-cancel">בטל</button>
          </div>
        </div>
      </div>

      <input id="importBackupInput" type="file" accept="application/json,.json" style="display:none" />

      <div id="editView">
        <div id="editProjectTag" class="edit-project-tag" style="display:none">
          ${IC.folder}
          <span id="editProjectTagText"></span>
        </div>
        <label>כותרת</label>
        <input id="editTitle" type="text" placeholder="לדוגמה: הפרויקט שלי">
        <label>קיצור פקודה מהירה (אופציונלי) — הקלד / בתיבת הצ'אט כדי לבחור</label>
        <input id="editTrigger" type="text" placeholder="/sum" dir="ltr">
        <label>תוכן</label>
        <textarea id="editContent" placeholder="הקונטקסט שיוזרק לצ'אט..."></textarea>
        <div id="editButtons">
          <button id="saveBtn">שמור</button>
          <button id="cancelBtn">בטל</button>
          <button id="deleteBtn" style="display:none">מחק</button>
        </div>
        <div class="edit-status" id="status"></div>
      </div>

    </div>

    <div id="conversationView" aria-hidden="true">
      <div class="cv-shell">
        <div class="cv-header">
          <button id="cvBack" type="button" aria-label="חזרה">${IC.chevronRight}</button>
          <div class="cv-title-wrap">
            <div id="cvTitle"></div>
            <div id="cvMeta" class="cv-meta"></div>
          </div>
        </div>

        <div class="cv-search-wrap">
          <input id="cvSearch" type="search" placeholder="חיפוש בשיחה..." autocomplete="off" />
          <span class="cv-search-icon">${IC.search}</span>
          <span id="cvSearchCount" class="cv-search-count"></span>
          <button id="cvNavPrev" type="button" class="cv-nav-btn" title="תוצאה קודמת" disabled>${IC.chevronRight}</button>
          <button id="cvNavNext" type="button" class="cv-nav-btn cv-nav-next" title="תוצאה הבאה" disabled>${IC.chevronRight}</button>
        </div>

        <div class="cv-messages" id="cvMessages"></div>

        <div class="cv-sel-bar">
          <button id="cvSelAll" type="button" class="cv-sel-btn">בחר הכל</button>
          <button id="cvSelNone" type="button" class="cv-sel-btn">בטל הכל</button>
          <span id="cvSelCount" class="cv-sel-count"></span>
        </div>

        <div class="cv-footer">
          <button id="cvLoadBtn" type="button" class="cv-load-btn" disabled>${IC.upload} טען נבחרים</button>
        </div>
      </div>
    </div>

    <div id="filePreviewView" aria-hidden="true">
      <div class="cv-shell">
        <div class="cv-header">
          <button id="fpBack" type="button" aria-label="סגור">${IC.x}</button>
          <div class="cv-title-wrap fp-title-wrap">
            <div id="fpTitle" class="fp-title"></div>
            <div id="fpPath" class="fp-path"></div>
            <div id="fpMeta" class="fp-meta"></div>
          </div>
        </div>
        <div class="fp-body-wrap"><pre class="fp-body" id="fpBody"></pre></div>
      </div>
    </div>

    <div id="depManagerView" aria-hidden="true">
      <div class="cv-shell">
        <div class="cv-header">
          <button id="dmBack" type="button" aria-label="סגור">${IC.x}</button>
          <div class="cv-title-wrap fp-title-wrap">
            <div id="dmTitle" class="fp-title"></div>
            <div id="dmPath" class="fp-path"></div>
          </div>
        </div>
        <div class="fp-body-wrap dm-body-wrap" id="dmBody"></div>
      </div>
    </div>

    <div id="onboardingView" aria-hidden="true">
      <div class="cv-shell">
        <div class="cv-header">
          <button id="obClose" type="button" aria-label="סגור">${IC.x}</button>
          <div class="cv-title-wrap fp-title-wrap">
            <div class="fp-title">מדריך שימוש</div>
          </div>
        </div>

        <div class="ob-dismiss-row" id="obDismissRow">
          <label class="ob-dismiss-label">
            <input type="checkbox" id="obDismissCheckbox" />
            אל תציג את המדריך אוטומטית בפעם הבאה
          </label>
        </div>

        <div class="fp-body-wrap ob-body-wrap" id="obBody">

          <div class="ob-section collapsed">
            <div class="ob-section-header">
              <div class="section-header">
                <div class="section-head-left">
                  <button type="button" class="collapse-btn collapsed" aria-label="הרחב/כווץ">${IC.chevronRight}</button>
                  <span class="ob-section-icon">${IC.menu}</span>
                  <span class="section-label">סיידבר וקיצורי מקלדת</span>
                </div>
              </div>
            </div>
            <div class="ob-section-body">
              <div class="ob-item"><b>פתיחה/סגירה</b> — קליק על כפתור העיגול (FAB) בצד המסך, או קיצור המקלדת Ctrl+Shift+L.</div>
              <div class="ob-item"><b>ברירת מחדל</b> — הפאנל תמיד נפתח לטאב Context.</div>
              <div class="ob-item"><b>שני טאבים</b> — Context (כל ההזרקות והמסמכים) ו"שיחות אחרונות" (History, היסטוריית שיחות).</div>
              <div class="ob-item"><b>כפתור ההגדרות (⚙)</b> — בראש הפאנל, פותח את חלון "אפשרויות מתקדמות" (כולל את המדריך הזה).</div>
            </div>
          </div>

          <div class="ob-section collapsed">
            <div class="ob-section-header">
              <div class="section-header">
                <div class="section-head-left">
                  <button type="button" class="collapse-btn collapsed" aria-label="הרחב/כווץ">${IC.chevronRight}</button>
                  <span class="ob-section-icon">${IC.folder}</span>
                  <span class="section-label">סרגל פרויקטים</span>
                </div>
              </div>
            </div>
            <div class="ob-section-body">
              <div class="ob-item"><b>הפרויקט הפעיל</b> — הרשימה הנפתחת למעלה קובעת פרויקט אחד "פעיל" לכל הפאנל; הבחירה נשמרת גם אחרי סגירה ופתיחה מחדש.</div>
              <div class="ob-item"><b>+ פרויקט</b> — יוצר פרויקט טקסט רגיל (הנחיות + מסמכים/קבצים שהודבקו או הועלו).</div>
              <div class="ob-item"><b>+ פרויקט קוד</b> — מקשר תיקייה מקומית במחשב ומאפשר לסרוק אותה כפרויקט קוד עם עץ קבצים.</div>
              <div class="ob-item"><b>תפריט 3 הנקודות</b> — עריכה על הפרויקט הפעיל: שינוי שם או מחיקה, עובד אותו דבר לפרויקט רגיל ולפרויקט קוד.</div>
            </div>
          </div>

          <div class="ob-section collapsed">
            <div class="ob-section-header">
              <div class="section-header">
                <div class="section-head-left">
                  <button type="button" class="collapse-btn collapsed" aria-label="הרחב/כווץ">${IC.chevronRight}</button>
                  <span class="ob-section-icon">${IC.context}</span>
                  <span class="section-label">טאב Context</span>
                </div>
              </div>
            </div>
            <div class="ob-section-body">
              <div class="ob-item"><b>זיכרון כללי (GM)</b> — כרטיס קבוע בראש הרשימה, זמין בכל שיחה בכל אתר; תיבת סימון לבחירה להזרקה + מתג "טעינה אוטומטית".</div>
              <div class="ob-item"><b>כרטיס הנחיות פרויקט</b> — מופיע מתחת ל-GM כשיש פרויקט פעיל, עובד באותה צורה בדיוק (סימון + מתג אוטומטי משלו).</div>
              <div class="ob-item"><b>עריכת כרטיס</b> — קליק על כרטיס GM/הנחיות פותח את טופס העריכה שלו; המתג/תיבת הסימון לא פותחים עריכה כשלוחצים עליהם ישירות.</div>
              <div class="ob-item"><b>באדג' "נטען אוטומטית"</b> — לחיץ: קליק עליו מחליף בין "בתחילת שיחה" ל"בכל הודעה", בנפרד ל-GM ולהנחיות הפרויקט.</div>
              <div class="ob-item"><b>רשימת פרומפטים מאוחדת</b> — בלוקים כלליים מוצגים תמיד, ובלוקים ששייכים לפרויקט הפעיל מתויגים בתגית עם שם הפרויקט.</div>
              <div class="ob-item"><b>+ בלוק חדש</b> — נוצר משויך אוטומטית לפרויקט הפעיל אם קיים, אחרת כבלוק כללי.</div>
              <div class="ob-item"><b>"טען פרומפטים" (פוטר)</b> — מזריק לצ'אט של האתר את כל מה שמסומן ברשימה, בלי לשלוח אוטומטית.</div>
            </div>
          </div>

          <div class="ob-section collapsed">
            <div class="ob-section-header">
              <div class="section-header">
                <div class="section-head-left">
                  <button type="button" class="collapse-btn collapsed" aria-label="הרחב/כווץ">${IC.chevronRight}</button>
                  <span class="ob-section-icon">${IC.file}</span>
                  <span class="section-label">מסמכי פרויקט ועץ קבצים</span>
                </div>
              </div>
            </div>
            <div class="ob-section-body">
              <div class="ob-item"><b>פרויקט רגיל</b> — רשימת מסמכים שטוחה: קבצים שהועלו, טקסט מודבק, או כתובות URL, דרך דיאלוג "+ הוסף".</div>
              <div class="ob-item"><b>פרויקט קוד — עץ קבצים</b> — תיבת סימון לכל קובץ; תיבה על תיקייה שלמה מסמנת/מבטלת בבת אחת את כל הקבצים תחתיה.</div>
              <div class="ob-item"><b>חיפוש בתוך תיקייה</b> — הקלדת שם תיקייה בתיבת החיפוש מעלה את כל הקבצים תחתיה, לא רק התאמה מדויקת של שם קובץ.</div>
              <div class="ob-item"><b>תגי תלויות/תלויים</b> — בתפריט "אפשרויות תלויות" של קובץ מוצג מספר התלויות (קבצים שהוא תלוי בהם) והתלויים (קבצים שתלויים בו).</div>
              <div class="ob-item"><b>"טען עם תלויות"</b> — מהתפריט של כל קובץ: לבחור בבת אחת את התלויות הישירות שלו, התלויים בו, או את כל ההקשר המלא.</div>
              <div class="ob-item"><b>תצוגה מקדימה (עין)</b> — פותחת את תוכן הקובץ לקריאה בלבד במסך מלא, כולל ספירת טוקנים מדויקת.</div>
              <div class="ob-item"><b>ניהול תלויות (עיפרון)</b> — מסך ייעודי לקובץ בודד: מוסיפים/מסירים תלויות יוצאות ידנית; התלויים הנכנסים והתלויות העקיפות מוצגים לקריאה בלבד.</div>
              <div class="ob-item"><b>מפת הפרויקט</b> — מסמך מבנה קבצים שנוצר אוטומטית בכל סריקה, מופיע כשורה משלו בראש העץ עם תיבת סימון.</div>
              <div class="ob-item"><b>רענון וסינון</b> — כפתור רענון סריקה וכפתור "קבצים להחרגה" (ignore) בכותרת סקשן המסמכים, ספציפיים לפרויקט הזה.</div>
              <div class="ob-item"><b>פס תקציב טוקנים</b> — מתחת לעץ, מציג את אחוז המילוי מתוך גודל חלון ההקשר בצבע לפי סף (ירוק/צהוב/אדום).</div>
            </div>
          </div>

          <div class="ob-section collapsed">
            <div class="ob-section-header">
              <div class="section-header">
                <div class="section-head-left">
                  <button type="button" class="collapse-btn collapsed" aria-label="הרחב/כווץ">${IC.chevronRight}</button>
                  <span class="ob-section-icon">${IC.clock}</span>
                  <span class="section-label">טאב History ותצוגת שיחה</span>
                </div>
              </div>
            </div>
            <div class="ob-section-body">
              <div class="ob-item"><b>רשימת שיחות</b> — חיפוש לפי כותרת או לפי תוכן ההודעות, ואפשרויות נעיצה / שינוי שם / שיוך לפרויקט / מחיקה.</div>
              <div class="ob-item"><b>סינון לפי פרויקט</b> — כשיש פרויקט פעיל, הרשימה מסוננת אליו אוטומטית; תיבת "הצג את כל השיחות" מבטלת זמנית את הסינון.</div>
              <div class="ob-item"><b>תצוגה מקדימה</b> — קליק על שיחה פותח חיפוש בתוך ההודעות שלה ובחירת הודעות ספציפיות.</div>
              <div class="ob-item"><b>"טען נבחרים"</b> — מזריק את ההודעות שנבחרו כהקשר לצ'אט הנוכחי, בלי לשלוח אוטומטית ובלי לקשר את השיחות.</div>
              <div class="ob-item"><b>שמירה אוטומטית</b> — כל שיחה נשמרת ברקע תוך כדי כתיבה, אין צורך בכפתור שמירה ידני.</div>
            </div>
          </div>

          <div class="ob-section collapsed">
            <div class="ob-section-header">
              <div class="section-header">
                <div class="section-head-left">
                  <button type="button" class="collapse-btn collapsed" aria-label="הרחב/כווץ">${IC.chevronRight}</button>
                  <span class="ob-section-icon">${IC.inject}</span>
                  <span class="section-label">הזרקה, ביטול ופקודות מהירות</span>
                </div>
              </div>
            </div>
            <div class="ob-section-body">
              <div class="ob-item"><b>"טען פרומפטים" / "טען קבצים"</b> — שני כפתורי הפוטר להזרקה ידנית; אף אחד מהם לא שולח אוטומטית.</div>
              <div class="ob-item"><b>"בטל הזרקה"</b> — מבטל תמיד רק את ההזרקה האחרונה; אפשר ללחוץ שוב ברצף כדי לבטל אחורה כמה הזרקות, עם מספר שמראה כמה ממתינות.</div>
              <div class="ob-item"><b>פקודות מהירות</b> — הקלדת "/" בתיבת הצ'אט של האתר עצמו (לא בפאנל) פותחת תפריט הצעות מסונן.</div>
              <div class="ob-item"><b>ניווט בתפריט</b> — חצים למעלה/למטה לניווט, Enter או Tab לבחירה, Escape לסגירה.</div>
              <div class="ob-item"><b>שרשור פקודות</b> — אפשר לבחור כמה פקודות מהירות ברצף לאותה הודעה, אחת אחרי השנייה.</div>
              <div class="ob-item"><b>הגדרת קיצור לבלוק</b> — בטופס העריכה של כל בלוק (כללי, פרויקט, GM, הנחיות) יש שדה "קיצור" (למשל "/summarize").</div>
            </div>
          </div>

          <div class="ob-section collapsed">
            <div class="ob-section-header">
              <div class="section-header">
                <div class="section-head-left">
                  <button type="button" class="collapse-btn collapsed" aria-label="הרחב/כווץ">${IC.chevronRight}</button>
                  <span class="ob-section-icon">${IC.settings}</span>
                  <span class="section-label">הגדרות מתקדמות</span>
                </div>
              </div>
            </div>
            <div class="ob-section-body">
              <div class="ob-item"><b>Context window</b> — גודל חלון ההקשר (באלפי טוקנים) — הבסיס לכל אחוזי המילוי המוצגים בפאנל.</div>
              <div class="ob-item"><b>מגבלת תווים למסמך</b> — חלה רק על מסמכים רגילים; קבצי קוד ומפת הפרויקט לעולם לא נחתכים.</div>
              <div class="ob-item"><b>מתי לטעון (GM / הנחיות פרויקט)</b> — שני מתגים נפרדים, "בתחילת שיחה" או "בכל הודעה", כל אחד עצמאי.</div>
              <div class="ob-item"><b>ייצוא/ייבוא גיבוי</b> — קובץ JSON אחד עם כל הבלוקים, הפרויקטים והמסמכים.</div>
              <div class="ob-item"><b>עריכת פרומפטים</b> — טקסטים חופשיים לפני/אחרי כל סוג הזרקה (ידני, GM, שיחה, פרויקט, קבצים, כל-הודעה).</div>
              <div class="ob-item"><b>קבצים לסריקת פרויקטי קוד</b> — כללי החרגה גלובליים: תיקיות/קבצים לדילוג, סיומות לסריקה, וגודל קובץ מקסימלי.</div>
            </div>
          </div>

        </div>
      </div>
    </div>

    <div id="quickCmdMenu" role="listbox" aria-label="פקודות מהירות" style="display:none"></div>
  `;

  return { IC, PANEL_HTML };
})();
