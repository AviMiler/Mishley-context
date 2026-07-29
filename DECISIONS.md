# Decisions

## [2026-07-29] Manual-file dependencies: manual declaration only, not real import-resolution

**Decision:** Give manually-added code-project files a "declare dependencies" capability by re-enabling the existing deps button/dependency-manager UI (`code-tree.js`), letting the user manually assert edges via the pre-existing `project.depGraphOverrides` mechanism. Do NOT feed manual files into `dep-graph.js#buildGraph` and do NOT attempt real import-resolution for them.

**Alternatives considered:** Real auto-detection — feed manual files into `buildGraph()` (new call sites in `history-view.js`/`document-handler.js`) and resolve their imports for real. Since manual files are keyed by bare filename (no relative path under the bookmarked folder), this would have required computing a true relative path via `dirHandle.resolve(fileHandle)` when a manual file happens to live inside the bookmarked folder, plus deciding explicit fallback behavior for files genuinely elsewhere on disk (where relative-path resolution is structurally impossible).

**Why:** Presented to the user as an explicit choice between the two paths (Stage 1 of `enforcing-coding-workflow`, since the request was genuinely ambiguous between them). User picked manual declaration explicitly for speed and because it reuses machinery that already exists and already works correctly for a path with no base-graph entry (`applyOverrides` merges override deltas onto an empty set with no special-casing needed) — same kind of two-real-engineering-paths tradeoff as the decision directly below, at the same bar for a DECISIONS.md entry.

## [2026-07-29] Manual code-project files: refresh silently on content change, only notify on deletion

**Decision:** When a manually-added file is found to have changed content (or size/timestamp) during a rescan, silently refresh the file's content into the stored doc (`doc.content = await file.text()`, same as any scanned file receiving a normal update). Do NOT notify the user, do NOT remove the doc, and do NOT treat "changed" as a removal trigger. Only file deletion/inaccessibility (`FileSystemFileHandle.getFile()` throws) triggers doc removal + user notification.

**Alternatives considered:** Treat any file content change as staleness, remove the doc, and notify the user — requiring deliberate re-add if the file was genuinely modified (not moved/deleted, just edited). This would have required storing comparison metadata (size/lastModified/hash) at manual-add time and detecting changes via that metadata on each rescan.

**Why:** The File System Access API's `FileSystemFileHandle.getFile()` naturally produces fresh file content on every read (no opt-in needed to detect updates). Storing metadata specifically to treat change as a removal trigger would add complexity (extra storage, comparison logic) without a clear benefit — a manually-added file that's being edited is doing exactly what the user expects (the file updates, the project reflects the latest version). Deletion is unambiguous and warrants notification; changes are just normal workflow and should be transparent. This keeps the rescan logic simple and mirrors how scanned files handle updates (silently).

## [2026-07-28] Onboarding guide: extend existing modules, not a new `onboarding.js`
**Decision:** Implement the Phase 5 onboarding guide entirely across the four pre-existing modules — static markup in `ui-template.js`, CSS in `ui-styles.js`, open/close/interaction logic in `ui-modals.js`, and storage (`ccb_onboardingSeen`) in `content.js` — rather than creating a new `onboarding.js` module.

**Alternatives considered:** A dedicated `onboarding.js` module (matching the project's general convention of one focused file per concern, e.g. `code-tree.js`, `chat-features.js`), which would own the guide's content, rendering, and behavior in one place and keep `ui-modals.js`/`ui-template.js` smaller.

**Why:** The guide's content is 100% static (no per-item JS rendering needed) and its behavior — open/close, collapse toggling, a scroll listener, a checkbox — is small (~80 lines) and fits naturally into `ui-modals.js`'s existing stated role ("pure overlay/dialog UI"), exactly the same way `openSettings`/`openScanSettings`/`openPromptsEditor` already work there. The `ccb_onboardingSeen` flag is genuinely self-contained (no other module reads or writes it), so it didn't need its own module either — it follows the exact same load/set-with-guard pattern already established for `ctxWindow`/`docMaxChars` directly in `content.js`. A new file would have added a fifth `init(deps)` module for a feature with no unique data model or cross-module concerns to justify the split.
