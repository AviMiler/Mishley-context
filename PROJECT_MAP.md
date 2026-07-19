# Project Map
_Last updated: 2026-07-16_

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
├── history-view.js
├── chat-features.js
├── content.js
├── summarizer.js
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
| `config.js` | Site selectors (Gemini vs. internal chat) behind `ACTIVE_SITE`, plus `FRAMING_*`/`SUMMARY_PROMPT` defaults and other config constants. Exports `window.__ccbRawConfig`. |
| `prompts.js` | Loads user overrides for the editable parts of the framing/summary prompts from storage and patches `__ccbRawConfig`; keeps technical markers locked. Exports `window.__ccbPromptsAPI`. |
| `storage.js` | Thin `loadBlocks`/`saveBlocks` wrapper over `chrome.storage.local["blocks"]`. Exports `window.__ccbStorage`. |
| `inject.js` | Finds the page's chat input and injects text into it (prepend/append/replace). Exports `window.__ccbInject`. |
| `push.js` | Shifts the host page's layout right when the sidebar opens. Exports `window.__ccbPush`. |
| `ui-styles.js` | All Shadow DOM CSS as a single string. Exports `window.__ccbCSS`. |
| `ui-template.js` | SVG icon set + the sidebar's static HTML skeleton (`PANEL_HTML`). Exports `window.__ccbTpl`. |
| `ctx-meter.js` | Context-window usage meter: estimates tokens for the conversation + uploaded files, renders the meter and the per-file breakdown dropdown. Exports `window.__ccbCtxMeter`. |
| `ui-modals.js` | Generic in-shadow dialogs (confirm/choice/prompt/project-picker), the advanced-options popover, and the prompts editor overlay. Exports `window.__ccbModals`. |
| `fs-handles.js` | IndexedDB wrapper storing `FileSystemDirectoryHandle` objects for bookmarked code-project folders (chrome.storage.local can't hold them). Exports `window.__ccbFsHandles`. |
| `document-handler.js` | Project-document lifecycle (add/remove/toggle/estimate/extract text incl. DOCX/ODT/RTF) and the code-project folder scanner (`scanCodeProject`, `syncCodeProjectDocuments`). The scanner uses bounded-concurrency directory traversal + file reads and batched storage IO — see ARCHITECTURE.md "Scan performance". Exports `window.__ccbDocHandler`. |
| `dep-graph.js` | Static, no-AI import/reference graph builder for scanned code projects (JS/TS/JSX resolution + C# symbol-table heuristic). `buildGraph` is async so it can yield to the event loop. Exports `window.__ccbDepGraph`. |
| `code-tree.js` | Interactive checkbox file-tree modal for hand-picking which code-project files to inject, incl. a dependency-aware "load with dependencies" menu. Exports `window.__ccbCodeTree`. |
| `history-view.js` | Unified project list (regular + code projects) + project detail view — now rendered into the Context tab's "פרויקטים" sub-view — plus the History-tab conversation list, per-message preview panel, project documents UI, code-project bookmark/rescan/picker actions, and all row/project dropdowns. Exports `window.__ccbHistoryView`. |
| `chat-features.js` | General Memory card + auto-inject, manual multi-block injection, conversation capture/auto-save, inline 💾 save button on AI messages. Exports `window.__ccbChat`. |
| `content.js` | Orchestrator: shared `state`, Shadow DOM mount, `initModules` wiring, central event switchboard, edit form, Context-tab sub-view toggle (`syncCtxSubview`) + general/project-blocks list render, `ctx-project`→`project` migration, backup export/import, init/routing. Exports `window.__ccb` (consumed by `summarizer.js`). |
| `summarizer.js` | Runs independently of the panel; watches the DOM for a `[[CCB:SAVE]]` marker in an AI response and saves a summary block. |
| `icon.png` / `icon.svg` | Extension icon assets. |
| `FILE_EXTENSIONS_REFERENCE.txt` | Reference notes on file extensions/MIME types used when tuning `ctx-meter.js`/`document-handler.js` token estimation. |
| `AGENT_CONTEXT.md` | Primary entry point for an agent/human picking up this project — current state, last changes, gotchas. |
| `ARCHITECTURE.md` | Full architecture reference — file table, global API surface, module wiring, storage shape, per-module function indices. |
| `CLAUDE.md` | Condensed project index + rules (module split, where to look for what). |
| `CHANGELOG.md` | Dated log of changes. |
| `DEPENDENCIES.md` | Third-party/browser-API dependencies and why they were chosen. |
| `mishley-test-projects/` | Local fixture folders (C# and JS/TS, small and large) used to manually test `document-handler.js#scanCodeProject` and `dep-graph.js#buildGraph` against real multi-file projects. Not loaded by the extension itself. |
