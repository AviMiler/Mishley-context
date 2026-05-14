# Context Bank Extension — Project Index

Chrome extension (MV3) — floating sidebar for chat sites (Gemini today) that manages context blocks, general memory, projects, and conversation history.

## File Map

| File              | Role                                                                          | ~Lines |
| ----------------- | ----------------------------------------------------------------------------- | ------ |
| `config.js`       | Site selectors + active site toggle + FRAMING / SUMMARY_PROMPT defaults       | 180    |
| `prompts.js`      | Loads prompt overrides (editable parts only) from storage, per-type FRAMING   | 265    |
| `storage.js`      | `loadBlocks` / `saveBlocks` → `window.__ccbStorage`                           | 20     |
| `inject.js`       | Input detection + text injection → `window.__ccbInject`                       | 80     |
| `push.js`         | Page shift when sidebar opens → `window.__ccbPush`                            | 40     |
| `ui-styles.js`    | Shadow DOM CSS → `window.__ccbCSS`                                            | 1625   |
| `ui-template.js`  | SVG icons + PANEL_HTML → `window.__ccbTpl`                                    | 340    |
| `ctx-meter.js`    | Context window usage meter → `window.__ccbCtxMeter`                           | 400    |
| `ui-modals.js`    | Dialogs + settings popover + prompts editor → `window.__ccbModals`            | 355    |
| `history-view.js` | Projects + history list + conversation preview → `window.__ccbHistoryView`    | 970    |
| `chat-features.js`| GM + capture + manual injection + inline save → `window.__ccbChat`            | 460    |
| `content.js`      | Orchestrator: state, mount, wireEvents, edit form, context list, init         | 945    |
| `summarizer.js`   | Watches for `[[CCB:SAVE]]` marker in AI responses                              | 120    |
| `popup.html/js`   | Toolbar popup → sends `togglePanel` to active tab                              | —      |
| `manifest.json`   | MV3 config, load order, permissions                                            | —      |
| `ARCHITECTURE.md` | Full architecture reference                                                    | —      |

**Manifest load order:**
`config` → `prompts` → `storage` → `inject` → `push` → `ui-styles` → `ui-template` → `ctx-meter` → `ui-modals` → `history-view` → `chat-features` → `content` → `summarizer`

## Module split rationale

`content.js` is the orchestrator: state, mount, the central `wireEvents` switchboard, the edit-form, the small context-list render, and init. Everything else lives in a focused module:

- **`ui-modals.js`** — pure overlay/dialog UI. No business state. Backup export/import stays in `content.js` because it mutates `state.blocks`.
- **`history-view.js`** — history-tab world. Projects, conversation list, the per-message preview panel, dropdowns. Also owns the framing builders (`buildConversationInjectionText`, `buildProjectSectionText`, `formatTranscript`, `buildHistoryMessages`).
- **`chat-features.js`** — interactions with the page's chat. General Memory render+auto-inject, manual injection of selected blocks, "save chat" capture flow, inline 💾 save button on AI messages.

Each module exposes `init(deps)` (matching the `ctx-meter.js` pattern). `content.js` calls each module's `init` during `mountUI` and passes a shared `state` object plus the functions the module needs.

## Key Globals

