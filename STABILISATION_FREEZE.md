# Stabilisation Freeze

**Status:** ACTIVE
**Started:** 2026-04-20
**Last updated:** 2026-04-21
**Expected end:** Once Phase 1 (foundations) and Phase 2
(executable contracts) are complete, the freeze on stabilisation
work lifts. The Phase 4 stock analyser migration begins under
normal feature-development cadence on the new foundation.

## What this means

No new features will be built in any Transformotion repo during
this freeze. Only stabilisation work is permitted. The phases below
are the authoritative scope.

## Operating principle

Foundation first, symptoms second. When a diagnostic reveals a live
bug, the default action is to log it as an Issue and defer the fix
until the foundation supports it correctly. Symptom-fixing during
the freeze risks recreating the drift the freeze was declared to
eliminate.

## Phase plan (authoritative — execute in order)

### Phase 0 — Scope freeze and repo hygiene (COMPLETE)
- Scope freeze declared
- Repo hygiene (gitignore, untracked artefacts, stale folders)
- Migration invariants preserved from monolithic stock analyser
- Pre-existing contract drift fixed (`fn-budget-settings`)
- Auth hardening rescued from forgotten stash

### Phase 1 — Foundations (IN PROGRESS)

Phase 1 is "build the enforcement and deployment infrastructure
such that, when we eventually redeploy, the result is correct,
complete, and self-verifying." Order matters.

Sub-phases:

1. **Strategic checkpoint and tracking Issues** (this update)
2. **Environment variable foundation** — single source of truth for
   required env vars across all apps and environments. `.env.example`
   checked in. CI verifies all required vars exist before deploying.
   Drift between local, GitHub Actions, and AWS becomes impossible.
3. **Deploy verification** — every deploy workflow ends by confirming
   the deploy actually succeeded and the deployed version matches
   the commit that triggered it. CI says "deployed" only when it
   can prove it.
4. **Lint enforcement** — ESLint flat config migration, real
   workspace lint scripts, boundary rules enforced in CI.
   eslint-plugin-boundaries flat-config compatibility resolved.
5. **Test enforcement** — Vitest tests in `packages/budget-domain`
   wired into CI as a required gate.
6. **Pre-commit hooks** — Husky + lint-staged for typecheck and
   lint on staged files.
7. **Budget Tracker consolidation** — see Issue #17. Sub-PRs for
   cleanup, reconciliation, API Gateway rollback, deploy pipeline,
   launchpad fix, route cutover.

### Phase 2 — Executable contracts

Markdown contracts in `/contracts/` converted to Zod schemas in a
new `packages/contracts` package. Lambda handlers validate
requests and responses against schemas. API client validates
responses on receipt. Contract tests assert real Lambda responses
parse against the schemas. The class of bug that caused the
`BudgetSettings` drift becomes impossible.

### Phase 3 — IaC policy enforcement

cdk-nag integration in CI. Custom rules encoding platform
invariants (e.g., "exactly one shared platform API Gateway" —
catches the BudgetTrackerApiStack drift class). Snapshot tests
on synthesised stacks.

### Phase 3.5 — Verified redeploy

With the foundation in place, redeploy from current `develop`
against the dev environment. Verify everything reaches dev as
expected. Steve retests the original three Budget Tracker bugs
(sign-in loop, data import, budget tab crash). Any that remain
are real bugs to fix on a trustworthy foundation.

### Phase 4 — Stock analyser migration

Migrate the monolithic `stock-signal-analyser.html` from the
separate `transformotion/stock-analyser` repo into
`apps/stock-analyser/` as proper Next.js components, with all 16
invariants from `MIGRATION_INVARIANTS.md` covered by tests.
Decommission the monolithic repo.

### Phase 5 — v0 operating model

With the foundation stable, decide and document how (or whether)
v0 fits back into the development cycle. Decision deferred until
Phase 4 completes.

## How to know the freeze is lifting

The freeze on stabilisation work lifts at the end of Phase 2.
Phase 4 (stock analyser migration) and Phase 5 (v0 model) are
structured work, not freeze-period stabilisation.

The freeze ends entirely when Phase 4 ships and the monolithic
stock analyser repo is archived.

## Living document

This file is updated as scope evolves. Every update increments the
"Last updated" date and records the change in the commit message.
