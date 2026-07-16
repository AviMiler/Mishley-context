# Architecture — Chat Context Bank (v2)

## Files

| File              | Purpose                                                                       | Lines |
| ----------------- | ----------------------------------------------------------------------------- | ----- |
| `config.js`       | Site selectors + active site toggle + FRAMING defaults                        | ~180  |
| `prompts.js`      | Loads prompt overrides (editable parts only) and patches `__ccbRawConfig`     | ~265  |
| `storage.js`      | `loadBlocks` / `saveBlocks` → `window.__ccbStorage`                           | ~20   |
| `inject.js`       | Input detection + text injection → `window.__ccbInject`                       | ~80   |
| `push.js`         | Page shift CSS when sidebar opens → `window.__ccbPush`                        | ~40   |
| `ui-styles.js`    | Shadow DOM CSS → `window.__ccbCSS`                                            | ~1750 |
| `ui-template.js`  | SVG icons + PANEL_HTML → `window.__ccbTpl`                                    | ~390  |
| `ctx-meter.js`    | Context window usage meter → `window.__ccbCtxMeter`                           | ~400  |
| `ui-modals.js`    | Dialogs + settings popover + prompts editor → `window.__ccbModals`            | ~355  |
| `fs-handles.js`   | IndexedDB storage for `FileSystemDirectoryHandle` objects → `window.__ccbFsHandles` | ~80   |
| `document-handler.js` | Document management for projects (files/URLs/text + code-project scanning) → `window.__ccbDocHandler` | ~800  |
| `dep-graph.js`    | Static (no-AI) import/reference graph for scanned code projects → `window.__ccbDepGraph` | ~415  |
| `code-tree.js`    | Inline file-tree picker for code-project documents (rendered into the project view) → `window.__ccbCodeTree` | ~330  |
| `history-view.js` | Projects + history list + conversation preview + document UI + code-project UI → `window.__ccbHistoryView` | ~1720 |
| `chat-features.js`| GM + capture + manual injection + inline save → `window.__ccbChat`            | ~465  |
| `content.js`      | Orchestrator: state, mount, wireEvents, edit form, context list, backup, init | ~1050 |
| `summarizer.js`   | Watches DOM for `[[CCB:SAVE]]` trigger, auto-saves                            | ~130  |
| `manifest.json`   | MV3 manifest — load order below                                                | —     |
| `popup.html`      | Toolbar popup — sends `togglePanel` to the active tab                          | —     |
| `popup.js`        | Popup script (calls chrome.tabs.sendMessage and closes)                        | ~15   |

**Manifest load order:** `config.js` → `prompts.js` → `storage.js` → `inject.js` → `push.js` → `ui-styles.js` → `ui-template.js` → `ctx-meter.js` → `ui-modals.js` → `fs-handles.js` → `document-handler.js` → `dep-graph.js` → `code-tree.js` → `history-view.js` → `chat-features.js` → `content.js` → `summarizer.js`

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
| `__ccbFsHandles`     | `fs-handles.js`    | `put(id, dirHandle)`, `get(id)`, `remove(id)`, `verifyPermission(dirHandle, mode?)`                            |
| `__ccbDocHandler`    | `document-handler.js` | `init`, `addDocument`, `removeDocument`, `toggleDocument`, `getDocumentContent`, `getOrExtractContent`, `getEnabledDocuments`, `injectFilesToChat`, `estimateTokens`, `estimateFileTokens`, `getFileType`, `isLikelyTextFile`, `scanCodeProject`, `buildStructureMarkdown`, `syncCodeProjectDocuments`, `removeCodeContent` |
| `__ccbDepGraph`      | `dep-graph.js`     | `buildGraph(included)`, `getTransitiveClosure(graph, path)`, `getDirectDependents(graph, path)`, `getFullContext(graph, path)` |
| `__ccbCodeTree`      | `code-tree.js`     | `init`, `renderInline(project, mount)`                                                                         |
| `__ccbHistoryView`   | `history-view.js`  | `init`, `render*`, `open*/close*`, `get*`, `build*`, `sync*`, `addProject`, `saveProjectView`, `renderProjectSelect`, `renderProjectViewDocuments`, `openProjectView`, `closeProjectView`, `openAddDocumentDialog`, `createCodeProjectBookmark`, `rescanCodeProject`, `loadCodeProjectAll`, `enableFilesForProject`, `setAllCodeDocsEnabled`, `injectProjectDocuments` |
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

