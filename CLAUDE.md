# Context Bank Extension — Project Index

Chrome extension (MV3) — floating sidebar for Gemini chat that manages context blocks, general memory, and conversation history.

## File Map

| File              | Role                                                                  | ~Lines |
| ----------------- | --------------------------------------------------------------------- | ------ |
| `config.js`       | Site selectors, prompts (FRAMING, SUMMARY_PROMPT), active site toggle | 110    |
| `storage.js`      | `loadBlocks` / `saveBlocks` → `window.__ccbStorage`                   | 20     |
| `inject.js`       | Input detection + text injection → `window.__ccbInject`               | 75     |
| `push.js`         | Page shift when sidebar opens → `window.__ccbPush`                    | 40     |
| `ui-styles.js`    | Shadow DOM CSS → `window.__ccbCSS`                                    | 310    |
| `ui-template.js`  | SVG icons + PANEL_HTML → `window.__ccbTpl`                            | 75     |
| `content.js`      | All UI logic, state, business logic (orchestrator)                    | ~980   |
| `summarizer.js`   | Watches for `[[CCB:SAVE]]` marker in AI responses                     | 115    |
| `manifest.json`   | MV3 config, load order, permissions                                   | —      |
| `ARCHITECTURE.md` | Full architecture reference                                           | —      |

**Load order (manifest):** config → storage → inject → push → ui-styles → ui-template → content → summarizer

## Key Globals

- `window.__ccbRawConfig` — exported by config.js, consumed by all modules
- `window.__ccbStorage` — { loadBlocks, saveBlocks }
- `window.__ccbInject` — { findInput, injectIntoInput }
- `window.__ccbPush` — { pushPage }
- `window.__ccbCSS` — CSS string
- `window.__ccbTpl` — { IC, PANEL_HTML }
- `window.__ccb` — public API for summarizer.js { blocks, saveBlocks, loadBlocks, setStatus, renderPanel }

## Storage Schema

All blocks in `chrome.storage.local["blocks"]` as flat object:

```
{ "b_<ts>_<rand>": { id, title, content?, messages?, tags?, kind?, updated, pinned?, autoLoad? } }
```

- No `kind` → Context tab
- `kind: "conversation"` → History tab
- `id: "__general_memory"` → General Memory card

## Active Site

Change `ACTIVE_SITE` in `config.js` → `"gemini"` or `"internal"`
The UI and summarizer are gated to the active site's `AUTO_OPEN_URLS`, so they stay inert on other sites.
Loading a history item now prompts for either DOM-only preview or chat injection; the existing injected history block is replaced on each load.
History bubbles preserve line breaks with `white-space: pre-wrap`, so saved conversations keep more of their original structure.
General Memory now has its own manual injection checkbox in the context card and is injected first when selected.
The sidebar header now includes a left-aligned gear button labeled with the tooltip "אפשרויות מתקדמות".
That menu is a floating popover styled like a UX side menu and includes backup export/import for `context-bank-backup.json`; import replaces the current blocks after confirmation.

## Rules

- After every change: update this file and ARCHITECTURE.md
- Keep the config/content/summarizer/ui split — never merge back into one file
- When editing logic: read content.js. For styles: read ui-styles.js. For prompts: read config.js only.
