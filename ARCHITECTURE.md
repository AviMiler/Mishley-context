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
| `tokenizer.js`    | Real BPE token counting (o200k_base) → `window.__ccbTokenizer`. Loads first so `config.js` can delegate to it | ~200  |
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
| `code-tree.js`    | Inline file-tree picker for code-project documents (rendered into the project view) → `window.__ccbCodeTree` | ~555  |
| `history-view.js` | Projects + history list + conversation preview + document UI + code-project UI → `window.__ccbHistoryView` | ~1720 |
| `chat-features.js`| GM + capture + manual injection + inline save → `window.__ccbChat`            | ~465  |
| `content.js`      | Orchestrator: state, mount, wireEvents, edit form, context list, backup, init | ~1050 |
| `summarizer.js`   | Watches DOM for `[[CCB:SAVE]]` trigger, auto-saves                            | ~130  |
| `background.js`   | MV3 service worker hosting the tree-sitter WASM parsers (NOT a content script — see its own section) | ~250 |
| `wasm/`           | Vendored tree-sitter runtime + grammar binaries (see DEPENDENCIES.md)          | 4 files |
| `tokenizer/`      | Vendored `o200k_base.tiktoken` BPE ranks (see DEPENDENCIES.md)                  | 1 file |
| `manifest.json`   | MV3 manifest — load order below                                                | —     |
| `popup.html`      | Toolbar popup — sends `togglePanel` to the active tab                          | —     |
| `popup.js`        | Popup script (calls chrome.tabs.sendMessage and closes)                        | ~15   |

**Manifest load order:** `tokenizer.js` → `config.js` → `prompts.js` → `storage.js` → `inject.js` → `push.js` → `ui-styles.js` → `ui-template.js` → `ctx-meter.js` → `ui-modals.js` → `fs-handles.js` → `document-handler.js` → `dep-graph.js` → `code-tree.js` → `history-view.js` → `chat-features.js` → `content.js` → `summarizer.js`

## Global API surface (`window.__ccb*`)

| Global               | Module             | Members                                                                                                       |
| -------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------- |
| `__ccbTokenizer`     | `tokenizer.js`     | `load()` (lazy, idempotent), `countTokens(text)` → `number\|null`, `isReady()`, `isFailed()`, `MAX_EXACT_CHARS` |
| `__ccbRawConfig`     | `config.js`        | Site config + FRAMING strings (patched by prompts.js)                                                         |
| `__ccbPromptsAPI`    | `prompts.js`       | `ready`, `getEditable`, `getLocked`, `save`, `reset`                                                          |
| `__ccbStorage`       | `storage.js`       | `loadBlocks(key)`, `saveBlocks(key, blocks)`                                                                  |
| `__ccbInject`        | `inject.js`        | `findInput()`, `injectIntoInput(text, mode)`                                                                  |
| `__ccbPush`          | `push.js`          | `pushPage(open)`                                                                                              |
| `__ccbCSS`           | `ui-styles.js`     | CSS string                                                                                                    |
| `__ccbTpl`           | `ui-template.js`   | `{ IC, PANEL_HTML }`                                                                                          |
| `__ccbCtxMeter`      | `ctx-meter.js`     | `init`, `update`, `resetTokenCache`, `watchConversation`, `watchFileInputs`, `openFilesDropdown`, `cleanup`, `getUploadedFiles`, `queueFilesForInjection`  |
| `__ccbModals`        | `ui-modals.js`     | `init`, `show*`, `openSettings/closeSettings`, `openScanSettings/closeScanSettings/saveScanSettings/resetScanSettingsToDefaults`, `openPromptsEditor/...` |
| `__ccbFsHandles`     | `fs-handles.js`    | `put(id, dirHandle)`, `get(id)`, `remove(id)`, `verifyPermission(dirHandle, mode?)`                            |
| `__ccbDocHandler`    | `document-handler.js` | `init`, `addDocument`, `removeDocument`, `toggleDocument`, `getDocumentContent`, `getOrExtractContent`, `getCodeContents`, `getEnabledDocuments`, `injectFilesToChat`, `estimateTokens`, `estimateFileTokens`, `getFileType`, `isLikelyTextFile`, `scanCodeProject`, `getDefaultScanSettings`, `buildStructureMarkdown`, `syncCodeProjectDocuments`, `removeCodeContent` |
| `__ccbDepGraph`      | `dep-graph.js`     | `buildGraph(included)` (**async**), `getTransitiveClosure(graph, path)`, `getDirectDependents(graph, path)`, `getFullContext(graph, path)` |
| `__ccbCodeTree`      | `code-tree.js`     | `init`, `renderInline(project, mount)`, `closeFilePreview()`                                                   |
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

**Injection auto-response filtering:** The framing prompts ask the model to reply with a fixed string after each injection ("Context loaded.", "Transcript loaded.", "Project guidelines loaded."). These responses are not part of the real conversation. They are filtered out:
- At capture time — `captureConversation` in `chat-features.js` drops any AI message whose trimmed text matches one of the canned responses.
- At read time — `buildHistoryMessages` in `history-view.js` filters the same set so older saved blocks (created before the capture-time filter) don't show pollution in the conversation view.

Both `INJECTION_AUTORESPONSES` sets still list `"Files loaded."` too, but it's dead for anything captured after 2026-07-22: `FRAMING_DOCS_POST` no longer instructs a canned reply (see "`FRAMING_DOCS_POST` wording" under "Runtime config keys patched by prompts.js"), so the model never says it for new injections. Kept only in `history-view.js`'s copy, which is explicitly for filtering **legacy** saved blocks from before the change.

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
  docsPre, docsPost, everyPre, everyPost,
  summaryPrompt,
}
```

## prompts.js

Keeps technical markers locked:

- INJECTED marker (locked prefix): `[[CCB:INJECTED]]\n`
- Per-message markers (locked): `[[CCB:CTX]]\n` prefix and `\n[[CCB:CTX-END]]\n\n` **suffix** — unlike every other pair, the every-message pair's end marker closes the POST (the user's own message follows it in the same chat message), so its extraction/apply logic is suffix-based, and the pair is stored **trimmed** with structural newlines re-added on apply
- Opening/closing tags (locked): `<context>…</context>`, `<memory>…</memory>`, `<transcript>…</transcript>`, `<project>…</project>`, `<documents>…</documents>`
- SUMMARY_PROMPT trailing template (locked last 2 lines): the `[[CCB:TITLE:...]]` / `[[CCB:SAVE]]` lines

Editable state shape (`__ccbPromptsAPI.getEditable()`):
```
{ manualIntro, manualOutro, gmIntro, gmOutro, convIntro, convOutro, projIntro, projOutro, docsIntro, docsOutro, everyIntro, everyOutro, summaryBody }
```

Storage key: `chrome.storage.local["ccb_prompts"]`.
Backward-compat: old `framingBodies.{manual,gm}` and old `framingBody` are read on startup.

`reset(key)` accepts:
- `"framingAll"` — resets all 6 framing pairs (manual/gm/conv/proj/docs/every)
- `"framingManual"`, `"framingGm"`, `"framingConv"`, `"framingProj"`, `"framingDocs"`, `"framingEvery"` — one section
- `"summary"` — summary body only

Note: the prompts editor UI exposes the 6 FRAMING sections only; SUMMARY_PROMPT editing is intentionally hidden for now.

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
| `FRAMING_EVERY_PRE`    | Opens the per-message context prefix: `[[CCB:CTX]]` + intro (the `<memory>`/`<project>` body is built by `chat-features.js#buildPerMessagePrefix`, not by this pair) |
| `FRAMING_EVERY_POST`   | Closes it: outro + `[[CCB:CTX-END]]` — the user's own message follows in the same chat message |