**Save eligibility:** `persistConversation` skips any capture that has no `role === "user"` message after `[[CCB:INJECTED]]` filtering, and trims any leading AI messages (which are auto-responses to injections like "Context loaded." that captureConversation can't detect). This prevents injection-only chats from creating noise blocks.

**Injection auto-response filtering:** The framing prompts ask the model to reply with a fixed string after each injection ("Context loaded.", "Transcript loaded.", "Project guidelines loaded."). These responses are not part of the real conversation. They are filtered out:
- At capture time — `captureConversation` in `chat-features.js` drops any AI message whose trimmed text matches one of the canned responses.
- At read time — `buildHistoryMessages` in `history-view.js` filters the same set so older saved blocks (created before the capture-time filter) don't show pollution in the conversation view or re-inject it on continue.
- At continuation binding — `state.continuationBase` is populated via `buildHistoryMessages(b)` (filtered), so the snapshot used by `persistConversation` to prepend historical messages is clean. The next auto-save then overwrites the saved block with the filtered version, cleaning it permanently.

One conversation block per page load. The first message in a fresh chat creates a `kind: "conversation"` block with a default title (`שיחה — date time`) and stores its id in `state.currentConversationId`. Every subsequent message triggers an auto-save (debounced 2.5s) that **updates the same block** in place — no new block is created. The binding is cleared in two ways:

- **Page refresh** — content scripts reload, `state.currentConversationId` is null again, next message creates a new block.
- **SPA navigation** (URL change) — the `ccb:urlchange` handler in `content.js` explicitly clears `state.currentConversationId`.

The user renames a conversation later from the per-row dropdown in the History list. The conversation preview offers two distinct actions:

- **`cvLoadBtn` ("טען נבחרים")** — injects the selected messages into the current chat as context (`injectIntoInput(text, "replace")`). The current chat stays bound to its own conversation; the loaded messages are just reference material.
- **`cvContinueBtn` ("המשך שיחה")** — actually resumes the saved conversation. The flow is **save-then-reload-then-resume**:
  1. **Flush current chat** — `window.__ccbChat.flushAutoSave()` cancels any pending throttled save and runs one synchronously. If the captured messages include at least one `role === "user"` message (i.e. a real, non-injection turn), it's persisted to the bound block; otherwise nothing is written.
  2. **Record intent in `sessionStorage`** — `{ blockId, includeProject }` under key `ccb_pendingContinue`. This survives the reload.
  3. **`location.assign(CONFIG_PUBLIC.AUTO_OPEN_URLS[0])`** — navigates to the site's base URL (not just reload), so the host SPA routes us to a *fresh* chat. A plain `location.reload()` would keep us on the previously open chat URL (e.g. `/app/chat/abc`), and injecting the resumed transcript there would mix it with that chat's existing turns. The base URL is same-origin, so `sessionStorage` survives the navigation.
  4. **After reload, `processPendingContinue()` in `content.js#init`** reads the intent, polls until the chat input + send button are mounted, then builds a **single combined payload** — `framing.gmPre + gm.content + framing.gmPost + "\n\n"` (if `gm.autoLoad`) concatenated with the transcript injection text — and injects it with `mode: "replace"` in **one** call. Two sequential `injectIntoInput` calls (`prepend` GM + `append` transcript) were unreliable on Gemini's input; the second could overwrite the first. After injection it **binds `state.currentConversationId = b.id`**, **snapshots the historical messages into `state.continuationBase`**, sets `state.gmAutoInjected = true` to suppress duplicate GM injection, sets **`state.suppressNextUrlReset = true`** (one-shot, with an 8 s failsafe), and finally clicks send. The `suppressNextUrlReset` flag tells the `ccb:urlchange` handler to skip its normal reset on the very next URL change — Gemini routes from `/app` to `/app/chat/<id>` right after the send, and without this guard the binding/base would be wiped before the first auto-save could run.
  
  The `continuationBase` snapshot is critical: `persistConversation` prepends it in front of every DOM-captured message list, otherwise the live DOM after continuation only contains the new turn (the injected transcript is filtered out by the `[[CCB:INJECTED]]` marker) and the saved block's history would be overwritten on the first auto-save. Both `currentConversationId` and `continuationBase` clear on refresh/SPA URL change.

The manual save button still exists in the History tab; it scrolls the chat to the top first (to capture lazy-loaded older messages) before persisting through the same path. `summarizer.js` is a separate feature: when the AI emits `[[CCB:SAVE]]` it writes a standalone summary block (`tags: ["summary"]`), independent of the auto-saved conversation.

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
| `SIDEBAR_WIDTH`        | number       | Sidebar width in px (380; `push.js` + full-page overlays derive from it)                    |
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
| `render()`                      | Full re-render — calls `chat.renderGeneralMemory`, `renderContextList`, `renderProjectBlocksList`, `syncInjectDocsBtn`, `historyView.render`, ctx-meter update |
| `syncInjectDocsBtn()`           | Shows/hides the footer `#injectDocsBtn` based on whether the currently open project (`state.currentProjectId`) has any documents — the single global entry point for `historyView.injectProjectDocuments()`, covering both the code-project file tree and the flat regular-project document list |
| `syncCtxSubview()`              | Context tab: toggles the "טקסטים כלליים" / "פרויקטים" sub-views + active button state (`state.ctxSubview`) |
| `migrateCtxProjects()`          | Idempotent one-time migration of retired `kind:"ctx-project"` blocks → `kind:"project"` (runs inside `loadBlocks`) |
| `installUrlChangeWatcher()`     | Patches `history.pushState/replaceState`, fires `ccb:urlchange` to reset GM auto-inject |

### Context list + edit form (kept inline in content.js)

| Function                        | Description                                                       |
| ------------------------------- | ----------------------------------------------------------------- |
| `renderContextList()`           | Renders the "טקסטים כלליים" sub-view block list (general blocks, not GM/project-owned) |
| `renderProjectBlocksList()`     | Renders the open project's own text blocks inside its detail view (`#projectBlocksList`) |
| `updateInjectBtn()`             | Updates "טען נבחרים" button state + count pill                    |
| `hasUnsavedChanges()`           | Checks if the edit form differs from the saved block              |
| `openEdit(id, prefill)`         | Opens edit form; id=null for new block. Also resolves the block's project (existing `projectId`, or `state.pendingCtxProjectId` when adding via a project's "+ הוסף בלוק") and shows/hides the `#editProjectTag` pill (folder icon + project title) — the full-panel edit form otherwise hides all project context |
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
| `getProjects()`                           | Regular (non-code) project blocks, sorted by `updated` desc |
| `getAllProjects()`                        | Unified list — regular + code projects together (used by `renderProjectSelect`) |
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
| `render()`                                              | History-side of full render: collapsibles → project selector → history list → project view  |
| `renderProjectSelect()`                                 | Populates the `<select id="projectSelect">` with all projects (regular + code, code prefixed with 📁) in the Context tab's "פרויקטים" sub-view |
| `renderProjectView()` / `renderProjectViewConversations(project)` | Renders the active project detail screen (code projects render the inline file tree via `__ccbCodeTree.renderInline` inside `#projectDocumentsList`) |
| `syncCtxProjectsLayout()`                               | Keeps the selector (`#ctxProjectListWrap`) visible and shows/hides the open project's detail (`#projectView`) beneath it, inside the Context "פרויקטים" sub-view |
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

