# Architecture — Chat Context Bank (v2)

## Rejected: migrating the UI to `chrome.sidePanel`

**Decision (2026-07-19): rejected. Do not re-propose without new information.**

The UI is an injected Shadow-DOM panel inside the host page, not a real
`chrome.sidePanel`. Moving it was scoped out in full and rejected — the payoff
(native side-panel chrome) did not justify the breakage. Adding
`side_panel.default_path` to `manifest.json` on its own is a **no-op**: it also
needs the `sidePanel` permission, a `background.js` calling
`chrome.sidePanel.setPanelBehavior`, and a `sidepanel.html` that actually hosts
the UI.

The migration is cheaper than it looks in one respect: the host-page DOM surface
is only ~34 call sites across 6 files. `history-view.js` (1712 lines) touches the
page **once**; `code-tree.js`, `ui-modals.js`, `dep-graph.js`, `fs-handles.js`,
`storage.js`, `prompts.js`, `ui-styles.js` and `ui-template.js` touch it **zero**
times — their `document.createElement` calls are context-portable. `push.js`
would simply be deleted (Chrome reflows the page for a real side panel).

What killed it — four consequences, the first being decisive:

1. **All code-project folder bookmarks break.** `fs-handles.js` keeps
   `FileSystemDirectoryHandle` objects in IndexedDB. A content script uses the
   **host page's** origin (`gemini.google.com`); a side panel is a
   `chrome-extension://` origin — a different database. Every bookmarked folder
   would need re-picking. (`chrome.storage.local` is shared across both contexts,
   so blocks, documents, instructions and prompts would survive; only the handles
   are lost.) Keeping `fs-handles.js` page-side instead does not rescue it:
   `showDirectoryPicker()` and `requestPermission()` need a user gesture, which
   would now occur in the panel, not the page.
2. **`MSG_SELECTORS` holds functions.** `messageText`, `aiMessageMatch` and
   `userMessageMatch` (`config.js`) execute against live DOM nodes and cannot
   cross `chrome.runtime` messaging. All capture logic — `captureConversation`,
   `scrollAndCaptureAll`, and both MutationObservers — must run page-side and
   hand the panel a finished `[{role,text}]`.
3. **`File`/`Blob` do not survive messaging.** `docHandler.injectFilesToChat`
   builds `File` objects and sets them on the page's `<input type="file">` via
   `DataTransfer`. Solvable — pass only `docId`s and let the page agent read
   `docBlob_<id>` from `chrome.storage` itself — but it moves the module boundary.
4. **"One conversation per page load" stops working for free.** Today
   `state.currentConversationId` resets because content scripts re-execute on
   refresh. A side panel survives page refreshes *and* tab switches, so that
   reset would have to be rebuilt on an explicit signal from the page agent —
   otherwise consecutive chats merge into one saved block.

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
| `__ccbCtxMeter`      | `ctx-meter.js`     | `init`, `update`, `watchConversation`, `watchFileInputs`, `openFilesDropdown`, `cleanup`, `getUploadedFiles`, `queueFilesForInjection`  |
| `__ccbModals`        | `ui-modals.js`     | `init`, `show*`, `openSettings/closeSettings`, `openScanSettings/closeScanSettings/saveScanSettings/resetScanSettingsToDefaults`, `openPromptsEditor/...` |
| `__ccbFsHandles`     | `fs-handles.js`    | `put(id, dirHandle)`, `get(id)`, `remove(id)`, `verifyPermission(dirHandle, mode?)`                            |
| `__ccbDocHandler`    | `document-handler.js` | `init`, `addDocument`, `removeDocument`, `toggleDocument`, `getDocumentContent`, `getOrExtractContent`, `getCodeContents`, `getEnabledDocuments`, `injectFilesToChat`, `estimateTokens`, `estimateFileTokens`, `getFileType`, `isLikelyTextFile`, `scanCodeProject`, `getDefaultScanSettings`, `buildStructureMarkdown`, `syncCodeProjectDocuments`, `removeCodeContent` |
| `__ccbDepGraph`      | `dep-graph.js`     | `buildGraph(included)` (**async**), `getTransitiveClosure(graph, path)`, `getDirectDependents(graph, path)`, `getFullContext(graph, path)` |
| `__ccbCodeTree`      | `code-tree.js`     | `init`, `renderInline(project, mount)`                                                                         |
| `__ccbHistoryView`   | `history-view.js`  | `init`, `render*` (incl. `renderProjectContext`, `renderProjectInstructionsCard`), `loadActiveProjectId`/`setActiveProjectId`, `open*/close*`/`toggleProjectSelectDropdown`, `get*`, `build*`, `sync*`, `addProject`, `openProjectDropdown`, `renderProjectSelect`, `renderProjectViewDocuments`, `openAddDocumentDialog`, `createCodeProjectBookmark`, `rescanCodeProject`, `enableFilesForProject`, `setAllCodeDocsEnabled`, `injectProjectDocuments`, `openIgnorePatternsDialog` |
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

**Injection auto-response filtering:** The framing prompts ask the model to reply with a fixed string after each injection ("Context loaded.", "Transcript loaded.", "Project guidelines loaded.", "Files loaded."). These responses are not part of the real conversation. They are filtered out:
- At capture time — `captureConversation` in `chat-features.js` drops any AI message whose trimmed text matches one of the canned responses.
- At read time — `buildHistoryMessages` in `history-view.js` filters the same set so older saved blocks (created before the capture-time filter) don't show pollution in the conversation view.

One conversation block per page load. The first message in a fresh chat creates a `kind: "conversation"` block with a default title (`שיחה — date time`) and stores its id in `state.currentConversationId`. Every subsequent message triggers an auto-save (debounced 2.5s) that **updates the same block** in place — no new block is created. The binding is cleared in two ways:

- **Page refresh** — content scripts reload, `state.currentConversationId` is null again, next message creates a new block.
- **SPA navigation** (URL change) — the `ccb:urlchange` handler in `content.js` explicitly clears `state.currentConversationId`.

The user renames a conversation later from the per-row dropdown in the History list. The conversation preview's only action is **`cvLoadBtn` ("טען נבחרים")** — injects the selected messages into the current chat as context (`injectIntoInput(text, "replace")`). The current chat stays bound to its own conversation; the loaded messages are just reference material. **Does not auto-send** — the user reviews/edits/sends manually, same as `injectProjectDocuments()`.

