# Architecture — Chat Context Bank (v2)

## Files

| File              | Purpose                                                                       | Lines |
| ----------------- | ----------------------------------------------------------------------------- | ----- |
| `config.js`       | Site selectors + active site toggle + FRAMING defaults                        | ~180  |
| `prompts.js`      | Loads prompt overrides (editable parts only) and patches `__ccbRawConfig`     | ~265  |
| `storage.js`      | `loadBlocks` / `saveBlocks` → `window.__ccbStorage`                           | ~20   |
| `inject.js`       | Input detection + text injection → `window.__ccbInject`                       | ~80   |
| `push.js`         | Page shift CSS when sidebar opens → `window.__ccbPush`                        | ~40   |
| `ui-styles.js`    | Shadow DOM CSS → `window.__ccbCSS`                                            | ~1625 |
| `ui-template.js`  | SVG icons + PANEL_HTML → `window.__ccbTpl`                                    | ~340  |
| `ctx-meter.js`    | Context window usage meter → `window.__ccbCtxMeter`                           | ~400  |
| `ui-modals.js`    | Dialogs + settings popover + prompts editor → `window.__ccbModals`            | ~355  |
| `history-view.js` | Projects + history list + conversation preview → `window.__ccbHistoryView`    | ~970  |
| `chat-features.js`| GM + capture + manual injection + inline save → `window.__ccbChat`            | ~440  |
| `content.js`      | Orchestrator: state, mount, wireEvents, edit form, context list, backup, init | ~960  |
| `summarizer.js`   | Watches DOM for `[[CCB:SAVE]]` trigger, auto-saves                            | ~130  |
| `manifest.json`   | MV3 manifest — load order below                                                | —     |
| `popup.html`      | Toolbar popup — sends `togglePanel` to the active tab                          | —     |
| `popup.js`        | Popup script (calls chrome.tabs.sendMessage and closes)                        | ~15   |

**Manifest load order:** `config.js` → `prompts.js` → `storage.js` → `inject.js` → `push.js` → `ui-styles.js` → `ui-template.js` → `ctx-meter.js` → `ui-modals.js` → `history-view.js` → `chat-features.js` → `content.js` → `summarizer.js`

## Global API surface (`window.__ccb*`)

| Global               | Module             | Members                                                                                                       |
| -------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------- |
| `__ccbRawConfig`     | `config.js`        | Site config + FRAMING strings (patched by prompts.js)                                                         |
| `__ccbPromptsAPI`    | `prompts.js`       | `ready`, `getEditable`, `getLocked`, `save`, `reset`                                                          |
| `__ccbStorage`       | `storage.js`       | `loadBlocks(key)`, `saveBlocks(key, blocks)`                                                                  |
| `__ccbInject`        | `inject.js`        | `findInput()`, `injectIntoInput(text, mode)`                                                                  |
| `__ccbPush`          | `push.js`          | `pushPage(open)`                                                                                              |
| `__ccbCSS`           | `ui-styles.js`     | CSS string                                                                                                    |
| `__ccbTpl`           | `ui-template.js`   | `{ IC, PANEL_HTML }`                                                                                          |
| `__ccbCtxMeter`      | `ctx-meter.js`     | `init`, `update`, `watchConversation`, `watchFileInputs`, `openFilesDropdown`, `cleanup`, `getUploadedFiles`  |
| `__ccbModals`        | `ui-modals.js`     | `init`, `show*`, `openSettings/closeSettings`, `openPromptsEditor/...`                                        |
| `__ccbHistoryView`   | `history-view.js`  | `init`, `render*`, `open*/close*`, `get*`, `build*`, `sync*`, `addProject`, `saveProjectView`                 |
| `__ccbChat`          | `chat-features.js` | `init`, `getGM`, `renderGeneralMemory`, `tryAutoInject`, `injectSelected`, `saveChat`, `start/stopMsgObserver`|
| `__ccb`              | `content.js`       | `{ MSG_SELECTORS, blocks, saveBlocks, loadBlocks, setStatus, renderPanel }` — consumed by summarizer          |

