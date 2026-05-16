// summarizer.js — watches the page for [[CCB:SAVE]] and auto-saves to the context bank.
// Works on any chat without configuration: scans the DOM for the trigger,
// extracts the surrounding message, and stores it as a "conversation" block.
// All storage and UI calls go through window.__ccb (exposed by content.js).

(() => {
  if (window.__ccbSumInstalled) return;
  window.__ccbSumInstalled = true;

  const ACTIVE_URLS = window.__ccbRawConfig?.AUTO_OPEN_URLS || [];
  const isActiveSitePage = () =>
    ACTIVE_URLS.some((u) => location.href.startsWith(u));

  const SAVE_TRIGGER = "[[CCB:SAVE]]";
  const DEBOUNCE_MS = 1000;
  const MIN_LEN = 30;
  const MAX_LEN = 50000;

  if (!isActiveSitePage()) return;

  function waitForApi(cb, tries = 0) {
    if (window.__ccb) {
      cb();
      return;
    }
    if (tries > 60) return;
    setTimeout(() => waitForApi(cb, tries + 1), 50);
  }

  waitForApi(() => {
    const api = window.__ccb;
    const seen = new Set();
    let timer = null;

    const obs = new MutationObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(checkAndSave, DEBOUNCE_MS);
    });
    obs.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    async function checkAndSave() {
      const node = findAiSummaryNode();
      if (!node) return;

      const fullText = (node.innerText || node.textContent || "").trim();
      if (!fullText.includes(SAVE_TRIGGER)) return;

      // Extract optional [[CCB:TITLE:...]] marker
      const titleMatch = fullText.match(/\[\[CCB:TITLE:([^\]]+)\]\]/);
      const aiTitle = titleMatch ? titleMatch[1].trim() : null;

      // Strip all CCB markers from content
      let clean = fullText
        .split(SAVE_TRIGGER)
        .join("")
        .replace(/\[\[CCB:TITLE:[^\]]*\]\]/g, "")
        .trim();

      if (clean.length < MIN_LEN || clean.length > MAX_LEN) return;

      // Dedupe — same summary content shouldn't be saved twice
      const fp =
        clean.length + ":" + clean.slice(0, 80) + ":" + clean.slice(-80);
      if (seen.has(fp)) return;
      seen.add(fp);

      const now = new Date();
      const dateStr =
        now.toLocaleDateString("en-GB") +
        " " +
        now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
      const title = aiTitle ? aiTitle : "Summary";

      await api.loadBlocks();
      const id = "b_" + Date.now() + "_sum";
      api.blocks[id] = {
        id,
        title,
        content: clean,
        tags: ["summary"],
        kind: "conversation",
        updated: Date.now(),
        savedAt: Date.now(),
      };
      await api.saveBlocks();
      api.setStatus("הסיכום נשמר ✓");
      api.renderPanel();
    }

    function findAiSummaryNode() {
      // Search elements (not text nodes) so innerText consolidates split text nodes from streaming.
      // Among all matching elements, return the SMALLEST one that passes all checks
      // (smallest = most specific = the message bubble, not a parent container).
      const candidates = [];

      for (const el of document.body.querySelectorAll("*")) {
        const text = el.innerText || "";
        if (!text.includes(SAVE_TRIGGER)) continue; // no trigger
        const clean = text
          .split(SAVE_TRIGGER)
          .join("")
          .replace(/\[\[CCB:TITLE:[^\]]*\]\]/g, "")
          .trim();
        if (clean.length < MIN_LEN || clean.length > MAX_LEN) continue;
        candidates.push({ el, len: clean.length });
      }

      if (!candidates.length) return null;
      // Smallest passing element = closest ancestor to the actual content = message bubble
      candidates.sort((a, b) => a.len - b.len);
      return candidates[0].el;
    }

    window.addEventListener("beforeunload", () => obs.disconnect(), {
      once: true,
    });
  });
})();
