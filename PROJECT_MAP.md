# Project Map
_Last updated: 2026-08-06_

## File Tree
```
.
├── AGENT_CONTEXT.md
├── ARCHITECTURE.md
├── CLAUDE.md
├── CHANGELOG.md
├── DEPENDENCIES.md
├── PROJECT_MAP.md
├── FILE_EXTENSIONS_REFERENCE.txt
├── manifest.json
├── popup.html
├── popup.js
├── icon.png
├── icon.svg
├── tokenizer.js                   # real BPE token counting (o200k_base) — loaded first, config.js delegates to it
├── config.js
├── prompts.js
├── storage.js
├── inject.js
├── push.js
├── ui-styles.js
├── ui-template.js
├── ctx-meter.js
├── ui-modals.js
├── fs-handles.js
├── document-handler.js
├── dep-graph.js
├── code-tree.js
├── history-view.js                # Projects only (2026-08-04) — see its file description below
├── chat-features.js
├── msg-nav.js                     # floating prev/next widget over the host page's own chat messages
├── content.js
├── background.js                  # MV3 service worker — tree-sitter WASM parser host for dep-graph.js
├── wasm/                          # vendored tree-sitter runtime + grammars (see DEPENDENCIES.md)
│   ├── tree-sitter.js
│   ├── tree-sitter.wasm
│   ├── tree-sitter-c-sharp.wasm
│   └── tree-sitter-javascript.wasm
├── tokenizer/                     # vendored BPE ranks data, no library (see DEPENDENCIES.md)
│   └── o200k_base.tiktoken
└── mishley-test-projects/        # local scan/dep-graph test fixtures, not part of the extension
    ├── dotnet-demo/               # small C# fixture
    ├── dotnet-shop-api/           # larger C# fixture (controllers/services/repos)
    ├── e2e/                      # fixture for end-to-end scan testing
    ├── react-demo/                # small JS/TS fixture
    └── react-large/               # larger JS/TS fixture
```

## File Descriptions