## Module wiring

Each module exposes `init(deps)` (the `ctx-meter.js` pattern). `content.js` builds a shared `deps` object during `mountUI` (after the Shadow DOM is up) and calls each module's `init`:

```
mountUI() {
  // ... create host + shadow DOM ...
  initModules();   // calls __ccbCtxMeter.init, __ccbModals.init,
                   //       __ccbHistoryView.init, __ccbChat.init
  wireEvents();
}
```

Each module's `init` stashes the deps as a private `_deps`. State mutations from a module go to `_deps.state.xxx` — `state` is a single mutable object owned by `content.js` and passed by reference so every module sees the same data.

### Shared state object (owned by `content.js`)

```
state: {
  blocks, blocksLoaded, selected, editingId,
  historySearchMode,
  currentProjectId, projectsCollapsed, historyCollapsed,
  projectInstructionsOpen,
  ctxWindow, ctxWindowLoaded, gmAutoInjected,
  currentConversationViewId, cvSelectedIndices,
  cvMatchElements, cvMatchIndex, cvOpenedFromProject,
  hiDropdownCleanup,
  currentConversationId, // auto-save binding for this page load
}
```

### Conversation model

One conversation block per page load. The first message in a fresh chat creates a `kind: "conversation"` block with a default title (`שיחה — date time`) and stores its id in `state.currentConversationId`. Every subsequent message triggers an auto-save (debounced 2.5s) that **updates the same block** in place — no new block is created. The binding is cleared in two ways:

- **Page refresh** — content scripts reload, `state.currentConversationId` is null again, next message creates a new block.
- **SPA navigation** (URL change) — the `ccb:urlchange` handler in `content.js` explicitly clears `state.currentConversationId`.

The user renames a conversation later from the per-row dropdown in the History list. Loading messages from a stored conversation via the conversation preview only injects text into the input — it does not bind that conversation to the current chat. The manual save button still exists in the History tab; it scrolls the chat to the top first (to capture lazy-loaded older messages) before persisting through the same path. `summarizer.js` is a separate feature: when the AI emits `[[CCB:SAVE]]` it writes a standalone summary block (`tags: ["summary"]`), independent of the auto-saved conversation.

### Shared `framing` object (live getters)

`content.js` exposes a `framing` object whose getters read `window.__ccbRawConfig.FRAMING_*` and `SUMMARY_PROMPT` on every access. After `__ccbPromptsAPI.save(...)` patches the raw config, the next read picks up the new value — no manual refresh is needed.

```
framing: {
  manualPre, manualPost, gmPre, gmPost,
  convPre, convPost, projPre, projPost,
  summaryPrompt,
}
```

## prompts.js

Keeps technical markers locked:

- INJECTED marker (locked prefix): `[[CCB:INJECTED]]\n`
- Opening/closing tags (locked): `<context>…</context>`, `<memory>…</memory>`, `<transcript>…</transcript>`, `<project>…</project>`
- SUMMARY_PROMPT trailing template (locked last 2 lines): the `[[CCB:TITLE:...]]` / `[[CCB:SAVE]]` lines

Editable state shape (`__ccbPromptsAPI.getEditable()`):
```
{ manualIntro, manualOutro, gmIntro, gmOutro, convIntro, convOutro, projIntro, projOutro, summaryBody }
```

Storage key: `chrome.storage.local["ccb_prompts"]`.
Backward-compat: old `framingBodies.{manual,gm}` and old `framingBody` are read on startup.

`reset(key)` accepts:
- `"framingAll"` — resets all 4 framing pairs (manual/gm/conv/proj)
- `"framingManual"`, `"framingGm"`, `"framingConv"`, `"framingProj"` — one section
- `"summary"` — summary body only

