// ui-template.js — SVG icons and Shadow DOM HTML template. Loaded before content.js.
window.__ccbTpl = (() => {
  const IC = {
    menu: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>`,
    x: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
    context: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="12" y2="16"/></svg>`,
    clock: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
    search: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`,
    plus: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
    msg: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`,
    upload: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/></svg>`,
    download: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`,
    cs: `<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
    settings: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1 1 0 0 0 .2 1.1l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1 1 0 0 0-1.1-.2 1 1 0 0 0-.6.9V20a2 2 0 1 1-4 0v-.2a1 1 0 0 0-.6-.9 1 1 0 0 0-1.1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1 1 0 0 0 .2-1.1 1 1 0 0 0-.9-.6H4a2 2 0 1 1 0-4h.2a1 1 0 0 0 .9-.6 1 1 0 0 0-.2-1.1l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1 1 0 0 0 1.1.2 1 1 0 0 0 .6-.9V4a2 2 0 1 1 4 0v.2a1 1 0 0 0 .6.9 1 1 0 0 0 1.1-.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1 1 0 0 0-.2 1.1 1 1 0 0 0 .9.6H20a2 2 0 1 1 0 4h-.2a1 1 0 0 0-.9.6Z"/></svg>`,
  };

  const PANEL_HTML = `
    <button class="fab" id="fab" title="משלי קוד (Ctrl+Shift+L)">${IC.menu}</button>
    <div class="panel" id="panel">

      <div class="sidebar-header">
        <div class="sidebar-title-row">
          <button id="closeBtn" title="סגור" aria-label="סגור">${IC.x}</button>
          <div class="title-wrap">
            <div style="display: flex; align-items: flex-end; gap: 8px; width: 100%; direction: ltr;">
              <button id="settingsBtn" title="אפשרויות מתקדמות" aria-label="אפשרויות מתקדמות">${IC.settings}</button>
              <div style="display: flex; align-items: flex-end; gap: 8px; direction: rtl; flex: 1;">
                <img src="${chrome.runtime.getURL("icon.png")}" alt="לוגו" style="width: 30px; height: 30px; display: block;" />
                <span class="sidebar-title" style="font-size: 30px; line-height: 1; margin: 0;">משלי קוד</span>
              </div>
            </div>
            <span class="sidebar-subtitle">בחר בלוקים לטעינה לשיחה</span>
          </div>
        </div>
        <div class="tabs" role="tablist">
          <div class="tab active" data-tab="history" role="tab" aria-selected="true">${IC.clock} שיחות אחרונות</div>
          <div class="tab" data-tab="context" role="tab" aria-selected="false">${IC.context} קונטקסט</div>
          <div class="tab-indicator" id="tabIndicator"></div>
        </div>
      </div>

      <div class="tab-pane" id="pane-context">
        <div class="context-toolbar">
          <button id="addBtn" title="בלוק חדש" aria-label="הוסף בלוק חדש">${IC.plus}</button>
        </div>
        <div id="gmCard"></div>
        <div id="list"></div>
      </div>

      <div class="tab-pane active" id="pane-history">
        <div class="context-toolbar" style="flex-direction:column; gap:8px;">
          <div class="hi-search-toggle">
            <button class="hi-toggle-btn active" id="toggleSearchTitle">חיפוש שיחה</button>
            <button class="hi-toggle-btn" id="toggleSearchContent">חיפוש בתוכן</button>
          </div>
          <div class="search-wrap">
            <input id="searchHistory" type="search" placeholder="חיפוש בשיחות..." aria-label="חיפוש בשיחות">
            <span class="search-icon">${IC.search}</span>
          </div>
        </div>
        <div id="historyList"></div>
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

      <div class="settings-overlay" id="settingsOverlay">
        <div class="settings-box" id="settingsBox">
          <div class="settings-head">
            <div class="settings-title">אפשרויות מתקדמות</div>
            <button class="settings-close" id="settingsCloseBtn" aria-label="סגור">${IC.x}</button>
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
          </div>
        </div>
      </div>

      <input id="importBackupInput" type="file" accept="application/json,.json" style="display:none" />

      <footer id="mainFooter">
        <button id="summarizeBtn">${IC.msg} שמור שיחה</button>
        <button id="injectBtn" disabled>${IC.upload} טען נבחרים</button>
      </footer>

      <footer id="historyFooter" style="display:none">
        <button id="summarizeBtnHistory" style="flex:1">${IC.msg} שמור שיחה</button>
      </footer>

      <div id="editView">
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
  `;

  return { IC, PANEL_HTML };
})();
