# Architecture — Chat Context Bank (v2)

## Files

| File            | Purpose                                                               | Lines |
| --------------- | --------------------------------------------------------------------- | ----- |
| `config.js`     | All user-configurable constants — edit this to adapt to any chat site | ~70   |
| `content.js`    | Full sidebar UI + logic (Shadow DOM, storage, inject, render)         | ~1500 |
| `summarizer.js` | Watches DOM for `[[CCB:SAVE]]` trigger, auto-saves summaries          | ~115  |
| `manifest.json` | MV3 manifest — load order: config → content → summarizer              | —     |

## config.js — site switching

```js
const ACTIVE_SITE = "gemini"; // ← שנה ל-"internal" לצ'אט הפנימי
```

`_GEMINI_SELECTORS` ו-`_INTERNAL_CHAT_SELECTORS` מוגדרים בנפרד — רק `ACTIVE_SITE` קובע איזה פעיל.
הסקריפטים עצמם רצים רק בדפים שתואמים ל-`AUTO_OPEN_URLS` של האתר הפעיל.

## config.js exports (`window.__ccbRawConfig`)

| Key                    | Type         | Description                                          |
| ---------------------- | ------------ | ---------------------------------------------------- |
| `AUTO_OPEN_URLS`       | string[]     | URLs where sidebar auto-opens                        |
| `CHAT_INPUT_SELECTOR`  | string       | CSS selector for chat textarea                       |
| `SEND_BUTTON_SELECTOR` | string       | CSS selector for send button                         |
| `PUSH_SELECTOR`        | string\|null | Root element to push right when sidebar opens        |
| `PUSH_FIXED_SELECTORS` | string[]     | Fixed-position elements to push separately           |
| `SIDEBAR_WIDTH`        | number       | Sidebar width in px (default 300)                    |
| `MSG_SELECTORS`        | object       | Selectors for inline-save feature (fill in per site) |
| `INPUT_FALLBACKS`      | string[]     | Fallback selectors when CHAT_INPUT_SELECTOR fails    |
| `STORAGE_KEY`          | string       | chrome.storage key (`"blocks"`)                      |
| `GM_ID`                | string       | ID of general memory block (`"__general_memory"`)    |
| `SUMMARY_PROMPT`       | string       | Prompt sent to AI when user clicks "סכם שיחה"        |
| `FRAMING`              | string       | Preamble injected before any context handoff         |

## content.js — function index

### Storage

| Function       | Description                                                 |
| -------------- | ----------------------------------------------------------- |
| `loadBlocks()` | Loads blocks from chrome.storage into `blocks` (idempotent) |
| `saveBlocks()` | Persists `blocks` to chrome.storage                         |

### Input injection

| Function                      | Description                                                     |
| ----------------------------- | --------------------------------------------------------------- |
| `findInput()`                 | Returns the visible chat input element                          |
| `isTextInput(el)`             | True for textarea / text input / contenteditable                |
| `isVisible(el)`               | True if element has non-zero dimensions and is not hidden       |
| `getCurrentValue(el)`         | Gets current text from input or contenteditable                 |
| `setInputValue(el, value)`    | Sets value with React/framework event dispatch                  |
| `injectIntoInput(text, mode)` | Injects text (mode: replace / prepend / append) → `{ok, error}` |

### Page push

| Function         | Description                                     |
| ---------------- | ----------------------------------------------- |
| `pushPage(open)` | Adds/removes CSS that shifts page content right |

### UI mount + events

| Function                                       | Description                                                            |
| ---------------------------------------------- | ---------------------------------------------------------------------- |
| `mountUI()`                                    | Attaches Shadow DOM host + sidebar HTML (once)                         |
| `settingsBtn`                                  | Header gear button for advanced options                                |
| `moveTabIndicator(tab)`                        | Animates the sliding underline to the active tab                       |
| `showConfirm({title,msg,confirmLabel,danger})` | Custom in-shadow confirm dialog → Promise<bool>                        |
| `showPrompt({title,defaultValue})`             | In-shadow text-input dialog → Promise<string\|null> (null = cancelled) |
| `openSettings()` / `closeSettings()`           | Show/hide and position the advanced options popover                    |
| `exportBackup()`                               | Downloads `context-bank-backup.json` with the full blocks object       |
| `importBackupFile(file)`                       | Validates and restores blocks from a JSON backup file                  |
| `hasUnsavedChanges()`                          | Checks if edit form differs from saved block                           |
| `wireEvents()`                                 | Binds all button/tab/search event listeners                            |

### Panel state

| Function             | Description                                    |
| -------------------- | ---------------------------------------------- |
| `setPanelOpen(open)` | Opens or closes sidebar, loads blocks, renders |
| `togglePanel()`      | Flips panel open/closed                        |

### General Memory

| Function                | Description                                         |
| ----------------------- | --------------------------------------------------- |
| `getGM()`               | Returns GM block from `blocks` (with defaults)      |
| `renderGeneralMemory()` | Renders the GM card in the context tab and lets it be selected for manual injection |
| `tryAutoInject()`       | Polls for input readiness, injects GM + clicks send |

### Render