(Legacy flat keys `FRAMING`, `FRAMING_MANUAL`, `FRAMING_GM` are also patched for backward compatibility but no code reads them directly anymore — the `framing` getters in `content.js` fall back to these only if PRE is undefined.)

`FRAMING_DOCS_*` is consumed by exactly one call site: `history-view.js#injectProjectDocuments()` (the footer "קבצים" button — the dedicated top-level file-injection action). One other place builds a literal `<documents>...</documents>` block but is deliberately **not** wired to this pair, since it's nested inside a different outer wrapper already: `chat-features.js#injectSelected()` (docs of a manually-selected project block, nested inside FRAMING_MANUAL/FRAMING_GM).

**`FRAMING_DOCS_POST` wording (2026-07-22):** `injectProjectDocuments()` never auto-sends, so the user's real request always follows the files in the SAME chat message, never as a separate turn. The original outro — `Reply only with "Files loaded." and wait for the first instruction.` — was therefore instructing the model to just acknowledge, while a real question sat immediately after it in the same message. Reworded to `End of the attached files. The user's actual request follows — respond to it only.`, matching the "end of context, the user's message follows" pattern `FRAMING_EVERY_POST` already uses for the per-message wrapper. No canned reply means nothing for `INJECTION_AUTORESPONSES`'s `"Files loaded."` entries to match going forward — they remain only in `history-view.js`'s copy, kept for filtering legacy saved blocks captured under the old wording.

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
| `DOC_MAX_CHARS_DEFAULT` | number      | Default per-document character cap for the "טען קבצים" injection (50000). Seed value only — the live value is `chrome.storage.local.docMaxChars`, editable in Advanced Options. Applies to ordinary documents only; code files and the generated structure doc are exempt |
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
| `chrome.storage.local.docMaxChars` | content.js     | `number` (chars) — per-document truncation cap for the "טען קבצים" injection. Loaded by `loadDocMaxChars()`, written by `setDocMaxChars(k)` (k in thousands, clamped 1–1000). Read at inject time via the `getDocMaxChars` dep in `history-view.js` |
| `chrome.storage.local.ccb_scanSettings` | content.js | `{ denyDirs, denyFilenames, codeExtensions, maxFileSizeKb }` — the GLOBAL code-project scan rules (see below) |
| `chrome.storage.local.ccb_autoInjectModeGm` | content.js | `"start"` \| `"every"` — WHEN General Memory auto-injects (conversation start vs prepended to every outgoing message). Loaded by `loadAutoInjectMode()` **before the first `tryAutoInject()`**, written by `setAutoInjectMode("gm", mode)`. See "Per-message auto-inject" in the chat-features section |
| `chrome.storage.local.ccb_autoInjectModeProject` | content.js | Same, for the active project's instructions — independent of GM's mode (2026-07-22 split). Written by `setAutoInjectMode("project", mode)`. If neither new key is set yet, `loadAutoInjectMode()` seeds both from the pre-split single key (`ccb_autoInjectMode`) as a one-time migration |

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
| `renderUnifiedBlocksList()`     | Renders `#list`: general blocks (no `projectId`) plus the active project's own blocks, the latter tagged with `.ctx-proj-tag` (project title) rendered right beside the title inside `.block-head`. Blocks owned by a *different* project stay hidden. Each row is `display:flex` (`.block` in `ui-styles.js`) so the checkbox and title share one line — `.block-main` already had `flex:1`/`.cb-wrap` `flex-shrink:0` but `.block` itself was missing `display:flex` until 2026-07-19, so rows rendered checkbox-above-title instead. `.block-head` uses `justify-content: flex-start` (not `space-between`, fixed 2026-07-19) so the tag packs tight against the title instead of floating to the row's far edge. No longer shows a tag-count badge next to the title (tags themselves still render below when present). **Renders no empty-state placeholder** (2026-07-21, at the user's request): with no blocks to show the list is simply left blank — the "בנק ריק / לחץ + להוספת בלוק ראשון" `.empty` div was removed. The `.empty` CSS rule in `ui-styles.js` stays, since the History tab's conversation list still uses it for both "no saved conversations" and "no search results". |
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
| `injectProjectDocuments()`                 | Thin try/catch wrapper around `runProjectDocumentsInjection()` — builds enabled doc contents and injects them wrapped in `FRAMING_DOCS_PRE`/`_POST` (its own editable framing pair — see prompts.js section below), then calls `docHandler.injectFilesToChat(project.id)` to re-attach any blob-only docs to the page's file input. Does **not** auto-send — the user reviews/edits the loaded text and sends it themselves, unlike most other injection paths. Per-doc truncation: `type: "code"` AND `type: "structure"` (the auto-generated `PROJECT_STRUCTURE.md`) are never truncated — a cut-off file silently loses the function it was pulled in for, and a cut-off tree looks complete but isn't (fixed 2026-07-21; the structure doc used to hit the same cap as ordinary text docs, so a large project's tree was silently chopped mid-listing). Other doc types are capped at `getDocMaxChars()` — the user-editable "מגבלת תווים למסמך" setting (`chrome.storage.local.docMaxChars`, default 50,000; was a hardcoded 10,000 until 2026-07-21, only ~3–5K tokens) — so a single huge attachment can't blow the context. The per-doc token header shown in the injected text is computed on the actually-injected (post-truncation) content. |

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

**Symbol extraction is AST-first (2026-07-23).** `.cs` and `.js`/`.jsx`/`.mjs`/`.cjs` files are parsed by **tree-sitter** (a real grammar-level parser compiled to WASM) in the background service worker — see the `background.js` section below for why a worker and the message protocol. `buildGraph` sends each language's files up front in one `parseViaTreeSitter(lang, files)` round-trip (batched internally: 50 files / 1.5M chars per message) and gets back per-file **facts**: for C# `{ namespace, usings, definitions, identifiers }`, for JS `{ imports }`. `buildCsharpSymbolTable` and the per-file analyzers consume facts when present (`analyzeCsharpFileFromFacts`/`analyzeJsFileFromFacts`) and **fall back to the regex path per file** otherwise — one unparseable file degrades only itself; a batch/worker failure (`parseViaTreeSitter` → null) degrades that language wholesale to regex, so a scan never breaks because of the parser. `.ts`/`.tsx` stay regex-only by scope decision (import syntax is simple; the regex there is high-confidence). Razor has no tree-sitter grammar — its markup scan stays regex but consumes the now-AST-accurate C# symbol table. The entire regex layer below is therefore **retained in full**, and everything documented about it still applies verbatim on the fallback path. The `[ccb-timing] dep-graph.buildGraph` log carries `csAst`/`csTotal`/`jsAst`/`jsTotal` — AST-parsed vs. total per language; both-zero with nonzero totals is the "worker/WASM failed to load" signature.

- **JS/TS/JSX**: resolves `import`/`export …from`/`require`/dynamic `import()` to files. Handles relative paths, `@/`/`~/` alias imports (tried against `src/` then project root), and is case-insensitive as a fallback. A relative import whose `..` segments climb past the scanned root resolves to **null** (2026-07-21) — it targets a file outside the project, and mapping it back into the root used to create a false edge whenever an in-project file happened to share the name.
- **C#**: builds a namespace/class symbol table (`buildCsharpSymbolTable`), then `analyzeCsharpFile` does a best-effort text scan for referenced type names, preferring matches in the file's own namespace or `using`s. `CS_TYPE_RE` covers modern declaration forms (2026-07-21): modifiers `readonly`/`ref`/`new`/`unsafe`/`file` and `record class` / `record struct` — previously `record struct Point` captured the keyword `struct` as the type name (poisoning the symbol table with a word that appears in nearly every file declaring any struct) and `readonly record struct` was missed entirely. The symbol table is built over the **strings-blanked** variant ("both", 2026-07-21), so a multi-line verbatim string containing `class X` at line start (code-gen templates) can't register a phantom type.
- **Razor (`.cshtml`/`.razor`)**: `analyzeRazorFile` reuses the same C# symbol table — it declares no types of its own, so any known type name found anywhere in the markup (`@model`, `@inject`, tag helpers, embedded `@{ }` C# blocks) becomes a dependency edge, filtered by `@using` directives (`extractRazorUsings`) the same way C# `using`s filter candidates. Code-behind pairs (`Foo.cshtml`↔`Foo.cshtml.cs`, `Foo.razor`↔`Foo.razor.cs`) additionally get a guaranteed bidirectional edge in `buildGraph()` regardless of whether either side textually references the other — they're one logical unit split across two files.
- All three share a comment/string scanner (`scanRegions`) so regex passes aren't confused by code-like text inside strings/comments; Razor gets its own `lang: "razor"` branch there for `@* ... *@` and `<!-- ... -->`. **C#-style `//` and `/* */` are NOT treated as comments in Razor** (2026-07-21): razor's "code" mode is mostly HTML markup with no string detection, so a URL in an attribute (`https://...`, `src="//cdn..."`) used to start a phantom line comment that blanked every type reference on the rest of that line — a silent under-inclusion, the exact failure direction this module promises to avoid. The cost is that a commented-out type name inside an `@{ }` block may over-include, which is the documented bias. None of the resolvers are 100% — dynamic dispatch (computed member access, reflection, `eval`, virtual/interface calls, DI-container-injected services, partial-view names passed as strings) can't be resolved statically.
- **CSS (`.css` only, 2026-07-26)**: `analyzeCssFile` resolves `@import "x"`/`'x'` and `@import url(x)` (quoted or bare) to files — deterministic, since CSS `@import` has no dynamic form. Every path resolves relative to the importing file via the existing `joinRelative` (`findCssCandidate`/`resolveCssImport`) — unlike JS, plain CSS has no bare-specifier/node_modules/alias convention, so there's no equivalent of `stripLeadingAlias`. A scheme-prefixed or protocol-relative URL (a CDN stylesheet, a web font service) resolves to `null` — it targets something outside the project, not a scanned file. `scanRegions` excludes `lang === "css"` from the generic `//` line-comment detection alongside Razor (CSS has no `//` comments; a URL inside `url(http://...)` would otherwise start a phantom comment and blank the rest of the declaration — same bug class as the Razor fix above) and adds minimal single/double-quote tracking so a value like `content: "/* not a comment */"` can't be misread as starting a real `/* */` comment. `.scss`/`.sass`/`.less` share the same `@import` syntax and could reuse this verbatim, but are out of scope for now (scanned as plain leaf files, same as before) — a scope decision, not a limitation of the approach.

`buildGraph(included)` is called right after `scanCodeProject` while file content is still in memory. `getTransitiveClosure` (BFS, cycle-safe) gives "dependencies"; `getDirectDependents` (one hop, not transitive) gives "dependents"; `getFullContext` combines both. `applyOverrides(graph, overrides)` (2026-07-27, for the per-file dependency manager — see the `code-tree.js` section) merges manual per-file edits onto a **copy** of the graph without mutating the input; every reader that might also need a manual edit reflected (the dependency manager, the "load with dependencies" menu/counts) calls this instead of reading `project.depGraph` directly.

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

## background.js — tree-sitter parser worker

The extension's only MV3 background service worker, added 2026-07-23 solely to host the tree-sitter WASM parsers for `dep-graph.js`. **Why a worker at all:** content scripts cannot reliably compile WebAssembly — WASM compilation in a content script is subject to the *host page's* CSP, and chat sites (gemini.google.com) don't allow `wasm-unsafe-eval`. The extension's own CSP does (manifest.json `content_security_policy.extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'"`), and that CSP governs the service worker. Side benefit: parsing runs entirely off the tab's main thread.

- **Module worker** (`"background": { "service_worker": "background.js", "type": "module" }`) because `wasm/tree-sitter.js` (the web-tree-sitter runtime) is ESM.
- **Assets** live in `wasm/`: `tree-sitter.js` + `tree-sitter.wasm` (runtime, `web-tree-sitter@0.25.6`), `tree-sitter-c-sharp.wasm` + `tree-sitter-javascript.wasm` (grammars, `@vscode/tree-sitter-wasm@0.1.4` — the JS grammar includes JSX). Loaded via `chrome.runtime.getURL` — **no `web_accessible_resources` entry needed**, since only the worker itself fetches them, not web pages.
- **Protocol** (from `dep-graph.js#parseViaTreeSitter` via `chrome.runtime.sendMessage`): `{ type: "ccbTsParse", lang: "cs"|"js", files: [{ path, content }] }` → `{ ok: true, results }` / `{ ok: false, error }`. Per-file results are `{ path, ok, ...facts }`; a single file's parse failure yields `{ path, ok: false }` without failing the batch.
- **Extraction is a manual cursor walk, not a tree-sitter query** — queries throw at compile time if a pattern names a node type the shipped grammar doesn't have (grammar versions drift); a walk switching on `node.type` simply doesn't match unknown types. C# walk collects: type declarations' `name` field (`class/interface/struct/enum/record/record_struct/delegate_declaration`), the first `namespace_declaration`/`file_scoped_namespace_declaration`, `using_directive` targets (`lastNameChild` — handles `using static` and `using X = ...` aliases), and **every `identifier` node** as the reference set (strings/comments are excluded by the grammar itself, which is the entire point). JS walk collects import specifiers from `import_statement`/`export_statement` `source` fields and `require(...)`/dynamic `import(...)` call expressions (string-literal arguments only — a template string with interpolation is skipped).
- **Lifecycle:** Chrome kills idle service workers; every message re-wakes it and `Parser.init` re-runs (cached per worker instance via `_initPromise`, languages lazy-loaded per `lang`). Init is ~100–300ms, dwarfed by any real batch.
- Verified end-to-end in Node (web-tree-sitter runs there too) by stubbing `chrome` and invoking the real message listener: 24 assertions on fact extraction (including the two historical regex bugs — `record struct` phantom symbol, string/comment immunity) plus a 14-assertion integration run of the real `buildGraph` against the real worker handler in both AST and worker-dead-fallback modes.

## tokenizer.js — real BPE token counting (2026-07-26)

Replaces the chars→tokens ratio as the *primary* token-counting policy. `config.js#estimateTextTokens` — still the single canonical entry point every module calls — now tries `window.__ccbTokenizer.countTokens(text)` first and falls back to the original Hebrew-aware heuristic whenever that returns `null`. **The heuristic is retained in full**, on the same "never break because of the new layer" principle as `dep-graph.js`'s regex fallback behind tree-sitter.

`countTokens` returns `null` (→ heuristic) in exactly three cases: the ranks aren't loaded yet (loading is lazy and async), loading failed, or the text exceeds `MAX_EXACT_CHARS`. A fourth, caller-driven bypass exists: `estimateTextTokens(text, { fast: true })` skips the tokenizer outright.

**Exact where it shows, fast where it's bulk (2026-07-27).** Real BPE is ~240× slower than the heuristic, and `scanCodeProject` estimates once per scanned file — enough to add ~20s to a 50MB project. The scan's per-file call therefore passes `{ fast: true }`; the conversation meter, `addDocument`, and the structure doc stay exact, being single interactive counts. The heuristic's **aggregate** error over a real 8.65M-char corpus is 1.81%, and scan estimates are only ever shown as an approximate file size in the tree, so the trade is one-sided. The flag is passed explicitly rather than letting each bulk caller keep its own copy of the heuristic — parallel copies drifting apart is the exact bug that made `estimateTextTokens` canonical in the first place.

A second bulk caller with the same shape was missed on the first pass: `history-view.js#runProjectDocumentsInjection`'s per-file token *label* (shown next to each file's name in the injected `<documents>` block) ran once per enabled document, same as the scan — for a code project with hundreds of files, this reintroduced the exact same synchronous, un-yielding slowdown in the "טען קבצים" flow itself (reported 2026-07-27 as "loading files into the chat box is very slow" on the affected machine). Fixed the same way, `{ fast: true }` on that call only. The function's *other* `estimateTokens` call — the final injection-total shown in the success toast — is deliberately left exact, since it's the one single interactive count in this flow.

