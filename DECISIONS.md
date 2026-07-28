# Decisions

## [2026-07-28] Onboarding guide: extend existing modules, not a new `onboarding.js`
**Decision:** Implement the Phase 5 onboarding guide entirely across the four pre-existing modules — static markup in `ui-template.js`, CSS in `ui-styles.js`, open/close/interaction logic in `ui-modals.js`, and storage (`ccb_onboardingSeen`) in `content.js` — rather than creating a new `onboarding.js` module.

**Alternatives considered:** A dedicated `onboarding.js` module (matching the project's general convention of one focused file per concern, e.g. `code-tree.js`, `chat-features.js`), which would own the guide's content, rendering, and behavior in one place and keep `ui-modals.js`/`ui-template.js` smaller.

**Why:** The guide's content is 100% static (no per-item JS rendering needed) and its behavior — open/close, collapse toggling, a scroll listener, a checkbox — is small (~80 lines) and fits naturally into `ui-modals.js`'s existing stated role ("pure overlay/dialog UI"), exactly the same way `openSettings`/`openScanSettings`/`openPromptsEditor` already work there. The `ccb_onboardingSeen` flag is genuinely self-contained (no other module reads or writes it), so it didn't need its own module either — it follows the exact same load/set-with-guard pattern already established for `ctxWindow`/`docMaxChars` directly in `content.js`. A new file would have added a fifth `init(deps)` module for a feature with no unique data model or cross-module concerns to justify the split.
