# Context Bank Extension — Project Index

Chrome extension (MV3) — floating sidebar for chat sites (Gemini today) that manages context blocks, general memory, projects, and conversation history.

## File Map

| File              | Role                                                                          | ~Lines |
| ----------------- | ----------------------------------------------------------------------------- | ------ |
| `config.js`       | Site selectors + active site toggle + FRAMING / SUMMARY_PROMPT defaults       | 180    |
| `prompts.js`      | Loads prompt overrides (editable parts only) from storage, per-type FRAMING   | 265    |
| `storage.js`      | `loadBlocks` / `saveBlocks` → `window.__ccbStorage`                           | 20     |
| `inject.js`       | Input detection + text injection → `window.__ccbInject`                       | 80     |
| `push.js`         | Page shift when sidebar opens → `window.__ccbPush`                            | 40     |
| `ui-styles.js`    | Shadow DOM CSS → `window.__ccbCSS`                                            | 1990   |
| `ui-template.js`  | SVG icons + PANEL_HTML → `window.__ccbTpl`                                    | 400    |
| `ctx-meter.js`    | Context window usage meter → `window.__ccbCtxMeter`                           | 400    |
| `ui-modals.js`    | Dialogs + settings popover + prompts editor → `window.__ccbModals`            | 355    |
| `fs-handles.js`   | IndexedDB storage for directory handles → `window.__ccbFsHandles`             | 80     |
| `document-handler.js` | Project documents: files/URLs/text + code-project scanning → `window.__ccbDocHandler` | 800    |
| `dep-graph.js`    | Static import/reference graph for code projects → `window.__ccbDepGraph`      | 415    |
| `code-tree.js`    | Inline file-tree picker for code-project docs (rendered into the project view) → `window.__ccbCodeTree` | 335    |
| `history-view.js` | Projects (rendered into Context tab) + history list + conversation preview + document/code-project UI → `window.__ccbHistoryView` | 1712   |
| `chat-features.js`| GM + capture + manual injection + inline save → `window.__ccbChat`            | 465    |
| `content.js`      | Orchestrator: state, mount, wireEvents, edit form, context list, ctx sub-views, init | 1420   |
| `summarizer.js`   | Watches for `[[CCB:SAVE]]` marker in AI responses                              | 120    |
| `popup.html/js`   | Toolbar popup → sends `togglePanel` to active tab                              | —      |
| `manifest.json`   | MV3 config, load order, permissions                                            | —      |
| `ARCHITECTURE.md` | Full architecture reference                                                    | —      |

**Manifest load order:**
`config` → `prompts` → `storage` → `inject` → `push` → `ui-styles` → `ui-template` → `ctx-meter` → `ui-modals` → `fs-handles` → `document-handler` → `dep-graph` → `code-tree` → `history-view` → `chat-features` → `content` → `summarizer`

## Module split rationale

`content.js` is the orchestrator: state, mount, the central `wireEvents` switchboard, the edit-form, the small context-list render, and init. Everything else lives in a focused module:

