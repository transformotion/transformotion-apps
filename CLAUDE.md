# Transformotion Apps — Claude Code Instructions

This is a pnpm workspace monorepo. Each app lives in `apps/<app>/` with its own `CLAUDE.md`, contracts, infrastructure, and tests.

When working on a specific app, read that app's `CLAUDE.md` first.

Cross-app contracts live in `/contracts/`. Shared code lives in `/packages/`. Platform infrastructure lives in `/infrastructure/`.

Before modifying shared code or platform infrastructure, consider the impact on every app — these changes deploy to all of them.

---

## Branching strategy

- `main` — production. Never commit directly.
- `develop` — integration branch. Never commit directly.
- Feature branches: `claude-code/<feature-name>` off `develop`, PR back to `develop`.
- v0 branches: `v0/<feature-name>` off `develop`, PR back to `develop`.
- After merge to `develop`, CD pipeline deploys to dev automatically.

---

## Where to find things

| What | Where |
|---|---|
| Monorepo structure, import rules, deploy triggers | `MONOREPO.md` |
| Stock Analyser app | `apps/stock-analyser/CLAUDE.md` |
| Budget Tracker app | `apps/budget-tracker/CLAUDE.md` |
| Shared packages | `packages/` |
| Platform Lambda handlers | `functions/` |
| AWS CDK infrastructure | `infrastructure/` |