Note: the prompts editor UI exposes the 4 FRAMING sections only; SUMMARY_PROMPT editing is intentionally hidden for now.

## Runtime config keys patched by prompts.js

| Key                    | Description                                                          |
| ---------------------- | -------------------------------------------------------------------- |
| `FRAMING_MANUAL_PRE`   | Opens manual context: `[[CCB:INJECTED]]` + intro + `<context>`       |
| `FRAMING_MANUAL_POST`  | Closes manual context: `</context>` + outro                          |
| `FRAMING_GM_PRE`       | Opens GM block: `[[CCB:INJECTED]]` + intro + `<memory>`              |
| `FRAMING_GM_POST`      | Closes GM block: `</memory>` + outro                                 |
| `FRAMING_CONV_PRE`     | Opens conversation: `[[CCB:INJECTED]]` + intro + `<transcript>`      |
| `FRAMING_CONV_POST`    | Closes conversation: `</transcript>` + outro                         |
| `FRAMING_PROJ_PRE`     | Opens project: `[[CCB:INJECTED]]` + intro + `<project>`              |
| `FRAMING_PROJ_POST`    | Closes project: `</project>` + outro                                 |

(Legacy flat keys `FRAMING`, `FRAMING_MANUAL`, `FRAMING_GM` are also patched for backward compatibility but no code reads them directly anymore — the `framing` getters in `content.js` fall back to these only if PRE is undefined.)

## config.js — site switching

```js
const ACTIVE_SITE = "gemini"; // ← change to "internal" for the internal chat
```

`_GEMINI_SELECTORS` and `_INTERNAL_CHAT_SELECTORS` are defined separately — only `ACTIVE_SITE` decides which is active. Scripts gate by `AUTO_OPEN_URLS` so the panel stays inert on other sites.

## config.js exports (`window.__ccbRawConfig`)

| Key                    | Type         | Description                                                                                 |
| ---------------------- | ------------ | ------------------------------------------------------------------------------------------- |
| `AUTO_OPEN_URLS`       | string[]     | URLs where the sidebar auto-opens                                                           |
| `CHAT_INPUT_SELECTOR`  | string       | CSS selector for chat textarea                                                              |
| `SEND_BUTTON_SELECTOR` | string       | CSS selector for the send button                                                            |
| `PUSH_SELECTOR`        | string\|null | Root element to push right when sidebar opens                                               |
| `PUSH_FIXED_SELECTORS` | string[]     | Fixed-position elements to push separately                                                  |
| `SIDEBAR_WIDTH`        | number       | Sidebar width in px (default 300)                                                           |
| `MSG_SELECTORS`        | object       | Selectors for inline-save / capture features (per site)                                     |
| `INPUT_FALLBACKS`      | string[]     | Fallback selectors when `CHAT_INPUT_SELECTOR` fails                                         |
| `STORAGE_KEY`          | string       | chrome.storage key for blocks (`"blocks"`)                                                  |
| `GM_ID`                | string       | ID of General Memory block (`"__general_memory"`)                                           |
| `CTX_WINDOW_DEFAULT`   | number       | Default context window in tokens (128000)                                                   |
| `CHARS_PER_TOKEN`      | number       | Approximate chars/token ratio for meter estimation                                          |
| `SUMMARY_PROMPT`       | string       | Prompt sent to AI for "save chat" fallback                                                  |
| `FRAMING_*_PRE/POST`   | string       | See table above                                                                             |

## Storage keys used

| Key                                | Owner          | Shape                                                  |
| ---------------------------------- | -------------- | ------------------------------------------------------ |
| `chrome.storage.local.blocks`      | content.js     | `{ [id]: block }` — see Storage shape below           |
| `chrome.storage.local.ccb_prompts` | prompts.js     | `{ manualIntro, manualOutro, gmIntro, ... }`           |
| `chrome.storage.local.ctxWindow`   | content.js     | `number` (tokens, used by the meter)                   |

## content.js — function index

