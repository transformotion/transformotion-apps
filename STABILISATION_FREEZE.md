# Stabilisation Freeze

**Status:** ACTIVE
**Started:** 2026-04-20
**Last updated:** 2026-04-24 (sub-phase 7e-docs amendment: auth model revised — 3-group Dimension A, single-owner invariant, 4 auth helpers, detailed invitation and revocation flows; sub-phase-7e-plan.md updated to match)
**Expected end:** Once Phase 1 (foundations) and Phase 2
(executable contracts) are complete, the freeze on stabilisation
work lifts. The Phase 4 stock analyser migration begins under
normal feature-development cadence on the new foundation.

## Architectural discipline

All architectural invariants are documented in [docs/architecture/](./docs/architecture/). **Any PR changing what those documents describe must update the relevant document in the same PR.** Architecture documents are the source of truth; code conforms to them, not the other way around.

The discipline rule applies from sub-phase 7e-docs forward. Pre-existing architectural decisions have been migrated to `docs/architecture/` as part of that sub-phase.

---

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
5. **Test enforcement** (complete) — Vitest tests in `packages/budget-domain`
   (56 tests, 6 files) wired into CI via `pnpm turbo test` as a required gate.
   `--passWithNoTests` added to 13 workspace packages that have no test files.
   `vitest` added to root devDependencies to fix Linux hoisting in CI.
6. **Pre-commit hooks** (complete) — Husky v9 + lint-staged v16
   installed at workspace root. Pre-commit hook runs ESLint on staged
   `.ts/.tsx/.js/.jsx` files (respecting `.lint-baseline.json` from
   sub-phase 4) and `tsc --noEmit` on each affected workspace.
   Implemented as `scripts/ci/lint-staged-baseline-check.mjs` (Node.js,
   cross-platform) and `scripts/ci/typecheck-staged-workspaces.sh`.
   `git commit --no-verify` available as escape hatch.

   **Sub-phase 6 follow-up (2026-04-22)** — `typecheck-staged-workspaces.sh`
   updated to exclude `@transformotion/infra` (infrastructure/) from
   pre-commit typecheck. CDK typecheck is too slow (60–120s) for the
   "fast feedback" goal of pre-commit hooks, and has been observed
   hanging entirely. CI's `pnpm turbo typecheck` still covers
   infrastructure, so no verification coverage is lost. A 60s per-
   workspace timeout also added as belt-and-braces defence.
