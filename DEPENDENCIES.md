# Dependencies

No package manager, build step, or third-party libraries — this is a vanilla-JS Chrome MV3 extension. Every `.js` file is loaded directly as a content script in the order listed in `manifest.json`.

## Browser APIs relied on

| API | Used in | Why |
|---|---|---|
| `chrome.storage.local` | `storage.js`, `document-handler.js`, `history-view.js`, `content.js` | Persists blocks, prompts overrides, the context-window size, file blobs (`docBlob_<id>`), and per-file code-project content (`codeContent_<id>`). Chosen over `chrome.storage.sync` for size headroom (`unlimitedStorage` permission) — file/document data can be large. |
| `indexedDB` | `fs-handles.js` | `chrome.storage.local` is JSON-only and can't hold a `FileSystemDirectoryHandle`; IndexedDB supports structured clone, so bookmarked code-project folder handles live there instead. |
| File System Access API (`showDirectoryPicker`, `FileSystemDirectoryHandle`) | `history-view.js`, `document-handler.js` | Lets the user bookmark a local folder as a "code project" and re-scan it later without re-picking every time (subject to permission re-verification via `fs-handles.js#verifyPermission`). Chrome-only API — the extension already targets Chrome (MV3), so no polyfill is needed. |
| `DecompressionStream('deflate-raw')` | `document-handler.js` | DOCX/ODT are ZIP archives; this built-in (Chrome 80+) inflates the compressed XML entry without pulling in a ZIP library. |
| `DataTransfer` / synthetic `input`/`change` events | `document-handler.js#injectFilesToChat` | Programmatically attaches stored file blobs to the host page's native `<input type="file">` so uploaded documents can be re-sent to the chat. |

## Why no build tooling
The extension is small enough that plain script tags (via the manifest's content-script array) are simpler to reason about and debug than a bundler — every module is loaded as-is, in a fixed, explicit order. See `CLAUDE.md`/`ARCHITECTURE.md` for the load order and module-split rationale.
