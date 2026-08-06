# Decisions

## [2026-08-06] Parallel Sessions: internal site only — Gemini dropped entirely, not deferred

**Decision:** The Parallel Sessions feature (`sessions.js`, an internal iframe-backed tab strip) ships for the internal chat site only. Gemini support was not built, deferred, or feature-flagged — it was dropped from the design outright before Build started.

**Alternatives considered:** Building the feature generically (site-agnostic, reading `AUTO_OPEN_URLS` for whichever site is active) and letting it simply fail silently or show an error for any site that refuses iframe embedding, rather than hard-coding an internal-only assumption anywhere.

**Why:** A direct `curl -I` against `gemini.google.com` returned `X-Frame-Options: DENY` — an unconditional header that blocks iframe embedding regardless of origin, including same-origin framing. This isn't a same-origin/CSP nuance that a different approach could work around; it's Google's own server refusing to be framed at all, for any reason, from anywhere. There is no fallback available (Gemini has no alternate embeddable surface), so "build it generically and let it fail on Gemini" would ship a FAB button and menu entry point that can never work on the site most users associate with this extension's original purpose — worse than not exposing it there at all. The internal site (`dev-mfe-mishley.ips.gov.il`) was confirmed by the user directly (the agent validating this at Stage 1 couldn't reach the VPN-gated domain itself to verify) as allowing iframe embedding, and is already the currently-active site (`ACTIVE_SITE = "internal"` in `config.js`), so this isn't a regression for current usage. **Anyone re-proposing Gemini support for this feature in the future must first re-check whether Google has changed this header** — it was not treated as a soft, revisit-later scope cut; it's a hard platform constraint discovered directly, the same category of finding as ARCHITECTURE.md's "Rejected: migrating to chrome.sidePanel" section above.

## [2026-08-04] Cross-tab sync (E1) self-write guard: monotonic generation counter, not a boolean flag or no guard at all

**Decision:** The `chrome.storage.onChanged` listener that refreshes `state.blocks` from another tab's write applies an incoming snapshot only when `_writeGeneration === _lastSavedGeneration` — a monotonic counter (`_writeGeneration`, incremented on every `saveBlocks()` call) compared against the generation of the most recent write that's actually confirmed durable (`_lastSavedGeneration`, which only ever advances). If there's any local edit not yet confirmed durable — whether it's this tab's own pending write or one about to be overwritten by an external one — the listener defers instead of applying.

**Alternatives considered:** (1) A boolean "ignore my own echo" flag, set before `saveBlocks()` and cleared after. `verify-agent` found this could desync under overlapping coalesced flushes (a second edit queued while the first write is still in flight) and get stuck permanently `true` if a write's promise rejected (`storage.js#saveBlocks` swallows all errors) — silently dropping every subsequent genuine external update forever, a worse failure mode than doing nothing. (2) No guard at all — reasoning that re-applying your own echo onto yourself is idempotent so it doesn't matter. `verify-agent` reproduced with an actual Node simulation that this was WORSE than shipping no listener: because the save-coalescing throttle (`storage.js#saveBlocks`/Phase A) deliberately allows a newer edit to queue while an earlier write is still in flight, that earlier write's OWN echo can arrive back via `storage.onChanged` AFTER the newer, not-yet-saved edit — and unconditionally applying it silently reverts the newer edit. This is reachable from ordinary single-tab rapid editing (e.g. fast checkbox toggling in the code tree), not just genuine multi-tab use, meaning option (2) introduced a real single-tab data-loss bug that didn't exist before E1 at all.

**Why:** Both rejected designs treated "is this update mine" as a point-in-time boolean, when the actual invariant needed is "is there an unconfirmed local edit right now, in either direction." A monotonic generation counter captures that directly: a stale self-echo can never look newer than a not-yet-confirmed local edit (case 2's bug), and a genuinely external write can't clobber this tab's own pending edit either — which, notably, was never actually protected by the original boolean-flag design in the first place, so the generation approach is strictly more correct, not just a fix for the immediately reported bug. Verified via two rounds of `verify-agent` No-Go → fix (this was the third design), with actual Node-level simulations of both the originally-found bug and an adversarial 3-edit-plus-external-write variant, not just static code reading — the race conditions here are real enough that static review alone had already missed them twice.

## [2026-08-04] `storage.js` duplicates `document-handler.js`'s private key-format strings rather than exporting them

**Decision:** `storage.js#codeContentKey(docId)`/`docBlobKey(docId)` are a second, literal copy of the same `` `codeContent_${docId}` ``/`` `docBlob_${docId}` `` format strings `document-handler.js` already builds internally (and keeps private — it doesn't export them). A code comment in `storage.js` flags the duplication and instructs keeping both in sync if either format ever changes.

**Alternatives considered:** Exporting the key builders from `document-handler.js` (via `window.__ccbDocHandler`) and having `storage.js`'s backup/orphan-scan code call the shared exported version instead of re-implementing the format.

**Why:** `storage.js` is loaded very early (before `document-handler.js` in the manifest's content-script order) and is meant to stay a low-level, dependency-free primitive that `document-handler.js` itself sits on top of — adding a reverse dependency (storage.js calling into a module loaded after it) would invert that layering for the sake of two one-line format strings. `verify-agent` confirmed the two copies are byte-for-byte identical as of this change; the accepted risk is a future desync if either format changes without updating both — judged low-probability and cheap to catch (any mismatch would show up immediately as backup/orphan-sweep misses, not a silent corruption) against the cost of the layering violation the alternative would introduce.

## [2026-08-04] D1 (backup content-completeness) scoped to content-only — no chunking/streaming of the export

**Decision:** The finished D1 (`exportBackup`/`importBackupFile` now including/restoring `codeContent_<id>`/`docBlob_<id>` content) stays a single synchronous, non-chunked `JSON.stringify`/`JSON.parse` — the streaming/chunked-export half of the originally-scoped D1 was not built.

**Alternatives considered:** Building the full original D1 scope in the same pass, since `exportBackup`/`importBackupFile` were already being touched to add content-completeness.

**Why:** Asked directly at Stage 1 for this remainder task (the `blocks` key is metadata-only now, and the conversation-history feature that used to dominate backup size is gone, so the original "250MB+ pretty-printed string" motivation for streaming is much less pressing than when it was first raised) — the user chose content-completeness only. A backup that's correct-but-synchronous was judged sufficient; chunking/streaming remains a real, understood gap (large `codeContent_*`/`docBlob_*` payloads can still make a single `JSON.stringify` slow or memory-heavy on a big code project) but was deliberately left out of this pass rather than expanded beyond what was asked.

## [2026-08-04] Existing stored conversation data: purge permanently, not left inert

**Decision:** The storage migration (`content.js#migrateStorage`, v2→v3) deletes every `kind:"conversation"` block and its `conv_<id>` data outright, rather than leaving it sitting in storage unreachable by any UI.

**Alternatives considered:** Leave the data inert — keep the pre-existing move-inline-messages-to-`conv_<id>` step (still needed regardless, to avoid re-bloating `blocks` for anyone not yet on v2) but skip the extra step of deleting the block/key. Zero risk of unwanted deletion, but the data occupies storage forever with no way to reach it.

**Why:** Asked directly, the user chose purge. This project's most recent work before this task (`f2cb07d`, the whole Storage-v2 effort) was specifically about eliminating exactly this kind of storage bloat (one profile had reached ~138MB). Leaving removed-feature data to rot forever would silently reintroduce the same problem class that work had just fixed — defaulting to "leave it inert" would have been inconsistent with the project's own recent priorities without a real reason to choose it.

## [2026-08-04] Backup format: clean cut to v3, not preserve-on-import

**Decision:** `exportBackup`/`importBackupFile` bumped to `BACKUP_VERSION = 3`. New exports never write a `conversations` section; an old v2 backup file's `conversations` data is ignored on import rather than restored into `conv_<id>`.

**Alternatives considered:** Preserve-on-import — keep writing an always-empty `conversations` key for shape stability, and still restore an old backup's real conversation data into `conv_<id>` on import (orphaned/unreachable, same philosophy as leaving existing data inert).

**Why:** This pairs with the purge decision above — restoring conversation data on import while a migration on the very same load path exists purely to delete that data would be self-defeating (the freshly-imported blocks would just get purged again). The user confirmed the clean-cut option directly.

## [2026-08-04] Tab bar removed entirely rather than kept as a single dead tab

**Decision:** With the History tab gone, the two-tab strip (`.tabs`/`.tab`/`#tabIndicator`) was removed entirely rather than kept as a one-item strip showing only "Context".

**Alternatives considered:** Keep the tab bar with just the Context tab, for a smaller diff and less template/CSS churn.

**Why:** A one-item tab strip has nothing to switch between — it's UI chrome with no function, and finishing the removal properly (rather than leaving a visible relic) was judged worth the larger diff. This was Stage 1's own recommendation, treated as an implementation call rather than a product ambiguity since the request was about the feature, not the chrome around it. (A later follow-up removed the "Context" title text that briefly replaced the tab strip too, leaving the header with no title/label at all — a direct user request, not a further design call.)

## [2026-08-04] `history-view.js` keeps its filename despite being Projects-only now

**Decision:** The module — now purely the Projects world after every History/conversation function was removed — was not renamed to something like `project-view.js`.

**Alternatives considered:** Rename it to match its actual (now Projects-only) contents.

**Why:** A rename would churn the manifest's content-script load order, every `_deps.historyView` cross-module reference (used by `content.js`, `chat-features.js`, `code-tree.js`), and the git blame/history of a ~2000-line file — all for a cosmetic naming mismatch with no functional benefit. A comment was added at the top of the file explaining the mismatch explicitly instead, so a future reader isn't left wondering why a "history" file has no history code in it.

## [2026-08-04] Restore `.cv-footer`/`.cv-load-btn` under their existing names, not rename them

**Decision:** When Stage 3 verification caught that deleting these two CSS classes broke `#depPickerView`'s save button (an unrelated surviving feature that also used them), the fix restored both rules verbatim under their original names rather than renaming them to something generic and updating the template to match.

**Alternatives considered:** Give `#depPickerView`'s footer its own equivalently-styled classes (e.g. `.dp-footer`/`.dp-save-btn`), leaving the `cv-` prefix to die with the rest of the conversation view.

**Why:** verify-agent's own fix recommendation called this the smallest correct fix, and it is: no template change needed, no risk of missing a second reference to the old names, and a one-line comment at the restored rules explains that the `cv-` prefix is now a naming leftover with `#dpSaveBtn` as the surviving user — which is honest about the naming debt without paying the cost of fixing it in a task that was about removing a feature, not renaming CSS classes.

## [2026-07-30] Storage/perf fix ships as Phase A only — B/C/D/E/F deferred, not descoped

**Decision:** Of the 6-phase plan validated at Stage 1 (spec-doc-agent) for the ~138MB `blocks`-key write-amplification bug, only Phase A (stop the write amplification itself: move `messages[]`/`depGraph` off the block, coalesce `saveBlocks()`, migrate existing data) shipped this round. Phases B (bounded conversation growth/retention), C (History-tab render perf), D (backup/orphan hygiene, except a forced partial slice — see the backup decision below), E (cross-tab sync), and F (deferred low-priority items) were not built.

**Alternatives considered:** Building all 6 phases in one pass, since they were already scoped together and Phase A's async-ification of `messages[]` access touches some of the same call paths B/C would touch.

**Why:** Phase A is the one that actually removes the freeze — the user's core complaint — and it changes a synchronous contract (in-memory `b.messages`, always resident) to an asynchronous one across roughly 30 call sites. That's a large enough behavioral change to verify and ship on its own before layering further changes (retention deletion, render virtualization, cross-tab listeners) on top of a not-yet-real-world-tested foundation. Shipping it alone also means if something is wrong with Phase A once tested against the user's actual 138MB profile, the fix is isolated rather than tangled with five other concurrent changes.

## [2026-07-30] Conversation content-search: full async search with progress, not an inline snippet-index or a scoped-down search

**Decision:** After Phase A moved `messages[]` off the block (so it's no longer synchronously scannable in memory), History-tab content-search now awaits `ensureConvMessagesMany`/`storage.js#loadConvMessagesBatch` to load the messages of conversations in scope, with progress shown while it runs, rather than scanning an in-memory copy.

**Alternatives considered:** (1) Keep a lightweight snippet/index (e.g. first ~200 chars) inline on the block for instant search, trading full accuracy for speed. (2) Scope content-search down to only the currently-open conversation preview, dropping cross-conversation content-search entirely.

**Why:** This was a genuine spec contradiction flagged by `spec-doc-agent` at Stage 1 (not something inferable from the existing spec) and put to the user directly. The user chose full accuracy over speed — search should never miss a real match or search stale/truncated text — accepting that a content query now costs more than a title query and takes visibly longer on a large history, mitigated by the progress indicator already built for exactly this kind of long-running operation.

## [2026-07-30] Migration (`migrateStorageV2`) runs automatically on first load, with a progress bar — not as an explicit user-triggered action

**Decision:** The one-time split of the existing (potentially ~138MB) `blocks` map into per-item `conv_<id>`/`depGraph_<projectId>` keys runs automatically inside `loadBlocks()`, guarded by `ccb_storageVersion`, showing progress via the pre-existing `setProgress`/`clearProgress` indicator — the same one built for long-running scans.

**Alternatives considered:** Requiring an explicit user-triggered action (e.g., a button in Advanced Options) before running the migration, given its potential size/duration and that this is the first migration in this codebase operating at this scale (the existing `migrateCtxProjects()` precedent runs on small, near-instant data).

**Why:** `spec-doc-agent` flagged this as genuinely ambiguous at Stage 1 — no existing spec precedent covers a migration at this scale. Presented to the user directly; the user chose automatic-with-progress, reasoning that an extra manual step before the extension is even usable again adds friction without adding safety (the migration is interruption-safe by construction — batched writes-before-strip — so there's no real risk an explicit trigger would have mitigated).

## [2026-07-30] Auto-save no-op check: compare `messageCount`+`lastMsgLen`, not the last message's text

**Decision:** `chat-features.js#persistConversation`'s debounced auto-save now decides whether anything actually changed by comparing the block's `messageCount` and `lastMsgLen` fields, instead of re-reading and comparing the last message's actual text.

**Alternatives considered:** Keep comparing last-message text directly, which is simpler and was already correct — but would require loading the conversation's `messages[]` back into memory (via `ensureConvMessages`) on every single 2.5s tick just to perform the comparison, defeating a meaningful part of Phase A's point (the tick is the single hottest `saveBlocks()`-adjacent call site).

**Why:** A metadata-only proxy (message count + last message's length) is cheap to keep on the block already-loaded in memory, and false positives (same count+length but different text) are not a realistic concern for a monotonically-growing chat transcript where each tick either appends a new message or extends the in-progress streaming one.

## [2026-07-30] `buildHistoryMessages` kept synchronous behind a per-tab cache, rather than making every reader `async`

**Decision:** `history-view.js#buildHistoryMessages(b)` still returns synchronously (`b.messages || state.convCache.get(b.id)`), instead of becoming `async` and reading `conv_<id>` directly. Only 3 call sites (`openConversationView`, the History row click handler, and content-search) `await` a load into `state.convCache` first; every other existing reader is untouched.

**Alternatives considered:** Making `buildHistoryMessages` itself `async` and pushing `await` up through every call site that (transitively) reads a conversation's messages — the more "textbook correct" refactor once the underlying storage read became asynchronous.

**Why:** The async blast radius of Phase A was already large (~30 `saveBlocks()` call sites plus every messages-reader); keeping the read path synchronous behind an explicitly-populated cache confined the actual `async`/`await` changes to the 3 places that generate real UI transitions (opening a view, clicking a row, searching), while every quieter internal reader of `buildHistoryMessages` needed zero changes. `verify-agent` confirmed no cold-cache path reaches the synchronous branch without an intervening await having populated it first.

## [2026-07-30] Backup v2 scoped to conversations + depGraphs only — not the full originally-planned backup-completeness fix

**Decision:** `content.js#exportBackup`/`importBackupFile` now include `conversations`/`depGraphs` alongside `blocks` (format `{ __ccbBackupVersion: 2, exportedAt, blocks, conversations, depGraphs }`), fixing the fact that Phase A alone would have made every exported conversation silently empty (messages live in `conv_<id>`, not on the block, so the old bare-`blocks` export would no longer capture them). `codeContent_<id>`/`docBlob_<id>` (file blobs/code text) are still NOT included, and export is still a single synchronous, non-chunked `JSON.stringify`.

**Alternatives considered:** Shipping Phase A without touching backup at all, and separately flagging the now-broken backup as a regression to fix in a later task; or building the full originally-scoped D1 (chunked/streamed export + full content-blob inclusion) in this same round since it was already touched.

**Why:** Shipping Phase A with a silently-broken backup was not acceptable — an export that looks successful but discards every conversation's content is worse than not touching backup at all, so this was treated as a forced, in-scope consequence of A1/A2 rather than an optional nice-to-have. Going further to the full D1 scope (streaming, full blob inclusion) was deliberately left out since it wasn't required to keep backup *correct*, only to make it more *complete* — that's still approved (see AGENT_CONTEXT.md/CHANGELOG.md) but pending its own build/verify pass.

## [2026-07-30] "Custom" dependency-load picker scope corrected same day: per-file candidates, not whole-project browsing

**Decision:** Rebuilt the picker opened by the new "התאמה אישית" menu item to be scoped to the specific file whose "אפשרויות תלויות" menu opened it (`openDepPicker(doc)` — the missing `doc` argument in the first version was literally the bug). It now shows exactly two sections mirroring that file's own "ניהול תלויות" (dependency manager) screen — direct dependencies and indirect dependencies (`code-tree.js#dpComputeCandidates`/`dpRenderRow`, reusing `effectiveGraph()`/`computeIndirectDeps()` rather than reimplementing them) — with checkboxes starting **pre-checked** (except an indirect file already on that path's ignore list, which starts unchecked), and Save now always includes the clicked file itself in addition to whatever's checked. Dependents are out of scope, covered separately by the existing "תלויים" menu item.

**Alternatives considered:** None at design time this round — this replaced the first version outright rather than choosing between competing designs, since the first version's whole-project checkbox tree was rejected by the user as pointless/redundant with the main inline tree (which already supports the same manual multi-select, one row/folder at a time).

**Why:** The first version was built on a misreading of the request, confirmed directly by the user's rejection after trying it — not a spec ambiguity `spec-doc-agent` could have caught at Stage 1 (both readings of the original request text were plausible on paper; only hands-on use surfaced that a whole-project browser added nothing over the existing tree). This correction went through a full plan-mode review + write-up with the user, including two follow-up `AskUserQuestion` rounds resolving the candidate-list scope (direct+indirect, no dependents) and the default-checked-state (pre-checked, with the ignore-list exception), then explicit approval via `ExitPlanMode` — treated as Stage 1 (spec-validate) for this correction in place of a fresh `spec-doc-agent` Invocation 1, per the coordinator's explicit note. The additive-only Save decision directly below is **unchanged** by this correction — only the picker's candidate scope and default-checked state changed, not whether Save can turn files off.

## [2026-07-30] "Custom" dependency-load picker Save is additive only, not a full-replace of the enabled set

**Corrected, same day:** see the decision directly above — the picker's *candidate scope* (whole-project → this file's own direct+indirect dependencies) and *default-checked state* (blank → pre-checked, with an ignore-list exception) were both corrected after the user rejected the first version as redundant with the main tree. The additive-only Save semantics described below were **not** part of that correction and still hold exactly as decided here.

**Decision:** The new "התאמה אישית" full-pane file picker's Save button is additive only — it calls `enableFilesForProject(project.id, checkedPaths)` (default `enabled = true`), the exact same call other 4 deps-menu options already use. Every file the user left unchecked keeps whatever `enabled` state it already had; nothing is ever turned off by this feature.

**Alternatives considered:** Full-replace — after Save, the project's entire enabled-set becomes EXACTLY the checked files, turning off everything else (including files enabled before the picker was opened). This was the more "obviously useful" reading at first glance: a purely additive picker is largely redundant with the checkboxes already available in the main inline tree, so the main argument FOR building a dedicated full-screen picker at all is that it can do something the inline tree can't — namely, replace the whole selection in one action instead of manually unchecking dozens of files first.

**Why:** Stage 1 (`spec-doc-agent`) flagged this as a genuine ambiguity with real data-loss risk if guessed wrong (full-replace could silently disable many already-enabled files) and required an explicit user answer before Build rather than inferring intent, despite the agent's own lean toward full-replace for the reason above. Presented to the user directly; **the user confirmed additive**, matching the literal wording of their own request ("יסמן... את הקבצים שנבחרו" — "will mark the files selected") and the mental model of the other 4 menu options, none of which ever turn a file off. The blank-start-checkbox behavior (picker never pre-populates from current `enabled` state) followed automatically from this decision — additive semantics mean a checked box unambiguously means "add this," so pre-checking already-enabled files would have implied "uncheck to disable," which Save doesn't actually do.

## [2026-07-30] Manual GM/project-instructions injection disabled during every-mode — closes the trade-off accepted below; no second-layer filter added to `injectSelected()`

**Decision:** Disable the manual-injection checkbox for GM/project instructions outright whenever that source's own auto-inject mode is `"every"` (`chat-features.js#renderGeneralMemory`, `history-view.js#renderProjectInstructionsCard`), with defensive `state.selected` cleanup both at render time and at the mode-badge's start→every click transition. Do **not** additionally filter `state.selected` for every-mode sources inside `injectSelected()` itself as a second defensive layer.

**Alternatives considered:** Add the same every-mode filter as a second check directly inside `injectSelected()` — defense-in-depth, consistent with the layered-guard style already used elsewhere in this codebase (e.g. `_interceptSend`'s own guards) — so the manual-injection path could never send a stale every-mode-selected id even if some future code path added to `state.selected` without going through a render first.

**Why:** `verify-agent` traced every call site that can add to or read `state.selected` and confirmed the render-time removal is unconditional and re-runs on every render that could plausibly precede a click on `#injectBtn` — there is no reachable path today where a stale every-mode id survives to `injectSelected()`. A second filter there would be speculative hardening against a path that doesn't currently exist, not a fix for a real gap, so it was left out to keep the change minimal and traceable to the actual bug being closed. This decision directly closes the risk accepted immediately below: the earlier entry's accepted edge case (GM-alone/instructions-alone manual load duplicating with every-mode) can no longer occur at all, since the checkbox that would trigger it is now unavailable exactly whenever that risk condition holds.

## [2026-07-30] Per-message auto-inject dedup guard: narrow fix (`[[CCB:CTX]]` only), accept the GM-alone/instructions-alone duplicate edge case

**Decision:** In `chat-features.js#_interceptSend`, narrow the dedup guard that decides whether to skip building the every-mode GM/project-instructions prefix so it checks only for `[[CCB:CTX]]` (the marker unique to that prefix itself), not `[[CCB:INJECTED]]` (a marker shared by five unrelated framing pairs: GM, manual prompts, conversation loads, project instructions, and file injections). This fixes the confirmed bug where loading files/prompts/a conversation without immediately sending silently suppressed that turn's every-mode context on the next real send.

**Alternatives considered:** (1) Status quo — keep checking both markers; rejected outright, since it's the confirmed bug itself. (2) Source-aware guard — instead of a blanket marker check, look for the specific `<memory>`/`<project>` inner tags already present in the box, suppressing only the specific source that's already manually loaded rather than blocking the whole every-mode prefix. This would have closed the GM-alone/instructions-alone duplicate case that the narrow fix reopens, but still had a residual gap: `injectSelected()`'s mixed-block "טען פרומפטים" selection (GM combined with other blocks) wraps everything in the generic `FRAMING_MANUAL`/`<context>` tag without a distinguishing `<memory>`/`<project>` sub-tag, so that combination wouldn't be reliably detectable under this approach either — meaning it adds real code complexity to close only part of the gap, not all of it.

**Why:** Presented to the user as an explicit choice between the two real fix directions (Stage 1 of `enforcing-coding-workflow`, since the guard's `[[CCB:INJECTED]]` check was traced to a deliberate, documented double-wrap-prevention comment, not an oversight — narrowing it has a real, traceable regression). The user picked the narrow fix explicitly for simplicity and to resolve the reported bug cleanly, knowingly accepting that manually loading GM (or project instructions) ALONE via "טען פרומפטים" while that same source is in every-mode can duplicate its content in the very next sent message. This is a known, low-probability edge case (requires a specific combination: single-source manual load + that same source in every-mode + no edit before sending) with an existing mitigation already in the product (the undo-last-injection feature) if it's ever actually hit — not silently overlooked.

**Closed, same day:** see the decision directly above — the manual-injection checkbox for a source is now disabled outright whenever that source is in every-mode, so this accepted edge case can no longer occur.

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