### Storage / state

| Function                              | Description                                                  |
| ------------------------------------- | ------------------------------------------------------------ |
| `loadBlocks()` / `saveBlocks()`       | Loads/persists `state.blocks` from `chrome.storage`         |
| `loadCtxWindow()` / `setCtxWindow(k)` | Loads/persists the context-window size (the meter)          |

### Mount + UI lifecycle

| Function                        | Description                                                                  |
| ------------------------------- | ---------------------------------------------------------------------------- |
| `mountUI()`                     | Attaches Shadow DOM host + sidebar HTML (once), calls `initModules`, `wireEvents` |
| `initModules()`                 | Builds deps and calls each module's `init`                                   |
| `moveTabIndicator(tab)`         | Animates the sliding underline to the active tab                             |
| `wireEvents()`                  | Binds all UI event listeners (central switchboard)                           |
| `setPanelOpen(open)`            | Opens/closes sidebar, loads blocks, renders                                  |
| `togglePanel()`                 | Flips panel open/closed                                                      |
| `resetTabDefaults(tabName)`     | Resets per-tab UI defaults when user clicks a tab                            |
| `render()`                      | Full re-render — calls `chat.renderGeneralMemory`, `renderContextList`, `historyView.render`, ctx-meter update |
| `installUrlChangeWatcher()`     | Patches `history.pushState/replaceState`, fires `ccb:urlchange` to reset GM auto-inject |

### Context list + edit form (kept inline in content.js)

| Function                        | Description                                                       |
| ------------------------------- | ----------------------------------------------------------------- |
| `renderContextList()`           | Renders the context-tab block list (manual blocks, not GM)        |
| `updateInjectBtn()`             | Updates "טען נבחרים" button state + count pill                    |
| `hasUnsavedChanges()`           | Checks if the edit form differs from the saved block              |
| `openEdit(id, prefill)`         | Opens edit form; id=null for new block                            |
| `closeEdit()`                   | Exits edit mode, clears form                                      |
| `saveEdit()`                    | Validates and saves form to `state.blocks`                        |
| `deleteEdit()`                  | Confirms (via modals) and deletes the block being edited          |

### Backup

| Function                  | Description                                                                   |
| ------------------------- | ----------------------------------------------------------------------------- |
| `exportBackup()`          | Downloads `context-bank-backup.json` with the full blocks object              |
| `importBackupFile(file)`  | Validates and restores blocks from a JSON backup file (replaces all existing) |

### Toast / status

| Function                  | Description                                                |
| ------------------------- | ---------------------------------------------------------- |
| `setStatus(msg, isError)` | Shows toast (panel mode) or inline label (edit-form mode) |

### Init + routing

| Function                  | Description                                                                                                |
| ------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `shouldAutoOpen()` / `isActiveSitePage()` | True if current URL matches the active site URL list; gates mount/toggle/init               |
| `init()`                  | Entry point — loads ctxWindow, mountUI, starts inline save, watches conversation/files, loads blocks, tryAutoInject, opens panel if `AUTO_OPEN_URL` |

## ui-modals.js — function index

| Function                                       | Description                                                            |
| ---------------------------------------------- | ---------------------------------------------------------------------- |
| `showConfirm({title,msg,confirmLabel,danger})` | In-shadow confirm dialog → `Promise<bool>`                             |
| `showChoice({title,msg,primaryLabel,secondaryLabel})` | Two-button modal → `Promise<"primary"\|"secondary"\|undefined>` |
| `showPrompt({title,defaultValue})`             | Text-input dialog → `Promise<string\|null>`                            |
| `showProjectPicker({title,currentId,allowClear})` | Project assignment picker (uses `_deps.getProjects()`)              |
| `openSettings()` / `closeSettings()`           | Show/hide and position the advanced options popover                    |
| `openPromptsEditor()` / `closePromptsEditor()` | Show/hide the prompts editor overlay                                   |
| `savePromptsEditor()`                          | Persists edits via `__ccbPromptsAPI.save`                              |
| `resetPromptsEditor(key)`                      | Resets a section via `__ccbPromptsAPI.reset` and refreshes textareas   |