| Decision | Why |
|---|---|
| Pure JS, not WASM | A content script is subject to the **host page's** CSP, and chat sites block `'wasm-unsafe-eval'` — the same constraint that put tree-sitter in `background.js`. Routing counts through the worker would make every count async and break the synchronous chain in `ctx-meter.js#measureMessage` / the `WeakMap` memo built on top of it. |
| `o200k_base`, not `cl100k_base` | Its multilingual vocabulary tokenizes Hebrew far more efficiently, and Hebrew accuracy is the whole reason the fallback heuristic has a separate Hebrew divisor in the first place. Costs 3.4 MB instead of 1.7 MB. |
| Data vendored, algorithm hand-written | The BPE merge loop + split regex are ~60 lines. Vendoring a *library* would have required a bundler, which this project deliberately doesn't have (DEPENDENCIES.md, "Why no build tooling"). |
| Lazy `load()`, fired from `content.js#init` | `init()` returns early on non-active sites, so only chat-site tabs ever fetch the 3.4 MB. The panel renders immediately on the heuristic and sharpens itself when the ranks resolve (~200–400 ms). |
| `web_accessible_resources` entry | A content script's `fetch` is subject to the page's origin, so the ranks file must be web-accessible — unlike `wasm/`, which only the worker reads. |
| `MAX_EXACT_CHARS = 500000` | Bounds a single synchronous call to roughly 100–200 ms. |
| Bulk callers pass `{ fast: true }` | **Real BPE is ~240× slower than the heuristic it replaced** (measured: 8.65M chars in 3.4s vs 15–56ms). `scanCodeProject` estimates once per file, so on a 50MB project the tokenizer alone added ~20s. Bulk scan estimates therefore take the heuristic path explicitly; single interactive counts stay exact. The aggregate error over a real corpus is **1.81%**, and those numbers are only shown as an approximate size in the tree and summed into the budget bar. |