- `window.__ccbRawConfig` — exported by `config.js`, patched by `prompts.js`, consumed by all modules
- `window.__ccbPromptsAPI` — `ready`, `getEditable`, `getLocked`, `save`, `reset`
- `window.__ccbStorage` — `{ loadBlocks, saveBlocks }`
- `window.__ccbInject` — `{ findInput, injectIntoInput }`
- `window.__ccbPush` — `{ pushPage }`
- `window.__ccbCSS` — CSS string
- `window.__ccbTpl` — `{ IC, PANEL_HTML }`
- `window.__ccbCtxMeter` — `init`, `update`, `watchConversation`, `watchFileInputs`, `openFilesDropdown`, `cleanup`, `getUploadedFiles`
- `window.__ccbModals` — `init`, `showConfirm/Choice/Prompt/ProjectPicker`, `openSettings/closeSettings`, `openPromptsEditor/closePromptsEditor/savePromptsEditor/resetPromptsEditor`
- `window.__ccbHistoryView` — `init`, `render*`, `open*/close*`, `getProjects/getProjectById/getConversationProject`, `buildHistoryMessages/buildConversationInjectionText/buildProjectSectionText/formatTranscript`, `sync*` collapse helpers, `addProject`, `saveProjectView`
- `window.__ccbChat` — `init`, `getGM`, `renderGeneralMemory`, `tryAutoInject`, `injectSelected`, `saveChat`, `inlineReady`, `startMsgObserver`, `stopMsgObserver`
- `window.__ccb` — public API for `summarizer.js`: `{ MSG_SELECTORS, blocks, saveBlocks, loadBlocks, setStatus, renderPanel }`

## Storage Keys

| Key                                | Owner          | Shape                                                  |
| ---------------------------------- | -------------- | ------------------------------------------------------ |
| `chrome.storage.local.blocks`      | content.js     | `{ [id]: block }` — see schema below                  |
| `chrome.storage.local.ccb_prompts` | prompts.js     | `{ manualIntro, manualOutro, gmIntro, gmOutro, ... }` |
| `chrome.storage.local.ctxWindow`   | content.js     | `number` (tokens, used by the meter)                  |

## Storage Schema (blocks)

```
{ "b_<ts>_<rand>": { id, title, content?, messages?, tags?, kind?, updated, pinned?, autoLoad?, projectId? } }
```

- No `kind` → Context tab
- `kind: "conversation"` → History tab; may have `projectId`
- `kind: "project"` → Projects section
- `id: "__general_memory"` → General Memory card (kind: `"general_memory"`, has `autoLoad`)

## Active Site

Change `ACTIVE_SITE` in `config.js` → `"gemini"` or `"internal"`.
The UI and summarizer are gated to the active site's `AUTO_OPEN_URLS`, so they stay inert on other sites.

## Features overview

- **Sidebar** with FAB strip on the left, opens with click or Ctrl+Shift+L
- **Context tab** — manual blocks + General Memory card + context-window meter (with file-token breakdown)
- **History tab** — projects + conversation list with title-search or content-search; pin / rename / assign-to-project / delete
- **Conversation preview panel** — opens on click, lets you search messages, select a subset, and inject (optionally with project instructions)
- **Auto-save chat** via the `[[CCB:SAVE]]` marker (summarizer.js); manual "save chat" captures the DOM directly
- **Advanced options** popover — context-window size, backup export/import (`context-bank-backup.json`), prompts editor
- **Prompts editor** — 4 framing pairs (manual / GM / conversation wrapper / project wrapper); the locked technical markers (`[[CCB:INJECTED]]`, `<context>`, `<memory>`, `<transcript>`, `<project>`) are visible but not editable. The SUMMARY_PROMPT editor is intentionally hidden for now.
- **GM auto-inject** at conversation start (when `autoLoad` is on); resets on URL change along with `lastInjectedConversationId`
- **Multi-block injection** — GM-only uses FRAMING_GM, otherwise FRAMING_MANUAL (GM always goes first if mixed)

## Rules

- After every change: update this file and `ARCHITECTURE.md`
- Keep the current split — never re-merge `ui-modals.js` / `history-view.js` / `chat-features.js` / `content.js`
- When editing dialogs/settings: read `ui-modals.js`. For history/projects/conversation view: `history-view.js`. For GM/save-chat/inject-selected: `chat-features.js`. For mount/wiring/state/edit-form/context-list: `content.js`. For styles: `ui-styles.js`. For prompts defaults: `config.js`.
- Modules access shared state via `_deps.state` and shared helpers via the `_deps` object passed to `init()`. Never read state directly from `window.__ccb*` outside of `init`.
