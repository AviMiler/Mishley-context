# Architecture — Chat Context Bank (v2)

## Files

| File            | Purpose                                                                   | Lines |
| --------------- | ------------------------------------------------------------------------- | ----- |
| `config.js`     | All user-configurable constants — edit this to adapt to any chat site     | ~70   |
| `prompts.js`    | Loads prompt overrides (editable parts only) and patches `__ccbRawConfig` | ~80   |
| `content.js`    | Full sidebar UI + logic (Shadow DOM, storage, inject, render)             | ~1500 |
| `summarizer.js` | Watches DOM for `[[CCB:SAVE]]` trigger, auto-saves summaries              | ~115  |
| `manifest.json` | MV3 manifest — load order: config → prompts → … → content → summarizer    | —     |

`prompts.js` keeps technical markers locked:

- FRAMING locked prefix: `[[CCB:INJECTED]]\n`
- SUMMARY_PROMPT locked suffix: the last 2 lines (template for `[[CCB:TITLE:...]]` and `[[CCB:SAVE]]`)

It exposes `window.__ccbPromptsAPI`:

- `ready` (Promise) — resolves after loading overrides from storage
- `getEditable()` → `{ manualIntro, manualOutro, gmIntro, gmOutro, convIntro, convOutro, projIntro, projOutro, summaryBody }`
- `save({ manualIntro, manualOutro, gmIntro, gmOutro, convIntro, convOutro, projIntro, projOutro, summaryBody? })` — persists overrides + updates `window.__ccbRawConfig`
- `reset("framingAll"|"framingManual"|"framingGm"|"framingConv"|"framingProj"|"summary")` — clears override(s) and restores default

Runtime config keys patched by `prompts.js`:

- `FRAMING_MANUAL` — used when injecting selected context blocks
- `FRAMING_GM` — used when auto-injecting General Memory at chat start
- `FRAMING_CONV` — wrapper for conversation transcript injection
- `FRAMING_PROJ` — wrapper for project instructions injection

Note: The prompts UI currently exposes only the FRAMING editors; SUMMARY_PROMPT editing is intentionally hidden for now.

## config.js — site switching

```js
const ACTIVE_SITE = "gemini"; // ← שנה ל-"internal" לצ'אט הפנימי
```

`_GEMINI_SELECTORS` ו-`_INTERNAL_CHAT_SELECTORS` מוגדרים בנפרד — רק `ACTIVE_SITE` קובע איזה פעיל.
הסקריפטים עצמם רצים רק בדפים שתואמים ל-`AUTO_OPEN_URLS` של האתר הפעיל.

## config.js exports (`window.__ccbRawConfig`)

