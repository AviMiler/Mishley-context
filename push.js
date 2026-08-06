// push.js — shifts page content right when sidebar opens, and/or down to make
// room for the persistent sessions tab strip. Loaded before content.js.
window.__ccbPush = (() => {
  const { PUSH_SELECTOR, PUSH_FIXED_SELECTORS, SIDEBAR_WIDTH } = window.__ccbRawConfig;

  // Shifts the page down by `px` (the sessions tab strip's height) and keeps
  // it shifted permanently — unlike pushPage below, there's no toggle: the
  // strip is always visible once mounted, so the push is applied once at
  // sessions.js's init and never removed. Reuses the same PUSH_SELECTOR (the
  // site's real chat container, not <body>) so a site with its own fixed
  // header/toolbar shifts down together with it, same reasoning as pushPage.
  function pushTop(px) {
    const id = "ccb-push-top-style";
    if (document.getElementById(id)) return;
    let css;
    if (PUSH_SELECTOR) {
      css = `${PUSH_SELECTOR} { margin-top: ${px}px !important; }`;
      for (const sel of PUSH_FIXED_SELECTORS || []) {
        css += ` ${sel} { margin-top: ${px}px !important; }`;
      }
    } else {
      css = `body { margin-top: ${px}px !important; }`;
    }
    const s = document.createElement("style");
    s.id = id;
    s.textContent = css;
    document.head.appendChild(s);
  }

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

  return { pushPage, pushTop };
})();