### Project documents (regular projects)

| Function                                  | Description                                                                   |
| ------------------------------------------ | ------------------------------------------------------------------------------ |
| `wireProjectViewDocumentEvents()`          | Binds the add-document / drag-drop handlers once per project-view mount        |
| `renderProjectViewDocuments(project)`      | Renders the document list (icon, name, token estimate, enable checkbox, remove) |
| `getDocumentIcon(type)`                    | Icon lookup by `doc.type` (`text`/`pdf`/`image`/`word`/...)                     |
| `openAddDocumentDialog()`                  | Opens the file-picker / paste-text dialog and calls `docHandler.addDocument`   |
| `injectProjectDocuments()`                 | Builds combined project text (instructions + enabled doc contents) and injects it; also calls `docHandler.injectFilesToChat` for enabled blob docs |

### Code projects (folder-backed, `isCodeProject: true`)

| Function                                            | Description                                                                                   |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `getCodeProjects()`                                 | Project blocks with `isCodeProject: true`                                                       |
| `renderCodeProjectList()`                           | Renders the code-project cards (name + "last scanned" age)                                      |
| `createCodeProjectBookmark()`                       | Opens `showDirectoryPicker()`, stores the handle via `__ccbFsHandles`, creates the project block, runs the first `scanCodeProject` + `buildGraph` + `syncCodeProjectDocuments` |
| `rescanCodeProject(projectId)`                      | Re-verifies (or re-requests) folder permission, then rescans + rebuilds `depGraph` + re-syncs documents |
| `loadCodeProjectAll(projectId)`                     | Ensures a scan exists, enables every document, injects them all                                 |
| `enableFilesForProject(projectId, relativePaths)`   | Bulk-enables a set of code docs by path in one `saveBlocks()` call (not one call per file — see perf note in source) |
| `setAllCodeDocsEnabled(projectId, enabled)`         | Bulk select-all / clear-all for code docs                                                       |
| `openCodeProjectDropdown(project, menuBtn)`         | Load all / pick files / refresh / remove dropdown                                               |