| Key                    | Type         | Description                                              |
| ---------------------- | ------------ | -------------------------------------------------------- |
| `AUTO_OPEN_URLS`       | string[]     | URLs where sidebar auto-opens                            |
| `CHAT_INPUT_SELECTOR`  | string       | CSS selector for chat textarea                           |
| `SEND_BUTTON_SELECTOR` | string       | CSS selector for send button                             |
| `PUSH_SELECTOR`        | string\|null | Root element to push right when sidebar opens            |
| `PUSH_FIXED_SELECTORS` | string[]     | Fixed-position elements to push separately               |
| `SIDEBAR_WIDTH`        | number       | Sidebar width in px (default 300)                        |
| `MSG_SELECTORS`        | object       | Selectors for inline-save feature (fill in per site)     |
| `INPUT_FALLBACKS`      | string[]     | Fallback selectors when CHAT_INPUT_SELECTOR fails        |
| `STORAGE_KEY`          | string       | chrome.storage key (`"blocks"`)                          |
| `GM_ID`                | string       | ID of general memory block (`"__general_memory"`)        |
| `CTX_WINDOW_DEFAULT`   | number       | Default context window in tokens (128000)                |
| `CHARS_PER_TOKEN`      | number       | Approximate chars/token ratio for meter estimation       |
| `SUMMARY_PROMPT`       | string       | Prompt sent to AI when user clicks "סכם שיחה"            |
| `FRAMING`              | string       | Preamble injected before manual/GM context handoff       |
| `FRAMING_MANUAL_PRE`   | string       | Opens context wrapper for manual block injection (`[[CCB:INJECTED]]` + intro + `<context>`) |
| `FRAMING_MANUAL_POST`  | string       | Closes context wrapper (`</context>` + final instruction) |
| `FRAMING_GM_PRE`       | string       | Opens memory wrapper for GM injection (`[[CCB:INJECTED]]` + intro + `<memory>`) |
| `FRAMING_GM_POST`      | string       | Closes memory wrapper (`</memory>` + final instruction) |
| `FRAMING_CONV_PRE`     | string       | Opens conversation wrapper for conversation injection (`[[CCB:INJECTED]]` + intro + `<conversation>`) |
| `FRAMING_CONV_POST`    | string       | Closes conversation wrapper (`</conversation>` + final instruction) |
| `FRAMING_PROJ_PRE`     | string       | Opens project wrapper for project instructions (`[[CCB:INJECTED]]` + intro + `<project>`) |
| `FRAMING_PROJ_POST`    | string       | Closes project wrapper (`</project>` + final instruction) |

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
| `loadCtxWindow()` / `setCtxWindow(k)`          | Load and persist the context-window size used by the meter             |
| `watchFileInputs()`                            | Tracks attached files from page file inputs and estimates token cost   |
| `exportBackup()`                               | Downloads `context-bank-backup.json` with the full blocks object       |
| `importBackupFile(file)`                       | Validates and restores blocks from a JSON backup file                  |
| `hasUnsavedChanges()`                          | Checks if edit form differs from saved block                           |
| `wireEvents()`                                 | Binds all button/tab/search event listeners                            |

### Panel state

| Function             | Description                                    |
| -------------------- | ---------------------------------------------- |
| `setPanelOpen(open)` | Opens or closes sidebar, loads blocks, renders |
| `togglePanel()`      | Flips panel open/closed                        |

`currentProjectId` tracks the active project detail view inside the history tab.
`projectsCollapsed`, `historyCollapsed`, and `projectInstructionsOpen` track the section toggles in the history/project UI.
`ccb-ctx-meter` is rendered inside `#pane-context`, so the context-window meter appears only in the Context tab.
The meter combines live DOM message tokens with tracked uploaded-file tokens.
Both tabs now scroll at the pane level (`#pane-context`, `#pane-history`), so search/toolbars + content scroll together.

### General Memory

| Function                | Description                                                                         |
| ----------------------- | ----------------------------------------------------------------------------------- |
| `getGM()`               | Returns GM block from `blocks` (with defaults)                                      |
| `renderGeneralMemory()` | Renders the GM card in the context tab and lets it be selected for manual injection |
| `tryAutoInject()`       | Polls for input readiness, injects GM at _conversation start only_ + clicks send    |

### Render