| File | Description |
|---|---|
| `manifest.json` | MV3 manifest — permissions (`storage`, `unlimitedStorage`), host permissions, and the exact content-script load order. |
| `popup.html` / `popup.js` | Toolbar popup — sends a `togglePanel` message to the active tab and closes itself. |
| `tokenizer.js` | Real BPE token counting (o200k_base) in pure JS over the vendored ranks in `tokenizer/`. Lazily loaded on active-site pages only. Exports `window.__ccbTokenizer`. |
| `config.js` | Site selectors (Gemini vs. internal chat) behind `ACTIVE_SITE`, plus `FRAMING_*`/`SUMMARY_PROMPT` defaults, other config constants, and the canonical token counter (`estimateTextTokens` — delegates to `tokenizer.js`, falls back to the Hebrew-aware chars→tokens heuristic). Exports `window.__ccbRawConfig`. |
| `prompts.js` | Loads user overrides for the editable parts of the framing/summary prompts from storage and patches `__ccbRawConfig`; keeps technical markers locked. Exports `window.__ccbPromptsAPI`. |
| `storage.js` | Owns the v3 storage layout (2026-08-04): `blocks` (metadata only) plus a per-item `depGraph_<projectId>` (scanned import graph) key, with batched (`setBatched`) load/save/remove helpers — no longer a thin wrapper. Also owns `purgeConversationData`, the one-time cleanup for the retired conversation-history feature's `conv_<id>` keys. **Since 2026-08-04 (D1-D4)** also owns `codeContentKey`/`docBlobKey` (a deliberate second copy of `document-handler.js`'s own private key formats, so backup/orphan code doesn't need a new dependency on that module — see DECISIONS.md), `CONTENT_KEY_PREFIXES`, `listAllKeys()`, and `getBytesInUse()` — the primitives the storage-usage panel and orphan GC in `content.js` are built on. The write *coalescing* on top of it (`saveBlocks`/`flushSaveBlocks`) lives in `content.js`, not here. See ARCHITECTURE.md "Storage shape". Exports `window.__ccbStorage`. |
| `inject.js` | Finds the page's chat input and injects text into it (prepend/append/replace). Exports `window.__ccbInject`. |
| `push.js` | Shifts the host page's layout right when the sidebar opens. Exports `window.__ccbPush`. |
| `ui-styles.js` | All Shadow DOM CSS as a single string. Exports `window.__ccbCSS`. |
| `ui-template.js` | SVG icon set + the sidebar's static HTML skeleton (`PANEL_HTML`). Exports `window.__ccbTpl`. |
| `ctx-meter.js` | Context-window usage meter: renders the meter and the per-file breakdown dropdown. Token math delegates to the shared estimator in `config.js` (conversation, per message) and to `document-handler.js#estimateFileTokens` (uploaded files) — no local heuristics fork. Exports `window.__ccbCtxMeter`. |
| `ui-modals.js` | Generic in-shadow dialogs (confirm/choice/prompt/project-picker), the advanced-options popover, and the prompts editor overlay. Exports `window.__ccbModals`. |
| `fs-handles.js` | IndexedDB wrapper storing `FileSystemDirectoryHandle` objects for bookmarked code-project folders (chrome.storage.local can't hold them). Exports `window.__ccbFsHandles`. |
| `document-handler.js` | Project-document lifecycle (add/remove/toggle/estimate/extract text incl. DOCX/ODT/RTF) and the code-project folder scanner (`scanCodeProject`, `syncCodeProjectDocuments`). The scanner uses bounded-concurrency directory traversal + file reads and batched storage IO — see ARCHITECTURE.md "Scan performance". Exports `window.__ccbDocHandler`. |
| `dep-graph.js` | Static, no-AI import/reference graph builder for scanned code projects (JS/TS/JSX resolution + C# symbol-table heuristic + plain CSS `@import` resolution). `buildGraph` is async so it can yield to the event loop. Exports `window.__ccbDepGraph`. |
| `code-tree.js` | Interactive checkbox file-tree rendered inline in the open project's documents section, for hand-picking which code-project files to inject, incl. a dependency-aware "load with dependencies" menu. Exports `window.__ccbCodeTree`. |
| `history-view.js` | Unified project list (regular + code projects) + project detail view, project documents UI, code-project bookmark/rescan/picker actions, and the shared floating-menu host (`#hiDropdown`). Projects-only since 2026-08-04 (the History tab / conversation-history feature it also used to hold was retired) — kept its filename regardless, to avoid churning the manifest load order and every cross-module reference for a cosmetic mismatch (see DECISIONS.md). Exports `window.__ccbHistoryView`. |
| `chat-features.js` | General Memory card + auto-inject, manual multi-block injection, quick commands. Exports `window.__ccbChat`. |
| `msg-nav.js` | Floating prev/next widget, independent of the sidebar panel, that scrolls+highlights through the host page's own chat messages (all roles, unfiltered) using `config.js`'s existing `MSG_SELECTORS`. No storage, no shared `state` fields, and (2026-08-06) no persistent index-based cursor — position is derived from the live viewport, with a brief same-click settle-window memory (`_lastTarget`, ~700ms) so rapid repeated clicks don't misread a still-animating scroll; see ARCHITECTURE.md. Exports `window.__ccbMsgNav`. |
| `content.js` | Orchestrator: shared `state`, Shadow DOM mount, `initModules` wiring, central event switchboard, edit form, general/project-blocks list render, `ctx-project`→`project` migration, storage migration, backup export/import, init/routing. |
| `icon.png` / `icon.svg` | Extension icon assets. |
| `FILE_EXTENSIONS_REFERENCE.txt` | Reference notes on file extensions/MIME types used when tuning `ctx-meter.js`/`document-handler.js` token estimation. |
| `AGENT_CONTEXT.md` | Primary entry point for an agent/human picking up this project — current state, last changes, gotchas. |
| `ARCHITECTURE.md` | Full architecture reference — file table, global API surface, module wiring, storage shape, per-module function indices. |
| `CLAUDE.md` | Condensed project index + rules (module split, where to look for what). |
| `CHANGELOG.md` | Dated log of changes. |
| `DEPENDENCIES.md` | Third-party/browser-API dependencies and why they were chosen. |
| `mishley-test-projects/` | Local fixture folders (C# and JS/TS, small and large) used to manually test `document-handler.js#scanCodeProject` and `dep-graph.js#buildGraph` against real multi-file projects. Not loaded by the extension itself. |