**Inline `(?i:…)` is expanded manually** in the split regex. The official o200k pattern uses inline case-insensitive groups for the English contraction suffixes (`'s`/`'t`/`'re`/…); JS support for regex modifiers is too recent to rely on, so each is written out as an explicit character-class alternation. Everything else in the pattern is character-for-character the upstream one.

**Two caches, different lifetimes:** the module-level `_pieceCache` (`Map`, capped at 50,000 entries) memoizes per *split piece* — real text repeats heavily (whitespace runs, keywords, punctuation), so most BPE calls are cache hits. Separately, `ctx-meter.js`'s per-message `WeakMap` is keyed on content length, which does **not** change when the tokenizer finishes loading — hence `ctxMeter.resetTokenCache()`, called once from the load callback in `content.js#init`. Without it, a conversation already on screen at load time would keep its heuristic numbers for the rest of the session.

**One heuristic-era correction had to be scoped down:** `document-handler.js#estimateTokensForFile`'s markup branch divided its estimate by 1.2, compensating for character-counting over-weighting HTML/XML tags. A real tokenizer has no such bias, so the discount now applies only on the fallback path — leaving it unconditional would have under-counted every markup file by ~17%.

**Stored estimates are not retroactively recomputed.** `doc.estimatedTokens` is written at scan/add time; documents scanned before this change keep their heuristic numbers until the project is rescanned. Live displays (the conversation meter, the file-tree token sum) recompute from content and are exact immediately.

**Verification** (Node, mirroring the tree-sitter harness): 427/427 exact matches against `gpt-tokenizer`'s `o200k_base` encoder — 400 randomized fuzz strings over a mixed Hebrew/English/CJK/emoji/code/punctuation alphabet, hand-picked edge cases (empty, whitespace-only, contractions, URLs, repeated tokens), and whole repo source files. Plus 18 integration assertions covering the fallback ladder: fetch failure, HTTP error, `tokenizer.js` absent entirely, and over-cap input — each must still yield a sane heuristic number rather than throwing or returning `null` upward.

## inject.js — chat-input detection and text injection

`findInput()` locates the site's chat input: tries `CHAT_INPUT_SELECTOR` first, falls back to `document.activeElement`, then `INPUT_FALLBACKS`. `injectIntoInput(text, mode)` writes into whatever it finds — a native `<textarea>`/`<input>` or a `contenteditable` element — and returns `{ ok, error? }`.