| Function                                                         | Description                                                                                                                                         |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `dateGroup(ts)`                                                  | Returns Hebrew date bucket: היום/אתמול/השבוע/החודש/קודם                                                                                             |
| `captureConversation()`                                          | Reads all messages from DOM via MSG_SELECTORS → `[{role,text}]`                                                                                     |
| `getProjects()` / `getProjectById(id)`                           | Returns project blocks or a single project block                                                                                                    |
| `formatTranscript(messages)`                                     | Formats message array as "User: … / Assistant: …" text                                                                                              |
| `buildConversationInjectionText(messages, block, opts)`          | Builds two context blocks: (1) conversation with FRAMING_CONV_PRE/POST wrapper, (2) project instructions with FRAMING_PROJ_PRE/POST wrapper (if enabled) |
| `injectHistoryBubbles(messages)`                                 | Prepends styled chat bubbles into the page's messageList container, preserving line breaks                                                          |
| `buildHistoryMessages(b)`                                        | Normalizes conversation/summarized history into DOM-ready message bubbles                                                                           |
| `showChoice({title,msg,primaryLabel,secondaryLabel})`            | Two-button modal for choosing history view vs chat injection                                                                                        |
| `showProjectPicker()`                                            | Modal picker for assigning a conversation to a project                                                                                              |
| `loadConversation(b, mode?)`                                     | Prompts for view/inject, swaps existing history DOM, and injects project context for project chats                                                  |
| `openProjectView(projectId)` / `closeProjectView()`              | Switches the history tab into project-management mode                                                                                               |
| `renderProjectList()` / `renderProjectView()`                    | Renders the project cards and the active project detail screen with GM-style instructions editing and dots menu; long names are truncated in the UI |
| `estimateTokens()` / `updateCtxMeter()` / `watchConversation()`  | Estimates live DOM token usage and keeps the meter updated                                                                                          |
| `syncUploadedFiles()` / `watchFileInputs()`                      | Tracks file input selections and folds their tokens into the meter                                                                                  |
| `syncCollapsibleSections()` / `syncProjectInstructionsSection()` | Keeps the history/project section toggles in sync with state                                                                                        |
| `openHiDropdown(b, menuBtn)`                                     | Opens pin/delete dropdown next to history item                                                                                                      |
| `openProjectDropdown(project, menuBtn)`                          | Opens rename/delete dropdown for a project                                                                                                          |
| `closeHiDropdown()`                                              | Closes the dropdown and removes outside-click listener                                                                                              |
| `extractSnippet(text, q, fromIndex)`                             | Returns a 50-char context snippet with match boundaries for content search                                                                          |
| `renderHistoryList()`                                            | Renders history tab: title search or content search, with project tags + date groups; long project tags truncate instead of expanding the row       |
| `render()`                                                       | Full re-render (GM card + context list + project list + history list + project view)                                                                |
| `renderList({listId,searchId,isMatch,emptyMsg})`                 | Renders a filtered+sorted block list with checkboxes                                                                                                |

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
| `injectSelected()`         | Injects selected blocks with FRAMING_MANUAL (or FRAMING_GM when only GM is selected), clicks send                                                                                                                                  |
| `findScrollableAncestor()` | Walks up from `MSG_SELECTORS.messageList` to find the real scrollable element (overflow auto/scroll + scrollHeight > clientHeight); falls back to scanning `main` / class-based candidates. Generic — survives Gemini DOM changes. |
| `scrollAndCaptureAll()`    | Uses `findScrollableAncestor()`, then scrolls to top repeatedly until message count stabilizes (defeats virtual scrolling)                                                                                                         |
| `saveChat()`               | If MSG_SELECTORS ready: scrolls to top → captures DOM → appends new messages to the current conversation or creates one. Else: injects SUMMARY_PROMPT (fallback)                                                                   |
| `saveProjectView()`        | Persists the active project instructions field                                                                                                                                                                                     |

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

| Function             | Description                                                                                               |
| -------------------- | --------------------------------------------------------------------------------------------------------- |
| `shouldAutoOpen()`   | True if current URL matches AUTO_OPEN_URLS                                                                |
| `isActiveSitePage()` | True if current URL matches the active site URL list; gates mount/toggle/init                             |
| `init()`             | Entry point — loads blocks, starts inline save, runs tryAutoInject (always), opens panel if AUTO_OPEN_URL |

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
    content?: string,                          // old summary blocks / project instructions
    messages?: [{role:"user"|"ai", text}],     // new full-conversation blocks
    tags?: string[],
    kind?: "conversation" | "general_memory" | "project",
    projectId?: string | null,                 // only on conversation blocks
    updated: number,
    pinned?: boolean,
    autoLoad?: boolean                         // only on GM_ID block
  }
}
```

Special block: `GM_ID = "__general_memory"` — kind `"general_memory"`, has `autoLoad`.
History list: blocks with `kind === "conversation"` (saved by summarizer.js).
Project list: blocks with `kind === "project"`.
Context list: blocks without `kind` (and not GM_ID / project / conversation).