## document-handler.js — function index

| Function                                                     | Description                                                                                  |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `init(deps)`                                                  | Wires up `{ loadBlocks, saveBlocks, getBlocks }`                                                |
| `addDocument(file, projectId, contentOverride?)`              | Reads/extracts text (or uses `contentOverride` for pasted text), estimates tokens, stores the blob in `chrome.storage.local` (key `docBlob_<id>`), pushes a doc onto `project.documents` |
| `removeDocument(projectId, docId)`                            | Removes the doc entry + its stored blob                                                        |
| `toggleDocument(projectId, docId, enabled)`                   | Flips `doc.enabled`                                                                             |
| `getDocumentContent(projectId, docId)`                        | Returns `doc.content` if already extracted/stored                                              |
| `getOrExtractContent(projectId, docId)`                       | Lazily extracts + caches text for blob-only docs; reads code-project file text from its own storage key (never inline on the doc) |
| `getEnabledDocuments(projectId)`                              | Enabled docs for a project                                                                       |
| `injectFilesToChat(projectId)`                                | Loads enabled blob docs from storage and sets them on the page's `<input type="file">` (or queues them via `ctx-meter` if the input isn't mounted yet) |
| `estimateTokens` / `estimateFileTokens`                       | Char-count and file-type-based token estimation (extends the `ctx-meter.js` heuristics)          |
| `getFileType(file)` / `isLikelyTextFile(file)`                | File-type classification used by estimation + extraction                                        |
| `extractOfficeText` (docx/odt/rtf)                            | Extracts plain text from Office formats — DOCX/ODT via manual ZIP central-directory read + `DecompressionStream('deflate-raw')`, RTF via control-word stripping. Legacy binary `.doc` is not supported |
| `scanCodeProject(dirHandle)`                                  | Recursively walks a directory handle, skipping `DENY_DIRS`/`DENY_FILENAMES`/non-code extensions/oversized files (>200 KB), reading matching files immediately (no lazy loading) |
| `buildStructureMarkdown(included, rootName)`                  | Renders the scanned file list as a markdown folder tree                                         |
| `syncCodeProjectDocuments(project, included, rootName)`       | Upserts the structure doc + one doc per scanned file into `project.documents`, preserving `enabled` on files that already existed; file text is written to its own `codeContent_<id>` storage key, never inlined on the doc, so `saveBlocks()` stays cheap regardless of project size |
| `removeCodeContent(docId)`                                    | Deletes a code file's stored content (used when a bookmark/file is removed)                     |

Requires the `unlimitedStorage` permission (manifest.json) since file blobs and per-file code content are stored as `chrome.storage.local` entries, which can add up past the default quota for large projects.

## dep-graph.js — static dependency graph

Builds a best-effort, deterministic import/reference graph for a scanned code project — no AI involved. Used by `code-tree.js`'s "load with dependencies" menu.

- **JS/TS/JSX**: resolves `import`/`export …from`/`require`/dynamic `import()` to files. Handles relative paths, `@/`/`~/` alias imports (tried against `src/` then project root), and is case-insensitive as a fallback.
- **C#**: builds a namespace/class symbol table, then does a best-effort text scan for referenced type names, preferring matches in the file's own namespace or `using`s.
- Both use a shared comment/string scanner (`scanRegions`) so regex passes aren't confused by code-like text inside strings/comments. Neither resolver is 100% — dynamic dispatch (computed member access, reflection, `eval`, virtual/interface calls) can't be resolved statically.

