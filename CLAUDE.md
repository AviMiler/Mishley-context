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
| `code-tree.js`    | Interactive file-tree picker for code-project docs → `window.__ccbCodeTree`   | 320    |
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
- **`history-view.js`** — projects + conversation world. The unified project list + project detail view (instructions, own text blocks, documents, code-project bookmarking/scanning/file-picking) — **now rendered into the Context tab's "פרויקטים" sub-view**, not the History tab. Also the History-tab conversation list, the per-message preview panel, and all row/project dropdowns. Owns the framing builders (`buildConversationInjectionText`, `buildProjectSectionText`, `formatTranscript`, `buildHistoryMessages`). (Kept as its own module even though its project UI now lives under the Context tab — the split is by responsibility, not by which tab hosts the DOM.)
- **`document-handler.js`** — project document lifecycle (add/remove/toggle, token estimation, Office text extraction) and the code-project folder scanner (`scanCodeProject`, `syncCodeProjectDocuments`). No UI of its own.
- **`dep-graph.js`** — pure, static (no-AI) import/reference graph builder for scanned code projects (JS/TS/JSX + C#). No UI, no storage access.
- **`code-tree.js`** — the file-tree picker modal for hand-selecting which code-project files to inject, including the "load with dependencies" menu backed by `dep-graph.js`.
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
- `window.__ccbHistoryView` — `init`, `render*`, `open*/close*`, `getProjects/getCodeProjects/getProjectById/getConversationProject`, `buildHistoryMessages/buildConversationInjectionText/buildProjectSectionText/formatTranscript`, `sync*` collapse helpers, `addProject`, `saveProjectView`, `renderProjectViewDocuments`, `openAddDocumentDialog`, `injectProjectDocuments`, `createCodeProjectBookmark`, `rescanCodeProject`, `loadCodeProjectAll`, `openCodeProjectPicker`, `enableFilesForProject`, `setAllCodeDocsEnabled`
- `window.__ccbChat` — `init`, `getGM`, `renderGeneralMemory`, `tryAutoInject`, `injectSelected`, `saveChat`, `inlineReady`, `startMsgObserver`, `stopMsgObserver`
- `window.__ccbDocHandler` — `init`, `addDocument`, `removeDocument`, `toggleDocument`, `getDocumentContent`, `getOrExtractContent`, `getEnabledDocuments`, `injectFilesToChat`, `estimateTokens`, `estimateFileTokens`, `getFileType`, `isLikelyTextFile`, `scanCodeProject`, `buildStructureMarkdown`, `syncCodeProjectDocuments`, `removeCodeContent`
- `window.__ccbDepGraph` — `buildGraph`, `getTransitiveClosure`, `getDirectDependents`, `getFullContext`
- `window.__ccbCodeTree` — `init`, `open(project)`, `close()`
- `window.__ccbFsHandles` — `put(id, dirHandle)`, `get(id)`, `remove(id)`, `verifyPermission(dirHandle, mode?)`
- `window.__ccb` — public API for `summarizer.js`: `{ MSG_SELECTORS, blocks, saveBlocks, loadBlocks, setStatus, renderPanel }`

## Storage Keys

| Key                                | Owner          | Shape                                                  |
| ---------------------------------- | -------------- | ------------------------------------------------------ |
| `chrome.storage.local.blocks`      | content.js     | `{ [id]: block }` — see schema below                  |
| `chrome.storage.local.ccb_prompts` | prompts.js     | `{ manualIntro, manualOutro, gmIntro, gmOutro, ... }` |
| `chrome.storage.local.ctxWindow`   | content.js     | `number` (tokens, used by the meter)                  |

## Storage Schema (blocks)

```
{ "b_<ts>_<rand>": { id, title, content?, messages?, tags?, kind?, updated, pinned?, autoLoad?, projectId?,
                     documents?, isCodeProject?, dirHandleId?, lastScanned?, depGraph? } }
```

`documents` (kind: "project" only): array of `{ id, name, type, size, added, enabled, preview, estimatedTokens, content?, hasBlob? }`. File blobs live in `chrome.storage.local["docBlob_<id>"]`; code-project file text lives in `chrome.storage.local["codeContent_<id>"]` — never inline on the doc, so scanning a large folder doesn't bloat every `saveBlocks()` call. Requires the `unlimitedStorage` permission.

- No `kind` → Context tab block (general if no `projectId`; project-owned if `projectId` is set)
- `kind: "conversation"` → History tab; may have `projectId` (assigned project)
- `kind: "project"` → the single unified project entity — instructions (`content`), own text blocks (child blocks with `projectId`), documents, and/or code-project scanning. Rendered in the **Context tab's "פרויקטים" sub-view**.
- `id: "__general_memory"` → General Memory card (kind: `"general_memory"`, has `autoLoad`)

**`kind: "ctx-project"` is retired.** It was the old Context-tab "grouping of text blocks only" entity. On load, `content.js#migrateCtxProjects()` (idempotent) rewrites any surviving `ctx-project` block to `kind: "project"` (filling `documents: []`, `isCodeProject: false`), keeping the same `id` so child blocks' `projectId` links are preserved. There is now one project concept, not two.

**Project-owned text blocks (`projectId` field):**
A regular context block (no `kind`) may have `projectId` pointing to a `kind: "project"` block. They render inside that project's detail view (`#projectBlocksList`) via `renderProjectBlocksList()` in `content.js`. General blocks (no `projectId`) render in the "טקסטים כלליים" sub-view's `#list`.
Since the shared `#editView` add/edit form covers the whole panel (no project context visible behind it), `openEdit()` in `content.js` shows a small `#editProjectTag` pill (folder icon + project title) above the title field whenever the block being edited has a `projectId` (or is about to get one via `state.pendingCtxProjectId`) — otherwise it's hidden.

## Active Site

Change `ACTIVE_SITE` in `config.js` → `"gemini"` or `"internal"`.
The UI and summarizer are gated to the active site's `AUTO_OPEN_URLS`, so they stay inert on other sites.

## Features overview

- **Sidebar** with FAB strip on the left, opens with click or Ctrl+Shift+L. Width is `SIDEBAR_WIDTH` in `config.js` (340px; `push.js` + full-page overlays derive from the same constant).
- **Context tab** — context-window meter (with file-token breakdown) at the top, then a two-button segmented sub-view control (`.ctx-subview-toggle`, wired in `content.js#syncCtxSubview`, state `state.ctxSubview`):
  - **"טקסטים כלליים"** (`#ctxSubviewGeneral`) — the "+ new block" button, the General Memory card (`#gmCard`), and the general block list (`#list`, blocks with no `kind`/`projectId`).
  - **"פרויקטים"** (`#ctxSubviewProjects`) — the unified project list (`#projectList`, regular + code projects, folder icon distinguishes code ones) and, when a project is opened, its inline detail view (`#projectView`): instructions accordion, the project's own text blocks (`#projectBlocksList`), documents list + add-document dialog, and code-project info/refresh/file-tree-picker entry points. Opening a project swaps list↔detail via `history-view.js#syncCtxProjectsLayout`.
- **History tab** — conversation list only (title-search or content-search; pin / rename / assign-to-project / delete). Projects were moved to the Context tab; the "assign to project" picker still reads the same unified `kind:"project"` blocks.
- **Conversation preview panel** — opens on click, lets you search messages, select a subset, and inject (optionally with project instructions). Clicking the same conversation row again closes the preview. Content-search hits in the History list (rows with `kind: "message"` and `messageIndex`) jump straight to the matching message inside the preview: they open the conversation, copy the History search query into `cvSearch` (so highlights show), scroll the target message into view via `scrollToMessageIndex`, and briefly flash it (`.cv-msg-flash`). The "כלול הנחיות פרויקט" checkbox is pre-checked whenever the conversation has a `projectId` — regardless of where the preview was opened from — so "המשך שיחה" includes the project's instructions by default.
- **Conversation view — two actions:**
  - **"טען נבחרים" (`cvLoadBtn`)** — injects selected messages as context into the current chat. Does NOT bind; current chat stays its own conversation.
  - **"המשך שיחה" (`cvContinueBtn`)** — when opening the conversation view, if `state.currentConversationId === b.id` (already active), the same button DOM node is repurposed as a non-clickable label: class `is-active-label`, text "השיחה פעילה", `pointer-events: none`. The click handler still has a defensive early-return for the same condition. Otherwise: save-then-navigate-then-resume flow: (1) flushes current chat (saves only if user typed a real non-injection message), (2) stores intent `{ blockId, includeProject }` in `sessionStorage.ccb_pendingContinue`, (3) `location.assign(AUTO_OPEN_URLS[0])` to land in a fresh chat. After the load, `processPendingContinue()` in `init` polls for chat readiness, injects GM (always, if it has content — not gated on `autoLoad`) + full transcript in a SINGLE combined `replace` injection, binds `state.currentConversationId` and snapshots `state.continuationBase` via `buildHistoryMessages(b)` (filtered), then clicks send.
- **Auto-save chat** runs continuously in `chat-features.js#scheduleAutoSave` (2.5s debounce after each new message) — keeps a single conversation block per page load, refreshed on every message. Refresh or SPA navigation starts a new conversation. Manual "save chat" button still exists for a full scroll-to-top capture of older messages. `summarizer.js` separately saves a summary block on the `[[CCB:SAVE]]` marker.
- **Advanced options** popover — context-window size, backup export/import (`context-bank-backup.json`), prompts editor
- **Prompts editor** — 4 framing pairs (manual / GM / conversation wrapper / project wrapper); the locked technical markers (`[[CCB:INJECTED]]`, `<context>`, `<memory>`, `<transcript>`, `<project>`) are visible but not editable. The SUMMARY_PROMPT editor is intentionally hidden for now.
- **GM auto-inject** at conversation start (when `autoLoad` is on); resets on URL change. `tryAutoInject` polls until both input is present *and* `msgCount === 0` (or times out at 10s) — this catches the SPA transition where the old chat's DOM lingers for a moment after navigating to a fresh chat.
- **Active-conversation marker** — `createHistoryRow` in `history-view.js` checks `state.currentConversationId === b.id` and adds an `.active` class + a pulsing dot (`.hi-active-dot`) to the row. Re-rendered on bind (continuation flow), on auto-save write, and on URL change (clearing the marker).
- **Multi-block injection** — GM-only uses FRAMING_GM, otherwise FRAMING_MANUAL (GM always goes first if mixed)
- **Project documents** — projects can hold documents: uploaded files, pasted text, or URLs, added via the restyled `#addDocumentOverlay` dialog (design-system CSS classes `.doc-paste-textarea` / `.doc-url-input`, no more inline styles). `document-handler.js` estimates tokens, extracts text (including DOCX/ODT/RTF via manual ZIP/XML parsing), and stores file blobs in `chrome.storage.local` (`docBlob_<id>`). `injectProjectDocuments()` in `history-view.js` combines enabled doc contents with the project instructions into one injection, and separately re-attaches enabled file blobs to the page's file input via `docHandler.injectFilesToChat`.
- **Code projects** — a project can instead be folder-backed (`isCodeProject: true`): `createCodeProjectBookmark()` opens `showDirectoryPicker()`, stores the handle in IndexedDB via `fs-handles.js` (chrome.storage.local can't hold handles), then `document-handler.js#scanCodeProject` recursively walks the folder (skipping `node_modules`/build output/lockfiles/config files/oversized files) and `dep-graph.js#buildGraph` builds a static import graph. `code-tree.js` renders a checkbox file tree for hand-picking files to inject, with a "load with dependencies" menu (dependencies / dependents / full context) backed by the dep graph — all static analysis, no AI, best-effort on dynamic dispatch.

## Rules

- After every change: update this file and `ARCHITECTURE.md`
- Keep the current split — never re-merge `ui-modals.js` / `history-view.js` / `chat-features.js` / `content.js`
- When editing dialogs/settings: read `ui-modals.js`. For history/projects/conversation view: `history-view.js`. For GM/save-chat/inject-selected: `chat-features.js`. For mount/wiring/state/edit-form/context-list: `content.js`. For styles: `ui-styles.js`. For prompts defaults: `config.js`.
- Modules access shared state via `_deps.state` and shared helpers via the `_deps` object passed to `init()`. Never read state directly from `window.__ccb*` outside of `init`.
