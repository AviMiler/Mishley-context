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
  };

  const PANEL_HTML = `
    <button class="fab" id="fab" title="משלי קוד (Ctrl+Shift+L)">${IC.menu}</button>
    <div class="panel" id="panel">

      <div class="sidebar-header">
        <div class="sidebar-title-row">
          <button id="closeBtn" title="סגור" aria-label="סגור">${IC.x}</button>
          <div class="title-wrap">
            <span class="sidebar-title">משלי</span>
          </div>
          <button id="settingsBtn" title="אפשרויות מתקדמות" aria-label="אפשרויות מתקדמות">${IC.settings}</button>
        </div>
        <div class="tabs" role="tablist">
          <div class="tab active" data-tab="history" role="tab" aria-selected="true">${IC.clock} שיחות אחרונות</div>
          <div class="tab" data-tab="context" role="tab" aria-selected="false">${IC.context} Context</div>
          <div class="tab-indicator" id="tabIndicator"></div>
        </div>
      </div>

      <div class="global-project-bar" id="globalProjectBar">
        <select id="projectSelect" class="project-select" aria-label="בחר פרויקט"></select>
        <button id="projectEditBtn" type="button" aria-label="ניהול פרויקט" title="ניהול פרויקט" style="display:none">${IC.menuDots}</button>
        <button id="addProjectBtn" type="button" aria-label="פרויקט חדש" title="פרויקט חדש">${IC.plus}</button>
        <button id="addCodeProjectBtn" type="button" aria-label="פרויקט קוד חדש" title="פרויקט קוד חדש">${IC.folder}</button>
      </div>

      <div class="tab-pane" id="pane-context">
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

        <div id="projectInstructionsCard" class="gm-card project-instructions-card" style="display:none">
          <div class="gm-header project-instructions-header">
            <div class="project-instructions-head">
              <button id="projectInstructionsToggle" type="button" class="collapse-btn collapsed" aria-label="פתח או סגור עריכת הנחיות" title="פתח או סגור עריכת הנחיות">${IC.chevronRight}</button>
              <span class="gm-title">הנחיות הפרויקט</span>
            </div>
            <button id="projectInstructionsEditBtn" type="button" class="gm-edit-btn">עריכה</button>
          </div>
          <div id="projectInstructionsPreview" class="gm-preview"></div>
          <div id="projectInstructionsPanel" class="project-accordion-panel collapsed">
            <div class="project-view-label">הנחיות</div>
            <textarea id="projectViewInstructions" placeholder="הנחיות הפרויקט..."></textarea>
            <button id="projectViewSaveBtn" type="button">שמור</button>
          </div>
        </div>

        <div class="context-toolbar">
          <button id="addBtn" title="בלוק חדש" aria-label="הוסף בלוק חדש">${IC.plus}</button>
        </div>
        <div id="gmCard"></div>
        <div id="list"></div>

        <div id="codeProjectInfoRow" class="code-project-info-row" style="display:none">
          <span class="code-project-info-icon">${IC.folder}</span>
          <span id="codeProjectInfoText" class="code-project-info-text"></span>
          <button id="codeProjectInfoRefreshBtn" type="button" class="code-project-info-refresh" aria-label="רענן" title="רענן">${IC.refresh}</button>
        </div>
        <div id="projectDocumentsCard" class="gm-card project-documents-card" style="display:none">
          <div class="gm-header project-documents-header">
            <div class="project-documents-head">
              <button id="projectDocumentsToggle" type="button" class="collapse-btn" aria-label="סגור או פתח מסמכים" title="סגור או פתח מסמכים">${IC.chevronRight}</button>
              <span class="gm-title">מסמכים</span>
            </div>
            <button id="projectAddDocumentBtn" type="button" class="gm-edit-btn">${IC.plus} הוסף</button>
          </div>
          <div id="projectDocumentsList" class="project-documents-list"></div>
        </div>

        </div><!-- /tab-scroll -->
        <footer id="footerContext">
          <button id="injectBtn" disabled style="flex:1">${IC.upload} טען נבחרים</button>
          <button id="injectDocsBtn" style="display:none">${IC.inject} מסמכים</button>
        </footer>
      </div>

      <div class="tab-pane active" id="pane-history">
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
        <footer id="footerHistory">
          <button id="summarizeBtnHistory" style="flex:1">${IC.msg} שמור שיחה</button>
        </footer>
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
          <div class="dialog-title">הוסף מסמך</div>
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
            <input type="text" id="docUrlName" class="doc-url-input" placeholder="שם המסמך (אופציונלי)" />
          </div>
          <div class="dialog-btns">
            <button class="dialog-confirm" id="docAddBtn">הוסף</button>
            <button class="dialog-cancel" id="docCancelBtn">ביטול</button>
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
              <span class="settings-item-icon">✏️</span>
              <span class="settings-item-text">
                <span class="settings-item-title">עריכת פרומפטים</span>
                <span class="settings-item-sub">מסגרות הזרקה (FRAMING)</span>
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
                <div class="prompts-sublabel">הוראות לפני הקונטקסט</div>
                <textarea id="promptFramingManualIntro" spellcheck="false"></textarea>
                <div class="prompts-locked prompts-locked-tag">&lt;context&gt; … &lt;/context&gt;</div>
                <div class="prompts-sublabel">הוראות אחרי הקונטקסט</div>
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
        <label>תגים (מופרדים בפסיק)</label>
        <input id="editTags" type="text" placeholder="קוד, ארכיטקטורה, API">
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

        <div class="cv-project-bar" id="cvProjectBar" style="display:none;">
          <label class="cv-project-toggle">
            <span class="cb-wrap">
              <input type="checkbox" id="cvIncludeProject" />
              <span class="cb-box"><svg class="cb-check" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></span>
            </span>
            <span class="cv-project-label">כלול הנחיות פרויקט</span>
          </label>
        </div>

        <div class="cv-footer">
          <button id="cvLoadBtn" type="button" class="cv-load-btn" disabled>${IC.upload} טען נבחרים</button>
          <button id="cvContinueBtn" type="button" class="cv-continue-btn">${IC.msg} המשך שיחה</button>
        </div>
      </div>
    </div>
  `;

  return { IC, PANEL_HTML };
})();
