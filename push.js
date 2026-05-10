// push.js — shifts page content right when sidebar opens. Loaded before content.js.
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