`buildGraph(included)` is called right after `scanCodeProject` while file content is still in memory. `getTransitiveClosure` (BFS, cycle-safe) gives "dependencies"; `getDirectDependents` (one hop, not transitive) gives "dependents"; `getFullContext` combines both.

## code-tree.js — inline file-tree picker

`renderInline(project, mount)` renders an interactive checkbox tree (folders + files) over a code project's scanned documents **inline** into the open project's documents section (`#projectDocumentsList`, mounted by `history-view.js#renderProjectViewDocuments` when `project.isCodeProject`) — not a separate modal. It builds its own shell (path search + "בחר הכל"/"נקה הכל" + token count) plus the tree body. Each file row has a "deps" button opening a small menu (`תלויות`/`תלויים`/`הקשר מלא`) that calls into `dep-graph.js` via `history-view.js#enableFilesForProject` to bulk-enable the resulting closure. Reuses the shared `#hiDropdown` host element for that menu (via `deps.getShadow()`) but manages its own outside-click cleanup. Per-view state (`_query`, `_collapsedPaths`) survives same-project re-renders and resets when switching projects. Only `type: "code"` docs appear in the tree; the `type: "structure"` doc is injected but not shown (parity with the former modal).

## fs-handles.js — directory handle storage

`chrome.storage.local` is JSON-only and can't hold a `FileSystemDirectoryHandle`. IndexedDB supports structured clone, so bookmarked code-project folder handles are stored there instead (`ccbFsHandles` DB, `handles` store, keyed by the project's `id`). `verifyPermission(dirHandle, mode)` re-checks (and if needed re-requests) read/readwrite permission — must be called from a user-gesture handler since `requestPermission()` requires one.

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
    kind?: "conversation" | "general_memory" | "project",  // "ctx-project" retired (migrated to "project")
    projectId?: string | null,                 // only on conversation / project-owned text blocks
    updated: number,
    pinned?: boolean,
    autoLoad?: boolean,                        // only on GM_ID block

    // kind: "project" only
    documents?: Document[],                    // see Document shape below
    isCodeProject?: boolean,                   // true for folder-backed projects
    dirHandleId?: string,                      // key into __ccbFsHandles (IndexedDB), == block id
    lastScanned?: number | null,               // timestamp of last scanCodeProject run
    depGraph?: { [relativePath: string]: string[] }, // built by dep-graph.js#buildGraph
  }
}
```

**Document shape** (`project.documents[]`):

```js
{
  id, name, type,             // type: "text"|"pdf"|"image"|"word"|"spreadsheet"|"presentation"|
                               //       "audio"|"video"|"file"|"code"|"structure"
  size, added, enabled,
  preview,                     // first ~200 chars, newlines stripped
  estimatedTokens,
  content?: string | null,     // inline text (regular docs); null for code/blob-only docs
  hasBlob?: boolean,           // true if a blob is stored in chrome.storage.local (docBlob_<id>)
}
```

Code-project file text is **not** stored on the doc — it lives in its own `chrome.storage.local` key (`codeContent_<id>`), fetched on demand via `docHandler.getOrExtractContent`, so scanning a large project doesn't bloat every `saveBlocks()` call.

Special block: `GM_ID = "__general_memory"` — kind `"general_memory"`, has `autoLoad`.
- History tab: blocks with `kind === "conversation"` (may carry `projectId` = assigned project)
- Context tab, "פרויקטים" sub-view: the unified project list is blocks with `kind === "project"` (code projects have `isCodeProject: true`)
- Context tab, "טקסטים כלליים" sub-view: blocks without `kind`, without `projectId` (and not GM_ID)
- Project-owned text blocks: a regular context block (no `kind`) may carry `projectId` pointing to a `kind: "project"` block; they render inside that project's detail view (`#projectBlocksList`)

**`kind: "ctx-project"` retired (migration):** older builds had a separate Context-tab "ctx-project" entity (grouping of text blocks, no documents). `content.js#migrateCtxProjects()` runs inside `loadBlocks()` on every load (idempotent): it rewrites each `kind === "ctx-project"` block to `kind === "project"`, adding `documents: []` / `isCodeProject: false` where missing, without changing the `id`, so existing child blocks' `projectId` links keep resolving. The `content?` field on the migrated block (unused by the old ctx-project) simply becomes the project's instructions. After migration there is a single project concept.