- **`ui-modals.js`** — pure overlay/dialog UI. No business state. Backup export/import stays in `content.js` because it mutates `state.blocks`.
- **`history-view.js`** — the active project (global selection, persisted) + conversation world. Owns `loadActiveProjectId`/`setActiveProjectId`, the project instructions/documents rendering for whichever project is active (`renderProjectContext`), project bookmarking/scanning/file-picking, the History-tab conversation list (filterable by the active project), the per-message preview panel, and all row/project dropdowns. Owns the framing builders (`buildConversationInjectionText`, `buildProjectSectionText`, `formatTranscript`, `buildHistoryMessages`). (Kept as its own module even though the project bar/context now render above and inside the Context tab — the split is by responsibility, not by which tab hosts the DOM.)
- **`document-handler.js`** — project document lifecycle (add/remove/toggle, token estimation, Office text extraction) and the code-project folder scanner (`scanCodeProject`, `syncCodeProjectDocuments`). No UI of its own.
- **`dep-graph.js`** — pure, static (no-AI) import/reference graph builder for scanned code projects (JS/TS/JSX + C#/Razor). No UI, no storage access.
- **`code-tree.js`** — the inline file-tree picker for hand-selecting which code-project files to inject, rendered directly into the open project's documents section (not a modal), including the "load with dependencies" menu backed by `dep-graph.js`.
- **`fs-handles.js`** — IndexedDB wrapper for storing `FileSystemDirectoryHandle` objects (chrome.storage.local can't hold them).
- **`chat-features.js`** — interactions with the page's chat. General Memory render+auto-inject, manual injection of selected blocks, "save chat" capture flow, inline 💾 save button on AI messages.

Each module exposes `init(deps)` (matching the `ctx-meter.js` pattern). `content.js` calls each module's `init` during `mountUI` and passes a shared `state` object plus the functions the module needs.

## Key Globals

- `window.__ccbRawConfig` — exported by `config.js`, patched by `prompts.js`, consumed by all modules
- `window.__ccbPromptsAPI` — `ready`, `getEditable`, `getLocked`, `save`, `reset`
- `window.__ccbStorage` — `{ loadBlocks, saveBlocks }`
- `window.__ccbInject` — `{ findInput, injectIntoInput }`
- `window.__ccbPush` — `{ pushPage }`
- `window.__ccbCSS` — CSS string
- `window.__ccbTpl` — `{ IC, PANEL_HTML }`
- `window.__ccbCtxMeter` — `init`, `update`, `watchConversation`, `watchFileInputs`, `openFilesDropdown`, `cleanup`, `getUploadedFiles`
- `window.__ccbModals` — `init`, `showConfirm/Choice/Prompt/ProjectPicker`, `openSettings/closeSettings`, `openPromptsEditor/closePromptsEditor/savePromptsEditor/resetPromptsEditor`
- `window.__ccbHistoryView` — `init`, `render*` (incl. `renderProjectContext`, `renderProjectInstructionsCard`), `loadActiveProjectId/setActiveProjectId`, `open*/close*`, `getProjects/getCodeProjects/getProjectById/getConversationProject`, `buildHistoryMessages/buildConversationInjectionText/buildProjectSectionText/formatTranscript`, `sync*` collapse helpers, `addProject`, `renderProjectSelect`, `renderProjectViewDocuments`, `openAddDocumentDialog`, `injectProjectDocuments`, `createCodeProjectBookmark`, `rescanCodeProject`, `loadCodeProjectAll`, `enableFilesForProject`, `setAllCodeDocsEnabled`
- `window.__ccbChat` — `init`, `getGM`, `renderGeneralMemory`, `tryAutoInject`, `injectSelected`, `saveChat`, `inlineReady`, `startMsgObserver`, `stopMsgObserver`
- `window.__ccbDocHandler` — `init`, `addDocument`, `removeDocument`, `toggleDocument`, `getDocumentContent`, `getOrExtractContent`, `getEnabledDocuments`, `injectFilesToChat`, `estimateTokens`, `estimateFileTokens`, `getFileType`, `isLikelyTextFile`, `scanCodeProject`, `buildStructureMarkdown`, `syncCodeProjectDocuments`, `removeCodeContent`
- `window.__ccbDepGraph` — `buildGraph`, `getTransitiveClosure`, `getDirectDependents`, `getFullContext`
- `window.__ccbCodeTree` — `init`, `renderInline(project, mount)`
- `window.__ccbFsHandles` — `put(id, dirHandle)`, `get(id)`, `remove(id)`, `verifyPermission(dirHandle, mode?)`
- `window.__ccb` — public API for `summarizer.js`: `{ MSG_SELECTORS, blocks, saveBlocks, loadBlocks, setStatus, renderPanel }`

## Storage Keys

| Key                                | Owner          | Shape                                                  |
| ---------------------------------- | -------------- | ------------------------------------------------------ |
| `chrome.storage.local.blocks`      | content.js     | `{ [id]: block }` — see schema below                  |
| `chrome.storage.local.ccb_prompts` | prompts.js     | `{ manualIntro, manualOutro, gmIntro, gmOutro, ... }` |
| `chrome.storage.local.ctxWindow`   | content.js     | `number` (tokens, used by the meter)                  |
| `chrome.storage.local.activeProjectId` | history-view.js | `string \| null` — the globally selected project (see Features overview) |

## Storage Schema (blocks)

```
{ "b_<ts>_<rand>": { id, title, content?, messages?, tags?, kind?, updated, pinned?, autoLoad?, projectId?,
                     documents?, isCodeProject?, dirHandleId?, lastScanned?, depGraph? } }
```

`documents` (kind: "project" only): array of `{ id, name, type, size, added, enabled, preview, estimatedTokens, content?, hasBlob? }`. File blobs live in `chrome.storage.local["docBlob_<id>"]`; code-project file text lives in `chrome.storage.local["codeContent_<id>"]` — never inline on the doc, so scanning a large folder doesn't bloat every `saveBlocks()` call. Requires the `unlimitedStorage` permission.

- No `kind` → Context tab block (general if no `projectId`; project-owned if `projectId` is set)
- `kind: "conversation"` → History tab; may have `projectId` (stamped from the active project at creation)
- `kind: "project"` → the single unified project entity — instructions (`content`), own text blocks (child blocks with `projectId`), documents, and/or code-project scanning. Selected via the global project bar above both tabs.
- `id: "__general_memory"` → General Memory card (kind: `"general_memory"`, has `autoLoad`)

**`kind: "ctx-project"` is retired.** It was the old Context-tab "grouping of text blocks only" entity. On load, `content.js#migrateCtxProjects()` (idempotent) rewrites any surviving `ctx-project` block to `kind: "project"` (filling `documents: []`, `isCodeProject: false`), keeping the same `id` so child blocks' `projectId` links are preserved. There is now one project concept, not two.

**Project-owned text blocks (`projectId` field):**
A regular context block (no `kind`) may have `projectId` pointing to a `kind: "project"` block. They render together with general blocks in the Context tab's unified `#list` via `content.js#renderUnifiedBlocksList()` — project-owned ones only appear while their project is the active one (global selector), tagged with `.ctx-proj-tag` (project title, always visible). General blocks (no `projectId`) always show regardless of the active project.
Since the shared `#editView` add/edit form covers the whole panel (no project context visible behind it), `openEdit()` in `content.js` shows a small `#editProjectTag` pill (folder icon + project title) above the title field whenever the block being edited has a `projectId` — or, for a brand-new block, whenever a project is currently active (`state.currentProjectId`) — otherwise it's hidden.

## Active Site

Change `ACTIVE_SITE` in `config.js` → `"gemini"` or `"internal"`.
The UI and summarizer are gated to the active site's `AUTO_OPEN_URLS`, so they stay inert on other sites.

## Features overview

- **Sidebar** with FAB strip on the left, opens with click or Ctrl+Shift+L. Width is `SIDEBAR_WIDTH` in `config.js` (380px; `push.js` + full-page overlays derive from the same constant). **Opens to the Context tab by default** (`.tab.active`/`.tab-pane.active` on `#pane-context` in `ui-template.js`) — the History tab's `#searchHistory` autofocus in `content.js#setPanelOpen` is guarded to only fire when the History tab is actually the active one.
- **Global project bar** (`#globalProjectBar`) — sits above both tabs (visible regardless of which is active), never hides. A **selector** (`<select id="projectSelect">`, regular + code projects together, code ones prefixed with 📁, plus a "ללא פרויקט" option) drives `state.currentProjectId`, the single **active project** for the whole panel. Persisted across sessions in `chrome.storage.local.activeProjectId` via `history-view.js#loadActiveProjectId`/`setActiveProjectId` (loaded once inside `content.js#loadBlocks`). Next to the selector: `#projectEditBtn` (pencil/menu icon, hidden when no project is active) opens the existing project management dropdown (`openProjectDropdown`/`openCodeProjectDropdown` — rename/delete/rescan), and the "+ פרויקט"/"+ פרויקט קוד" buttons (`addProjectBtn`/`addCodeProjectBtn`) create new ones (auto-selecting the new project).
- **Context tab** — one unified view, no sub-tabs. Context-window meter at the top, then a single collapsible **`#blocksSection`** (`section-header` + `#blocksCollapseBtn`, same collapse pattern as the History tab's conversation list — toggling it hides `#blocksSectionBody` as a whole) holding **everything injectable**: the "+ new block" button, the General Memory card (`#gmCard`), the active project's **instructions card** (`#projectInstructionsCard`, directly below GM, hidden when no project is active), and the **unified prompts list** (`#list`) — general blocks (no `projectId`) plus the active project's own blocks, project-owned rows carrying a `.ctx-proj-tag` pill with the project's title, always visible (not just when selected). Both GM and the instructions card are built dynamically (`chat-features.js#renderGeneralMemory` / `history-view.js#renderProjectInstructionsCard`) as `.gm-card`s: a header (autoLoad toggle + title; GM also has a select-for-inject checkbox) and, when autoLoad is on, an `.auto-badge` below. **Neither has a dedicated edit button** — clicking anywhere on the card opens the shared block-edit form (`content.js#openEdit`) prefilled with its title/content, exactly like clicking a row in `#list`; the toggle/checkbox `stopPropagation()` so toggling them doesn't also open the form. A block created via "+" is stamped with `state.currentProjectId` if one is active, otherwise stays general (`content.js#renderUnifiedBlocksList`/`openEdit`/`saveEdit`/`syncBlocksSection`). `saveEdit()` spreads the existing block first (`{ ...existing, id, title, content, tags, updated }`) so fields the form doesn't know about — `kind`, `autoLoad`, `projectId`, and a project's `documents`/`isCodeProject`/`dirHandleId`/`lastScanned`/`depGraph` — survive instead of being dropped; the delete button stays hidden for `kind:"project"` blocks since their deletion needs the dedicated cleanup in `history-view.js#openProjectDropdown` (child blocks, active-project reset), not the generic one-block delete. Below `#blocksSection` (outside the collapse — its own separate toggle): for the active project, a **documents section** (`#projectDocumentsCard`, header styled identically to `#blocksSection`'s — same `.section-header`/`.section-head-left`/`.section-label`, no card background — collapsible via `#projectDocumentsToggle`/`history-view.js#syncProjectDocumentsSection`). The header's right side holds `#projectAddDocumentBtn` ("+ הוסף", regular projects only) and `#codeProjectRefreshBtn` (code projects only — replaces the old standalone "last scanned" info box, which is gone; the scan age now shows as the button's `title` tooltip). Content is a flat list + add-document dialog for regular projects, or the **inline file tree** (`code-tree.js#renderInline` inside `#projectDocumentsList` — tree + per-file dependency-linking, no modal) for code projects. All driven by `history-view.js#renderProjectContext`, called on every `render()`.
- **History tab** — conversation list (title-search or content-search; pin / rename / assign-to-project / delete), **filtered to the active project's conversations** whenever one is selected (`renderHistoryList`'s `state.currentProjectId` filter — "ללא פרויקט" does not filter, it shows everything). A row (`#historyProjectFilterRow`) shows "מציג שיחות של: <project>" plus a "הצג את כל השיחות" checkbox (`state.historyShowAll`, transient) to override the filter without changing the active project. The "assign to project" picker still reads the same unified `kind:"project"` blocks.
- **Conversation preview panel** — opens on click, lets you search messages, select a subset, and inject (optionally with project instructions). Clicking the same conversation row again closes the preview. Content-search hits in the History list (rows with `kind: "message"` and `messageIndex`) jump straight to the matching message inside the preview: they open the conversation, copy the History search query into `cvSearch` (so highlights show), scroll the target message into view via `scrollToMessageIndex`, and briefly flash it (`.cv-msg-flash`). The "כלול הנחיות פרויקט" checkbox is pre-checked whenever the conversation has a `projectId` — regardless of where the preview was opened from — so "המשך שיחה" includes the project's instructions by default.
- **Conversation view — two actions:**
  - **"טען נבחרים" (`cvLoadBtn`)** — injects selected messages as context into the current chat. Does NOT bind; current chat stays its own conversation.
  - **"המשך שיחה" (`cvContinueBtn`)** — when opening the conversation view, if `state.currentConversationId === b.id` (already active), the same button DOM node is repurposed as a non-clickable label: class `is-active-label`, text "השיחה פעילה", `pointer-events: none`. The click handler still has a defensive early-return for the same condition. Otherwise: save-then-navigate-then-resume flow: (1) flushes current chat (saves only if user typed a real non-injection message), (2) stores intent `{ blockId, includeProject }` in `sessionStorage.ccb_pendingContinue`, (3) `location.assign(AUTO_OPEN_URLS[0])` to land in a fresh chat. After the load, `processPendingContinue()` in `init` polls for chat readiness, injects GM (always, if it has content — not gated on `autoLoad`) + full transcript in a SINGLE combined `replace` injection, binds `state.currentConversationId` and snapshots `state.continuationBase` via `buildHistoryMessages(b)` (filtered), then clicks send.
