# Dependencies

No package manager or build step — this is a vanilla-JS Chrome MV3 extension. Every content-script `.js` file is loaded directly in the order listed in `manifest.json`. The one third-party dependency is **vendored** (checked-in binaries, no npm):

## Vendored: tree-sitter (WASM) — `wasm/`

Used only by `background.js` (the service worker) to parse C# and JS/JSX for `dep-graph.js`'s symbol extraction (2026-07-23). Downloaded once from jsDelivr (npm mirror) and committed; updating means re-downloading newer files, there is nothing to "install".

| File | Package / version | Size | Role |
|---|---|---|---|
| `wasm/tree-sitter.js` | `web-tree-sitter@0.25.6` | 147 KB | ESM runtime (why `background.js` is a `"type": "module"` worker) |
| `wasm/tree-sitter.wasm` | `web-tree-sitter@0.25.6` | 201 KB | Core parser engine |
| `wasm/tree-sitter-c-sharp.wasm` | `@vscode/tree-sitter-wasm@0.1.4` | 5.8 MB | C# grammar |
| `wasm/tree-sitter-javascript.wasm` | `@vscode/tree-sitter-wasm@0.1.4` | 376 KB | JS grammar (includes JSX) |

**Version-pairing caution:** grammar `.wasm` files must be ABI-compatible with the runtime. The 0.25.6 runtime + vscode 0.1.4 grammars pairing is verified (Node test suite loads and parses with both grammars); when updating, update the runtime and grammars together and re-run the parse tests. Requires `'wasm-unsafe-eval'` in the manifest's `content_security_policy.extension_pages` — WASM only compiles in the worker, never in content scripts (host-page CSP blocks it there; that's the entire reason `background.js` exists).

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
