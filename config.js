// config.js — כל הערכים שצריך להתאים לאתר שלך. נטען לפני content.js.
// כל הקבועים נחשפים דרך window.__ccbRawConfig לשימוש ב-content.js.

// ─── SITE SELECTORS ──────────────────────────────────────────────────────────
// הגדר כאן את ה-selectors לכל אתר, ושנה את ACTIVE_SITE למטה.

const _GEMINI_SELECTORS = {
  messageList: "infinite-scroller.chat-history", // ה-container שמכיל את כל השיחה (כל ה-turns)
  message: "user-query, model-response", // כל turn (שאלה / תשובה)
  aiMessageMatch: (n) =>
    n.tagName === "MODEL-RESPONSE" || n.matches?.("model-response"),
  userMessageMatch: (n) =>
    n.tagName === "USER-QUERY" || n.matches?.("user-query"),
  messageText: (n) => {
    // הודעת משתמש: span.user-query-bubble-with-background > div[role="heading"].query-text
    const userBubble = n.querySelector(
      "span.user-query-bubble-with-background",
    );
    if (userBubble) {
      const heading = userBubble.querySelector(
        'div[role="heading"].query-text',
      );
      if (heading) return heading.innerText || "";
      // אם אין heading, נסה את ה-bubble עצמו
      return userBubble.innerText || "";
    }
    // הודעת AI: message-content > div.markdown.markdown-main-panel
    const markdown = n.querySelector("message-content .markdown");
    if (markdown) return markdown.innerText || "";
    const msgContent = n.querySelector("message-content");
    if (msgContent) return msgContent.innerText || "";
    return n.innerText || "";
  },
};

// selectors של הצ'אט הפנימי (dev-mfe-mishley)
const _INTERNAL_CHAT_SELECTORS = {
  messageList: "div.messages-container",
  message: "div.message.user, div.message.assistant",
  aiMessageMatch: (n) => n.classList.contains("assistant"),
  userMessageMatch: (n) => n.classList.contains("user"),
  messageText: (n) =>
    n.querySelector(".message-content")?.innerText?.trim() ||
    n.innerText?.trim() ||
    "",
};

// ⬇ CHANGE: בחר איזה site להפעיל — "gemini" או "internal"
const ACTIVE_SITE = "gemini";

// ─────────────────────────────────────────────────────────────────────────────

const _SITE_CONFIG = {
  gemini: {
    AUTO_OPEN_URLS: ["https://gemini.google.com"],
    CHAT_INPUT_SELECTOR: "textarea.new-input-ui",
    SEND_BUTTON_SELECTOR:
      ".gds-icon-xl.google-symbols.mat-icon.send-button-icon",
    PUSH_SELECTOR: "chat-app",
    PUSH_FIXED_SELECTORS: ["top-bar-actions"],
  },
  internal: {
    AUTO_OPEN_URLS: ["https://dev-mfe-mishley.ips.gov.il"],
    CHAT_INPUT_SELECTOR: "textarea.chat-input",
    SEND_BUTTON_SELECTOR:
      "div.chat-input-buttons button[type='submit'], div.chat-input-buttons button:last-of-type",
    PUSH_SELECTOR: "div.app-main-content",
    PUSH_FIXED_SELECTORS: [],
  },
};

const _ACTIVE = _SITE_CONFIG[ACTIVE_SITE] || _SITE_CONFIG.gemini;

  window.__ccbRawConfig = {
    AUTO_OPEN_URLS: _ACTIVE.AUTO_OPEN_URLS,
    CHAT_INPUT_SELECTOR: _ACTIVE.CHAT_INPUT_SELECTOR,
    SEND_BUTTON_SELECTOR: _ACTIVE.SEND_BUTTON_SELECTOR,
    PUSH_SELECTOR: _ACTIVE.PUSH_SELECTOR,
    PUSH_FIXED_SELECTORS: _ACTIVE.PUSH_FIXED_SELECTORS,

    // רוחב הסיידבר בפיקסלים
    SIDEBAR_WIDTH: 300,
    CTX_WINDOW_DEFAULT: 128000,
    CHARS_PER_TOKEN: 3.5,

    MSG_SELECTORS:
      ACTIVE_SITE === "gemini" ? _GEMINI_SELECTORS : _INTERNAL_CHAT_SELECTORS,

  INPUT_FALLBACKS: [
    "textarea",
    'div[contenteditable="true"]',
    'input[type="text"]',
  ],

  STORAGE_KEY: "blocks",
  GM_ID: "__general_memory",

  // ─── Prompts ───────────────────────────────────────────────────────────────

  SUMMARY_PROMPT:
    "You are about to end this conversation. Write a briefing for the next AI instance that will continue it.\n" +
    "\n" +
    'Write as if you\'re handing off to yourself — use second person ("You were helping the user with...").\n' +
    "\n" +
    "Cover:\n" +
    "- **What you were building together** — the goal and context\n" +
    "- **Exact state when the conversation ended** — what was just completed, what's in progress\n" +
    "- **Open threads** — unresolved questions, pending decisions, things the user said they'd come back to\n" +
    "- **Technical constraints locked in** — stack, patterns, naming, decisions that shouldn't be revisited\n" +
    "- **Next logical step** — what the user will likely ask first in the next session\n" +
    "\n" +
    "Be specific. Vague summaries are useless. Include file names, function names, exact wording of decisions if relevant.\n" +
    "\n" +
    "Output only the briefing. No preamble.\n" +
    "After the briefing, on a new line, write exactly (replace each # with a colon):\n" +
    "[[CCB#TITLE#כותרת בעברית 3-5 מילים]]\n" +
    "[[CCB#SAVE]]",

  FRAMING:
    "[[CCB:INJECTED]]\n" +
    "[SYSTEM CONTEXT — DO NOT RESPOND TO THIS MESSAGE]\n" +
    "The following is background context for this conversation. Load it silently into memory.\n" +
    "Do NOT greet, acknowledge, summarize, or reply to this message in any way.\n" +
    "Do NOT say anything until the user sends their first actual message.\n" +
    "Simply wait.\n\n",
};
