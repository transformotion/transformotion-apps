# Stabilisation Freeze

**Status:** ACTIVE
**Started:** 2026-04-20
**Last updated:** 2026-04-21 (sub-phase 3: deploy verification wired)
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

   **2a (complete):** `.env.example` files added to all three app
   workspaces (stock-analyser, budget-tracker, web), each listing every
   required variable with descriptive comments and placeholder values.
   Inventory also surfaced two previously undocumented missing vars:
   `NEXT_PUBLIC_COGNITO_DOMAIN` and `NEXT_PUBLIC_APP_URL` (required by
   Amplify OAuth, absent from CI).

   **2b (complete):** `scripts/ci/check-required-env-vars.sh` added.
   Parses each app's `.env.example` for `[REQUIRED]` tags and asserts
   every required variable is set and non-empty in the target GitHub
   Actions environment before any install, build, or deploy step runs.
   Wired into `deploy-stock-analyser.yml` (dev + prod jobs) and
   `deploy-budget-tracker.yml`. Exits 1 with an actionable error
   listing missing vars and ready-to-paste `gh variable set` commands.
   `deploy-platform.yml` excluded — CDK-only, no frontend env vars.

   **2c (complete):** Structural refactor — every deploy job now
   declares its env block once at the job level. All steps inherit.
   Divergence between the check step and the build step (the bug class
   caught by PR #26) is structurally impossible. No variables added or
   removed; purely a reorganisation.

3. **Deploy verification** (complete) — `scripts/ci/verify-deploy.sh`
   added. After S3 sync and CloudFront invalidation, the final step in
   `deploy-stock-analyser.yml` (dev + prod) confirms:
   (1) the deployed URL responds HTTP 200 and all JS chunks are
   reachable; (2) the commit hash that triggered the deploy is present
   in the deployed bundle (injected via `NEXT_PUBLIC_COMMIT_HASH`,
   rendered as a `data-commit` attribute on the `<html>` element in
   each app's root layout via `lib/build-info.ts`); (3) every
   `[REQUIRED]` `NEXT_PUBLIC_*` variable's value appears as a string
   literal in the deployed bundle. Hard-fails on any check failure.
   A new `[BUILD-INJECTED]` tag was added to the `.env.example`
   tagging convention for CI-injected values; `check-required-env-vars.sh`
   does not match this tag (verified). When CI reports "deployed", it
   now has cryptographic evidence.
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
