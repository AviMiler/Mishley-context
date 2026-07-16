# Agent Context
_Last updated: 2026-07-16 after the Context-tab UX redesign (unified projects + general/projects sub-views)_

## What This Project Is
Mishley Code Context Bank is a Chrome MV3 extension: a floating sidebar injected into chat sites (Gemini today, an "internal chat" site configurable via `config.js`) that lets the user manage reusable context blocks, a "General Memory" auto-injected preamble, saved conversation history, and projects that can hold fixed text blocks, full documents (files/text/URLs), or an entire local code folder — all injected into the chat on demand. Context management now lives in one place (the Context tab); the History tab is conversations-only.

## Current State
- ✅ Working: sidebar mount/toggle, context blocks, General Memory auto-inject, conversation auto-save + continue flow, prompts editor, context-window meter (incl. per-file token breakdown), project documents (upload/paste/estimate/inject), code-project folder scanning + static dependency graph + file-tree picker. **New:** Context tab is reorganized into a general/projects segmented sub-view; the unified project entity (fixed text blocks + documents + code scanning) now lives under the Context tab.
- 🚧 WIP: none currently tracked — this session's Context-tab redesign is implemented and documented but **not yet manually verified end-to-end in the browser**, and not yet committed. (The earlier documents/code-projects feature is also still pending its own browser verification.)
- ❌ Known Issues: dependency-graph resolution is best-effort only (dynamic dispatch, computed member access, reflection, `eval` can't be resolved statically — see [dep-graph.js](dep-graph.js) header comment); legacy binary `.doc` files are not text-extractable.

## Last Changes
- 2026-07-16 (Context-tab UX redesign) — Unified the two project concepts: retired `kind:"ctx-project"` and folded it into `kind:"project"` via an idempotent `content.js#migrateCtxProjects()` in the load path. Restructured `#pane-context` (`ui-template.js`): the context-window meter, then a segmented sub-view control (`.ctx-subview-toggle`) with "טקסטים כלליים" (general blocks + GM) and "פרויקטים" (the unified project list + inline project detail — instructions, own text blocks, documents, code-project entry points). Moved all project UI out of the History tab (now conversations-only). In `content.js`: added `state.ctxSubview` + `syncCtxSubview()`, split `renderContextList()` into general-only + `renderProjectBlocksList()`, removed `createCtxProject`/`renameCtxProject`/`deleteCtxProject`. In `history-view.js`: merged `renderProjectList`/`renderCodeProjectList` into one, added `getAllProjects()` + `syncCtxProjectsLayout()`, dropped the History project section. Restyled the `#addDocumentOverlay` dialog (design-system CSS, no inline styles). Bumped `SIDEBAR_WIDTH` 300→340 (`config.js`). See [CHANGELOG.md](CHANGELOG.md), [ARCHITECTURE.md](ARCHITECTURE.md), [CLAUDE.md](CLAUDE.md).
- 2026-07-16 (earlier) — Added project documents (`document-handler.js`, new) and code-project scanning + static dependency graph (`dep-graph.js`, `code-tree.js`, `fs-handles.js`, all new). `manifest.json` gained `unlimitedStorage` + the four new scripts. `ctx-meter.js` binary-token estimation extended (more file types, async) and reused by `document-handler.js`.

## Entry Points
- `manifest.json` — content-script load order (source of truth for module boot sequence)
- `content.js#init` — extension entry point; mounts the Shadow DOM UI and wires every module
- `content.js#initModules` — builds the shared `deps` object and calls each module's `init(deps)`

## Key Patterns Used
- Every UI module exposes `init(deps)` and stashes deps privately; state mutations go through `_deps.state` / `_deps` helpers, never directly on `window.__ccb*` (see [CLAUDE.md](CLAUDE.md) Rules section).
- Bulk mutations (e.g. `enableFilesForProject`, `setAllCodeDocsEnabled`) call `saveBlocks()` once, not once per item — looping per-item saves was a real perf bug (each save re-serializes the whole `blocks` object).
- Large or numerous text payloads (file blobs, per-file code content) are kept out of the `blocks` object entirely, in their own `chrome.storage.local` keys, so routine `saveBlocks()` calls (toggling a checkbox, renaming something) stay cheap regardless of project size.
- Static analysis over AI: the dependency graph is a deterministic, no-API-call heuristic — intentionally conservative (favors including too much over silently missing a file).

## Next Steps
- [ ] Manually verify the Context-tab redesign in the browser: general/projects sub-view toggle, opening a project, adding a text block + a document, code-project scan/picker, and that a pre-existing `ctx-project` correctly migrates to a `project` (open the console — `migrateCtxProjects` runs silently in `loadBlocks`).
- [ ] Verify the History tab is conversations-only and the "assign to project" picker still lists the unified projects.
- [ ] Manually verify the code-project scan → dependency graph → file-tree inject flow (JS + C# — `mishley-test-projects/` has fixtures)
- [ ] Verify DOCX/ODT/RTF text extraction against real files
- [ ] Decide whether `mishley-test-projects/` (test fixtures) should be committed or added to a `.gitignore`
- [ ] Stage and commit the pending changes (see [CHANGELOG.md](CHANGELOG.md))

## Gotchas / Watch Out
- `verifyPermission()` in `fs-handles.js` must be called from a user-gesture handler — `requestPermission()` on a `FileSystemDirectoryHandle` throws otherwise.
- Code-project file content is never read back onto `project.documents[].content` — always fetch it via `docHandler.getOrExtractContent`/the `codeContent_<id>` key, or a rescan will silently re-duplicate storage.
- This repo lives under a OneDrive-synced folder with a Hebrew path segment; if OneDrive's cloud file provider isn't running, some files can dehydrate to cloud-only placeholders that `git diff` / file reads fail against with `mmap failed: Invalid argument` or "cloud file provider is not running" — start OneDrive if that happens.
- No bundler/build step — all files are loaded directly as MV3 content scripts in the exact order listed in `manifest.json`; adding a new module means adding it to both the manifest array and `content.js#initModules`.
