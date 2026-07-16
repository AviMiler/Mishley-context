# Git Instructions

Workflow for this project, used by the `enforcing-coding-workflow` Stage 5 (GIT).

## Branching
- Day-to-day work happens on **`develop`**. `main` is the release branch.
- Never commit directly to `main`. If work needs to start from `main`, branch first.

## Commits
- **Conventional Commits** style, matching existing history:
  `feat:`, `fix:`, `refactor:`, `docs:`, `chore:`, `style:`.
- Subject line in English, concise, imperative mood.
- Stage only the files touched by the current task (code + its doc updates) —
  never a blanket `git add -A`.
- Include spec/doc updates (`CLAUDE.md`, `ARCHITECTURE.md`) in the **same** commit
  as the code they describe.
- Co-author trailer on Claude-made commits:
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`

## Push
- **Do not push automatically.** Push only when the user explicitly asks.
- Never force-push; never skip hooks (`--no-verify`) or signing unless asked.

## Docs to update before committing (per enforcing-coding-workflow)
- `CLAUDE.md` — file map / globals / features when they change.
- `ARCHITECTURE.md` — decisions, function index, data flow when they change.