7. **Budget Tracker consolidation** — see Issue #17. Executed as sub-phases
   7a–7h in order. See below for the full plan.

   **Open design decisions (resolve before starting 7b)**:
   - Root path (`/`) behaviour after cutover: redirect to `/launchpad/`?
     Serve a static placeholder? Leave as `apps/launchpad` root?
   - Tile visibility during transition (while only stock-analyser is at
     its new basePath): show Budget Tracker tile as "coming soon" or hide?
   - Migration flow: keep `EmptyStateWithMigration` in `transactions-tab.tsx`
     or replace with a link to the standalone `/migrate` page?
   - API Gateway: keep Budget Tracker's own gateway (`3ndfaitweb`) or
     restore to platform gateway (see 7f)? The separate gateway is currently
     live and working; the rollback is optional polish.

   **Sub-phase 7a — Diagnostic (complete).** Read-only investigation.
   Key findings: S3 is already path-based (all routes served from
   `apps/stock-analyser` today). BT tree has 7 of 14 files diverged from SA.
   `rules-tab.tsx` `pattern` vs `pattern.source` bug logged as Issue #37.
   Cognito callbacks still reference `/budget` not `/budget-tracker`.
   Full findings in `docs/sub-phase-7a-diagnostic.md`.

   **Sub-phase 7b — `apps/stock-analyser` basePath migration.**
   Add `basePath: '/stock-signal'` to `apps/stock-analyser/next.config.mjs`.
   Update `deploy-stock-analyser.yml` to path-scoped S3 sync
   (`apps/stock-analyser/out/stock-signal → s3://.../stock-signal --delete`).
   Update CloudFront 403/404 error-page to serve `/stock-signal/index.html`
   (currently serves root `index.html`). **Risk:** breaks current prod URL
   for stock-analyser. Coordinate with Steve before deploying.

   **Sub-phase 7b.5-beta — Close Stock Analyser + claude-proxy authorization gap (this PR).**
   Stock Analyser API Lambdas (portfolio, watchlist, analysis-cache) and
   `functions/claude-proxy` had no group-based authorization checks —
   any authenticated Cognito user could call them. Added `requireGroup`
   calls matching Budget Tracker's existing pattern:
   `requireGroup(auth, 'stock-app', 'admin')` on SA Lambdas,
   `requireGroup(auth, 'stock-app', 'budget-app', 'admin')` on
   claude-proxy (broader because either app may legitimately use it).
   Note: `cycle-check` skipped — it is an EventBridge-scheduled stub with
   no API Gateway auth context. Platform Lambdas (accounts, user,
   invitations, first-login, forgot-provider) deferred to Issue #42.

   **Sub-phase 7b.5-alpha — Three-client Cognito permission model (COMPLETE).**
   Replaces the single shared `WebAppClient` with three distinct app
   clients: `LaunchpadAppClient` (renames WebAppClient; social IDPs),
   `StockAnalyserAppClient` (new; Cognito only), and
   `BudgetTrackerAppClient` (rebuilt and relocated from
   `budget-tracker-tables-stack.ts` to `auth-stack.ts` for construct
   consistency). Callback URLs corrected — previously `/budget`, now
   `/budget-tracker`. Pre-flight read confirmed BudgetTrackerClient
   was in budget-tracker-tables-stack.ts; approach accommodated
   accordingly. Supersedes PR #40 (LaunchpadAppClient rename was
   standalone; this PR does it as part of the split).
   Pre-token-generation Lambda and OAuth scope-based gating deferred
   to Issue #42.

   **Sub-phase 7c — `apps/budget-tracker`: static export + basePath.**
   Add `output: 'export'` and `basePath: '/budget-tracker'` to
   `apps/budget-tracker/next.config.mjs`. Set `trailingSlash: true`.
   Verify `pnpm build` produces `out/budget-tracker/index.html`.
   Decide whether to fix TypeScript now or flip `ignoreBuildErrors: false`
   after the reconciliation pass (7d).

   **Sub-phase 7d — Component tree reconciliation (Issue #37).**
   BT tree is the canonical destination. Before deleting the SA copy:
   - Port `builtinRule.pattern.source` fix from SA `rules-tab.tsx` to BT
     (fixes Issue #37).
   - Port `EmptyStateWithMigration` from SA `transactions-tab.tsx` to BT
     (or replace with link to standalone `/migrate` page — see design decision
     above).
   - Remove `@ts-nocheck` and fix TypeScript in BT's `budget-tab.tsx`,
     `rules-tab.tsx`, `transactions-tab.tsx`.
   - Confirm `id: string` UUID change in `app-shell.tsx` is end-to-end correct.
   - Diff and reconcile remaining 4 diverged files (`builtin-rules.ts`,
     `types.ts`, `review-tab.tsx`, one more).

   **Sub-phase 7e — Auth and permissions migration.**
   Full auth model migration — see [docs/sub-phase-7e-plan.md](./docs/sub-phase-7e-plan.md)
   for the detailed execution plan. Named sub-sub-phases in order:
   `7e-prep-1` (new Cognito groups), `7e-prep-2` (dual-gate handlers),
   `7e-pretoken` (pre-token-generation Lambda with invariant reconciliation),
   `7e-auth-middleware-extend` (4 new auth helpers), `7e-lambda-authorization-migration`
   (migrate all call sites), `7e-invitation-api` (full invitation model with two
   entry points and transactional redemption), `7e-invitation-ui` (launchpad admin
   + in-app invite forms), `7e-signup-reconciliation` (reconcile-invitation Lambda),
   `7e-launchpad-tiles` (wire real Cognito session, replace `MOCK_USER`),
   `7e-forgot-provider-fix` (federated-user lookup via `ListUsersCommand`),
   `7e-cleanup` (remove old groups, delete `requireGroup`).

   **Sub-phase 7f — API Gateway rollback (optional).**
   Refactor `BudgetTrackerApiStack` to consume the platform API Gateway via
   string ARN/ID outputs (`Fn.importValue`) rather than L2 construct props.
   This eliminates the separate `budget-tracker-api-dev` gateway (`3ndfaitweb`)
   and routes Budget Tracker through `transformotion-api-dev` (`yqtrjzrnp3`),
   consistent with all other apps. See `docs/sub-phase-7a-diagnostic.md` §5
   for the fix pattern. **Optional** — the separate gateway is working.

   **Sub-phase 7g — Budget Tracker deploy pipeline.**
   Wire `deploy-budget-tracker.yml` with real steps matching
   `deploy-stock-analyser.yml` as template: AWS OIDC credentials, CDK deploy
   (`BudgetTrackerApiStack` only — tables already exist, skip
   `BudgetTrackerTablesStack`), `pnpm build`, path-scoped S3 sync
   (`/budget-tracker --delete`), path-scoped CloudFront invalidation
   (`/budget-tracker/*`), `verify-deploy.sh`. Fix Cognito callback URLs
   in CDK from `/budget` → `/budget-tracker` (currently live in
   `BudgetTrackerTablesStack` — requires CDK deploy to take effect).
   Fix `package.json` `name` field: `@transformotion/budget` →
   `@transformotion/budget-tracker` (keeps turbo `--filter` consistent).

   **Sub-phase 7h — Delete SA budget-tracker copy.**
   With `apps/budget-tracker` live at `/budget-tracker/` and `apps/launchpad`
   serving launchpad + sign-in:
   - Delete `apps/stock-analyser/components/budget-tracker/`
   - Delete `apps/stock-analyser/app/budget-tracker/`
   - Delete `apps/stock-analyser/lib/examples/budget-tracker-usage.tsx`
     (orphaned scaffold, dead code — safe to delete; see §10 of diagnostic)
   - Remove tsconfig path alias `"components/budget-tracker"` from
     `apps/stock-analyser/tsconfig.json`
   - Delete `apps/stock-analyser/app/launchpad/` and
     `apps/stock-analyser/app/sign-in/` (now owned by `apps/launchpad`)
   - Remove the 18 `.lint-baseline.json` entries referencing Issue #17

   **Ordering constraints:**
   - 7b.5 must merge with PR #40 (deploy together — single client transition window)
   - 7b must deploy and verify before 7h removes the SA budget-tracker copy
   - 7c + 7d must both be complete before 7g deploys budget-tracker
   - 7e must deploy before 7h removes SA's launchpad/sign-in routes
   - 7f is independent of ordering (CDK refactor only)
   - 7g must verify before 7h

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

> **Note on architectural content in this document.** Architectural decisions previously recorded inline (Cognito model, URL model, tile visibility, etc.) have been migrated to `docs/architecture/`. This document is now scoped to project plan, phase status, and process discipline. Historical decision context is preserved in git history and in the architecture documents.

## Platform permission invariants (Cognito)

These are platform-level architectural invariants. Changes to any of
these require deliberate review — not a side-effect of other work.

### Three-client model

The platform targets three Cognito app clients, one per logical access
boundary:

1. **LaunchpadAppClient** — the platform shell client (PR #40). Any
   user who can authenticate against the user pool can obtain a token
   for this client. No group-scoped restrictions. Callback URLs on
   launchpad paths (`/`, `/callback`, `/launchpad/*`).

2. **StockAnalyserAppClient** — gated to users in the `stock-app` or
   `admin` Cognito group. Users outside those groups cannot obtain a
   valid token for this client, so the app is inaccessible to them at
   the authentication layer. Callback URLs on `/stock-signal/*`.

3. **BudgetTrackerAppClient** — gated to users in the `budget-app` or
   `admin` group. Callback URLs on `/budget-tracker/*`.

Gating is implemented via a pre-token-generation Lambda that rejects
token requests for an app client if the user's `cognito:groups` claim
does not include an allowed group for that client. This makes access
control real at the Cognito authentication layer — not merely a
frontend display rule that a technically-capable user could bypass.

### Current state (verified 2026-04-22; updated 2026-04-23 for 7b.5-alpha)

| Client | Pre-token Lambda gating | API-layer gating | Frontend-layer gating |
|---|---|---|---|
| LaunchpadAppClient (was WebAppClient; 7b.5-alpha PR) | None | None | None (intentional — shell is open) |
| BudgetTrackerAppClient (rebuilt + relocated; 7b.5-alpha PR) | **None** | **Yes** — every Lambda handler calls `requireGroup('budget-app', 'admin')` — throws 403 | UI reads `cognito:groups` for tile display |
| StockAnalyserAppClient (new; 7b.5-alpha PR) | **None** | **Gated** — `requireGroup('stock-app', 'admin')` (7b.5-beta). `claude-proxy` gated with `requireGroup('stock-app', 'budget-app', 'admin')` | UI reads `cognito:groups` for display only |

**Pre-token-generation Lambda:** Absent (`UserPool.LambdaConfig` is
null). No Lambda triggers are configured. Anyone who can create a
Cognito account can get a token for any client.

**API Gateway authorizers:** Both gateways (`yqtrjzrnp3` platform,
`3ndfaitweb` budget-tracker) use `COGNITO_USER_POOLS` type — validates
JWT signature and expiry only; does not check `cognito:groups`.

**Plain-language assessment:**
- Budget Tracker API access is effectively gated (any valid Cognito
  token can reach the API Gateway, but every Lambda returns 403 to
  users outside `budget-app`/`admin`). The gating is real but at the
  application layer, not the authentication layer.
- Stock Analyser API access is **ungated** — any authenticated user
  can call stock analyser APIs successfully. Only the Launchpad UI
  hides the tile.

### Path to the invariant

**Sub-phase 7b.5-beta** (complete) — added Lambda-layer gating to
SA Lambdas and claude-proxy, closing the authorization gap at the
application layer.

**Sub-phase 7b.5-alpha** (complete — merged and deployed) introduces the three-client model:
`LaunchpadAppClient`, `StockAnalyserAppClient`, `BudgetTrackerAppClient`.
Separates authentication sessions per app; SSO via shared Hosted UI
domain. Authorization model unchanged (still Lambda-layer `requireGroup`).
Pre-token-generation Lambda and auth-layer group gating deferred to Issue #42.

### Permission model expansion (deferred)

The current group-based model (`stock-app`, `budget-app`, `admin`)
treats group membership as app access with `admin` as a bypass.
A richer model will likely be needed:

- **App access** dimension: stock-app, budget-app, future apps
- **Capability level** dimension: admin, standard user, view-only
- Possibly **OAuth scopes** on tokens as an alternative or
  complement to group-based checks

This will be designed once the set of features and actions needing
permissioning is clear. Not sub-phase 7 scope.

Tracked for platform Lambdas (accounts, user, invitations,
first-login, forgot-provider) specifically as Issue #42.

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
| #37 | bug(budget-tracker): rules-tab.tsx passes regex object where .source string expected | Open |
| #42 | authz: define permission model for platform Lambdas (accounts, user, onboarding handlers) | Open |

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

This document will be archived to `docs/history/` when stabilisation is complete.
