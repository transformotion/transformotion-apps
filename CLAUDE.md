# Transformotion Apps — Claude Code instructions

This is a pnpm workspace monorepo containing multiple apps and platform code. Read this file first when starting a session.

## Operating documents

Three documents define how this repository works. Read them before substantive work:

- **[`PLAN.md`](./PLAN.md)** — current trajectory of work. Goals, milestones (M-setup, M0–M14, Backlog), gating relationships. Tells you what's in scope right now and what's deferred.
- **[`CONTRIBUTING.md`](./CONTRIBUTING.md)** — ways of working. Document map, repository conventions, workflow rules, the discipline rule, status-tag system, operating principles. Tells you how to do work correctly.
- **[`docs/architecture/inventory.md`](./docs/architecture/inventory.md)** — living current-state inventory of the platform. What is true about code, infrastructure, and operating state right now. Updated as state changes.

For monorepo structure (current state), import boundaries, and deploy triggers, see **[`MONOREPO.md`](./MONOREPO.md)**.

When working on a specific app, read that app's `CLAUDE.md` first:

- `apps/stock-analyser/CLAUDE.md`
- `apps/budget-tracker/CLAUDE.md`

## Operating mode

Two principles affect almost every session:

**The discipline rule** (`CONTRIBUTING.md` Section 2.1): PRs that change what a normative document describes update that document in the same PR. PLAN.md, CONTRIBUTING.md, MONOREPO.md, README.md, and `inventory.md` are all normative. GitHub Milestone descriptions are also paired with PLAN.md content.

**Verification mode**: Verification work captures findings, it doesn't fix problems. If a verification surfaces a real issue requiring fix work, the issue gets a tracked GitHub Issue per `CONTRIBUTING.md` Section 4.5; the current PR's scope does not expand to fix it. Out of scope and worth being explicit about: the verification PR closes its issue with findings recorded in the inventory; the fix work happens later in whichever milestone owns it.

## Branching strategy

- `main` — production. Never commit directly.
- `develop` — integration branch. Never commit directly.
- Feature branches off `develop`, PR back to `develop`. Naming convention per `CONTRIBUTING.md` Section 4.1 — `claude-code/<feature-name>` for Claude-Code-driven work, `v0/<feature-name>` for v0-pushed work, `<author>/<feature-name>` for manual work.
- After merge to `develop`, CD pipeline deploys to dev automatically.

## Where to find things

Note: some paths are migrating per `CONTRIBUTING.md` Section 3 — see `MONOREPO.md` for current state and `CONTRIBUTING.md` Section 3 for target state.

| What | Where (current) |
|---|---|
| Cross-app contracts | `/contracts/<scope>/` |
| Shared packages | `/packages/` |
| Platform Lambda handlers | `/functions/` (migrating to `/platform/functions/` per M7) |
| Platform infrastructure | `/infrastructure/lib/platform/` (migrating to `/platform/infrastructure/` per M7) |
| Per-app infrastructure | `/infrastructure/lib/<app>/` (migrating to `apps/<app>/infrastructure/` per M7) |
| Migration data artefacts | `/migration-artifacts/<app>/` |
| Architecture invariants | `/docs/architecture/` |
| Archived superseded docs | `/docs/archive/` |

Before modifying shared code or platform infrastructure, consider the impact on every app — these changes deploy to all of them.