**Contenteditable point-insertion, not read-and-replace (fixed 2026-07-27).** On the active site, `findInput()` resolves to a `contenteditable` `DIV` (the configured `CHAT_INPUT_SELECTOR` textarea selector doesn't match; `document.activeElement` is the fallback that actually fires). The original implementation, for every mode, read `el.innerText` to get the current value (layout-dependent — forces a synchronous reflow of the whole field) and then did `sel.selectAllChildren(el)` + `execCommand("insertText", ...)`, which selects and replaces the **entire** existing content. After "טען קבצים" the field holds hundreds of KB, so the next injection (prompts, conversation messages) paid to read and fully replace all of it — the reported "load files then load prompts hangs" symptom.

`prepend`/`append` modes insert **only the new text** at a collapsed caret (`document.createRange()` + `.collapse(atStart)`) instead of rebuilding the whole field — `O(new text)`, not `O(entire field)`. Emptiness (to decide whether `prepend`/`append` should just become a plain write) is checked via `textContent`, not `innerText` — same layout-independent-length principle as `ctx-meter.js`'s per-message memo.

**`execCommand("insertText")` itself was the real bottleneck, not just what it was applied to (fixed 2026-07-27, same day).** The point-insertion fix above only changed *where* the range pointed — it still called `document.execCommand("insertText", false, text)` to do the actual insert, and the user reported "טען קבצים" was still very slow afterward. Measured directly in a real browser (not a Node mock — `execCommand` and `Range` don't exist in Node): a synthetic contenteditable benchmark showed `execCommand("insertText", false, text)` **did not return within 60+ seconds for a ~300,000-character string** (many short, repetitive lines — i.e. code-shaped text), completely wedging the tab's main thread. The same insertion done via `Range.insertNode` on a manually built `DocumentFragment` completed **100K chars in ~100ms, 2M in ~2s, 5M in ~5.3s** — linear, not catastrophic. This is why the earlier fix (isolating the caret position) didn't resolve the complaint: the mechanism, not the selection scope, was the cost.

`insertRangeText()` now builds the fragment itself instead of calling `execCommand`: `buildLineFragment(text)` splits on `"\n"` and alternates plain `Text` nodes with real `<br>` elements, then `range.insertNode(frag)` places it, and the caret is explicitly moved to just after the last inserted node (`range.setStartAfter(last)`). Real `<br>` elements are used rather than raw `"\n"` characters inside one text node because a `contenteditable` isn't guaranteed to have `white-space: pre-wrap` — embedding literal newlines in a single text node risks them collapsing to a space visually, whereas `<br>` renders a line break unconditionally. This mirrors what `execCommand("insertText")` does internally for multi-line input, just without its apparently-unbounded internal cost for large/repetitive text. `replaceContentEditable` (the `replace` mode and empty-field case) uses the same `insertRangeText` helper, clearing existing children via `el.replaceChildren()` first instead of `sel.selectAllChildren` + `execCommand`. A rare fallback (if `Range`/`Selection` somehow throws) still reads `innerText` and rebuilds the string via `textContent`, since correctness there matters more than the cost of a path that's essentially never taken.

Verified with a 14-assertion suite run in an actual browser tab (not Node): exact final-content correctness for empty/prepend/append/replace (including that line breaks become real `<br>` elements, matched by count against the input's newline count), the textarea/`<input>` path is unaffected (still `setNativeValue`, untouched by this change), and a 3,000,000-character `replace` completes in ~1.4s.

## code-tree.js — inline file-tree picker

`renderInline(project, mount)` renders an interactive checkbox tree (folders + files) over a code project's scanned documents **inline** into the open project's documents section (`#projectDocumentsList`, mounted by `history-view.js#renderProjectViewDocuments` when `project.isCodeProject`) — not a separate modal. It builds its own shell (path search + "בחר הכל"/"נקה הכל" + token count) plus the tree body. The search input carries `.code-tree-search-input` (shares the `#search`/`#searchHistory` rule set in `ui-styles.js`) rather than being an unstyled bare `<input type="search">` — it previously fell through both selector lists and rendered with default browser search-input chrome. Each file row has a "deps" button opening a small menu (`תלויות`/`תלויים`/`הקשר מלא`) that calls into `dep-graph.js` via `history-view.js#enableFilesForProject` to bulk-enable the resulting closure. Reuses the shared `#hiDropdown` host element for that menu (via `deps.getShadow()`) but manages its own outside-click cleanup. **Each menu item shows a live count (2026-07-26)** — "תלויות (N)"/"תלויים (M)"/"הקשר מלא (K)" — computed in `openDepsMenu` only for the file whose menu is open, via the existing `getTransitiveClosure`/`getDirectDependents`/`getFullContext` (no batch computation, no new `dep-graph.js` function; that's deliberate — see below). If the project has no `depGraph` yet, the labels show with **no parenthesized count** rather than a fabricated `(0)`, since `loadWithDependencies` already knows to scan on demand in that case and `(0)` would misleadingly read as "confirmed empty." Per-view state (`_query`, `_collapsedPaths`) survives same-project re-renders and resets when switching projects. Only `type: "code"` docs appear in the tree; the `type: "structure"` doc is injected but not shown (parity with the former modal). The shell's token-count label counts **only enabled `type:"code"` docs** as "קבצים נבחרים" (2026-07-21 — the always-enabled structure doc used to make a fresh project read "1 קבצים נבחרים" with nothing ticked), while the token **sum** still spans every enabled doc including structure, because that is exactly what the footer inject sends. `loadWithDependencies` reports the count returned by `enableFilesForProject` (files that actually matched documents) and warns "סומנו X מתוך Y — ייתכן שנדרש רענון סריקה" when a stale graph made some closure paths miss.

**Folder-aware search (2026-07-26).** `matchesQuery(path, q)` replaces the inline `d.name.toLowerCase().includes(q)` filter. Typing a folder name surfaces every file beneath it *by intent* rather than as a side effect of substring-on-path, and a slash-bearing query (`src/utils`) is matched segment-wise at any offset. Plain substring matching is still tried first, so every query that worked before still works. Segments are compared with **`startsWith`, not `includes`** — `includes` would make `src/utils` also match `src/myUtilsHelper.js`, while `startsWith` still supports partial typing (`areas/adm` → `Areas/Admin/...`).

**Design note on the deps-menu counts vs. a tree-wide badge (2026-07-26).** The original design for this feature put a `↓N ↑M` badge on every file row, computed once per render via a new `dep-graph.js#getAllEdgeCounts(graph)` (batches the reverse-graph build once instead of once per row). The user asked instead for the counts to live only inside the per-file menu that actually injects into the chat — not as a permanent fixture cluttering the tree. Since counting is now per-click rather than per-render-of-every-row, no batch helper is needed here. (The dependency-management screen that followed, feature 6 below, was itself later re-scoped from a project-wide table to a per-file screen, so `getAllEdgeCounts` was never actually built — nothing in the shipped code needs a project-wide batch count.)

**Token-budget bar (2026-07-26).** Below the token-count label sits `.code-tree-budget` — the current selection as a percentage of the context window, so the sum can be judged without mentally comparing it to the Advanced Options value. It **reuses the context meter's own classes** (`.ctx-bar-track`/`.ctx-bar-fill`/`.ctx-pct`) and its exact severity thresholds (>50% `warn`, >75% `high`, >90% `crit`) rather than defining a parallel palette, so every place in the panel that talks about context-window usage looks and behaves identically. `updateBudgetBar` is driven from `updateTokenCount`, so it refreshes on the same events the label already did. It hides itself when the window is 0/unset (rather than dividing by zero) and clamps the fill at 100% so an over-budget selection can't overflow the track. `getCtxWindow` had to be added to this module's `init` deps in `content.js#initModules` — it previously had no access to the context-window size at all. `history-view.js#appendDocsBudgetBar` renders the same bar for a regular project's flat document list.

**Read-only file preview, full-pane not dialog (2026-07-27, scope changed).** Each file row's second action button (eye icon, `openPreview(doc)`) opens `#filePreviewView` — the same full-pane takeover layout as `#conversationView` (`ui-styles.js`'s positioning rule is written as `#conversationView, #filePreviewView { ... }`, both toggled by the same `.cv-open` class, both reusing the `.cv-shell`/`.cv-header` markup), rather than a `ui-modals.js`-style dialog overlay. This was a deliberate deviation from the original plan (a small ~720px centered dialog) at the user's explicit request — the same category of change as the deps-menu-vs-tree-badge decision above. `openPreview` reads content through the existing batched `docHandler.getCodeContents([id])`, measures the token count **live** via `estimateTextTokens` rather than trusting `doc.estimatedTokens` (which can still hold a stale pre-real-tokenizer value for documents scanned before that feature landed), and caps the displayed text at 20,000 characters — display-only, the cap never affects what a later injection would send; the meta line always states the file's true length and adds a truncation note when the cap was hit. Content is written via `.textContent`, never `.innerHTML`, since a scanned file can contain arbitrary text. Because this view and the conversation preview occupy the identical fixed, same-z-index screen region, opening either one closes the other (`openPreview` calls `historyView.closeConversationView()`; `history-view.js#openConversationView` calls the reverse, `window.__ccbCodeTree.closeFilePreview()`), and `content.js` calls `closeFilePreview()` at every point it already calls `closeConversationView()` (the panel's Escape handler, tab-switch, panel close) plus the view's own `#fpBack` button — so a preview can never persist open behind a tab switch or a fully closed panel. `closeFilePreview()` clears `#fpBody`'s `textContent` on close so a large file's text isn't left sitting in the DOM.

**Per-file dependency manager (2026-07-27, feature 6 of the batch, re-scoped mid-build).** The original design was a project-wide table screen (a new `dep-manager.js` module listing every file with its edge counts, click-through to an editor) — the user stopped that build and asked instead for each file's own existing "אפשרויות תלויות" menu to gain a "ניהול תלויות" item opening a screen scoped to just that one file. The reverted table design is not preserved on any branch (unlike the deps-badge and file-preview scope changes above, which have a preserved alternate on `feature/nine-panel-features`) — it was deleted outright before this rebuild. The shipped version adds a 4th `openDepsMenu` item (below a separator) calling `openDepsManager(doc)`, which opens `#depManagerView` — a fourth full-pane takeover view added to the same shared selector as `#conversationView`/`#filePreviewView` in `ui-styles.js`, closed defensively everywhere those two already are (Escape, tab-switch, panel close, and by each other's open). It renders the file's outgoing dependencies as removable rows plus an add-dependency input (filtered suggestions from the project's own code-file list, excluding the file itself and already-listed deps), and its incoming dependents as a read-only list — dependents are derived from other files' outgoing edges, so editing them only makes sense at the source file. A new `code-tree.js#effectiveGraph()` (`dep-graph.js#applyOverrides(graph, overrides)` applied to `_project.depGraph`) is now the single read path for the graph — both this screen and the pre-existing "load with dependencies" menu/counts go through it, so a manual edit shows up everywhere the graph is read, not just inside the manager. Edits are stored as **deltas against the raw scanned graph**, not the effective one (`project.depGraphOverrides = { [path]: { added: [], removed: [] } }`, persisted via a new `history-view.js#setFileDependencyOverride`) — kept deliberately separate from `project.depGraph`, which `rescanCodeProject` overwrites wholesale on every scan, so a manual choice survives a rescan and keeps overriding the freshly-scanned default rather than being clobbered by it. `applyOverrides` never mutates its input graph, since `_project.depGraph` is read repeatedly across menu opens and must stay pristine for the delta math (toggling an edge on/off must not accumulate stale override entries) to stay correct.

**Dependency manager UI rework (2026-07-28), per direct user feedback on the above.** Three changes, all inside `code-tree.js`, none touching the override persistence described above. **(1)** The outgoing list no longer uses a remove-only button — each row now has a checkbox reflecting membership in the *effective* graph, and the row set itself is the union of the raw scanned edges and `ov.added` (`allDeps` in `renderDepsManager`), not just the effective deps. Unchecking a row that exists in the raw graph adds it to `ov.removed` exactly as before, but its row **stays rendered** (styled via `.dm-dep-excluded` — dimmed, struck through) since it's still in `allDeps`; unchecking a row that only exists via `ov.added` removes it from `ov.added` (the existing `removeDepEdge` branch already did this), so on the next render it's gone from `allDeps` entirely — it has no scanned origin worth remembering. This is a pure rendering change: `removeDepEdge`/`addDepEdge`'s delta logic against the raw graph was already exactly what this needed. **(2)** The add-dependency section gained a persistent, collapsible file-map (`dmRenderTreeNode`, `.dm-add-tree`) below the existing search box, because a text-only search wasn't enough to *discover* a dependency by browsing. It's a dependency-manager-local tree walker over the same `buildTree()` used by the main inline tree, deliberately not reusing that tree's `renderNode` (wired to `doc.enabled` checkboxes and bulk folder-enable, neither applicable to "click a file to add one edge"). Every folder starts **collapsed** by default — the opposite of the main tree's default — tracked in its own `_dmExpandedPaths` Set (membership = explicitly opened, inverted from the main tree's `_collapsedPaths` = explicitly closed), reset whenever `openDepsManager` opens a file. Typing in the search box only rebuilds the tree container (`refreshAddTree()`), never the whole manager body, so the input never loses focus mid-keystroke — same discipline as the original suggestion-list design it replaces. **(3)** The read-only dependents section's label was reworded to state plainly, in the UI itself, why an edit there isn't possible ("...מחושב אוטומטית מהתלויות של הקבצים האחרים... כדי להוסיף/להסיר קישור יש לפתוח את מסך ניהול התלויות של אותו קובץ אחר") — the user asked why dependents couldn't be selected, and the answer is now visible on the screen rather than only in this doc. Wording only; the section's read-only behavior is unchanged.

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
| `tryAutoInject()`       | Starts/resumes the poll for a chat that is both mounted **and empty**, then injects whichever of GM / the active project's instructions is currently in `"start"` mode, clicks send. Re-entrant: its own programmatic new-chat click calls it again, which resumes the in-flight attempt instead of restarting its clock. **No blanket bail for `"every"` mode** — `_autoInjectPayload()` excludes each source independently, so a source set to `"every"` simply contributes nothing here (handled instead by the per-message path) while the other source, if `"start"`, still injects normally — see "Per-message auto-inject" below |
| `autoInjectTick()`      | One poll step (150ms cadence). Phase 1 waits untimed for `inject.findInput()`; phase 2 waits for `getMsgCount() === 0`, with a 2.5s settle window and a 10s cap — see the transition-timing note below |
| `_getActiveProjectInstructions()` | `## title\ncontent` for the active project (`state.currentProjectId`), or `null`. **Instructions only**, never the project's enabled documents (tens of thousands of tokens for a code project) — those stay behind the explicit footer `#injectDocsBtn` |
| `_autoInjectPayload()`  | Builds `{ text, hasGm, hasProject }` — GM block (if `autoLoad` + content) and/or the project-instructions block, wrapped in `FRAMING_GM_*` / `FRAMING_PROJ_*`, joined into ONE injection |
| `_doInject()`           | Guarded by `state.gmAutoInjected`; injects `_autoInjectPayload().text` and clicks send    |

**Auto-inject at conversation start** covers two independent sources, either of which alone triggers it:

- **General Memory** — gated on `gm.autoLoad` + non-empty content (unchanged).
- **Active project instructions** — gated on a project being active (`state.currentProjectId`), `project.autoLoad !== false`, + non-empty `content`. `project.autoLoad` is an explicit per-project toggle, built dynamically inside `history-view.js#renderProjectInstructionsCard` (same `.toggle` markup as GM's, wired inline — no static id, no `content.js#wireEvents` entry). **Missing `autoLoad` defaults to ON** — both the toggle's checked state and the actual gate treat `undefined` as `true`, so older projects (created before the toggle existed) keep auto-loading without a migration step. The instructions card's `.auto-badge` ("נטען אוטומטית") reflects the toggle state, not the content — it shows even when instructions are empty, since it communicates intent ("this project *will* auto-load once you write something"), matching the GM card's badge pattern.

Both are concatenated into a **single** `injectIntoInput(..., "prepend")` call (two sequential injections are unreliable on Gemini — same reason as the continuation flow). The payload is computed **at inject time**, not when `tryAutoInject` is called: the wait for a usable chat is unbounded in its first phase, so the user may switch project or edit GM in between, and reading late keeps the injection consistent with the current selection.

#### Why the "empty chat" wait is a poll, not a single check (2026-07-21)

Both triggers that reset auto-inject state — `content.js#installNewChatBtnWatcher`'s delegated click listener and its `ccb:urlchange` handler — are registered with `capture: true`, so they run **before** the site's own handler has begun tearing down the current conversation. At that instant the previous chat's message nodes are all still in the DOM.

The original code read `msgCount` once, right there, and branched on it. On the internal chat site that meant a single click on "new chat" always looked like "user is sitting in an existing conversation", so it re-clicked the new-chat button — which re-entered the same capture listener, called `tryAutoInject()` again, saw the same stale DOM, and clicked again, recursing until the stack overflowed. Nothing was injected. By the time the user clicked a second time the DOM had settled, `msgCount` was 0, and injection worked — the reported "only works if I click twice". (A Node harness reproduces both halves: the pre-fix module raises `RangeError: Maximum call stack size exceeded`; the fixed one injects on the first click.)

The fix replaces that one-shot read with `autoInjectTick()`, a 150ms poll governed by three separate timings:

| Timing | Value | Why |
| --- | --- | --- |
| wait for `findInput()` | untimed | A login screen or slow SPA can take minutes to mount the chat; this phase must never expire. |
| `AUTO_INJECT_SETTLE_MS` | 2500ms | Grace for an in-flight transition to drop the old messages. Only after this does a non-empty chat count as "genuinely an existing conversation" worth clicking new-chat for. |
| `AUTO_INJECT_TIMEOUT_MS` | 10000ms | Overall cap on the wait-for-empty phase, so a chat that never empties stops polling instead of looping forever. |

`_autoInjectClickedNewChat` ensures the new-chat button is clicked at most once per attempt, and `tryAutoInject()` treats a call arriving while a poll is already in flight as *resuming* that attempt (keeping `_autoInjectReadyAt` and the clicked flag) rather than starting a fresh one — together these are what make the re-entrancy terminate. Pending-timer guards compare against `null`, not truthiness, since a timer id of `0` is falsy.

Both blocks are prefixed with `[[CCB:INJECTED]]` via their FRAMING, so `captureConversation` filters them out of saved conversations, and the AI's canned replies (`"Context loaded."`, `"Project guidelines loaded."`) are already in `INJECTION_AUTORESPONSES`.

### Per-message auto-inject ("בכל הודעה" mode, 2026-07-22 — split into independent GM/project settings same day)

Two separate settings, `chrome.storage.local["ccb_autoInjectModeGm"]` and `["ccb_autoInjectModeProject"]` (each `"start"` default / `"every"`), independently decide **WHEN** GM and the active project's instructions auto-inject — a source in `"every"` mode rides on every outgoing message, a source in `"start"` mode injects once at conversation start (or not at all if `autoLoad` is off). **WHAT** is unchanged — still the per-card `autoLoad` toggles. Originally one shared setting; split the same day the user asked for GM and project instructions to be independently configurable. Owned by `content.js` (`loadAutoInjectMode()` loads both keys in one `chrome.storage.local.get` call, migrating from the old single `ccb_autoInjectMode` key if the new ones are unset; `setAutoInjectMode(source, mode)` where `source` is `"gm"` or `"project"`; `getAutoInjectMode(source)` reads the corresponding state field — the `docMaxChars` load/set pattern, now parameterized by source). Loaded in `init()` **before** the first `tryAutoInject()`, since a source in `"every"` mode is excluded from the start injection. Chosen from the Advanced Options selects (`#ccb-auto-inject-mode-gm` / `#ccb-auto-inject-mode-project`) or by clicking the live auto-badge on the corresponding card (`.auto-badge-live` on the GM card flips only `getAutoInjectMode("gm")`; on the instructions card, only `("project")` — text "נטען בתחילת שיחה" ↔ "נטען בכל הודעה", re-rendering via `render()` after a flip).

For whichever source(s) are in `"every"` mode:

| Piece | Behavior |
| --- | --- |
| `_isGmEveryMode()` / `_isProjectEveryMode()` / `_hasEveryModeSource()` | Thin wrappers over `getAutoInjectMode("gm"/"project")`. `_hasEveryModeSource()` is the interceptor's cheap early-out gate — checked before any DOM traversal, since the listeners fire on every click/keydown page-wide. |
| `installSendInterceptor()` | Installed once in `chat.init()` (active-site pages only, since `initModules` runs from `mountUI`). Capture-phase listeners on **`window`** (not `document` — in the capture phase window listeners run before document listeners, so a site that delegates its send handling at document-capture level, registered before the content script, still can't read the input ahead of the prepend) for `pointerdown`/`mousedown`/`click`/`keydown`. The ladder starts at **`pointerdown`** — the press itself, mirroring Enter's keydown timing: it precedes the click that fires the site's send, so the input is mutated before the send handler reads it. (2026-07-22: a hover/`pointerover` trigger was tried and reverted the same day — it filled the input on every stray mouse pass over the button, which the user rejected; the mouse misses that motivated it turned out to be send-**detection** bugs, fixed by the `[class*="send"]` heuristic in `_isSendClick`, not timing.) The `[[CCB:CTX]]` marker check makes the event series idempotent (only the first prepends). A `console.log("[ccb] per-message context prepended via", e.type)` line reports which event won. **Inert unless `_hasEveryModeSource()` is true** — checked live per event, so flipping either source's mode needs no listener add/remove. |
| `_interceptSend(e)` | Detects a send: pointerdown/click inside the send control (`_isSendClick()` — resolved from the **click target upward** via `closest`, never via `document.querySelector`, because Gemini keeps multiple elements matching `SEND_BUTTON_SELECTOR` (mic/send icon swaps, stale copies) and the first document match isn't necessarily the clicked one — a real bug: mouse-click sends went out unprefixed; also listens on `pointerdown` in case the site's send triggers before the click phase — an early prepend is harmless since the marker check stops the later click from wrapping twice), or plain Enter in the chat input (not Shift+Enter, not IME composition). Skips empty inputs and inputs already carrying `[[CCB:CTX]]` or `[[CCB:INJECTED]]` (a manual load the user is sending — never double-wrap). Then **prepends `buildPerMessagePrefix()` synchronously and lets the original event proceed** — the site's own handler sends the combined text. Deliberately NOT block-and-replay (`preventDefault` + synthetic re-click): on Gemini the send listener is bound to the inner icon, not the wrapping `<button>`, so the first implementation's synthetic click silently sent nothing (2026-07-22 bug: Enter added context but needed a second Enter; mouse clicks did nothing). The mutate-and-let-through path is safe because `setInputValue` dispatches its input events synchronously during the capture phase — the page framework's model is updated before the site's (target/bubble-phase) send handler runs; worst case if detection misses is an unprefixed send, never a blocked one. |
| `buildPerMessagePrefix()` | Includes GM's `<memory>` block only if `_isGmEveryMode()`, and the instructions' `<project>` block only if `_isProjectEveryMode()` — a source whose own mode is `"start"` is excluded here and handled instead by `_autoInjectPayload()`/`tryAutoInject()` at conversation start. Wrapped in `FRAMING_EVERY_PRE`/`POST` — computed fresh per send, so mid-conversation project switches/GM edits/mode flips apply to the next message. |
| `_autoInjectPayload()` | Mirror image: includes GM only if its mode is NOT `"every"` (i.e. `"start"`), and instructions only if the project's mode is NOT `"every"` — so each source is handled by exactly one of the two paths, never both, never neither. |
| `tryAutoInject()` | No blanket "every mode" bail — relies on `_autoInjectPayload().text` being empty once every remaining source is either absent or itself `"every"`. This is what makes a mixed combination (e.g. GM `"every"` + project `"start"`) work correctly: the poll still runs and injects the project's instructions alone at conversation start, while GM rides per-message. |
| `captureConversation()` | The prefix rides **inside the user's real message**, so the `[[CCB:INJECTED]]` drop-the-whole-message rule can't apply. The markers are `[[CCB:CTX]]`…`[[CCB:CTX-END]]` instead, and capture **strips** everything through `CTX_END_MARKER`, keeping the user's text — saved conversations stay clean. |
| `saveChat()` | Its programmatic summary-prompt send click is wrapped in `_sendBypass` — the summary prompt is a standalone instruction, not a user message to wrap with per-message context. |

The framing is the 6th editable pair (`everyIntro`/`everyOutro` in `prompts.js`, reset key `framingEvery`, editor section "מעטפת טעינה בכל הודעה"). Unlike the other five pairs its outro has no canned "Reply only with X" (the model must answer the user's actual request in the same message), and `prompts.js` stores the pair **trimmed**, re-adding structural newlines in `applyToRawConfig` (`CTX_MARKER` prefix / `CTX_END_SUFFIX` suffix), so an edited value composes identically to the default.

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

**Conversation-meter cost control (2026-07-21).** The site selectors' `messageText()` reads `.innerText`, which is layout-dependent, so reading it forces a synchronous reflow. `estimateTokens()` runs from a `subtree: true` MutationObserver on the chat container, and a streaming AI response mutates that subtree continuously — so the original unthrottled `new MutationObserver(() => updateCtxMeter())` re-read and re-scanned **every message in the conversation on every mutation**, forcing a layout each time. Cost scaled with total conversation length and was paid many times per second, which is why the tab got progressively slower the longer a chat ran and why restarting the browser (e.g. via the hardware-acceleration toggle, which relaunches Chrome) appeared to "fix" it for a while. Two changes, both contained in this module:

- **Throttle** — the observer calls `scheduleCtxMeterUpdate()`, which coalesces a burst into one trailing recompute every `CTX_METER_THROTTLE_MS` (400ms). `setTimeout`, deliberately not `requestAnimationFrame` (suspended in backgrounded tabs — same rule as the progress indicator). The pending-timer guard checks `!== null` rather than truthiness, since a timer id of `0` is falsy and would let every mutation schedule its own update.
- **Per-message memo** — `measureMessage()` caches `{ rawLen, chars, tokens }` per message element in a `WeakMap`, using `textContent.length` (layout-independent, unlike `innerText`) as the change detector. Only a message whose length actually changed pays for the `innerText` read plus the token scan, so a recompute during streaming costs one element instead of the whole conversation. An edit preserving the exact character count is missed — acceptable for a length-derived estimate.

Token math is not implemented here anymore (2026-07-21): the conversation meter estimates each message via config.js's shared Hebrew-aware `estimateTextTokens` (summed per message), and per-file estimates delegate to `window.__ccbDocHandler.estimateFileTokens` at call time — this module used to carry a near-identical fork of the file heuristics and the two drifted (different return shapes, different extension lists). The call-time delegation is load-order-safe even though ctx-meter loads before document-handler in the manifest, since estimates only run from user file events; it mirrors the established cross-module pattern of document-handler calling `window.__ccbCtxMeter.queueFilesForInjection`. ctx-meter still owns the `{ name, tokens, size }` wrapper shape its dropdown consumes, plus a crude `size/50` last-resort fallback.

| Function                      | Description                                                                  |
| ----------------------------- | ---------------------------------------------------------------------------- |
| `init(deps)`                  | Wires up to content.js (shadow accessor, MSG_SELECTORS, ctxWindow getter, dropdown close/cleanup) |
| `update()`                    | Recalculate + redraw the meter                                              |
| `resetTokenCache()`           | Drops the per-message `WeakMap` memo. Called once from `content.js#init` when the lazy tokenizer finishes loading — the memo is keyed on content *length*, which doesn't change when the counting policy does, so an on-screen conversation would otherwise keep its heuristic numbers all session |
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