**Removed features (2026-07-19):** "המשך שיחה" (actually resuming a saved conversation in a fresh chat — `cvContinueBtn`, `pendingContinue`, `executeContinue`/`proceedWithContinue`, `state.continuationBase`, `state.suppressNextUrlReset`, `content.js#waitForInput`) and the "כלול הנחיות פרויקט" checkbox (`cvIncludeProject`/`cvProjectBar`, `history-view.js#buildProjectSectionText`, `buildConversationInjectionText`'s `includeProjectInstructions` option) were removed entirely, not just hidden. `buildConversationInjectionText` now takes just `(messages)`.

The manual save button still exists in the History tab; it scrolls the chat to the top first (to capture lazy-loaded older messages) before persisting through the same path. `summarizer.js` is a separate feature: when the AI emits `[[CCB:SAVE]]` it writes a standalone summary block (`tags: ["summary"]`), independent of the auto-saved conversation.

### Shared `framing` object (live getters)

`content.js` exposes a `framing` object whose getters read `window.__ccbRawConfig.FRAMING_*` and `SUMMARY_PROMPT` on every access. After `__ccbPromptsAPI.save(...)` patches the raw config, the next read picks up the new value — no manual refresh is needed.

```
framing: {
  manualPre, manualPost, gmPre, gmPost,
  convPre, convPost, projPre, projPost,
  docsPre, docsPost,
  summaryPrompt,
}
```

## prompts.js

Keeps technical markers locked:

- INJECTED marker (locked prefix): `[[CCB:INJECTED]]\n`
- Opening/closing tags (locked): `<context>…</context>`, `<memory>…</memory>`, `<transcript>…</transcript>`, `<project>…</project>`, `<documents>…</documents>`
- SUMMARY_PROMPT trailing template (locked last 2 lines): the `[[CCB:TITLE:...]]` / `[[CCB:SAVE]]` lines

Editable state shape (`__ccbPromptsAPI.getEditable()`):
```
{ manualIntro, manualOutro, gmIntro, gmOutro, convIntro, convOutro, projIntro, projOutro, docsIntro, docsOutro, summaryBody }
```

Storage key: `chrome.storage.local["ccb_prompts"]`.
Backward-compat: old `framingBodies.{manual,gm}` and old `framingBody` are read on startup.

`reset(key)` accepts:
- `"framingAll"` — resets all 5 framing pairs (manual/gm/conv/proj/docs)
- `"framingManual"`, `"framingGm"`, `"framingConv"`, `"framingProj"`, `"framingDocs"` — one section
- `"summary"` — summary body only

Note: the prompts editor UI exposes the 5 FRAMING sections only; SUMMARY_PROMPT editing is intentionally hidden for now.

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
| `FRAMING_DOCS_PRE`     | Opens file injection: `[[CCB:INJECTED]]` + intro + `<documents>`     |
| `FRAMING_DOCS_POST`    | Closes file injection: `</documents>` + outro                        |

(Legacy flat keys `FRAMING`, `FRAMING_MANUAL`, `FRAMING_GM` are also patched for backward compatibility but no code reads them directly anymore — the `framing` getters in `content.js` fall back to these only if PRE is undefined.)

`FRAMING_DOCS_*` is consumed by exactly one call site: `history-view.js#injectProjectDocuments()` (the footer "קבצים" button — the dedicated top-level file-injection action). One other place builds a literal `<documents>...</documents>` block but is deliberately **not** wired to this pair, since it's nested inside a different outer wrapper already: `chat-features.js#injectSelected()` (docs of a manually-selected project block, nested inside FRAMING_MANUAL/FRAMING_GM). The canned reply `"Files loaded."` is in `INJECTION_AUTORESPONSES` (both `chat-features.js` and `history-view.js`) alongside `"Context loaded."`/`"Transcript loaded."`/`"Project guidelines loaded."`.

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
| `CHARS_PER_TOKEN`      | number       | Chars/token ratio for non-Hebrew text (3.5 — calibrated for English/code)                   |
| `HEBREW_CHARS_PER_TOKEN` | number     | Chars/token ratio for Hebrew characters (2 — Hebrew tokenizes far denser than English; a flat 3.5 undercounted Hebrew content by ~40%) |
| `estimateTextTokens(text)` | function | **The canonical chars→tokens estimator.** Counts Hebrew chars (U+0590–U+05FF) at `HEBREW_CHARS_PER_TOKEN` and everything else at `CHARS_PER_TOKEN`. `document-handler.js#estimateTokens` and `ctx-meter.js`'s conversation meter both delegate here (each keeps a flat-ratio fallback only for the config-missing case) — there is deliberately exactly ONE chars→tokens policy in the codebase; the two modules used to carry drifting copies |
| `SUMMARY_PROMPT`       | string       | Prompt sent to AI for "save chat" fallback                                                  |
| `FRAMING_*_PRE/POST`   | string       | See table above                                                                             |

## Storage keys used

| Key                                | Owner          | Shape                                                  |
| ---------------------------------- | -------------- | ------------------------------------------------------ |
| `chrome.storage.local.blocks`      | content.js     | `{ [id]: block }` — see Storage shape below           |
| `chrome.storage.local.ccb_prompts` | prompts.js     | `{ manualIntro, manualOutro, gmIntro, ... }`           |
| `chrome.storage.local.ctxWindow`   | content.js     | `number` (tokens, used by the meter)                   |
| `chrome.storage.local.ccb_scanSettings` | content.js | `{ denyDirs, denyFilenames, codeExtensions, maxFileSizeKb }` — the GLOBAL code-project scan rules (see below) |

## content.js — function index

### Storage / state

| Function                              | Description                                                  |
| ------------------------------------- | ------------------------------------------------------------ |
| `loadBlocks()` / `saveBlocks()`       | Loads/persists `state.blocks` from `chrome.storage`         |
| `loadCtxWindow()` / `setCtxWindow(k)` | Loads/persists the context-window size (the meter)          |
| `loadScanSettings()` / `saveScanSettings(next)` | Loads/persists the global code-project scan rules (`ccb_scanSettings`). `loadScanSettings` is idempotent (guarded by `state.scanSettingsLoaded`) and **seeds + writes back** `docHandler.getDefaultScanSettings()` on first ever load, so the settings dialog always shows exactly what the scanner uses. Both validate each field individually against the defaults |

### Mount + UI lifecycle

| Function                        | Description                                                                  |
| ------------------------------- | ---------------------------------------------------------------------------- |
| `mountUI()`                     | Attaches Shadow DOM host + sidebar HTML (once), calls `initModules`, `wireEvents` |
| `initModules()`                 | Builds deps and calls each module's `init`                                   |
| `moveTabIndicator(tab)`         | Animates the sliding underline to the active tab                             |
| `wireEvents()`                  | Binds all UI event listeners (central switchboard)                           |
| `setPanelOpen(open)`            | Opens/closes sidebar, loads blocks, renders. Focuses `#searchHistory` only when the History tab is the active one — the panel now opens to the Context tab by default (`.tab.active`/`.tab-pane.active` moved to `#pane-context` in `ui-template.js`), so an unconditional focus would target a hidden field |
| `togglePanel()`                 | Flips panel open/closed                                                      |
| `resetTabDefaults(tabName)`     | Resets per-tab UI defaults when user clicks a tab                            |
| `render()`                      | Full re-render — calls `chat.renderGeneralMemory`, `renderUnifiedBlocksList`, `syncBlocksSection`, `syncInjectDocsBtn`, `historyView.render`, `updateInjectBtn` (after `historyView.render()` so the footer count reflects any project-selection pruning it did), ctx-meter update |
| `syncBlocksSection()`           | Toggles `.collapsed` on `#blocksSection`/`#blocksCollapseBtn` per `state.blocksCollapsed` — CSS hides `#blocksSectionBody` (the "+" toolbar, `#gmCard`, `#projectInstructionsCard`, and `#list` all together), same pattern as `historyView.syncCollapsibleSections`' history section |
| `syncInjectDocsBtn()`           | Hides the footer `#injectDocsBtn` when the active project (`state.currentProjectId`) has no documents at all; otherwise shows it but sets `.disabled` unless at least one non-`"structure"`-type document is `enabled` (the auto-generated structure doc for code projects is always enabled and never exposed in the file tree to toggle off, so it alone shouldn't make the button clickable) — the single global entry point for `historyView.injectProjectDocuments()`, covering both the code-project file tree and the flat regular-project document list |
| `migrateCtxProjects()`          | Idempotent one-time migration of retired `kind:"ctx-project"` blocks → `kind:"project"` (runs inside `loadBlocks`) |
| `installUrlChangeWatcher()`     | Patches `history.pushState/replaceState`, fires `ccb:urlchange` to reset GM auto-inject |

### Context list + edit form (kept inline in content.js)

| Function                        | Description                                                       |
| ------------------------------- | ----------------------------------------------------------------- |
| `renderUnifiedBlocksList()`     | Renders `#list`: general blocks (no `projectId`) plus the active project's own blocks, the latter tagged with `.ctx-proj-tag` (project title) rendered right beside the title inside `.block-head`. Blocks owned by a *different* project stay hidden. Each row is `display:flex` (`.block` in `ui-styles.js`) so the checkbox and title share one line — `.block-main` already had `flex:1`/`.cb-wrap` `flex-shrink:0` but `.block` itself was missing `display:flex` until 2026-07-19, so rows rendered checkbox-above-title instead. `.block-head` uses `justify-content: flex-start` (not `space-between`, fixed 2026-07-19) so the tag packs tight against the title instead of floating to the row's far edge. No longer shows a tag-count badge next to the title (tags themselves still render below when present). |
| `updateInjectBtn()`             | Updates the footer "טען פרומפטים" button (`#injectBtn`) state + count pill, based on `state.selected.size` — counts any selected block id, including GM's and (since 2026-07-19) a ticked project-instructions card |
| `hasUnsavedChanges()`           | Checks if the edit form differs from the saved block              |
| `openEdit(id, prefill)`         | Opens edit form; id=null for new block. Also resolves the block's project (an existing block's own `projectId`, or — for a new block — the active `state.currentProjectId`) and shows/hides the `#editProjectTag` pill (folder icon + project title) — the full-panel edit form otherwise hides all project context. Hides `#deleteBtn` when the block being edited is `kind:"project"` — project deletion needs `history-view.js#deleteProject`'s cleanup (child blocks, active-project reset), which this generic delete doesn't do. Called directly on click of the whole GM/instructions card (see Features overview) |
| `closeEdit()`                   | Exits edit mode, clears form                                      |
| `saveEdit()`                    | Validates and saves form to `state.blocks` — spreads the existing block first (`{ ...existing, id, title, content, tags, updated }`) so fields the form doesn't touch (`kind`, `autoLoad`, `projectId`, and a project's `documents`/`isCodeProject`/`dirHandleId`/`lastScanned`/`depGraph`) survive an edit instead of being dropped |
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
| `showProjectPicker({title,currentId,allowClear})` | Project assignment picker (uses `_deps.getProjects()`, wired in `content.js` to `historyView.getAllProjects()` — regular + code — so code projects are selectable here too). Rows reuse `.project-select-item` (icon + title + hover/active highlight), the same styling as the global project-selector dropdown, inside a bordered `.project-picker` scroll container (`max-height:280px; overflow-y:auto`) so a long project list scrolls instead of growing the dialog indefinitely |
| `openSettings()` / `closeSettings()`           | Show/hide and position the advanced options popover                    |
| `openScanSettings()` / `closeScanSettings()`   | Show/hide `#scanSettingsOverlay` — the global code-project scan rules (folders/files to exclude, extensions to scan, max file size). Copies the live settings into a module-scoped `_scanDraft` on open (arrays deep-copied so editing can't mutate live state before Save); clears it (and the per-list search filters) on close. Each of the three chip lists has its own live search box (`renderScanList` filters display-only by substring match — a chip's remove button still splices `_scanDraft` by its true unfiltered index, so filtering never removes the wrong item) |
| `saveScanSettings()`                           | Validates (size > 0, at least one extension) then persists `_scanDraft` via `_deps.saveScanSettings`. Does **not** auto-rescan projects — a permission-prompt storm; changes apply on each project's next scan |
| `resetScanSettingsToDefaults()`                | Refills `_scanDraft` from `_deps.getDefaultScanSettings()` — in-memory only, still requires Save to persist |
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
| `buildConversationInjectionText(messages)`              | Wraps transcript with FRAMING_CONV_PRE/POST                                  |