| Function                                         | Description                                                                            |
| ------------------------------------------------ | -------------------------------------------------------------------------------------- |
| `dateGroup(ts)`                                  | Returns Hebrew date bucket: היום/אתמול/השבוע/החודש/קודם                                |
| `captureConversation()`                          | Reads all messages from DOM via MSG_SELECTORS → `[{role,text}]`                        |
| `formatTranscript(messages)`                     | Formats message array as "User: … / Assistant: …" text                                 |
| `injectHistoryBubbles(messages)`                 | Prepends styled chat bubbles into the page's messageList container, preserving line breaks |
| `buildHistoryMessages(b)`                        | Normalizes conversation/summarized history into DOM-ready message bubbles               |
| `showChoice({title,msg,primaryLabel,secondaryLabel})` | Two-button modal for choosing history view vs chat injection                      |
| `loadConversation(b, mode?)`                     | Prompts for view/inject, swaps existing history DOM, and optionally sends transcript    |
| `setupAutoSave()`                                | Attaches a live MutationObserver to the chat DOM and auto-saves the current conversation snapshot as new messages appear |
| `openHiDropdown(b, menuBtn)`                     | Opens pin/delete dropdown next to history item                                         |
| `closeHiDropdown()`                              | Closes the dropdown and removes outside-click listener                                 |
| `extractSnippet(text, q, fromIndex)`             | Returns a 50-char context snippet with match boundaries for content search             |
| `renderHistoryList()`                            | Renders history tab: title search or content search, with pinned section + date groups |
| `render()`                                       | Full re-render (GM card + context list + history list)                                 |
| `renderList({listId,searchId,isMatch,emptyMsg})` | Renders a filtered+sorted block list with checkboxes                                   |

### Edit form

| Function                | Description                                 |
| ----------------------- | ------------------------------------------- |
| `openEdit(id, prefill)` | Opens edit form; id=null for new block      |
| `closeEdit()`           | Exits edit mode, clears form                |
| `saveEdit()`            | Validates and saves form to blocks          |
| `deleteEdit()`          | Confirms and deletes the block being edited |

### Footer actions

| Function                   | Description                                                                                                                                                                                                                        |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `updateInjectBtn()`        | Updates "טען נבחרים" button state + count pill                                                                                                                                                                                     |
| `injectSelected()`         | Injects all selected blocks with FRAMING, clicks send (GM first when selected)                                                                                                                                                      |
| `findScrollableAncestor()` | Walks up from `MSG_SELECTORS.messageList` to find the real scrollable element (overflow auto/scroll + scrollHeight > clientHeight); falls back to scanning `main` / class-based candidates. Generic — survives Gemini DOM changes. |
| `scrollAndCaptureAll()`    | Uses `findScrollableAncestor()`, then scrolls to top repeatedly until message count stabilizes (defeats virtual scrolling)                                                                                                         |
| `saveChat()`               | If MSG_SELECTORS ready: scrolls to top → captures DOM → updates the current conversation snapshot or creates one. Else: injects SUMMARY_PROMPT (fallback)                                                                                                                |

### Status / toast

| Function                  | Description                                          |
| ------------------------- | ---------------------------------------------------- |
| `setStatus(msg, isError)` | Shows toast (panel mode) or inline label (edit mode) |

### Inline save (requires MSG_SELECTORS)

| Function                | Description                                   |
| ----------------------- | --------------------------------------------- |
| `inlineReady()`         | True when all MSG_SELECTORS fields are filled |
| `decorateMessage(node)` | Adds 💾 button to an AI message node          |
| `startMsgObserver()`    | Starts MutationObserver for new AI messages   |

### Init

| Function           | Description                                                                           |
| ------------------ | ------------------------------------------------------------------------------------- |
| `shouldAutoOpen()` | True if current URL matches AUTO_OPEN_URLS                                            |
| `isActiveSitePage()` | True if current URL matches the active site URL list; gates mount/toggle/init         |
| `init()`           | Entry point — loads blocks, starts inline save + auto-save observers, runs tryAutoInject (always), opens panel if AUTO_OPEN_URL |

## summarizer.js

Runs independently. Waits for `window.__ccb` (exposed by content.js at bottom), then
uses MutationObserver to watch the DOM for `[[CCB:SAVE]]`. On trigger:

1. Finds the smallest DOM element containing the trigger (message bubble)
2. Strips `[[CCB:SAVE]]` and `[[CCB:TITLE:...]]` markers
3. Saves a `conversation` block via `window.__ccb.saveBlocks()`

## Storage shape

All data lives under `chrome.storage.local["blocks"]` as a flat object:

```js
{
  "b_<timestamp>_<rand>": {
    id, title,
    content?: string,                          // old summary blocks (backward compat)
    messages?: [{role:"user"|"ai", text}],     // new full-conversation blocks
    tags?: string[],
    kind?: "conversation" | "general_memory",  // undefined = context block
    updated: number,
    pinned?: boolean,
    autoLoad?: boolean                         // only on GM_ID block
  }
}
```

Special block: `GM_ID = "__general_memory"` — kind `"general_memory"`, has `autoLoad`.
History list: blocks with `kind === "conversation"` (saved by summarizer.js).
Context list: blocks without `kind` (and not GM_ID).
