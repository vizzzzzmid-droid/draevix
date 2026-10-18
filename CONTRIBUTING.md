# Contributing to Draevix

Thanks for helping out. This is a small project, so the process is short — but the rules below keep `main` green.

## Workflow

1. Fork the repo (or branch off `development` if you have write access).
2. Target the **`development`** branch with your pull request.
3. Title the PR `fix(issue-number): short description` (or `feat`/`chore`). Reference an issue that was discussed first.
4. Keep it to one feature or fix per PR.

## Before you push

From the repo root:

```bash
bun run magic   # format + typecheck + lint
bun run test    # all unit tests
```

Both must pass. If your change needs it, add or update tests (`bun test <path>` inside the owning package runs a single file while you work).

Other useful commands:

```bash
bun run knip        # dead code / dependency audit — must report nothing
bun run test:e2e    # Playwright end-to-end suite (needs browsers: bunx playwright install)
```

## Conventions

- Monorepo managed with Bun workspaces: `apps/*` are deployables, `packages/*` are libraries. Never import across workspaces except through their declared entry points (`@draevix/shared`, `@draevix/ui`, `@draevix/plugin-sdk`).
- i18n: user-facing strings go into `apps/client/src/i18n/locales/en/*.json` first (English is the fallback locale), plus Russian. `bun --filter @draevix/scripts synci18n` reports keys missing from other locales.
- Commits are short and imperative: `fix(music): ...`, `feat(client): ...`, `chore(desktop): bump to ...`.
- Don't commit `apps/server/data`, `node_modules`, lockfiles inside workspace subfolders (the root `bun.lock` is the only one), or secrets. The owner token printed on first launch must never end up in logs, screenshots or issues.
