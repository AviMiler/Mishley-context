# Dependencies

No package manager or build step — this is a vanilla-JS Chrome MV3 extension. Every content-script `.js` file is loaded directly in the order listed in `manifest.json`. All third-party dependencies are **vendored** (checked-in data/binaries, no npm):

## Vendored: tree-sitter (WASM) — `wasm/`

Used only by `background.js` (the service worker) to parse C# and JS/JSX for `dep-graph.js`'s symbol extraction (2026-07-23). Downloaded once from jsDelivr (npm mirror) and committed; updating means re-downloading newer files, there is nothing to "install".

| File | Package / version | Size | Role |
|---|---|---|---|
| `wasm/tree-sitter.js` | `web-tree-sitter@0.25.6` | 147 KB | ESM runtime (why `background.js` is a `"type": "module"` worker) |
| `wasm/tree-sitter.wasm` | `web-tree-sitter@0.25.6` | 201 KB | Core parser engine |
| `wasm/tree-sitter-c-sharp.wasm` | `@vscode/tree-sitter-wasm@0.1.4` | 5.8 MB | C# grammar |
| `wasm/tree-sitter-javascript.wasm` | `@vscode/tree-sitter-wasm@0.1.4` | 376 KB | JS grammar (includes JSX) |

**Version-pairing caution:** grammar `.wasm` files must be ABI-compatible with the runtime. The 0.25.6 runtime + vscode 0.1.4 grammars pairing is verified (Node test suite loads and parses with both grammars); when updating, update the runtime and grammars together and re-run the parse tests. Requires `'wasm-unsafe-eval'` in the manifest's `content_security_policy.extension_pages` — WASM only compiles in the worker, never in content scripts (host-page CSP blocks it there; that's the entire reason `background.js` exists).

## Vendored: o200k_base BPE ranks — `tokenizer/`

Used by `tokenizer.js` (a content script) to produce real token counts instead of a chars→tokens ratio (2026-07-26). Downloaded once from OpenAI's public encodings endpoint and committed; there is nothing to "install", and the file is immutable upstream (an encoding's ranks never change — a new encoding gets a new name).

| File | Source / version | Size | Role |
|---|---|---|---|
| `tokenizer/o200k_base.tiktoken` | `openaipublic.blob.core.windows.net/encodings/o200k_base.tiktoken` | 3.4 MB | 199,998 BPE ranks, one `<base64-token> <rank>` per line |

**No library is vendored — only the data.** The BPE merge loop and the split regex are ~60 lines in `tokenizer.js`, written against the reference algorithm; pulling in a package would have meant a bundler, which this project deliberately doesn't have. Correctness is pinned by a Node harness that compares against `gpt-tokenizer`'s `o200k_base` encoder over 400 fuzz cases, hand-picked Hebrew/English/code/emoji cases, and whole repo source files — 427/427 exact matches.

**Why `o200k_base` and not `cl100k_base`:** its multilingual vocabulary tokenizes Hebrew far more efficiently, and Hebrew accuracy is the entire reason the fallback heuristic has a separate Hebrew divisor. The cost is 3.4 MB instead of 1.7 MB.

**Why not WASM (e.g. `tiktoken`):** a content script is subject to the *host page's* CSP, and chat sites block `'wasm-unsafe-eval'` — the same constraint that forced tree-sitter into `background.js`. Routing token counts through the worker would make every count asynchronous and break the synchronous call chain in `ctx-meter.js#measureMessage`. Pure JS runs in-page, synchronously.

**Loading:** lazily fetched via `chrome.runtime.getURL` on active-site pages only (`content.js#init`), so other pages pay nothing; requires the file in `web_accessible_resources` because a content script's `fetch` is subject to the page's origin. Until it resolves — and if it ever fails — `config.js#estimateTextTokens` transparently falls back to the original heuristic.

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
