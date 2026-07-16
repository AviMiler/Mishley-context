# Changelog

## Unreleased (pending commit)

### 2026-07-16 — Context-tab UX redesign
- Changed: **Context management is now unified under the Context tab.** Under the context-window meter, a two-button segmented control (`.ctx-subview-toggle`) switches between "טקסטים כלליים" (general blocks + General Memory) and "פרויקטים" (the project list + inline project detail). State: `state.ctxSubview`; toggle logic: `content.js#syncCtxSubview`.
- Changed: **The History tab is now conversations-only.** Its projects section and project-detail shell were removed from `#pane-history` (`ui-template.js`) and relocated into the Context tab's "פרויקטים" sub-view. The per-conversation "assign to project" picker still works against the unified project list.
- Changed: **Unified the two project concepts.** Retired `kind:"ctx-project"` (Context-tab text-only groups). `content.js#migrateCtxProjects()` runs idempotently inside `loadBlocks()` and rewrites any surviving `ctx-project` block to `kind:"project"` (adding `documents:[]`/`isCodeProject:false`, same `id`), so a project now uniformly holds fixed text blocks *and* documents/code-scanning. Removed `createCtxProject`/`renameCtxProject`/`deleteCtxProject` from `content.js`; project CRUD is the existing `history-view.js` `addProject` + `openProjectDropdown` rename/delete.
- Changed: `history-view.js` — merged `renderProjectList`/`renderCodeProjectList` into one unified `renderProjectList` (folder icon distinguishes code projects), added `getAllProjects()`, replaced `updateHistoryLayoutForProjectView()` with `syncCtxProjectsLayout()` (list↔detail toggle inside the Context sub-view). `content.js` — `renderContextList()` now renders general blocks only; new `renderProjectBlocksList()` renders a project's own text blocks in its detail view (`#projectBlocksList`).
- Changed: Restyled the "add document" dialog (`#addDocumentOverlay`) — replaced inline `style="…"` attributes on the paste textarea / URL inputs with design-system CSS classes (`.doc-paste-textarea`, `.doc-url-input`) in `ui-styles.js`.
- Changed: `SIDEBAR_WIDTH` 300 → 340 px (`config.js`) to fit the segmented control and inline project rows; `push.js` and the full-page overlays derive from the same constant, so no other width edits were needed.
- Added: `#editProjectTag` — a small project-name pill (folder icon + title) shown above the title field in the shared `#editView` add/edit form whenever the block being created or edited belongs to a project. Fixes a gap where opening the full-panel edit form hid all project context, leaving no indicator of which project you were adding a block to.

### Earlier (also pending commit)
- Added: Project documents — a project can hold uploaded files, pasted text, or extracted-text documents (`document-handler.js`, new). Text extraction covers plain text, DOCX/ODT (ZIP + XML), and RTF; file blobs are stored in `chrome.storage.local` (requires the new `unlimitedStorage` permission).
- Added: Code projects — a project can instead be bookmarked to a local folder (`showDirectoryPicker`), scanned recursively (skips `node_modules`/build output/lockfiles/config files/oversized files), and re-scanned later. Folder handles are persisted in IndexedDB since `chrome.storage.local` can't hold them (`fs-handles.js`, new).
- Added: Static dependency graph for scanned code projects (`dep-graph.js`, new) — resolves JS/TS/JSX imports and C# type references, best-effort, no AI. Powers a "load with dependencies" (dependencies / dependents / full context) action.
- Added: Interactive file-tree picker (`code-tree.js`, new) for hand-selecting which scanned files to inject, instead of loading the whole project.
- Changed: `ctx-meter.js` binary file-token estimation — more file-type buckets (presentations, spreadsheets, archives, markup/code), made async so markup/code files are estimated from actual text length rather than raw size. Reused by `document-handler.js`.
- Changed: `content.js#initModules` now wires `document-handler.js` and `code-tree.js` into the shared deps graph; `history-view.js` grew the project-documents UI and the code-project bookmark/rescan/picker/dropdown functions; `chat-features.js#injectSelected` includes enabled project documents in the injected text.
- Changed: `manifest.json` — added `unlimitedStorage` permission and the four new scripts (`fs-handles.js`, `document-handler.js`, `dep-graph.js`, `code-tree.js`) to the content-script load order.
- Docs: `ARCHITECTURE.md` and `CLAUDE.md` updated with the new file table rows, global API entries, function indices, storage-shape additions (`documents`, `isCodeProject`, `dirHandleId`, `lastScanned`, `depGraph`), and a features-overview description of the document/code-project system.

## Earlier history (reconstructed from commit log, pre-dates this file)
- 2026-05-18 — UI polish pass ("שיפצורים").
- 2026-05-17 — History view improvements; continued conversation-history work.
- 2026-05-16 — Auto-save for conversations (one block per page load, debounced updates).
- 2026-05-14 — Refactor: split `content.js` into `ui-modals.js` / `history-view.js` / `chat-features.js`.
- 2026-05-12 — Prompts editor + framing-prompt wrapper rework.
- 2026-05-11 — Fixed tab-click always resetting to defaults; reworked conversation loading with preview + selection; added the context-window meter.
- 2026-05-10 — Added Projects; initial commit.