## history-view.js — function index

### Date / snippet utilities

| Function                              | Description                                                          |
| ------------------------------------- | -------------------------------------------------------------------- |
| `formatAge(ts)`                       | "לפני X דקות/שעות/ימים" or "עכשיו"                                   |
| `dateGroup(ts)`                       | Returns Hebrew date bucket: היום/אתמול/השבוע/החודש/קודם              |
| `extractSnippet(text, q, fromIndex)`  | Returns a 50-char context snippet with match boundaries              |

### Project lookups

| Function                                  | Description                                              |
| ----------------------------------------- | -------------------------------------------------------- |
| `getProjects()`                           | All project blocks sorted by `updated` desc             |
| `getProjectById(id)`                      | Single project block (null if not found)                |
| `getConversationProject(b)`               | Returns project assigned to a conversation block        |
| `getProjectConversationCount(projectId)`  | Counts conversations in a project                       |

### Transcript / framing builders

| Function                                                | Description                                                                  |
| ------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `formatTranscript(messages)`                            | `User: … / Assistant: …` text                                                |
| `buildHistoryMessages(b)`                               | Normalizes legacy `content` field into `[{role,text}]`                       |
| `buildProjectSectionText(block)`                        | `## project title\n content` block                                           |
| `buildConversationInjectionText(messages, block, opts)` | Wraps transcript with FRAMING_CONV_PRE/POST, optionally project block first |

### Render

| Function                                                | Description                                                                                  |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `render()`                                              | History-side of full render: collapsibles → project list → history list → project view      |
| `renderProjectList()`                                   | Renders project cards                                                                        |
| `renderProjectView()` / `renderProjectViewConversations(project)` | Renders the active project detail screen                                          |
| `updateHistoryLayoutForProjectView()`                   | Toggles toolbar / sections / project-view visibility                                         |
| `renderHistoryList()`                                   | Renders the full history list (title-search or content-search), pinned + grouped            |
| `createHistoryRow(b, opts)`                             | Builds a single conversation row (with optional snippet + project tag)                       |
| `syncCollapsibleSections()` / `syncProjectInstructionsSection()` | Updates the section-collapse chevrons and ARIA state                                 |

### Project actions

| Function                          | Description                                                          |
| --------------------------------- | -------------------------------------------------------------------- |
| `openProjectView(id)` / `closeProjectView()` | Switches history tab in/out of project detail mode        |
| `addProject()`                    | Prompts (via modals) and creates a new project block                |
| `saveProjectView()`               | Persists the active project's instructions                          |
| `openProjectDropdown(project, menuBtn)` | Rename / delete dropdown for a project                        |

### Conversation preview panel

| Function                                  | Description                                                                   |
| ----------------------------------------- | ----------------------------------------------------------------------------- |
| `openConversationView(b, opts)` / `closeConversationView()` | Open/close the per-message preview panel                    |
| `renderConversationMessages(b, query)`    | Renders messages with search highlight + selection state                      |
| `updateNavMatch()` / `updateCvFooter()`   | Nav between matches + selection-count display                                 |
| `escapeRegExp(s)` / `buildHighlightedNodes(text, q)` | Highlight helpers                                                  |

### History-row dropdown

| Function                                 | Description                                                  |
| ---------------------------------------- | ------------------------------------------------------------ |
| `openHiDropdown(b, menuBtn)` / `closeHiDropdown()` | Pin / rename / assign-to-project / delete dropdown |

## chat-features.js — function index

### General Memory