- **Auto-save chat** runs continuously in `chat-features.js#scheduleAutoSave` (2.5s debounce after each new message) — keeps a single conversation block per page load, refreshed on every message. A brand-new conversation is stamped with whatever project is active (`state.currentProjectId`) at the moment `persistConversation()` first creates its block — fixed for the conversation's lifetime; switching the active project afterward does not retroactively reassign it. Refresh or SPA navigation starts a new conversation. Manual "save chat" button still exists for a full scroll-to-top capture of older messages. `summarizer.js` separately saves a summary block on the `[[CCB:SAVE]]` marker.
- **Advanced options** popover — context-window size, backup export/import (`context-bank-backup.json`), prompts editor
- **Prompts editor** — 4 framing pairs (manual / GM / conversation wrapper / project wrapper); the locked technical markers (`[[CCB:INJECTED]]`, `<context>`, `<memory>`, `<transcript>`, `<project>`) are visible but not editable. The SUMMARY_PROMPT editor is intentionally hidden for now.
- **Auto-inject at conversation start** — two independent sources, combined into a SINGLE injection: the **General Memory** (when `gm.autoLoad` is on) and the **active project's instructions** (`project.content` only, when a project is active, has instructions, and `project.autoLoad !== false`). The instructions card has its own toggle (`#projectInstructionsAutoToggle`, same `.toggle` markup as GM) — **missing `autoLoad` defaults to ON**, so pre-existing projects keep auto-loading without a migration. The `#projectInstructionsAutoBadge` ("נטען אוטומטית") reflects the toggle state, not the content — it shows even with empty instructions, signaling intent. Project **documents are deliberately excluded** — they stay behind the explicit footer "מסמכים" button, since a code project's enabled files can be tens of thousands of tokens. The payload is computed at inject time (not when `tryAutoInject` is called) so switching project mid-wait doesn't inject stale instructions. Resets on URL change. `tryAutoInject` polls until both input is present *and* `msgCount === 0` (or times out at 10s) — this catches the SPA transition where the old chat's DOM lingers for a moment after navigating to a fresh chat.
- **Active-conversation marker** — `createHistoryRow` in `history-view.js` checks `state.currentConversationId === b.id` and adds an `.active` class + a pulsing dot (`.hi-active-dot`) to the row. Re-rendered on bind (continuation flow), on auto-save write, and on URL change (clearing the marker).
- **Multi-block injection** — GM-only uses FRAMING_GM, otherwise FRAMING_MANUAL (GM always goes first if mixed)
- **Project documents** — projects can hold documents: uploaded files, pasted text, or URLs, added via the restyled `#addDocumentOverlay` dialog (design-system CSS classes `.doc-paste-textarea` / `.doc-url-input`, no more inline styles). `document-handler.js` estimates tokens, extracts text (including DOCX/ODT/RTF via manual ZIP/XML parsing), and stores file blobs in `chrome.storage.local` (`docBlob_<id>`). `injectProjectDocuments()` in `history-view.js` combines enabled doc contents with the project instructions into one injection, and separately re-attaches enabled file blobs to the page's file input via `docHandler.injectFilesToChat`. Triggered via the fixed footer `#injectDocsBtn` ("מסמכים") — `content.js#syncInjectDocsBtn` shows/hides it based on whether the active project (`state.currentProjectId`) has documents; it's the single global entry point, covering both the code-project file tree and the flat regular-project document list (no per-project inject button, no separate project-picker section).
- **Code projects** — a project can instead be folder-backed (`isCodeProject: true`): `createCodeProjectBookmark()` opens `showDirectoryPicker()`, stores the handle in IndexedDB via `fs-handles.js` (chrome.storage.local can't hold handles), then `document-handler.js#scanCodeProject` recursively walks the folder (skipping `node_modules`/build output/lockfiles/config files/oversized files) and `dep-graph.js#buildGraph` builds a static import graph. `code-tree.js#renderInline` renders a checkbox file tree **inline** in the open project's documents section for hand-picking files to inject, with a per-file "load with dependencies" menu (dependencies / dependents / full context) backed by the dep graph — all static analysis, no AI, best-effort on dynamic dispatch. `CODE_EXTENSIONS` (`document-handler.js`) includes `.cshtml`/`.razor`/`.json` alongside the usual JS/TS/C#/etc. set, so ASP.NET Razor views and JSON config get scanned too (not just `.cs`).
- **Razor support in the dependency graph** — `.cshtml`/`.razor` files reuse the same C# class/namespace symbol table as `.cs` files (`dep-graph.js#analyzeRazorFile`): any known type name referenced anywhere in the markup (`@model`, `@inject`, tag helpers, embedded `@{ }` blocks) becomes an edge to that type's file, filtered by `@using` directives the same way C# `using`s filter candidates. Razor/HTML comments (`@* *@`, `<!-- -->`) are stripped first so commented-out references don't create false edges. Code-behind pairs (`Foo.cshtml`↔`Foo.cshtml.cs`, `Foo.razor`↔`Foo.razor.cs`) get a guaranteed bidirectional edge on top of the symbol-table scan, since the two files are one logical unit and don't necessarily name-reference each other's types.

## Rules

- After every change: update this file and `ARCHITECTURE.md`
- Keep the current split — never re-merge `ui-modals.js` / `history-view.js` / `chat-features.js` / `content.js`
- When editing dialogs/settings: read `ui-modals.js`. For history/projects/conversation view: `history-view.js`. For GM/save-chat/inject-selected: `chat-features.js`. For mount/wiring/state/edit-form/context-list: `content.js`. For styles: `ui-styles.js`. For prompts defaults: `config.js`.
- Modules access shared state via `_deps.state` and shared helpers via the `_deps` object passed to `init()`. Never read state directly from `window.__ccb*` outside of `init`.
