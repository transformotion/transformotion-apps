# Stabilisation Freeze

**Status:** ACTIVE
**Started:** 2026-04-20
**Last updated:** 2026-04-22 (backlog milestone; Phase 4 entry conditions; sub-phases 5–6 complete)
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
4. **Lint enforcement** (complete) — `.eslintrc.cjs` (legacy format)
   replaced by `eslint.config.mjs` (ESLint 10 flat config).
   `eslint-plugin-boundaries` v6 wired with native flat-config API and
   `eslint-import-resolver-typescript` for module resolution. All 9
   workspace stub lint scripts (`echo "lint: ..."`) replaced with
   `eslint .`. Boundary rules for all 6 element types enforced:
   apps cannot import from other apps; packages cannot import from apps;
   infrastructure cannot import from apps. `web` element added (was
   missing from legacy config). `.lint-baseline.json` generated and
   maintained. Ratchet script `scripts/ci/check-lint-baseline.sh`
   added; CI hard-fails on new violations. `pnpm turbo lint` replaced
   in CI by the ratchet (turbo task kept for local developer use).
   Follow-up: `eslint-plugin-react-hooks` and
   `@typescript-eslint/eslint-plugin` enabled (plugins were referenced
   in disable comments but not loaded — loading them makes the comments
   valid and surfaces real violations). `apps/web-vite-backup/**` and
   `v0-reference/**` excluded from ESLint (archived code; tracked in
   Issue #32). Baseline regenerated: 43 files, 92 real violations.
   CI growth-check step added: baseline may not grow on a PR unless
   `eslint.config.mjs` was also changed.
   Baseline review pass: `destructuredArrayIgnorePattern`/`argsIgnorePattern`/
   `varsIgnorePattern` added for `^_` convention, eliminating 17 mechanical
   entries. 4 `prefer-const` violations fixed mechanically. Format upgraded
   to entries array with per-entry `reason` fields. Final baseline: 43
   entries, 75 violations. All entries carry real reasons — 18 entries
   reference Issue #17 (Budget Tracker consolidation), 1 entry references
   Issue #33 (recommendations sector filter bug), 24 carry PRE-FREEZE
   catch-all. Issue #33 opened for `filteredStocks` bypass bug in
   recommendations-tab.
5. **Test enforcement** — Vitest tests in `packages/budget-domain`
   wired into CI as a required gate.
6. **Pre-commit hooks** (complete) — Husky v9 + lint-staged v16
   installed at workspace root. Pre-commit hook runs ESLint on staged
   `.ts/.tsx/.js/.jsx` files (respecting `.lint-baseline.json` from
   sub-phase 4) and `tsc --noEmit` on each affected workspace.
   Implemented as `scripts/ci/lint-staged-baseline-check.mjs` (Node.js,
   cross-platform) and `scripts/ci/typecheck-staged-workspaces.sh`.
   `git commit --no-verify` available as escape hatch.
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

#### Entry conditions for Phase 4

Before Phase 4 begins:

1. Every `#NN: investigated, deferred` entry in `.lint-baseline.json`
   must be either resolved (entry removed because the bug is fixed)
   or explicitly re-deferred with documented reasoning. Enumerate
   with:

       jq '.entries[] | select(.reason | test("^#[0-9]+: investigated"))' .lint-baseline.json

2. Review the [Stabilisation backlog](https://github.com/transformotion/transformotion-apps/milestone/1)
   milestone. Every Issue in it should be either resolved, explicitly
   deferred past Phase 4, or moved to a different milestone with
   its own tracking.

3. The "Open follow-ups" section below refreshed to match the
   milestone's current state.

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

## Open follow-ups from stabilisation work

Issues raised during stabilisation that are deliberately deferred
rather than fixed inline. All are attached to the
[Stabilisation backlog](https://github.com/transformotion/transformotion-apps/milestone/1)
GitHub milestone. The milestone is the canonical place to view
current backlog status.

Current snapshot (manually maintained — for live status see the
milestone):

| Issue | Title | Status |
| ----- | ----- | ------ |
| #16 | Add TabErrorBoundary around budget tracker tab content | Open |
| #17 | Consolidate Budget Tracker into apps/budget-tracker/ as standalone deployed app | Open |
| #18 | Deployment infrastructure: env var enforcement and deploy verification | Open |
| #32 | Lint: track and plan removal of web-vite-backup and v0-reference | Open |
| #33 | bug(recommendations): sector filter computed but never applied to rendered stock list | Open |

## Backlog discipline

Every Issue raised during stabilisation should be attached to the
Stabilisation backlog milestone at the time it's raised. This is
not enforced by tooling — it's a convention. To audit:

    gh issue list --state all --json number,title,milestone \
      --jq '.[] | select(.milestone == null and (.title | test("\\b(stabilisation|stabilization|phase|enforcement|consolidation|drift)\\b"; "i"))) | .number'

Any Issue numbers returned that look stabilisation-related should
be either attached to the milestone or explicitly excluded with
reasoning.

## Living document

This file is updated as scope evolves. Every update increments the
"Last updated" date and records the change in the commit message.