| Function                | Description                                                                                |
| ----------------------- | ------------------------------------------------------------------------------------------ |
| `getGM()`               | Returns the GM block from `state.blocks` (with `title: "זיכרון כללי"` default)            |
| `renderGeneralMemory()` | Renders the GM card in the context tab (select-for-inject checkbox + autoLoad toggle)      |
| `tryAutoInject()`       | Polls for input readiness, injects GM at *conversation start only*, clicks send            |

### Manual injection

| Function              | Description                                                                                              |
| --------------------- | -------------------------------------------------------------------------------------------------------- |
| `injectSelected()`    | Builds the prompt and injects: GM-only uses FRAMING_GM, otherwise FRAMING_MANUAL (with GM first if mixed) |

### Capture + save chat

| Function                                          | Description                                                                                                                              |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `findScrollableAncestor()`                        | Walks up from `MSG_SELECTORS.messageList` to find the real scrollable element. Generic — survives Gemini DOM changes                    |
| `captureConversation()`                           | Reads all messages from DOM via `MSG_SELECTORS` → `[{role,text}]`                                                                        |
| `messageListsEqual(a, b)`                         | Deep equality check on `[{role,text}]` arrays                                                                                            |
| `appendConversationMessages(existing, incoming)`  | Smart merge: handles overlap + full prefix containment                                                                                   |
| `upsertConversationMessages(id, messages)`        | Updates a block's `messages` + `updated` timestamp                                                                                       |
| `scrollAndCaptureAll()`                           | Scrolls to top repeatedly until message count stabilizes (defeats virtual scrolling)                                                     |
| `saveChat()`                                      | Captures + appends to the currently-injected conversation if any, else creates a new one. Falls back to injecting SUMMARY_PROMPT if MSG_SELECTORS isn't ready |

### Inline save (requires MSG_SELECTORS)

| Function                                  | Description                                       |
| ----------------------------------------- | ------------------------------------------------- |
| `inlineReady()`                           | True when all MSG_SELECTORS fields are filled     |
| `decorateMessage(node)`                   | Adds 💾 button to an AI message node              |
| `startMsgObserver()` / `stopMsgObserver()`| Starts/stops MutationObserver for new AI messages |

## ctx-meter.js — function index

| Function                      | Description                                                                  |
| ----------------------------- | ---------------------------------------------------------------------------- |
| `init(deps)`                  | Wires up to content.js (shadow accessor, MSG_SELECTORS, ctxWindow getter, dropdown close/cleanup) |
| `update()`                    | Recalculate + redraw the meter                                              |
| `watchConversation()`         | Start MutationObserver on the chat message list                              |
| `watchFileInputs()`           | Track `<input type="file">` elements globally to estimate uploaded tokens   |
| `openFilesDropdown(anchor)`   | Show per-file token breakdown dropdown (sets `dataset.menuType="files"`)    |
| `renderFilesDropdown(dd)`     | Populate an existing dropdown element                                        |
| `cleanup()`                   | Disconnect observers, clear state                                            |
| `getUploadedFiles()`          | Returns the current tracked file metadata                                    |

## summarizer.js

Runs independently. Waits for `window.__ccb` (exposed by content.js), then uses a MutationObserver to watch the DOM for `[[CCB:SAVE]]`. On trigger:

1. Finds the *smallest* DOM element containing the trigger (message bubble)
2. Strips `[[CCB:SAVE]]` and `[[CCB:TITLE:...]]` markers
3. Saves a `conversation` block via `window.__ccb.saveBlocks()`

Dedupes by content fingerprint (length + first/last 80 chars). Gated to the active site's `AUTO_OPEN_URLS`.

## Storage shape

All data lives under `chrome.storage.local["blocks"]` as a flat object:

```js
{
  "b_<timestamp>_<rand>": {
    id, title,
    content?: string,                          // legacy summary blocks / project instructions
    messages?: [{role:"user"|"ai", text}],     // full-conversation blocks
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
- History tab: blocks with `kind === "conversation"`
- Project list: blocks with `kind === "project"`
- Context tab: blocks without `kind` (and not GM_ID / project / conversation)
