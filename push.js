// push.js — shifts page content right when sidebar opens. Loaded before
// content.js.
//
// 2026-08-09: used to also export `pushTop`, which shifted the real host
// page's own chat content DOWN 40px so the persistent sessions tab strip
// (sessions.js) wouldn't visually cover it. Removed at the user's explicit
// request — pushing the real chat page's own layout was unwanted, even
// though it means the strip now visually overlaps the top of the real
// page's content instead of sitting above it. The extension's OWN UI
// (the sidebar panel and the 4 full-pane takeover views) still shifts
// down correctly — that's a separate, untouched mechanism: the
// `:host(.ccb-strip-active)` CSS rules in ui-styles.js, which only ever
// applied to this extension's own shadow-DOM elements.
window.__ccbPush = (() => {
  const { PUSH_SELECTOR, PUSH_FIXED_SELECTORS, SIDEBAR_WIDTH } = window.__ccbRawConfig;

  function pushPage(open) {
    const id = "ccb-push-style";
    const existing = document.getElementById(id);
    if (open) {
      if (existing) return;
      let css;
      if (PUSH_SELECTOR) {
        const tr = "margin-left .2s ease";
        css = `${PUSH_SELECTOR} { margin-left: ${SIDEBAR_WIDTH}px !important; transition: ${tr}; }`;
        for (const sel of PUSH_FIXED_SELECTORS || []) {
          css += ` ${sel} { margin-left: ${SIDEBAR_WIDTH}px !important; transition: ${tr}; }`;
        }
      } else {
        css = `
          html { overflow-x: hidden !important; }
          body {
            transform: translateX(${SIDEBAR_WIDTH}px) !important;
            width: calc(100vw - ${SIDEBAR_WIDTH}px) !important;
            transition: transform .2s ease, width .2s ease !important;
          }
        `;
      }
      const s = document.createElement("style");
      s.id = id;
      s.textContent = css;
      document.head.appendChild(s);
    } else {
      if (existing) existing.remove();
    }
  }

  return { pushPage };
})();