### Render

| Function                                                | Description                                                                                  |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `render()`                                              | Full re-render: collapsibles → project selector → history list → project context             |
| `renderProjectSelect()`                                 | Updates the custom project-dropdown trigger (`#projectSelectBtn`'s `#projectSelectLabel` text + `#projectSelectIcon` visibility) to reflect the active project; if the dropdown is currently open, also refreshes its item list via `renderProjectSelectItems`. Not a native `<select>` — see the dedicated section below |
| `renderProjectSelectItems(projects, current)`           | Builds the dropdown's rows into `#projectSelectDropdown`: a "ללא פרויקט"/"אין פרויקטים עדיין" clear row, then one `.project-select-item` per project (folder `IC.folder` SVG icon for code projects, `.active` class on the current selection). All text set via `textContent`, never `innerHTML`, since project titles are user-controlled |
| `openProjectSelectDropdown()` / `closeProjectSelectDropdown()` / `toggleProjectSelectDropdown()` | Show/hide `#projectSelectDropdown`. Open wires a capturing `document` click listener (closes on any click outside the trigger+panel — event retargeting inside the Shadow DOM doesn't break item clicks, since hiding the dropdown via CSS doesn't cancel an already-dispatched click's remaining bubble-phase listeners) and an Escape `keydown` listener; both are removed on close. `content.js` calls `closeProjectSelectDropdown()` on tab switch and on panel close, in addition to the automatic outside-click/Escape handling |
| `selectProjectFromDropdown(id)`                         | Closes the dropdown, calls `setActiveProjectId(id)`, then `_deps.render()` (the full top-level re-render, same as the old native `<select>`'s `change` handler used) |
| `renderProjectContext()`                                | Shows/hides `#projectInstructionsCard` and the documents section (code projects render the inline file tree via `__ccbCodeTree.renderInline` inside `#projectDocumentsList`); both hidden when no project is active. Prunes any *other* project's id out of `state.selected` first (only the active project's instructions checkbox is visible, so a stale selection from a since-deselected project must not linger invisibly). Calls `renderProjectInstructionsCard(project)`, then for documents: shows/hides `#projectAddDocumentBtn` vs `#codeProjectRefreshBtn` by `project.isCodeProject`, sets the refresh button's `title` to the last-scan age (or "טרם נסרק"), wires its `onclick` to `rescanCodeProject`, and calls `syncProjectDocumentsSection()` |
| `renderProjectInstructionsCard(project)`                | Builds the instructions card exactly like `chat-features.js#renderGeneralMemory`: an `.auto-badge`-below-header `.gm-card` with a select-for-inject checkbox (adds `project.id` to `state.selected`, same as GM's checkbox), an `autoLoad` toggle (missing `autoLoad` defaults to ON) + fixed title "הנחיות הפרויקט", **no edit button** — the whole card's `click` opens `openEdit(project.id)` (the checkbox/toggle `stopPropagation()` so using them doesn't also open the form). There is no separate "load instructions" button (`#injectInstructionsBtn` was removed 2026-07-19) — manual load is tick-checkbox-then-footer-"טען פרומפטים", identical to GM's flow |
| `syncProjectDocumentsSection()`                          | Toggles `.collapsed` on `#projectDocumentsList` + `#projectDocumentsToggle` per `state.projectDocumentsCollapsed` — same collapse pattern as `syncCollapsibleSections`' history section, but scoped to the documents list (works for both the flat regular-project list and the code-project inline file tree, since both render into the same `#projectDocumentsList` mount) |
| `syncHistoryProjectFilterRow()`                         | Shows/hides `#historyProjectFilterRow` ("מציג שיחות של: …" + "הצג את כל השיחות" checkbox) based on whether a project is active |
| `renderHistoryList()`                                   | Renders the history list (title-search or content-search), pinned + grouped — filtered to the active project's conversations unless `state.historyShowAll` is set or no project is active |
| `createHistoryRow(b, opts)`                             | Builds a single conversation row (with optional snippet + project tag)                       |
| `syncCollapsibleSections()`                             | Updates the History section's collapse chevron + ARIA state                                  |

### Project actions

| Function                          | Description                                                          |
| --------------------------------- | -------------------------------------------------------------------- |
| `loadActiveProjectId()` / `setActiveProjectId(id)` | Loads/persists the active project (`chrome.storage.local.activeProjectId`); `loadActiveProjectId` is idempotent (guarded by `state.activeProjectLoaded`), both validate the id via `getProjectById` |
| `addProject()`                    | Prompts (via modals), creates a new project block, and makes it active |
| `openProjectDropdown(project, menuBtn)` | Rename / delete dropdown behind `#projectEditBtn` (the "3-dot" trigger, positioned as the LAST child of `#globalProjectBar` so it sits at the RTL layout's far-left edge). Two items only — `renameProject`/`deleteProject` (private helpers, called from the menu items) are the same for both project types. `deleteProject` branches on `project.isCodeProject` (`deleteRegularProject` vs `deleteCodeProject`, the latter also releasing the `fs-handles.js` directory bookmark + scanned file content) but both share `unlinkProjectChildren(projectId)` — the only safe path to delete a project (unlinks conversations, deletes the project's own text blocks, resets the active project if it was the one deleted); `content.js#deleteEdit` refuses this by hiding `#deleteBtn` for `kind:"project"` |

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
| `injectProjectDocuments()`                 | Builds enabled doc contents and injects them wrapped in `FRAMING_DOCS_PRE`/`_POST` (its own editable framing pair — see prompts.js section below). Does **not** auto-send — the user reviews/edits the loaded text and sends it themselves, unlike most other injection paths. (Note: `docHandler.injectFilesToChat` exists for re-attaching blob docs to the page's file input but is not currently called from here or anywhere else — a pre-existing gap, not something this function does.) |

### Code projects (folder-backed, `isCodeProject: true`)

| Function                                            | Description                                                                                   |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `getCodeProjects()`                                 | Project blocks with `isCodeProject: true`                                                       |
| `renderCodeProjectList()`                           | Renders the code-project cards (name + "last scanned" age)                                      |
| `createCodeProjectBookmark()`                       | Opens `showDirectoryPicker()`, stores the handle via `__ccbFsHandles`, creates the project block (with `ignorePatterns: []`), runs the first `scanCodeProject` + `buildGraph` + `syncCodeProjectDocuments` |
| `rescanCodeProject(projectId)`                      | Re-verifies (or re-requests) folder permission, then rescans (passing `project.ignorePatterns`) + rebuilds `depGraph` + re-syncs documents. Deliberately does **not** touch `project.title` (fixed 2026-07-19 — it used to reset it to `dirHandle.name` on every rescan, silently reverting a user's rename); the folder name is only used as the transient `rootName` argument to `syncCodeProjectDocuments` for the generated structure doc's header, never written back onto the project block |
| `enableFilesForProject(projectId, relativePaths, enabled = true)` | Bulk-sets a set of code docs' enabled state by path in one `saveBlocks()` call (not one call per file — see perf note in source). `enabled` defaults to `true` for the dep-graph call sites (which only ever add files); `code-tree.js`'s per-folder checkbox passes it explicitly both ways. **Returns the number of docs that actually matched** (2026-07-21) — a stale dep graph can hold paths that no longer exist as documents, and `loadWithDependencies`' status line must report the real count, not the requested closure size |
| `setAllCodeDocsEnabled(projectId, enabled)`         | Bulk select-all / clear-all for code docs                                                       |
| `openIgnorePatternsDialog(project)`                  | Opens `#ignorePatternsOverlay` (a dialog next to the refresh button, via `#codeProjectIgnoreBtn`) to edit `project.ignorePatterns` — a user-typed list of file/folder names or `*`-globs to exclude from scanning. Add/remove happen in-memory against a local copy of the array; "שמור וסרוק מחדש" persists it to the block and immediately calls `rescanCodeProject` so newly-ignored files drop out of `project.documents` right away (via `syncCodeProjectDocuments`'s existing "remove docs for files no longer in `included`" step — no special-case needed) |

Code projects share `openProjectDropdown` (see "Project actions" above) — its delete item releases the directory bookmark and scanned file content for a code project specifically, via `deleteCodeProject`. The dropdown's old "load all"/"refresh" items (code-project-only, from before the unified rename/delete menu) were dropped as redundant (refresh has its own `#codeProjectRefreshBtn`; "load all" overlaps with the per-folder select-all checkbox + footer inject) — `loadCodeProjectAll()` itself was deleted since nothing calls it anymore.

## document-handler.js — function index

| Function                                                     | Description                                                                                  |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `init(deps)`                                                  | Wires up `{ loadBlocks, saveBlocks, getBlocks }`                                                |
| `addDocument(file, projectId, contentOverride?)`              | Reads/extracts text (or uses `contentOverride` for pasted text), estimates tokens, stores the blob in `chrome.storage.local` (key `docBlob_<id>`), pushes a doc onto `project.documents` |
| `removeDocument(projectId, docId)`                            | Removes the doc entry + its stored blob                                                        |
| `toggleDocument(projectId, docId, enabled)`                   | Flips `doc.enabled`                                                                             |
| `getDocumentContent(projectId, docId)`                        | Returns `doc.content` if already extracted/stored                                              |
| `getOrExtractContent(projectId, docId)`                       | Lazily extracts + caches text for blob-only docs; reads code-project file text from its own storage key (never inline on the doc). One doc per call — prefer `getCodeContents` for code files |
| `getCodeContents(docIds)`                                     | Batched read of many code files' text in a **single** `chrome.storage.local.get` → `Map<docId, text>`. Used by `injectProjectDocuments`, which otherwise paid one storage round-trip per selected file |
| `getEnabledDocuments(projectId)`                              | Enabled docs for a project                                                                       |
| `injectFilesToChat(projectId)`                                | Loads enabled blob docs from storage and sets them on the page's `<input type="file">` (or queues them via `ctx-meter` if the input isn't mounted yet) |
| `estimateTokens` / `estimateFileTokens`                       | **The canonical token estimation** (ctx-meter.js delegates its per-file estimates here since 2026-07-21 — it used to hold a drifting fork of the same heuristics). Text content goes through config.js's Hebrew-aware `estimateTextTokens`; binary types keep size-based heuristics (image tiers, pdf size/50, docx size/100, ...) which are order-of-magnitude only |
| `getFileType(file)` / `isLikelyTextFile(file)`                | File-type classification used by estimation + extraction. `isLikelyTextFile`'s extension list is aligned with `DEFAULT_CODE_EXTENSIONS` (2026-07-21) — it used to miss `.cs`/`.cshtml`/`.razor`/`.php`/`.kt`/`.vue`/... so uploading such a file skipped text extraction entirely (attached as a blob instead of injected as text) and fell to the crude size/50 binary token fallback |
| `extractOfficeText` (docx/odt/rtf)                            | Extracts plain text from Office formats — DOCX/ODT via manual ZIP central-directory read + `DecompressionStream('deflate-raw')`, RTF via control-word stripping. Legacy binary `.doc` is not supported |
| `scanCodeProject(dirHandle, scanSettings = {})`               | Recursively walks a directory handle. `scanSettings` bundles **two layers**: the project's own `ignorePatterns` (from `project.ignorePatterns`, edited via `history-view.js#openIgnorePatternsDialog`) plus the **global, user-editable** `denyDirs`/`denyFilenames`/`codeExtensions`/`maxFileSizeKb` (from `chrome.storage.local["ccb_scanSettings"]`, edited via `ui-modals.js#openScanSettings`). Every field falls back to its `DEFAULT_*` individually, so a partial settings object can't silently disable a filter. All pattern lists are matched case-insensitively against either the bare name or the full relative path, with `*` as a wildcard. Reads matching files immediately (no lazy loading), in **two bounded-concurrency phases** — see "Scan performance" below. Also accepts `onProgress({ phase, done, total, current })`, fired per file on both start and finish, which both call sites wire to the persistent progress indicator |
| `getDefaultScanSettings()`                                    | Fresh copies of the built-in `DEFAULT_DENY_DIRS`/`DEFAULT_DENY_FILENAMES`/`DEFAULT_CODE_EXTENSIONS`/`DEFAULT_MAX_FILE_SIZE_KB`. Used by `content.js#loadScanSettings` for first-load seeding and by the settings dialog's "reset to defaults". Returns copies (not the module's own arrays) so callers storing the result can't mutate the defaults |
| `buildStructureMarkdown(included, rootName)`                  | Renders the scanned file list as a markdown folder tree                                         |
| `syncCodeProjectDocuments(project, included, rootName, onProgress?)` | Upserts the structure doc + one doc per scanned file into `project.documents`, preserving `enabled` on files that already existed; file text is written to its own `codeContent_<id>` storage key, never inlined on the doc, so `saveBlocks()` stays cheap regardless of project size. Writes go out in batches of 50 keys per `chrome.storage.local.set`, not one call per file |
| `removeCodeContent(docId)`                                    | Deletes a code file's stored content (used when a bookmark/file is removed)                     |

Requires the `unlimitedStorage` permission (manifest.json) since file blobs and per-file code content are stored as `chrome.storage.local` entries, which can add up past the default quota for large projects.

## dep-graph.js — static dependency graph

Builds a best-effort, deterministic import/reference graph for a scanned code project — no AI involved. Used by `code-tree.js`'s "load with dependencies" menu.

- **JS/TS/JSX**: resolves `import`/`export …from`/`require`/dynamic `import()` to files. Handles relative paths, `@/`/`~/` alias imports (tried against `src/` then project root), and is case-insensitive as a fallback. A relative import whose `..` segments climb past the scanned root resolves to **null** (2026-07-21) — it targets a file outside the project, and mapping it back into the root used to create a false edge whenever an in-project file happened to share the name.
- **C#**: builds a namespace/class symbol table (`buildCsharpSymbolTable`), then `analyzeCsharpFile` does a best-effort text scan for referenced type names, preferring matches in the file's own namespace or `using`s. `CS_TYPE_RE` covers modern declaration forms (2026-07-21): modifiers `readonly`/`ref`/`new`/`unsafe`/`file` and `record class` / `record struct` — previously `record struct Point` captured the keyword `struct` as the type name (poisoning the symbol table with a word that appears in nearly every file declaring any struct) and `readonly record struct` was missed entirely. The symbol table is built over the **strings-blanked** variant ("both", 2026-07-21), so a multi-line verbatim string containing `class X` at line start (code-gen templates) can't register a phantom type.
- **Razor (`.cshtml`/`.razor`)**: `analyzeRazorFile` reuses the same C# symbol table — it declares no types of its own, so any known type name found anywhere in the markup (`@model`, `@inject`, tag helpers, embedded `@{ }` C# blocks) becomes a dependency edge, filtered by `@using` directives (`extractRazorUsings`) the same way C# `using`s filter candidates. Code-behind pairs (`Foo.cshtml`↔`Foo.cshtml.cs`, `Foo.razor`↔`Foo.razor.cs`) additionally get a guaranteed bidirectional edge in `buildGraph()` regardless of whether either side textually references the other — they're one logical unit split across two files.
- All three share a comment/string scanner (`scanRegions`) so regex passes aren't confused by code-like text inside strings/comments; Razor gets its own `lang: "razor"` branch there for `@* ... *@` and `<!-- ... -->`. **C#-style `//` and `/* */` are NOT treated as comments in Razor** (2026-07-21): razor's "code" mode is mostly HTML markup with no string detection, so a URL in an attribute (`https://...`, `src="//cdn..."`) used to start a phantom line comment that blanked every type reference on the rest of that line — a silent under-inclusion, the exact failure direction this module promises to avoid. The cost is that a commented-out type name inside an `@{ }` block may over-include, which is the documented bias. None of the resolvers are 100% — dynamic dispatch (computed member access, reflection, `eval`, virtual/interface calls, DI-container-injected services, partial-view names passed as strings) can't be resolved statically.

`buildGraph(included)` is called right after `scanCodeProject` while file content is still in memory. `getTransitiveClosure` (BFS, cycle-safe) gives "dependencies"; `getDirectDependents` (one hop, not transitive) gives "dependents"; `getFullContext` combines both.

**`buildGraph` is `async`** — not because it does IO (it doesn't), but so it can `await` a `setTimeout(0)` every 25 files. The analysis is pure main-thread CPU and would otherwise freeze the tab for its entire duration on a large C#/Razor project. Callers must `await` it. Two per-file costs are amortized inside it: `createRegionCache()` runs the expensive `scanRegions` pass **once per file per `buildGraph()` call** (a C# file used to be scanned up to three times — once for the symbol table, twice more during analysis) and derives both stripped variants from that one scan, and the combined "every type name in the project" regex is compiled once per run instead of once per file.

### Progress indicator

`#scanProgress` sits directly below the global project bar — visible from either tab, and above the content rather than overlaying it. It is **persistent**: unlike `setStatus` (a toast that auto-hides after 2.5s), it stays for the whole operation, which is the entire point on a scan that runs for minutes.

`content.js` owns it, as a sibling of `setStatus`, and passes `setProgress`/`clearProgress` into `history-view.js` via `init` deps. Payload: `{ phase?, label?, done, total, current, state? }` — `phase` maps to a Hebrew label (`discover`/`read`/`graph`/`save`/`load`), `label` overrides that map, `state: "done" | "error"` colors the bar.

| Concern | Resolution |
|---|---|
| Update volume | DOM writes throttled to one per 80ms. Deliberately `setTimeout`, **not** `requestAnimationFrame` — rAF is suspended in a backgrounded tab, which would freeze the indicator for a user who switched away mid-scan |
| Counter stalling | `scanCodeProject` reports on both file **start** (for `current`) and **finish** (for `done`). Start-only reporting leaves `done` permanently short by the number of in-flight reads, so the bar would stall near the end of every scan |
| No total during discovery | Bar renders an indeterminate sweep instead of sitting at 0% looking hung |
| Back-to-back operations | `clearProgress(holdMs)` captures a sequence number and skips the hide if a newer operation started during the hold |
| Long paths | Shortened from the left in JS (`shortenPath`), so the file name survives rather than the repo root |
| Stuck indicator on error | Every exit path clears it; `injectProjectDocuments` is a try/catch wrapper around `runProjectDocumentsInjection` for exactly this reason |

### Scan performance

Everything the scanner touches — `handle.entries()`, `getFile()`, `file.text()`, `chrome.storage.local.set/get` — is an IPC round-trip to the browser process. On a large project the limiting factor is **round-trip latency, not CPU**, so the pipeline is built around keeping work in flight:

| Stage | Approach |
|---|---|
| Directory traversal | `walkDirectories(root, DIR_CONCURRENCY = 8, visit)` — a **flat** BFS queue with a global cap. Deliberately not recursive: recursing into a concurrency-limited helper per directory level would multiply the cap once per level (8^depth), so a deep tree would end up with thousands of simultaneous reads instead of 8 |
| File reads | `runWithConcurrency(candidates, FILE_READ_CONCURRENCY = 12, worker)` — a flat pool over the file handles that survived the filters |
| Content writes | `codeContentPutMany` — `CONTENT_WRITE_BATCH = 50` keys per `chrome.storage.local.set`. Batched rather than one giant call so a single failure can't lose the whole scan and peak serialization memory stays bounded |
| Content reads (injection) | `getCodeContents(docIds)` — one batched `get` for every selected code file |
| Graph building | `buildGraph` yields every 25 files (see above) |
| Logging | One `console.log("[ccb-timing] ...", {...})` summary per phase/call (discover, read, graph, save, etc.), never per-file/per-entry — on a large project that would mean tens of thousands of calls, each expensive while DevTools is open, which is precisely when someone is watching a slow scan. Every `[ccb-timing]` payload is counts + durations only (`filesIncluded`, `discoverMs`, `readMs`, ...) — no file/folder names or file content, so a scan of a private project can't leak what's in it via the console. See "Timing logs" below |

Because reads complete out of order, `scanCodeProject` **sorts `included` by relative path** before returning, so the structure doc, the file tree, and the dep graph stay stable across scans of the same folder.

Measured on a synthetic 1,452-file tree with simulated per-IO latency: **47.6s sequential → 4.1s (≈11.6×)**, with byte-identical scan output.

### Timing logs

Every file-loading path (code-project create/rescan, "טען קבצים" injection, regular document add, blob injection into chat, IndexedDB handle ops, dep-graph build) logs one `console.log("[ccb-timing] <operation>", { ...counts, ...phaseMs, totalMs })` line per call — a fixed, small number of calls per user action, not one per file. This is how a slow load gets diagnosed from a user's DevTools console: `discoverMs` vs `readMs` vs `writeMs`/`saveMs` (or `codeContentsMs`/`extractMs`/`buildMs`/`injectMs` for the "טען קבצים" flow) shows which phase is actually slow, without needing anything else.

The render pipeline is covered too, since every one of those flows ends with `_deps.render()`: `content.js#render()` (`blocksListMs`/`historyViewMs`/`ctxMeterMs`/`totalBlocks`) and `history-view.js#render()` (`projectSelectMs`/`historyListMs`/`projectContextMs`/`totalBlocks`/`conversations`). This was the missing piece the first time this instrumentation shipped — a user's scan/sync steps all logged fast, but the panel still felt very slow afterward with zero console output, because the render step that runs right after had no timing at all. `historyListMs` in particular is worth checking first on "fast scan, slow everything else" reports: `renderHistoryList()` rebuilds a DOM row for every stored conversation (and in content-search mode, scans every message of every conversation) on every render, so an account with months of auto-saved history can make the panel feel slow independent of the current project's size — `totalBlocks`/`conversations` in the same log line is the number to look at.

**Hard rule: `[ccb-timing]` payloads carry only numbers/booleans/short enums (counts, milliseconds, `found`/`ok`/`result`, a `mode` string) — never a file name, folder name, path, or file content.** File/folder names still flow through the UI (progress bar `current`, document list rows, dialogs) — that's the user looking at their own project, not a console log. When adding a new timing log, follow the same shape as the existing ones in `document-handler.js`/`history-view.js`/`fs-handles.js`/`dep-graph.js` rather than reusing whatever variable is closest at hand.

## code-tree.js — inline file-tree picker

`renderInline(project, mount)` renders an interactive checkbox tree (folders + files) over a code project's scanned documents **inline** into the open project's documents section (`#projectDocumentsList`, mounted by `history-view.js#renderProjectViewDocuments` when `project.isCodeProject`) — not a separate modal. It builds its own shell (path search + "בחר הכל"/"נקה הכל" + token count) plus the tree body. The search input carries `.code-tree-search-input` (shares the `#search`/`#searchHistory` rule set in `ui-styles.js`) rather than being an unstyled bare `<input type="search">` — it previously fell through both selector lists and rendered with default browser search-input chrome. Each file row has a "deps" button opening a small menu (`תלויות`/`תלויים`/`הקשר מלא`) that calls into `dep-graph.js` via `history-view.js#enableFilesForProject` to bulk-enable the resulting closure. Reuses the shared `#hiDropdown` host element for that menu (via `deps.getShadow()`) but manages its own outside-click cleanup. Per-view state (`_query`, `_collapsedPaths`) survives same-project re-renders and resets when switching projects. Only `type: "code"` docs appear in the tree; the `type: "structure"` doc is injected but not shown (parity with the former modal). The shell's token-count label counts **only enabled `type:"code"` docs** as "קבצים נבחרים" (2026-07-21 — the always-enabled structure doc used to make a fresh project read "1 קבצים נבחרים" with nothing ticked), while the token **sum** still spans every enabled doc including structure, because that is exactly what the footer inject sends. `loadWithDependencies` reports the count returned by `enableFilesForProject` (files that actually matched documents) and warns "סומנו X מתוך Y — ייתכן שנדרש רענון סריקה" when a stale graph made some closure paths miss.

Every folder row also carries its own checkbox (`collectDocs(node)` flattens the folder's descendant file docs; the checkbox is `checked` when all are enabled, `indeterminate` when some are, unchecked when none are) — ticking it bulk-enables or bulk-disables the whole subtree in one `enableFilesForProject(projectId, relativePaths, enabled)` call (same bulk-save principle as "load with dependencies" and "בחר הכל"/"נקה הכל" — one `saveBlocks()`, not one per file). When a search filter (`_query`) is active, the folder checkbox only covers the *visible* (filtered) descendants, since the tree itself is built from the filtered doc list. The checkbox calls `e.stopPropagation()` on its own `click` so it doesn't also trigger the row's collapse-toggle handler.

A single file's own checkbox calls `_deps.render()` (fixed 2026-07-19 — it used to only call `updateTokenCount()`, a local-only update). `docHandler.toggleDocument()` mutates `state.blocks` in place but never triggers a re-render itself, so without this, single-file toggles never reached `content.js#syncInjectDocsBtn` — the footer inject button would only reflect folder-level/select-all changes (which already went through `enableFilesForProject`/`setAllCodeDocsEnabled`, both of which call `_deps.render()`), not an individual file toggle. `render` was added to `code-tree.js`'s `init(deps)` to make this possible. This mirrors the regular-project flat document list's own per-file checkbox (`history-view.js#renderProjectViewDocuments`), which already called `_deps.render()`.

## fs-handles.js — directory handle storage

`chrome.storage.local` is JSON-only and can't hold a `FileSystemDirectoryHandle`. IndexedDB supports structured clone, so bookmarked code-project folder handles are stored there instead (`ccbFsHandles` DB, `handles` store, keyed by the project's `id`). `verifyPermission(dirHandle, mode)` re-checks (and if needed re-requests) read/readwrite permission — must be called from a user-gesture handler since `requestPermission()` requires one.

## chat-features.js — function index

### General Memory

| Function                | Description                                                                                |
| ----------------------- | ------------------------------------------------------------------------------------------ |
| `getGM()`               | Returns the GM block from `state.blocks` (with `title: "זיכרון כללי"` default)            |
| `renderGeneralMemory()` | Renders the GM card in the context tab (select-for-inject checkbox + autoLoad toggle). No edit button — the whole card's `click` opens `openEdit(GM_ID, ...)`; the checkbox/toggle `stopPropagation()` so using them doesn't also open the form |
| `tryAutoInject()`       | Polls for input readiness, injects GM **and the active project's instructions** at *conversation start only*, clicks send |
| `_getActiveProjectInstructions()` | `## title\ncontent` for the active project (`state.currentProjectId`), or `null`. **Instructions only**, never the project's enabled documents (tens of thousands of tokens for a code project) — those stay behind the explicit footer `#injectDocsBtn` |
| `_autoInjectPayload()`  | Builds `{ text, hasGm, hasProject }` — GM block (if `autoLoad` + content) and/or the project-instructions block, wrapped in `FRAMING_GM_*` / `FRAMING_PROJ_*`, joined into ONE injection |
| `_doInject()`           | Guarded by `state.gmAutoInjected`; injects `_autoInjectPayload().text` and clicks send    |

**Auto-inject at conversation start** covers two independent sources, either of which alone triggers it:

- **General Memory** — gated on `gm.autoLoad` + non-empty content (unchanged).
- **Active project instructions** — gated on a project being active (`state.currentProjectId`), `project.autoLoad !== false`, + non-empty `content`. `project.autoLoad` is an explicit per-project toggle, built dynamically inside `history-view.js#renderProjectInstructionsCard` (same `.toggle` markup as GM's, wired inline — no static id, no `content.js#wireEvents` entry). **Missing `autoLoad` defaults to ON** — both the toggle's checked state and the actual gate treat `undefined` as `true`, so older projects (created before the toggle existed) keep auto-loading without a migration step. The instructions card's `.auto-badge` ("נטען אוטומטית") reflects the toggle state, not the content — it shows even when instructions are empty, since it communicates intent ("this project *will* auto-load once you write something"), matching the GM card's badge pattern.

Both are concatenated into a **single** `injectIntoInput(..., "prepend")` call (two sequential injections are unreliable on Gemini — same reason as the continuation flow). The payload is computed **at inject time**, not when `tryAutoInject` is called: the fallback `MutationObserver` has no timeout, so the user may switch project or edit GM in between, and reading late keeps the injection consistent with the current selection.

Both blocks are prefixed with `[[CCB:INJECTED]]` via their FRAMING, so `captureConversation` filters them out of saved conversations, and the AI's canned replies (`"Context loaded."`, `"Project guidelines loaded."`) are already in `INJECTION_AUTORESPONSES`.

### Manual injection

| Function              | Description                                                                                              |
| --------------------- | -------------------------------------------------------------------------------------------------------- |
| `injectSelected()`    | Builds the prompt and injects: GM-only uses FRAMING_GM, otherwise FRAMING_MANUAL (with GM first if mixed). A `kind:"project"` block reaches this when its instructions card is ticked — only `content` (instructions) is included, never its documents; those stay behind the explicit footer "טען קבצים" button, same rule as everywhere else. **Does not auto-send** (fixed 2026-07-19 — it used to click send 100ms after injecting; now matches `injectProjectDocuments()`/`cvLoadBtn`'s "load into the input, user sends themselves" convention) |

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

Token math is not implemented here anymore (2026-07-21): the conversation meter estimates each message via config.js's shared Hebrew-aware `estimateTextTokens` (summed per message), and per-file estimates delegate to `window.__ccbDocHandler.estimateFileTokens` at call time — this module used to carry a near-identical fork of the file heuristics and the two drifted (different return shapes, different extension lists). The call-time delegation is load-order-safe even though ctx-meter loads before document-handler in the manifest, since estimates only run from user file events; it mirrors the established cross-module pattern of document-handler calling `window.__ccbCtxMeter.queueFilesForInjection`. ctx-meter still owns the `{ name, tokens, size }` wrapper shape its dropdown consumes, plus a crude `size/50` last-resort fallback.

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
    ignorePatterns?: string[],                 // user-defined file/folder names or *-globs excluded from scanCodeProject; edited via openIgnorePatternsDialog
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
- History tab: blocks with `kind === "conversation"` (may carry `projectId`, stamped from the active project at creation — see chat-features.js#persistConversation), filterable by the active project.
- Projects: blocks with `kind === "project"` (code projects have `isCodeProject: true`); `renderProjectSelectItems` lists all of them in the global project dropdown (`#projectSelectDropdown`).
- Context tab's unified `#list`: blocks without `kind` and not GM_ID — general ones (no `projectId`) always show; project-owned ones only show while their project is the active one (tagged with `.ctx-proj-tag`). A regular context block (no `kind`) may carry `projectId` pointing to a `kind: "project"` block.

**`kind: "ctx-project"` retired (migration):** older builds had a separate Context-tab "ctx-project" entity (grouping of text blocks, no documents). `content.js#migrateCtxProjects()` runs inside `loadBlocks()` on every load (idempotent): it rewrites each `kind === "ctx-project"` block to `kind === "project"`, adding `documents: []` / `isCodeProject: false` where missing, without changing the `id`, so existing child blocks' `projectId` links keep resolving. The `content?` field on the migrated block (unused by the old ctx-project) simply becomes the project's instructions. After migration there is a single project concept.
