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

**Issue filing at time of discovery**: When recon and fix happen in the same session — which is common and fine — a GitHub issue is still required, created *before the fix code is written*. The issue is the audit trail. PR bodies are not searchable by topic; future contributors need to be able to search GitHub for "matcher whitespace bug" and find the diagnosis, not trawl every PR body from a six-month window. The sequence is: discover bug during recon → file issue → write fix → reference issue number in PR → issue closes on merge. Example: a recon surfaces a whitespace-normalisation gap in the rules matcher. The fix is two lines and will land in the same session. File the issue first, write the fix, reference the issue in the PR body. This adds thirty seconds and creates a permanent, searchable record. See `CONTRIBUTING.md` Section 4.5 for the full issue-filing convention.

## Boundary Discipline

When the user instructs "diagnose only," "recon only," "don't take action," "verify only," or any similar scope-limiting language, the constraint is binding. It applies for the entire session until the user explicitly authorises a different scope. It is not overridden by:

- Context summarisation (older instructions remain binding even after compression)
- Intermediate findings (no matter how clear the next step seems)
- Perceived urgency (the user can authorise faster work; you cannot self-authorise)
- Prior successful work in the same session
- The apparent correctness of the proposed change

NEVER take any of these actions without explicit user confirmation in the user's most recent message:

- git commit
- git push
- gh pr create
- gh pr merge
- Modifying production data
- Modifying production infrastructure
- Approving or accepting changes that would otherwise require sign-off

When in doubt about scope, ask. Surface findings as text and stop. Asking costs little; unauthorised action costs trust.

The user's confirmation must be in the immediately preceding message, not implied by earlier conversation. If you find yourself reasoning "the user would obviously want X next," you are about to violate this boundary. Stop and ask.

A correct fix delivered through a boundary violation is still a violation. The correctness of the work does not retroactively authorise it.

If the user retroactively accepts work that violated this boundary (e.g., "just merge it"), this is pragmatism, not validation of the violation. Future sessions must still respect the boundary.

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

## Runtime configuration pattern

The platform uses a profile + override pattern to select between provider implementations across architectural concerns. Set `NEXT_PUBLIC_RUNTIME_PROFILE=mock` (default; local dev) or `live` (deployed). Per-concern overrides (e.g., `NEXT_PUBLIC_AUTH_OVERRIDE`) allow targeted swaps without changing the profile.

| Concern | mock profile | live profile | Implemented |
|---|---|---|---|
| Auth | mock | cognito | Yes (#177, #189) |
| Data | local | dynamo | #178 |
| AI | mock | claude | #181 |
| Cache | memory | (TBD) | future |
| Email sender | mock | ses | future |
| File storage | local | s3 | future |

Resolution order: override env var (if set with valid value) > profile default > `mock` fallback. See `CONTRIBUTING.md` Section 5.8 for the canonical pattern documentation.
