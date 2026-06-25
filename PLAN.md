# Transformotion Apps — Plan

This document is the single source of truth for what work is happening on
the Transformotion Apps platform, in what order, and toward what end. It
supersedes `DEVELOPMENT_PLAN.md` (now archived at
`docs/archive/DEVELOPMENT_PLAN.md`) and the phase-plan portions of
`STABILISATION_FREEZE.md` (now archived at
`docs/archive/STABILISATION_FREEZE.md`).

The discipline rule for this document: when a milestone's scope changes
mid-execution, the change is made by updating this document in the same
PR that lands the change. The plan is not retrofitted to describe whatever
work happened; the plan is updated when work changes.

For ways of working, document map, repository structure, and operating
principles, see `/CONTRIBUTING.md`.

---

## 1. What this is for

The platform exists to deliver four goals against one cross-cutting
constraint. Every milestone in this plan serves at least one goal. Each
milestone's outcome states which goals it advances.

The full goal statements live in `/CONTRIBUTING.md` Section 1.1; this
section restates them by number for quick reference.

### 1.1 The four goals

- **Goal 1** — Work on one app without affecting another.
- **Goal 2** — Deploy a new app without affecting existing ones.
- **Goal 3** — Platform cohesion (update once, reuse everywhere, monitor
  as a platform).
- **Goal 4** — Invite people in based on the permissions model.

### 1.2 The v0 constraint

The frontend is developed using v0 with mocked persistence (localStorage)
and runs against real DynamoDB-via-Lambda persistence in production. The
canonical persistence pattern requires a swap point at the data-access
layer. Contracts are the v0 interface. The build pipeline supports both
modes.

The full constraint statement is in `/CONTRIBUTING.md` Section 1.2.

---

## 2. How this plan is structured

The plan is organised as 19 milestones (M0 through M18) plus a setup
milestone (M-setup) for documentation and project-tracking infrastructure.
Milestones are sequenced by dependency, not by priority. Each milestone
has:

- A **purpose** — what the milestone is for.
- An **outcome** — what is true after the milestone completes.
- **Goals served** — which of the four platform goals this milestone
  advances.
- A **gate to next** — the specific condition that says the milestone is
  complete and the next can begin.
- **Dependencies** — which prior milestones (or specific issues within
  them) must complete before this one starts.

The plan does not commit to dates. Dependencies are the primary scheduling
mechanism. Target dates may be added at the GitHub Project level later for
visibility, but the document itself is dependency-ordered.

---

## 3. Milestone setup (M-setup)

### Purpose

Documentation and project-tracking infrastructure. This is meta-work
supporting all subsequent milestones.

### Outcome

- `/PLAN.md` (this document) merged.
- `/CONTRIBUTING.md` merged.
- `/README.md` updated to reflect actual current state and reference
  the canonical operating documents.
- `/MONOREPO.md` updated to reference branch-naming convention from
  `CONTRIBUTING.md`.
- `/SECURITY.md` exists (minimum-viable; expanded later as needed).
- `docs/archive/` exists with `DEVELOPMENT_PLAN.md` and
  `STABILISATION_FREEZE.md` archived.
- GitHub Milestones M0–M14 (and the "Backlog — unsequenced items"
  milestone) created with names, descriptions, and "gate to next"
  conditions in their descriptions.
- GitHub Issues created under each milestone, including a "kickoff"
  issue per milestone where appropriate.
- GitHub Project (Projects v2) created at the organisation level with
  kanban and roadmap views, grouped by milestone:
  [github.com/orgs/transformotion/projects/1](https://github.com/orgs/transformotion/projects/1)
  — "Platform development".
- Project Status field configured with five options matching
  `CONTRIBUTING.md` Section 4.4: Backlog, Todo, In Progress, In
  Review, Done.
- Project automation rules configured: new issues attached to a
  milestone auto-add to Project; new items default to Backlog status;
  cards move to Done when issue closes or linked PR merges.

### Goals served

This is operational substrate; serves all four goals indirectly by
providing the tracking and discipline that makes goal-serving visible.

### Gate to next

GitHub Project visible with all milestones populated; first issue (M0
kickoff) ready to assign.

### Dependencies

None. This is the entry point.

---

## 4. M0 — Close the open signup gate

### Purpose

The Cognito User Pool currently has `selfSignUpEnabled: true`. Anyone can
create a Cognito account via the hosted UI without an invitation. This
compounds with the stock-analyser-Lambdas-don't-enforce-app-access gap to
create a real exposure: a self-signed-up user gets a JWT, calls the
unprotected stock-analyser routes directly, and consumes platform
resources they shouldn't have access to.

This milestone closes the signup gate as a one-line change ahead of all
other work, so subsequent milestones don't begin with a known-exploitable
gate sitting open.

### Outcome

- `selfSignUpEnabled: false` set in `infrastructure/lib/platform/auth-stack.ts`.
- Cognito hosted UI no longer accepts public signup. Account creation
  requires invitation (the invitation flow itself is M11).
- The compound vulnerability (gap #1 + gap #2 from the inventory's Section
  3.4) reduces to a single vulnerability pending M10's app-access gate
  enforcement.

The launchpad does not currently have a public Create Account screen
(verified during M0 scoping; no `signUp`, `register`, or
`createAccount` references in `apps/launchpad/`), so no frontend work
is required.

### Goals served

Goal 4 primarily. Indirectly Goal 3 (one-key-per-platform secrets
hygiene by ensuring only invited users can reach platform resources).

### Gate to next

Setting deployed to dev via the platform stack (`TransformotionDev-Auth`).
Hosted UI signup attempts return the expected "self-signup disabled"
response. The platform has no prod environment yet; when prod is later
established, the `selfSignUpEnabled: false` setting applies
automatically as part of the standard prod deploy of the auth stack —
no additional M0-specific work needed.

### Dependencies

M-setup complete. No code dependencies — this is a one-line change to a
single file.

---

## 5. M1 — Verification pass

### Purpose

The architectural inventory at `docs/architectural-inventory.md` flagged
seven items as "Blocking 0b — verify before writing decision documents."
These are unresolved questions about deployed state that affect what
Stage 0b's documents can claim. Writing those documents without
resolution would either commit to assumptions that turn out false or
require revising decisions immediately after they ratify.

This milestone resolves the verification items and reads the contents of
the existing architecture documents that the inventory could not directly
inspect.

### Outcome

- All seven Blocking-0b verification items resolved with confirmed
  findings, captured directly in the architectural inventory at
  `docs/architecture/inventory.md`:
  - X-Account-Id post-PR-#67 deployed state (Section 2.3 of inventory).
  - Helper availability in `packages/lambda-middleware` (Sections 2.5,
    3.3 of inventory).
  - Budget-tracker Lambda group-name reads (Section 2.6 of inventory).
  - Workflow-trigger fidelity for `packages/**` changes (Section 5.2 of
    inventory).
  - Stock-analyser portfolio/watchlist SK schema mismatch — potential
    production-data-layer integrity issue (Section 2.10 finding #1 of
    inventory).
  - Three-client Cognito authoriser acceptance (Section 5.6 of
    inventory).
  - Claude proxy authorization (Section 2.11 of inventory).
- Direct contents of the existing architecture documents read and
  catalogued in the inventory: `docs/architecture/data.md`,
  `docs/architecture/cdk.md`, `docs/architecture/urls-and-deploy.md`,
  `docs/architecture/README.md`, `apps/<app>/CLAUDE.md` (per app).
- Diff of inventory Section 2.10 schema view against `data.md`,
  Section 5.6 CDK topology against `cdk.md`, auth substrate against
  `auth.md` — discrepancies updated in the inventory or surfaced as
  M3 / M2 inputs.
- Each M1 issue closes with the relevant inventory section having a
  status tag of **Confirmed**, **Resolved by [reference]**, or
  **Superseded by [reference]** (per `CONTRIBUTING.md` Section 6).
  No M1 verification leaves an inventory section at "Status uncertain
  — verify".

### Goals served

This is preparatory; serves all four goals indirectly by ensuring
subsequent decisions are grounded in deployed reality.

### Gate to next

Verification document complete. All seven items have explicit findings.
Any newly-discovered concerns are tracked as issues and assigned to the
appropriate milestone.

### Dependencies

M-setup complete. Independent of M0 (M0 and M1 can run in parallel).

---

## 6. M2 — Architecture decision documents (Stage 0b)

### Purpose

The architectural inventory established what is currently the case (Stage
0a). This milestone makes the canonical architectural decisions that bind
subsequent implementation work — Stage 0b in the prior nomenclature.

### Outcome

Three architectural decisions ratified and documented:

**Decision M2.1 — Data-access patterns and table-naming policy.**

Documented in `CONTRIBUTING.md` Section 5 (Architectural patterns) and Section 6 (Utility categories and conventions). Specific outcomes:

- Layered architecture ratified as the canonical pattern: business logic, data-access layer, physical store. Strict separation — business logic never references physical implementations directly.
- Domain interfaces live in `contracts/<scope>/`. Names are store-agnostic.
- Implementations of domain interfaces are named for their physical store (e.g., `DynamoTransactionRepository`, `LocalStorageTransactionRepository`).
- Naming conventions for domain interfaces: Repository pattern for collection-of-entities access; Service pattern for capability-style operations.
- Implementation selection is an environment concern — build-time config client-side, deployment-time config via CDK server-side. Nothing flips at runtime.
- Canonical table-naming policy: `{scope}.{entity}-{stage}`. Scope is either `platform` or an app slug; categorical, not stylistic. Applies to all logical tables regardless of physical storage backend.
- Cache reclassification: `platform.analysis-cache-{stage}` reclassifies to `stock-analyser.analysis-cache-{stage}`; the `platform.` prefix is reserved for tables used by multiple apps or platform infrastructure.
- Account-scoping invariant: every account-scoped Lambda reads `account.accountId` from `withAuth` via the `requireAccountAccess` helper. Already in compliance per M1 #79's verification of all nine consumer Lambdas.
- New utility category established: data migration utilities at `migration-utilities/` (peer to `apps/`, `packages/`, `platform/`). One Lambda per migration, hierarchical structure by app namespace and data type. URL namespace `/api/migrations/<app>/<data-type>/<operation>` (no version segment).
- The `/migrate-from-localstorage` endpoint is recategorised as a data migration utility. Renames to `POST /api/migrations/budget-tracker/transactions/import`; relocates to `migration-utilities/budget-tracker/transactions/`. Implementation in M6.
- All non-conforming code migrates to the canonical patterns. New code conforms from inception. Migration scope is M7.

**Decision M2.2 — `auth.md` extension.**

- Per-app account model ratified: each `platform.accounts` row carries an
  `appSlug`. (User-expressed preference recorded in inventory Section
  3.2. To be ratified.)
- Writer pattern: `account-provisioning` and `accounts/createAccount`
  take `appSlug` (or split into per-app variants).
- UI invariant: the account switcher shows only accounts for the current
  app.
- Helper interface documented as canonical. M1 #79 verified that all
  five helpers (`requireSiteAdmin`, `requireAppAccess`,
  `requireAnyAppAccess`, `requireAccountAccess`, `requireAccountOwner`)
  already exist in `packages/lambda-middleware/` with signatures
  matching `auth.md`, and are in active use across all nine consumer
  Lambdas. M2.2's role here is to document this existing pattern as
  canonical rather than ratifying a proposal. (`requireSelfOrAccountManager`
  was listed in v4 inventory but is not a helper — see inventory
  Section 2.5.)
- JWT-claim consumer pattern documented: parse strings to objects/booleans
  on read (because Cognito V1 trigger forces string claims).
- Position on `resolveAccountContext` JWT-claim fallback (currently dead
  code): remove or leave.
- Permission model for the five platform Lambdas deliberately not gated
  during sub-phase 7b.5-beta (per the deferred decisions in Issue #42):
  `accounts`, `user`, `auth/invitations`, `auth/account-provisioning`,
  `auth/forgot-provider`. Each needs a documented decision on its
  authorisation model, including how onboarding-stage users (no app
  groups yet) interact with them.

**Decision M2.3 — Contracts policy.**

The seven M2.3 decisions establish what counts as a contract in this platform, where contracts canonically live, how they are structured, and the discipline that keeps them coherent.

- **Definitional framing (M2.3 batch).** A contract documents the binding interface between a provider and one or more consumers. Contracts cover any provider/consumer boundary: HTTP APIs, Lambda-to-Lambda calls, Lambda-to-AWS service usage, TypeScript domain interfaces, data model schemas, and internal helper APIs. Definition lives in CONTRIBUTING.md Section 5.7.
- **Normative-by-definition (#116).** Contracts are inherently normative. Anything in the contracts directory is a binding interface specification. Observation, history, project state, and other non-binding content do not belong in contracts; they live in operations docs, architecture inventory, or git history.
- **Canonical location: v0 repo (#114).** Contracts live in the v0 repo (`transformotion-apps-b8`), not the Claude repo. The v0 repo is the only location both AIs (v0 and Claude Code) can read natively. Claude repo accesses via a one-way sync from v0 repo into a gitignored location.
- **Single source of truth (#115).** Each contract has exactly one canonical location. Runtime code references contracts by import from the synced location; no copies, no embedded mirrors, no independent declarations of types that match contracts. Strict — independent type declarations matching contracts are non-conforming regardless of convenience.
- **Scope-first executable structure (#117/#136).** Within each scope, executable TypeScript files (`types.ts`, `api.ts`, `wss.ts`, `mocks.ts` where applicable) are authoritative for shape. Markdown files describe behaviour, navigation, validation, IAM, DynamoDB, Lambda, WSS, AI runtime, and external dependency expectations. Shared shapes live in `contracts/_shared/` and must not be duplicated.
- **Platform scope at sibling level (#118).** Platform substrate contracts live in `contracts/platform/` as a sibling scope. Shared auth, account, runtime config, and AI runtime shapes that cross app scopes live in `contracts/_shared/`.
- **Per-domain granularity for backend contracts (#133).** Backend service interface contracts are organised by functional domain (budget operations, auth operations, AI services, data storage, etc.), not per-Lambda. Each domain document covers related operations within the domain plus their cross-Lambda interactions.
- **Hybrid format with TypeScript-authoritative shape rule (#133).** Each domain has paired `.ts` and `.md` files. TypeScript files are authoritative for shape (imported directly by Claude code). Markdown files describe behaviour, edge cases, validation rules, and cross-references — but do NOT redeclare types. This eliminates format ambiguity and makes the single-source-of-truth rule operationally enforceable.
- **v0-sufficient minimum content (#117).** Frontend contracts must contain at least the content v0 needs to build a working mock — endpoint paths, methods, request/response shapes, status codes, authentication requirements, behavioural notes. Specific list documented in CONTRIBUTING.md Section 5.7.
- **Backend contract template (#133).** Per-domain backend contracts follow a standard structure including operations, type definitions, behavioural specs, cross-Lambda interactions, external dependencies (mockability flagging), authentication/authorisation model, IAM scope, error responses, rate limiting, and cross-references.
- **Authoring discipline (#114).** Contracts are edited in v0 repo first, then sync into Claude repo, then Claude-side work proceeds. Discipline is enforced by CI (Level 3: byte-identical match verification per #134) plus mechanical guardrails (gitignore, sync target README, sync script defensive behaviour).

### Goals served

All four goals primarily. These decisions are the canonical pattern that
subsequent implementation work conforms to.

### Gate to next

All three decision documents merged. From this point onward, the
discipline rule applies: code conforms to these documents; PRs that
change what's described in them update them in the same PR.

### Dependencies

- M1 must be complete (verification findings inform what the documents
  can claim).
- M0 not strictly required, but recommended — the documents should
  describe the post-M0 state of the auth substrate.

---

## 7. M3 — Documentation reconciliation (Stage 0c)

### Purpose

The inventory and Stage 0b decisions surfaced a number of stale documents
that describe the platform inaccurately. This milestone retires or
rewrites them so the documentation set reflects the post-M2 state.

### Outcome

- `DEVELOPMENT_PLAN.md` archived to `docs/archive/` if not already
  archived in M-setup. (M-setup probably already did this.)
- `STABILISATION_FREEZE.md` archived to `docs/archive/` if not already
  archived in M-setup. (M-setup probably already did this.)
- `infrastructure/lib/README.md` rewritten to describe actual current
  stacks (currently describes planned stacks that don't match
  implementation, including a non-existent MonitoringStack).
- `apps/stock-analyser/docs/api-endpoint-contract.md` retired or
  rewritten as descriptive-of-actual (currently describes endpoints that
  don't exist).
- `apps/stock-analyser/README.md` reviewed; v0-prototype README
  refreshed or replaced.
- `docs/cowork-testing-brief.md` reviewed; partly aspirational, partly
  historical — decision on future role.
- `contracts/budget-tracker/ui-patterns.md` reviewed: re-sync or formally
  diverge per M2.3 contracts policy. (File moved to canonical location by M7 #301.)
- Stale `first-login` references in code or docs that didn't propagate
  from the rename to `account-provisioning`: identified and fixed.
- `apps/web/` 0-LOC shell directory cleanup: directory deleted or removed
  from `pnpm-workspace.yaml`'s `apps/*` glob.
- `apps/web-vite-backup/` directory deletion. Contributes 18 of the
  original 36 lint baseline entries (per Issue #32). Backup is no
  longer referenced; removal eliminates the lint-baseline noise.
- `v0-reference/` directory formalised as part of the v0 sync workflow
  rather than treated as legacy artefact (per Issue #32 reframe). The
  directory should be `.gitignore`d (it is the sync target for the
  v0-pushed repository); its role in the v0 development workflow is
  documented in `MONOREPO.md` and/or `CONTRIBUTING.md`. Lint baseline
  entries from it removed since the directory itself becomes
  gitignored.
- `MONOREPO.md` extended to document the actual `claude-code/<n>` /
  `v0/<n>` / `<author>/<n>` branch-naming convention (per
  `CONTRIBUTING.md` Section 4.1). Already done in current `MONOREPO.md`
  via the cross-reference; if the root `CLAUDE.md` is retired (see
  below) any branch-naming content there moves to `CONTRIBUTING.md` or
  `MONOREPO.md`.
- Missing `apps/launchpad/CLAUDE.md` created per `CONTRIBUTING.md`
  Section 2.3 (per-app CLAUDE.md is required). Stock Analyser and
  Budget Tracker already have theirs.
- Root `CLAUDE.md` reconciled. Currently exists but is not described
  in `CONTRIBUTING.md` Section 2.3. Decision: either archive (if its
  content duplicates `CONTRIBUTING.md`/`MONOREPO.md`) or formalise
  the root-level CLAUDE.md role with `CONTRIBUTING.md` Section 2.3
  updated to cover it. The root file currently has stale content
  (branch-naming convention out of date with `CONTRIBUTING.md`
  Section 4.1, and assumes `contracts/<app>/` mirrors that don't
  exist for all apps).
- `MONOREPO.md` updated to reflect any structural changes landed in
  this milestone (e.g., `apps/web/` removal, `apps/web-vite-backup/`
  removal, `v0-reference/` formalisation). Per `CONTRIBUTING.md`
  Section 2.1 discipline rule, structural changes touch this document
  in the same PR.
- v0 workflow documentation reconciliation — fixing existing references
  to v0 setup in CONTRIBUTING.md Section 1.2 and related docs. The
  canonical v0 workflow document (covering both sync directions,
  mock-mode mechanics, and the contracts-as-v0-interface principle) is
  created in M15, not here. M3's scope is alignment of existing
  references with verified state.

### Goals served

Goal 3 primarily (platform cohesion through accurate documentation).
Indirectly all four (subsequent contributors, including Claude sessions,
work against accurate documentation rather than stale references).

### Gate to next

All identified stale documents reconciled or archived. Documentation set
matches deployed reality.

### Dependencies

- M2 complete (the decisions in M2 inform what counts as "accurate").

---

## 8. M4 — appSlug writer and account migration  *(CLOSED — folded into M11)*

**Status (2026-05-05):** Closed. The writer fix (#144 / PR #157) landed cleanly on 2026-05-04. Remaining work — data migration (#146) and provisioning verification (#147) — moved to M11 because both depend on M11's invitation flow design. Account creation under the closed-signup model happens during invitation acceptance, not during sign-in; the migration target shape and provisioning verification both depend on how M11 ends up structuring that flow.

The original outcomes below are preserved as historical record of what M4 was scoped for. The actual landed work was the writer fix only; the rest is M11's territory.

---

### Purpose

This is the active blocker the inventory identified as the single biggest
item. The pre-token-generation Lambda joins `platform.account-members`
through `platform.accounts` to populate the JWT `accounts` claim, but
neither writer (`account-provisioning/handleSetup` or
`accounts/createAccount`) writes `appSlug` onto the accounts row. Result:
the claim is empty for every JWT, and every account-scoped Lambda call
fails authorization.

This milestone closes the gap, conditional on M2.2 ratifying the per-app
account model. If M2.2 ratifies a different model, this milestone is
replaced with the equivalent fix for the ratified model.

### Outcome

Assuming M2.2 ratifies per-app accounts:

- `functions/auth/account-provisioning/handleSetup` updated to take
  `appSlug` argument or split into per-app variants. Writes `appSlug`
  onto the `platform.accounts` row.
- `functions/accounts/createAccount` similarly updated.
- Data migration with the minimisation trick:
  - Existing `6f28aaa4-...` accountId gets `appSlug: 'stock-signal'`
    written. Existing 13 stock-analyser data rows remain in place.
  - New accountId created for budget-tracker with `appSlug:
    'budget-tracker'`. 10 budget-tracker settings rows migrated to point
    at the new accountId.
  - Second `account-members` row created for the new budget-tracker
    accountId.
- Three knock-on items verified:
  - `account-provisioning` new-user logic creates per-app accounts based
    on which apps the user is granted.
  - `fc2f6a09-...` test debug account: same treatment or deleted.
  - Invitation reconciliation flow's per-app provisioning consistent
    with the ratified model.
- Account-scoped paths now functional end-to-end. The `accounts` JWT
  claim is populated; `requireAccountAccess` works against real account
  context.

### Goals served

Goal 4 primarily. Without this, the permissions model doesn't function
end-to-end.

### Gate to next

`accounts` claim populated in JWTs for both apps. Manual verification
that `requireAccountAccess` succeeds against deployed Lambdas.

### Dependencies

- M2 complete (specifically M2.2 — per-app account model ratification).
- M0 strongly recommended (closing the signup gate before doing data
  migration is hygienic).

---

## 9. M5 — Gateway consolidation (sub-phase 7f)

### Purpose

`BudgetTrackerApi` currently has its own API Gateway, separate from the platform API Gateway. This is documented in code as a "workaround for cross-stack CDK dependency cycle" — though investigation in #150 showed there was no actual circular dependency, just unfinished prop-threading between stacks. `MONOREPO.md` declares that apps share the platform API Gateway — currently true for stock-analyser, false for budget-tracker. New apps onboarding would hit the same wiring gap unless the structural pattern is resolved.

This milestone retires `BudgetTrackerApi`'s separate API Gateway construct (not the entire stack) and mounts its handlers onto the platform gateway. The CDK workaround goes away; `BudgetTrackerApiStack` continues to exist as the home for app-specific Lambda definitions and IAM, mirroring how `StockAnalyserApiStack` houses stock-analyser Lambdas. Both app stacks now consume the shared `api`/`authoriser` from `PlatformApiStack` via props.

Note: this consolidation collapses the *workaround* third gateway. The auth-api gateway (forgot-provider flow) remains intentionally separate per its pre-authentication design (M2.2 #111).

The milestone also resolves a related location problem: Budget Tracker code currently lives in two places. A duplicate component tree under `apps/stock-analyser/components/budget-tracker/` (which `apps/stock-analyser/` deploys at the `/budget-tracker` route) and a proper workspace at `apps/budget-tracker/` (mock-only today; deployment activation is M6 scope). M5 deletes the duplicate; the proper workspace's deploy workflow activation and the launchpad tile retargeting move to M6 where they sequence naturally with backend wiring.

Note: M5 does not restructure Budget Tracker's internal code architecture. The code stays as-is (still non-conforming to the canonical layered architecture from M2.1); architectural migration is M7's scope. M5 only changes where the code lives and how it deploys.

### Outcome

**Gateway consolidation:**

- Budget-tracker Lambda routes (transactions, rules, settings, ai, export, migrate) mounted on the platform API Gateway alongside stock-analyser's routes.
- `BudgetTrackerApiStack`'s separate `RestApi` and `CognitoUserPoolsAuthorizer` constructions removed; stack now matches `StockAnalyserApiStack`'s pattern (receives `api`/`authoriser` from `PlatformApiStack` via props; houses app-specific Lambdas and IAM).
- `NEXT_PUBLIC_BUDGET_API_URL` and equivalent env vars removed.
- CDK workaround code removed; structural pattern documented in `cdk.md`.
- CORS verification: platform gateway covers Budget Tracker frontend needs.
- Application routes consolidated onto the shared platform gateway. Auth-api gateway remains intentionally separate per M2.2 #111. The "shared API gateway" rule in `MONOREPO.md` applies to app gateways and is now fully honoured.

**Code location untangling:**

- Duplicate component tree under `apps/stock-analyser/components/budget-tracker/` deleted; `apps/stock-analyser/` no longer contains any Budget Tracker code or routes.
- `NEXT_PUBLIC_BUDGET_API_URL` env var and its consumers removed (was only consumed by the duplicate tree). Includes removal from `.env.example`, the build arg in `.github/workflows/deploy-stock-analyser.yml`, and the GitHub Actions repo variable in the `dev` environment.
- `@ts-nocheck` no longer present in Budget Tracker code (consequence of deleting the duplicate tree, which carried the suppressions).
- Note: launchpad code (handler + tile definition still pointing at `/budget-tracker` on the stock-analyser domain) remains as transitional dead code. The launchpad tile is currently disabled — the route 404 is unreachable organically. M6 cleans up these references when re-enabling the tile with the deployed standalone URL.

Deploy workflow activation and launchpad tile retargeting moved to M6 (issues #154 and #155 reassigned). Both depend on M6's backend wiring being in place — deploying or re-enabling the tile before then would create infrastructure or navigation paths that don't yet do anything useful.

### Goals served

Goal 2 primarily (platform deployment substrate now supports shared gateway across all apps cleanly). Goal 3 (one gateway, one place to configure CORS, one place to monitor traffic). Goal 1 partially (Budget Tracker is no longer deployed from `apps/stock-analyser/`; work on stock-analyser no longer accidentally affects Budget Tracker's UI through the duplicate tree).

### Gate to next

Workaround `budget-tracker-api-{stage}` API Gateway no longer exists in deployed CFN. Budget-tracker routes responding from the platform gateway under `/api/budget/v1`. `BudgetTrackerApiStack` continues to exist housing the app's Lambda definitions, matching `StockAnalyserApiStack`'s shape. `apps/stock-analyser/` no longer contains any Budget Tracker code or routes. `NEXT_PUBLIC_BUDGET_API_URL` env var and its consumers removed across `.env.example`, deploy workflow, and GitHub Actions repo variable. End-to-end test confirms budget-tracker routes work via the consolidated gateway against existing dev account data.

### Dependencies

- M4 #144 done (handleSetup writer fix; PR #157). **Done.** M5 originally listed M4-as-a-milestone as a dependency, but the only piece M5 actually needs from M4 is the writer fix to ensure account-scoped JWT claims work correctly during gateway consolidation. The remainder of M4 folded into M11; none of that gates M5.

---

## 10. M6 — Budget Tracker activation

### Purpose

Budget Tracker has been built to a point where it has Lambdas, tables,
contracts, and frontend code, but it is not wired to the real backend —
it runs against mock auth and localStorage repositories. This milestone
wires the frontend to the real backend, completes the data-import flow,
and makes Budget Tracker usable end-to-end with real users.

### Outcome

- Budget Tracker frontend wired to real backend through the canonical layered architecture ratified in M2.1 (`CONTRIBUTING.md` Section 5).
- `/api/budget/v1/migrate-from-localstorage` recategorised as a data migration utility per M2.1's #107 decision. Specifically:
  - URL path renamed to `POST /api/migrations/budget-tracker/transactions/import` (no version segment, per the utility namespace convention in `CONTRIBUTING.md` Section 6.3).
  - Lambda code relocated from `apps/budget-tracker/functions/budget-migrate/` to `migration-utilities/budget-tracker/transactions/`.
  - Old Lambda directory and old endpoint deleted cleanly (no production consumers).
  - AWS function renamed to follow the `migration-<app>-<data-type>-<stage>` naming convention.
- New repository categories created at repo root (per `CONTRIBUTING.md` Section 6):
  - `migration-utilities/` — peer to `apps/`, `packages/`, `platform/`. Houses migration utility code organised by app namespace and data type.
  - `migration-utilities/infrastructure/` — peer to `platform/infrastructure/`. Houses CDK stacks for the utilities namespace.
- `MigrationsApiStack` (or similar) created in `migration-utilities/infrastructure/`. Owns the `/api/migrations/...` API namespace. Route registration for `budget-tracker/transactions/import` lives here, not in `budget-tracker-api-stack.ts`.
- New deploy workflow `deploy-migration-utilities.yml` created. Triggers on `migration-utilities/**` and `migration-utilities/infrastructure/**` path changes. Deploys the `MigrationsApiStack` and the Lambda functions within `migration-utilities/`. Workflow follows the same patterns as existing app deploys (authentication, pipeline stages, post-deploy verification).
- `ci.yml` updated to include `migration-utilities/**` in CI scope (typecheck, lint, test).
- Contract files updated to reflect the new endpoint path. `/v1/` documentation drift fixed in the same change (contracts previously omitted the `v1` segment that exists in the actual route).
- `MONOREPO.md` updated to document `migration-utilities/` as a peer category alongside `apps/`, `packages/`, `platform/`. The new `deploy-migration-utilities.yml` workflow documented alongside existing app and platform deploy workflows.
- The localStorage middleman removed: client posts file contents directly to the import endpoint without an intermediate localStorage hop.
- 732-transaction historical fixture (`migration-artifacts/budget-tracker/transactions/exports/export.json`) backfilled via S3-mediated migration endpoint.
- BudgetSettings canonicalised and backfilled (including businessExpenseFlags field) via parallel migration mechanism (#204; prerequisite for #179's repository swap). #204 also verifies that user-facing business-expense functionality exists in the deployed app; gaps captured as new work at implementation time.
- CSV import UI for ANZ and Macquarie statements implemented.
- `apps/budget-tracker/` deploy workflow activated (currently a no-op echo placeholder). Workflow patterns match `deploy-stock-analyser.yml`. Budget Tracker available at its own URL as a deployed standalone app. (Originally M5 #154; moved to M6 because deploying before backend wiring creates infrastructure that doesn't do anything useful.)
- Launchpad's Budget Tracker tile updated to navigate to the deployed Budget Tracker standalone URL (replacing the dead-code reference to `/budget-tracker` on the stock-analyser domain). Tile re-enabled. (Originally M5 #155; sequences naturally with the deploy activation.)
- Canonical Hosted UI authentication flow implemented across all three apps (per auth.md, issue #213):
  - Launchpad: real sign-in via `signInWithRedirect` with `LaunchpadAppClient`; `/launchpad/callback` route; deploy workflow; deploys to dev
  - Stock Analyser: sign-in converted from direct SRP to `signInWithRedirect` with `StockAnalyserAppClient`; `/stock-signal/callback` route
  - Budget Tracker: `/budget-tracker/callback` route; unauthenticated trigger calls `signInWithRedirect` with `BudgetTrackerAppClient`; `NEXT_PUBLIC_APP_URL` set in deploy workflow
  - Cognito Hosted UI session cookie set on first sign-in; per-app silent re-auth via SSO works across apps
  - Auth store localStorage key collision resolved: SA uses `stock-analyser-auth`; BT uses `budget-tracker-auth`
  - Existing direct-SRP sessions require one-time re-sign-in after deploy
- localStorage repositories removed; replaced with real DynamoDB-via-Lambda implementations through the canonical layered architecture pattern.
- Tab-level error-boundary support: new `packages/ui/error-boundaries/` package implementing a generic `TabErrorBoundary` component that wraps tab content so a crash in one tab does not unmount the whole app. Both budget-tracker tabs and stock-analyser tabs wrapped using the same package (per Issue #16; bilateral application avoids leaving stock-analyser shipping without boundaries while waiting for a later milestone).
- Budget Tracker functional end-to-end with the live user account.

### Goals served

Goal 4 (the budget-tracker permissions model is now exercised by real use). Goal 1 (Budget Tracker is now genuinely an app, not a mock; it exercises the platform substrate the same way stock-analyser does). Goal 3 indirectly (the data migration utilities category is established as a worked example of the utility-categories pattern in `CONTRIBUTING.md` Section 6).

### Gate to next

Live user can log in to Budget Tracker, import the historical fixture,
view transactions, run AI categorisation, edit rules, and persist
changes. All paths go through real Cognito and real DynamoDB.

### Dependencies

- M4 #144 done (handleSetup writer fix; PR #157). **Done.** M6 originally listed M4-as-a-milestone as a dependency, but the only piece M6 actually needs from M4 is the writer fix to ensure account-scoped JWT claims work correctly. The remainder of M4 folded into M11 (data migration and provisioning verification both depend on M11's invitation flow design); none of that gates M6.
- M5 complete (workaround gateway retired; budget-tracker routes consolidated onto the shared platform gateway alongside stock-analyser; `BudgetTrackerApiStack` continues to house app Lambdas in symmetry with `StockAnalyserApiStack`).
- M2.1 complete (canonical persistence pattern ratified).

Note: M6's Budget Tracker activation provides the first real-world
test of v0→app sync, exercised by M15 (v0 development workflow
infrastructure). M15 can begin once M6 is in progress or complete.

---

## 11. M7 — Deduplication and consolidation

### Purpose

The architectural inventory found that approximately 75% of
stock-analyser's codebase exists as duplicate code in budget-tracker.
The M7 census recon (2026-05-21) refined this framing with current
evidence:

- **The 58-component `components/ui/` shadcn set** is byte-for-byte
  identical across both apps and constitutes the single largest
  duplication class — larger than all service-layer/utility/type
  concerns combined. Tracked: #300.
- **Service-layer, utility, and type concerns** (cache, logger,
  repository base, config, hooks, useClaude orphan) are the
  O4+O5+O6 deduplication inventory from #247 — these are the second
  tier and roughly match the original 60% "byte-identical" framing.
- **The connective-tissue drift** (design-system, config shapes,
  app shells) corresponds to the original "40% drifted" framing.

The bilateral duplication is the primary structural barrier to Goal 1
("work on one app without affecting another"). This milestone is the
substantial corrective work to reach the canonical pattern from the
current bilaterally-duplicated state.

This milestone is comparable in scope to M5 — substantial enough that it
gets its own sub-phase rather than being folded into smaller cleanup
work.

M2.1's architectural decisions (#103, #105, #106) add additional
pattern-conformance work to M7. The layered-architecture migration
(#103) — all non-conforming code restructured to go through domain
interfaces in contracts — naturally pairs with the deduplication scope,
since extracting domain interfaces from duplicated shapes simultaneously
deduplicates AND migrates code to Position A. Two table renames (#105,
#106) bring exception cases into canonical form.

Note on scope boundary with M15: contracts-specific migration (moving
contracts to v0 repo as canonical, restructuring into scope-first executable contract bundles, format conversion, removing independent type declarations
that mirror contracts) is M15's responsibility per M2.3's decisions.
M7 covers non-contract layered-architecture migration and the broader
deduplication of duplicated runtime code.

### Outcome

- Cache reclassification: rename `platform.analysis-cache-{stage}` to
  `stock-analyser.analysis-cache-{stage}` and tighten IAM scope to
  stock-analyser Lambdas only. Per M2.1 #105.
- Rate-limits rename: rename `platform-rate-limits-{stage}` to
  `platform.rate-limits-{stage}` to match the canonical separator rule
  (`{scope}.{entity}-{stage}`). Rate-limit data loss acceptable
  (counters self-heal). Per M2.1 #106. Tracked: #246.
- Layered-architecture migration: all non-conforming code restructured
  to go through domain interfaces in contracts (per M2.1 #103). Existing
  service-layer code (stock-analyser portfolio/watchlist) migrates to
  repository pattern. Existing direct-DynamoDB Lambda code migrates
  behind domain interfaces. Implementations named for their physical
  store (e.g., `DynamoTransactionRepository`,
  `LocalStorageTransactionRepository`). Selection by build-time config
  client-side, deployment-time config server-side. Parent gate: #253.
  Requires deduplication inventory (#247) first.
- Remove hardcoded built-in rules: the previous `BuiltinRule` type and
  hardcoded rule list have been removed from code but the `removeBuiltinRules`
  migration path and any remaining references to the concept should be
  confirmed clean. Tracked: #201 (moved to Backlog — not blocking M7).
- Auth store refactor: split stable identity (`userId`, `email`,
  `groups`) from reactive current account (`currentAccountId`) in
  `useAuthStore`. Prevents unnecessary re-renders when account context
  changes. Migrated to M7 from M6. Tracked: #210.
- Deduplication scoping/inventory: enumerate all type, utility, and
  service-layer duplicates across apps before filing per-concern child
  issues. This inventory gates all O4+O5+O6 deduplication PRs. Tracked:
  #247. **The M7 census recon (2026-05-21) expanded scope beyond
  O4+O5+O6 — see "Census-expanded scope" subsection below for the full
  picture including #300-#305.**
- Drift refinement of the 60/40 split: within the drifted 40%,
  *semantic* drift (real behavioural differences, e.g., `Transaction._id`
  string-vs-number) distinguished from *cosmetic* drift (1-line deltas,
  formatting, comments). Different cleanup paths.
- Decision per duplicated concern: lift to a shared package, collapse
  onto one app, or delete one copy as orphan. Most concerns are
  domain-fit for `packages/`; the question is which package and what its
  API looks like (decisions deferred to per-concern issues under this
  milestone).
- Migration sequencing: byte-identical 60% lifted in single PRs per
  concern (UI primitives in one PR, auth substrate in another, etc.)
  because there's nothing to reconcile. Drifted 40% reconciled per-file
  before lifting (identify which copy is correct or whether neither is,
  reconcile, then lift).
- Lint re-enablement to prevent regression. Pre-condition: ESLint 10 /
  eslint-plugin-boundaries incompatibility resolved upstream first.
  Once lint is re-enabled, future cross-app file copies fail CI.
  Tracked: #248 (blocked-by-external pending upstream fix).
- Shared CDK construct library at `packages/cdk-constructs/` populated
  with the shared infrastructure constructs identified during the lift
  (the missing library from inventory finding 5.6 #4). Tracked: #249.
- Infrastructure reorganisation per `CONTRIBUTING.md` Section 3.7:
  per-app stacks moved to `apps/<app>/infrastructure/`, platform stacks
  moved to `platform/infrastructure/`, root `infrastructure/` reduced to
  CDK app entrypoint only. **Complete: #250.**
- `platform/` top-level directory: Lambda migration complete (root
  `functions/` ghost cleanup tracked in #303). Platform infrastructure
  migration to `platform/infrastructure/` **complete: #250.**
- `MONOREPO.md`, `cdk.md`, `CONTRIBUTING.md §3.7`, app `CLAUDE.md`
  files, and deploy workflow path filters all updated in the same PR.
  Per `CONTRIBUTING.md` Section 2.1 discipline rule. **Complete: #250.**
- `apps/web/` and `apps/web-vite-backup/` deleted. **Complete: #250.**
- Stock-analyser migrated from S3 root to `/stock-signal/` prefix:
  **Complete (M6 code + M7 #251 verification).** Verified 2026-05-21
  against dev deployment — basePath routing, CloudFront behavior,
  sign-in URLs all confirmed live on CloudFront distribution
  `E1128DYYBLMWYK` (dev.apps.transformotion.com.au). Tracked: #251.
  - `apps/stock-analyser/next.config.mjs` gains `basePath: '/stock-signal'`
    (`output: 'export'` already present)
  - `deploy-stock-analyser.yml` syncs to `s3://transformotion-web-{stage}-{account}/stock-signal/`
    (not bucket root; `--delete` scoped to prefix only)
  - New `additionalBehaviors` entry for `/stock-signal/*` in `NetworkStack`
    with `SubAppIndexRewrite` function (function established by M6 #154 PR #194)
  - CDK deploy of `TransformotionDev-Network` / `TransformotionProd-Network`
    to activate the behavior
  - Stock-analyser sign-in, launchpad tile, and budget-tracker tile URLs
    verified post-migration
- Launchpad promoted to root deployment:
  **Complete (M6 code + M7 #251 verification).** Verified 2026-05-21
  — default CloudFront behavior confirmed serving launchpad at root;
  `/stock-signal/*` and `/budget-tracker/*` sub-app path isolation
  confirmed live. Tracked: #251.
  - `apps/launchpad/next.config.mjs` gains `output: 'export'` and
    `trailingSlash: true`
  - New deploy workflow `deploy-launchpad.yml` mirroring
    `deploy-stock-analyser.yml`'s pattern but syncing to S3 root
    (`--exclude "stock-signal/*" --exclude "budget-tracker/*"`)
  - Default CloudFront behavior verified to serve launchpad correctly
    (root `index.html` resolves directly; no `SubAppIndexRewrite` needed)
  - CloudFront cache invalidation for `/*` executed at atomic swap;
    stale stock-analyser content flushed from edge nodes
- Cross-cutting deployment verification for all migrated apps:
  - Smoke check per app post-deploy: `data-commit` hash matches the
    deploying commit; sign-in completes; repository operations succeed
  - CloudFront cache invalidation strategy confirmed (stale cached content
    flushed when root occupant changes)
- `additionalBehaviors` abstracted into a reusable helper: once 3+ sub-app
  behaviors exist (budget-tracker, launchpad, stock-signal), the repeated
  `additionalBehaviors` entries in `NetworkStack` are extracted into a
  helper (e.g., `addSubAppBehavior(distribution, prefix, rewriteFn)`) in
  `packages/cdk-constructs/`. The helper encapsulates the canonical
  configuration (S3BucketOrigin with OAC, REDIRECT_TO_HTTPS,
  CACHING_OPTIMIZED, compress, function association on VIEWER_REQUEST).
  Each sub-app extraction then becomes a single helper invocation rather
  than ~10 lines of repeated configuration. Pattern emerged through
  PRs #194 and the launchpad routing fix; the third recurrence triggers
  the abstraction. Tracked: #249.
- Post-deploy app-identity verification: extend `verify-deploy.sh` (or
  equivalent per-workflow check) to assert the deployed URL returns HTML
  containing the expected app's identity marker in addition to the
  `data-commit` hash check already in place. This catches the class of
  routing failure surfaced by PRs #194 and the launchpad fix — bugs where
  S3 returns the wrong app's HTML with a 200 status, making the commit
  hash check pass while the wrong content is served. Verification should
  run as the final step of every deploy workflow after CloudFront
  invalidation completes. Also extend with repository-operations smoke
  check. Tracked: #252.

### Census-expanded scope

The M7 census recon (2026-05-21) identified the following items not in
the original M7 framing. All are M7 scope:

- **#300** — Lift 58-file shadcn `components/ui/` set to
  `packages/ui/primitives/`. The single largest duplication class.
  Blocks on #298 (packages/ui/ structure correction).
- **#301** — Move contracts to canonical locations. Resolved by M7:
  `contracts/budget-tracker/` populated (8 files); `contracts/stock-analyser/`
  created with `DATA_CONTRACTS.md`. §3.5 inversion closed.
- **#302** — Document BT WebSocket AI infrastructure in normative docs
  (MONOREPO.md, inventory.md, BT CLAUDE.md). 4 WS Lambdas, 1 WS CDK
  stack, 1 ai-connections table were shipped without §2.1 updates.
  **Absorbed by #295** — WSS stack migrated to platform in the same PR
  that performed the §2.1 documentation updates.
- **#303** — Orphan cleanup: `packages/cycle-engine/` (0 consumers),
  root `functions/` ghost, empty app dirs, dead shadcn hook copies in
  `components/ui/`.
- **#304** — Update `CONTRIBUTING.md` §3.4 and MONOREPO.md: add
  `runtime-config` and `auth-client` to the packages listing; remove
  stale "stub" description of auth-client.
- **#305** — Architecture decision: where do per-app `stores/` belong?
  All three apps have `stores/` at app root; §3.2 does not document it.
  Decision gates a §3.2 update.

### Remaining work — rank-ordered by structural impact

1. **#250** — Infrastructure split (per-app and platform stacks to canonical homes). **Complete.**
2. **#300** — 58-component `components/ui/` lift. Largest dedup item. Blocks on #298.
3. **#298** — Correct `packages/ui/` structure. Gates #300 and #299.
4. **#301** — Contracts inversion fix. Open §3.5 violation.
5. **#302** — BT WebSocket infrastructure documentation. **Complete.** Absorbed by #295 — WSS stack migrated to platform; §2.1 doc updates shipped in the same PR.
6. **#290** — Cache service lift to `packages/cache/`.
7. **#291** — Logger service lift to `packages/logger/`.
8. **#292** — Repository base lift to `packages/data-access/`.
9. **#293** — Shared config sub-types lift to `packages/runtime-config/`.
10. **#294** — Delete BT legacy useClaude orphan.
11. **#303** — Orphan cleanup.
12. **#295** — SA polling→WebSocket migration. **Complete.** WSS stack + 4 Lambdas lifted to platform; claude-proxy gains WSS push; SA converts from polling to WSS subscription; polling infrastructure removed.
13. **#297** — SA design-system type leakage in BT (Signal, Verdict, TrendSignal etc. confirmed in BT design-system.tsx).
14. **#304** — Package listing doc updates.
15. **#305** — Stores/ decision.
16. **#246** — Rate-limits rename.
17. **#249** — Shared CDK construct library (`packages/cdk-constructs/`).
18. **#252** — Post-deploy app-identity verification.
19. **#210** — Auth store refactor.
20. **#248** — Lint re-enablement (blocked-by-external).
21. **#299** — Dedupe useIsMobile/useToast hooks (Backlog, blocks on #298).

### Goals served

Goal 1 primarily (work on one app without affecting another becomes
structurally possible after this milestone). Goal 3 (update once, reuse
everywhere becomes structurally possible). Goal 2 indirectly (a future
new app can copy a clean app shape rather than inheriting 75% of
irrelevant code).

### Gate to next

Bilateral duplication reduced to whatever the canonical pattern dictates.
Lint re-enabled and passing. Cross-app file copies caught at CI. Per-app
infrastructure split into the canonical structure. All non-conforming
data-access code migrated to layered architecture (Position A). Domain
interfaces in contracts; implementations named for physical store. Two
table renames complete (analysis-cache, rate-limits). Each app deployed
at its canonical S3 prefix per `docs/architecture/urls-and-deploy.md`
target layout. No app served via the SPA fallback (every path resolves
to its intended app via an explicit CloudFront behavior or the root
default). Sub-app `additionalBehaviors` entries abstracted into a
`cdk-constructs` helper. Post-deploy app-identity verification running
in every deploy workflow.

### Dependencies

- M2.1 complete (canonical pattern ratified) — strictly required for the
  layered-architecture migration and table renames.
- M2.3 complete (contracts policy ratified) — strictly required for
  domain interfaces in contracts. M2.2 not strictly required for M7 work.
- M3 complete (documentation set accurate so the migration is against
  documented targets).
- M6 useful but not blocking (Budget Tracker activation is its own
  trajectory; deduplication can run in parallel with M6 once M2.1 is done).

---

## 12. M8 — Cleanup of legacy auth substrate (sub-phase 7e-cleanup)

### Purpose

The auth substrate has both the new-pattern groups (`stock-app-access`,
`budget-app-access`, `site-admin`) in active use *and* legacy groups
(`admin`, `stock-app`, `budget-app`, `transformotion`, `family`) defined
in CDK with comments marking them for removal. The auth-stack carries
both states. This milestone retires the legacy.

### Outcome

- Legacy Cognito groups removed: `admin`, `stock-app`, `budget-app`,
  `transformotion`, `family`.
- `custom:active_account` writes removed from `account-provisioning` (`/auth/setup` and `/auth/switch`). The `/auth/switch` route itself is removed (no live callers; only called from the archived `web-vite-backup`). The attribute itself remains declared in the user pool schema permanently — Cognito does not permit removal of existing user pool schema attributes — but is inert post-M8.
- `resolveAccountContext` JWT-claim fallback to `custom:active_account`
  removed (per M2.2 #112 decision).
- Per M1 #80: Lambda handlers do not read group names directly, so
  no handler-level callsite migration is needed. The
  "callsite migration" outcome originally framed in M8 turned out
  unnecessary — all 9 consumer Lambdas use claim-based helpers that
  never read group names.
- `requireGroup` and `userInGroup` helpers removed from `packages/lambda-middleware/`. Both are group-name-based legacy patterns superseded by claim-based helpers; both retire together at this milestone (per M2.2 #109 + #111). Verify before removing — M1 #79 confirmed `requireGroup` is exported; `userInGroup` was found exported with zero callers during M2.2 diagnostic work.
- **`auth/forgot-provider` abuse-resistance tightenings** (per M2.2 #111):
  - SES grant scoped to the specific verified sender identity ARN (currently `Resource: ['*']` — broader than necessary)
  - API Gateway stage throttling added as a second layer independent of the Lambda's DDB-based limiter
  - CORS allowlist replacing `ALL_ORIGINS` — restrict to the sign-in page origin
  - Rate-limiter changed from fail-open to fail-closed (if rate-limit table is unavailable, requests are blocked rather than bypassed; availability trade-off accepted for this endpoint)

### Goals served

Goal 4 (the permissions model is now expressed cleanly without legacy
artefacts). Goal 3 (one canonical naming, not two).

### Gate to next

Legacy groups absent from `auth-stack.ts`. No code references to the old group names. `custom:active_account` writes absent from all Lambda code. `/auth/switch` route absent from `account-provisioning`. `forgot-provider` abuse-resistance tightenings landed (SES grant scoped, API Gateway throttling active, CORS restricted, rate-limiter fail-closed).

### Dependencies

- M2.2 complete (the new auth model is documented and ratified).
- M10 complete or in parallel (the helper migrations need to happen
  before legacy callsites can be removed). Could be sequenced as
  M8-then-M10 or M10-then-M8; the blocked-by edges are at the issue
  level.

This milestone can run in parallel with M9 and M10.

---

## 13. M9 - Per-app architecture (REST, WSS, auth ownership, AI proxy, IAM)

### Purpose

Substantial architectural restructure moving from shared-Platform to
per-app architecture across REST API gateways, WebSocket API gateways,
auth substrate ownership (LP becomes the owner of Cognito and auth
Lambdas), per-app AI proxies, per-app deploy IAM roles. Shared
platform layer shrinks to CloudFront, DNS, ACM, and build-time-only
shared CDK constructs and workspace packages. Deploy mechanism for the
residual shared platform shifts away from workflow_call cascade toward
backwards-compatibility defaults and explicit coordinated migrations.

M9 also establishes runtime-switchable multi-provider AI as an extension of
the per-app runtime ownership work. Each app owns exactly one `ai-proxy`;
provider-specific behaviour is internal to that proxy through provider modules
such as `ClaudeProvider` and `OpenAIProvider`. Provider/model selection is
runtime configuration, not provider-specific Lambda topology.

Scope includes recon, design proposal, sub-phase breakdown into child
issues, and implementation across all affected apps (LP, SA, BT, MU).

Reverses architectural direction from M5 (gateway consolidation,
closed) and M7 (consolidation within shared topology, closed).
Surfaced during PR #354's API Gateway deployment-snapshot diagnosis
when the cost of maintaining shared API Gateway ownership became
apparent.

### Original scope (subsumed)

Original M9 scope (Launchpad tile rendering migration to the `apps`
JWT claim) is subsumed by this work: LP's frontend gets refactored as
part of LP becoming the auth substrate owner, and tile rendering
migrates to the `apps` claim as part of that refactor.

### Goals served

Goal 1 primarily (deployment isolation made true). Goal 3
(observability isolation as a derived benefit). Goal 4 preserved
(permissions model still drives launchpad rendering).

### Gate to next

All apps deploy independently at REST, WSS, auth, AI proxy, and IAM layers.
CloudFront, DNS, ACM, build-time packages remain shared. Deploy of one
app's infrastructure does not affect any other app's deployment state.
Launchpad tile rendering reads the `apps` JWT claim (subsumed from
original M9 scope). App AI runtime supports runtime provider/model selection
with safe fallback to current Claude behaviour.

### Dependencies

- M7 (closed) provides the per-app stack foundation.
- M2.2 (already closed).
- M8 and M10 sub-phases may need re-sequencing - to be determined
  during M9's recon phase.

This milestone can run in parallel with M8 and M10 (sequencing TBD
during recon).

### Sub-phases (M9 child issues)

Phase 1 - Foundations (parallel, start immediately):
- #360 M9-1: Phase A doc corrections - cdk.md, SA CLAUDE.md, BT CLAUDE.md
- #361 M9-2: Workspace packages - initial Claude proxy mechanics extraction
  and `@transformotion/rate-limit-middleware` creation
- #362 M9-8: Per-app Cognito app clients + IAM deploy roles (moved to Phase 1
  because LP needs its own IAM role before taking auth ownership in Phase 2)

Phase 2 - Per-app infrastructure ownership (parallel after Phase 1):
- #363 M9-3: LP auth ownership transfer (Cognito + auth Lambdas to LP CDK)
- #364 M9-4: SA per-app WSS (split SA from platform-ws)
- #365 M9-5: BT per-app WSS (split BT from platform-ws)
- #366 M9-6a: SA per-app REST API + app-owned AI proxy Lambda + `sa.job-results` table
- #367 M9-7a: BT per-app REST API + app-owned AI proxy Lambda
  (+ remove unhandled /api/budget/v1/ai/categorise route)

Phase 3 - AI proxy naming and provider foundation (after Phase 2 ownership):
- #376 M9-12: Rename app-owned Claude proxy concept to app-owned AI proxy
- #377 M9-13: Shared AI provider abstraction with `ClaudeProvider` and
  `OpenAIProvider`
- #382 M9-18: AI proxy observability fields for provider, model, latency,
  usage, and errors

Phase 4 - Runtime provider switching (after provider foundation):
- #378 M9-14: Runtime AI provider/model config storage and API
- #379 M9-15: Wire Stock Analyser `ai-proxy` to runtime provider resolution
- #380 M9-16: Wire Budget Tracker `ai-proxy` to runtime provider resolution

Phase 5 - AI service canonicalization (parallel with late Phase 4):
- #368 M9-6b: SA AI service canonical refactor (Hybrid A: AIService class +
  thin hook; cache in service layer)
- #369 M9-7b: BT AI service hook wrapper + mock fidelity fix + cache layer
  (`budget-tracker.ai-cache-{stage}`, accountId+transactionsHash, 7-day TTL)

Phase 6 - LP frontend and admin settings:
- #370 M9-10: LP tile rendering migration (apps JWT claim)
- #381 M9-17: Launchpad Settings UI for AI provider/model settings
  (site-admin only; no secret management)

Phase 7 - Isolation close and cleanup (after ownership and runtime switching):
- #371 M9-9: Deploy cascade restructure (workflow_call to independent
  path-filtered triggers)
- #372 M9-11: Platform cleanup - decommission shared claude-proxy, platform-ws,
  platform.job-results

### Architectural decisions incorporated

Phase B: per-app REST, WSS, auth, AI proxy, IAM, StorageStack-to-MU,
  deploy cascade, LP tile rendering, app client ownership, AuthApiStack fate.
Phase C L1: all multi-route Lambdas are Type A (no cross-app routing issues).
Phase C L3: rate-limiting via per-Lambda env vars +
  `@transformotion/rate-limit-middleware` + per-app DynamoDB rate-limit tables.
Phase C L4: per-app `ai-proxy` Lambdas wrapping shared AI proxy/provider
  mechanics; sync mode (BT, no JOB_RESULTS_TABLE) and async mode (SA,
  JOB_RESULTS_TABLE required) both supported; original shared platform
  Claude proxy decommissioned on completion.
Phase C (C1-C5): Hybrid A canonical AI pattern - service class layer + thin
  React hook wrapper - adopted in both SA and BT; cache belongs in service
  layer, not hook.
Runtime multi-provider AI: each app owns one `ai-proxy`, not separate
Claude/OpenAI proxy Lambdas. The `ai-proxy` routes internally to
`ClaudeProvider` or `OpenAIProvider`. Provider/model config is separate from
secrets; API keys remain env/CDK/Secrets Manager managed. Runtime resolution
order is app override, then platform default, then env fallback. Missing or
invalid config must fail safe to current Claude behaviour. Launchpad Settings
is the site-admin-only UI for provider/model switching. Observability includes
provider, model, latency, token usage where available, and normalized errors.

---

## 14. M10 — Auth middleware extension (sub-phase 7e-auth-middleware-extend)

### Purpose

`auth.md` documents a helper interface and `packages/lambda-middleware/`
implements it (verified by M1 #79 — see inventory Section 2.5). All
nine consumer Lambdas already use the helpers. M10's remaining work
is filling specific gaps in role enforcement and any legacy
`requireGroup` callsites in budget-tracker that haven't migrated to
the canonical pattern.

### Outcome

- Budget-tracker Lambdas verified to use the canonical helpers
  consistently. Any remaining legacy `requireGroup('budget-app',
  'admin')` calls migrated to `requireAppAccess('budget-tracker')` +
  `requireAccountAccess` per the documented pattern. (Scope depends
  on M1 #80 verification; if no legacy calls remain, this outcome
  reduces to verification only.)
- Member-role enforcement audited at the Lambda layer. Where
  write/destructive operations exist that don't currently call
  `requireAccountAccess(..., minRole)`, the call is added.
- Site-admin paths verified to use `requireSiteAdmin(auth)`.
- Account-owner-only operations verified to use
  `requireAccountOwner(auth, app, accountId)`.

Note: Stock-analyser Lambda app-access enforcement was previously
listed here as an outcome. M1 #79 verified this is already in place
(see inventory Section 3.4.2) — M10 no longer needs to add it.

### Goals served

Goal 4 primarily (role enforcement is real and consistent). Goal 3
(every Lambda's auth check uses the same helper interface).

### Gate to next

All consumer Lambdas verified to use the canonical pattern with
appropriate role enforcement. End-to-end test: a user with viewer
role calls a write endpoint and receives 403; a user with member
role calls the same endpoint and succeeds.

### Dependencies

- M1 complete (helper-availability and budget-tracker group-name
  verifications inform scope).
- M2.2 complete (the helper interface is documented as canonical).
- M4 complete (account context populates correctly so
  `requireAccountAccess` has something to validate).

This milestone can run in parallel with M8 and M9.

---

## 15. M11 — Invitation API and UI (sub-phase 7e-invitation)

### Purpose

The invitation flow is the primary mechanism for adding new users to the
platform under the closed-signup model (M0). This milestone implements
both the backend and the UI for invitations, including signup
reconciliation.

### Outcome

- Lambda for app-access invitations created or extended:
  - Invitation record shape with `apps` + `roles` + `perApp` map (per
    inventory Section 3.2's existing design).
  - Site-admin / per-app-admin authorisation on the create-invitation
    endpoint.
  - SES email delivery for invitation links.
- Launchpad UI for creating invitations (admin-only):
  - Matrix of apps × roles based on caller's permissions.
  - Email entry, expiration default, custom message option.
- Signup reconciliation flow:
  - Reads invitation token from OAuth state on first sign-in.
  - Looks up pending invitation in `platform.invitations`.
  - Adds user to assigned Cognito groups.
  - Creates `platform.accounts` and `platform.account-members` rows per
    invitation `perApp` shape.
  - Per-app accounts created based on which apps the invitation grants
    (per M2.2's per-app account model).
  - New budget-tracker accounts seeded with default `budget-data` rows
    (categories, empty budget amounts/frequencies) and default settings
    (`csvFormatMappings: {}`) so the app is immediately usable without
    manual setup. Identified as a gap during M6's inert-settings cleanup:
    the existing account has data from migration, but invitation-created
    accounts would otherwise start empty.
- Multi-user platform functional end-to-end: an admin user invites
  another email; the invitee receives an email; clicking the link signs
  them up and gives them the granted access.

### Goals served

Goal 4 primarily (the invitation flow is the heart of the permissions
model). Goal 3 (one invitation flow serves all apps via the `perApp`
shape).

### Gate to next

End-to-end test: site-admin invites a new email to budget-tracker as
member; recipient receives email, clicks link, signs up via Cognito,
arrives at launchpad with budget-tracker tile visible, can navigate to
budget-tracker and see/edit data.

### Dependencies

- M0 complete (closed-signup model is what makes invitations the only path). **Done.**
- M2.2 complete (helper interface ratified, including `requireSiteAdmin` and `requireAccountOwner` that the invitation flow uses for authorization). **Done.**
- M2.3 complete (contracts policy ratified — establishes location for invitation-flow contracts). **Done.**
- M4 #144 done (handleSetup writer fix; PR #157). **Done.** Note: M4 originally listed as a milestone-level dependency, but the only piece M11 actually needed from M4 was the writer fix. The remaining M4 work (#146 data migration, #147 provisioning verification) folded into M11 because that work depends on M11's design.

M10 is no longer a dependency. PLAN.md previously listed M10 because helper interfaces were originally scoped as M10's outcome. M2.2 ratified those helpers; M10 reduces to verification-only of correct usage. M11 implementation should produce code conformant to M10's verification (i.e., M10 will eventually verify M11's invitation Lambda among others), but M11 doesn't wait on M10.

---

## 16. M12 — Forgot-provider fix

### Purpose

Federated users (Google, Microsoft, Facebook social IDP) sometimes forget
which provider they used to sign up. The `forgot-provider` Lambda exists
to let them recover by entering an email and getting their provider
returned. The current implementation has a bug in federated-user lookup.

### Outcome

- Bug in `functions/auth/forgot-provider/` fixed.
- Federated-user lookup correctly identifies which IDP a given email
  signed up with.
- Test added to cover the federated-user lookup path.

### Goals served

Goal 4 (federated identity recovery is part of the permissions model;
the bug breaks it for federated users specifically).

### Gate to next

End-to-end test: a user signed up via Google calls forgot-provider with
their email and receives the correct provider name. Same for Microsoft
and Facebook.

### Dependencies

None hard. Can run in parallel with M5 onwards. Sequenced last because
it's small and isolated.

---

## 17. M13 — Observability

### Purpose

The platform currently has fragmented observability. To understand
whether Stock Signal or Budget Tracker is healthy, you have to visit
multiple AWS consoles (CloudWatch Logs per Lambda) with no aggregated
view. There is no per-app health dashboard, no cross-app monitoring at
the platform level, and no per-user or per-account Claude API
consumption visibility. The architectural inventory's Section 5.6
flagged that `infrastructure/lib/README.md` declares a `MonitoringStack`
that does not exist in the deployed CDK app.

This milestone delivers the observability substrate the platform needs
to operate at multi-app, multi-user scale. Goal 3's "monitor as a
platform" requires this.

### Outcome

- `MonitoringStack` CDK stack created at `platform/infrastructure/`
  per `CONTRIBUTING.md` Section 3.7. Deployed alongside other platform
  stacks.
- Per-app CloudWatch dashboards: one per app (stock-analyser,
  budget-tracker, launchpad), each surfacing the Lambda-invocation
  counts, error rates, latency percentiles, and downstream-call
  patterns for its app's Lambdas.
- Cross-app platform dashboard: one dashboard at the platform level
  surfacing aggregate health across all apps (total invocations, total
  errors, gateway-level metrics).
- Per-user and per-account Claude API consumption observability:
  CloudWatch metrics or logs that allow attributing Claude proxy
  invocations to a specific user and account, addressing inventory
  finding 2.11 #4.
- Health-check endpoints surfaced through the platform gateway for
  external uptime monitoring.
- Documentation in `infrastructure/lib/README.md` updated to describe
  `MonitoringStack` as it actually exists (per M3's documentation
  reconciliation expectations).

### Goals served

Goal 3 primarily ("monitor as a platform" is the third clause of the
goal statement). Goal 1 indirectly (per-app dashboards make working on
one app without affecting another visible — regressions surface in the
relevant app's dashboard rather than being invisible).

### Gate to next

`MonitoringStack` deployed. Per-app dashboards visible in the AWS
console. Platform dashboard visible. A test invocation of the Claude
proxy is attributable to the originating user and account in
observability output.

### Dependencies

- M12 complete (this milestone follows the substantive M0–M12 sequence
  and runs strictly after, per the linear-execution preference).

---

## 18. M14 — Deployment verification

### Purpose

Issue #18 tracked deployment infrastructure work through sub-phases
2a–3, with most of its substance landed in PRs #19–28. Three
deferred items from #18's comments remain unresolved and constitute
this milestone's scope:

1. The prod GitHub Actions environment has zero variables. First prod
   deploy will hard-fail at the env-var check.
2. Deploy workflows have incomplete path filters
   (`deploy-stock-analyser.yml` doesn't cover `.github/workflows/**`
   or `scripts/ci/**`; same likely for `deploy-budget-tracker.yml`).
   Changes to CI machinery don't auto-trigger the workflow they
   modify.
3. PR #28 added "verify deployed artefact after deploy" but the
   verification's depth is unclear. Smoke testing — the artefact
   responds correctly to a known request — may or may not be in
   place.

This milestone resolves all three. Goal 2's "deploy a new app without
affecting existing ones" requires deploy verification be real, not
ceremonial.

### Outcome

- Prod GitHub Actions environment populated with all `[REQUIRED]` env vars per the documentation set in PRs #19–24. First prod deploy passes the env-var check.
- Deploy workflow path filters extended for completeness, covering:
  - `.github/workflows/**` and `scripts/ci/**` for `deploy-stock-analyser.yml`, `deploy-budget-tracker.yml`, and `deploy-migration-utilities.yml` (per M6's creation). Changes to CI machinery trigger the workflows they modify.
  - `packages/**` for `deploy-budget-tracker.yml` (per M1 #81 finding — currently in stock-analyser's workflow but missing from budget-tracker's). Once #17/M5 activates the real budget-tracker deployment, this gap becomes a live bug.
  - `functions/**` asymmetry investigated for `deploy-budget-tracker.yml`. Stock-analyser triggers on `functions/**`; budget-tracker does not. Whether budget-tracker Lambdas have dependencies on `functions/**` changes determines whether the asymmetry is intentional or a gap.
  - `deploy-migration-utilities.yml` path filters verified for completeness — triggers on `migration-utilities/**` and `migration-utilities/infrastructure/**` plus the same CI machinery paths (`.github/workflows/**`, `scripts/ci/**`).
- Post-deploy smoke testing: a known-good request hits each app's primary endpoint after deploy, asserts a 2xx response or expected redirect. Failure rolls back or alerts. Existing PR #28 verification reviewed and extended if it doesn't already do this. Smoke testing extends to migration-utilities deployments — a known-good request hits a deployed migration utility's endpoint after deploy.
- **Pattern B IAM scope CI verification** (per M2.2 #110): a CI check confirms that receiving Lambdas using Pattern B (cross-Lambda invocation with synthetic-event claim propagation, currently `claude-proxy`) have their `lambda:InvokeFunction` IAM policy locked to expected callers only. If the policy drifts to allow unexpected callers, CI fails. This verification is the load-bearing constraint that makes Pattern B acceptable; without it, the platform's cross-Lambda trust posture is weaker.
- A first prod deploy executed against the populated environment as the milestone's verification — confirms the pipeline works end-to-end against prod.

### Goals served

Goal 2 primarily (deploy hygiene). Goal 1 (deploy verification catches
regressions before they affect users). Goal 3 (post-deploy smoke
testing surfaces in observability — links to M13's monitoring
substrate).

### Gate to next

First successful prod deploy with all env vars populated, all path
filters covering CI changes, and post-deploy smoke testing passing. A
deliberately-broken deploy detected by the smoke testing as a
verification of the verification.

### Dependencies

- M13 complete (per the linear-execution preference; deploy
  verification benefits from being able to surface in observability).

---

## 19. M15 - v0-canonical transition (contracts, workflow, and UI readiness)

**Purpose**

The v0 development workflow is foundational to how the platform's frontend is built (CONTRIBUTING.md Section 1.2). v0 generates UI against documented data shapes with mocked persistence; the same components run against real persistence in production.

M2.3's contracts policy decisions established v0 repo as the canonical location for contracts (per #114), with Claude repo accessing via a one-way sync into a gitignored location. The cross-repo access asymmetry is the determining constraint: v0 cannot access the Claude repo; Claude Code can access the v0 repo. The v0 repo is the only location both AIs can read natively.

M15 makes the v0-canonical workflow real end-to-end: contracts are authored in v0 first, runtime consumes those contracts through a generated sync target, and v0 apps are realistic enough that future UI work can start in v0 without misleading structural drift.

M15 current state:

- #134 implemented v0 contract sync, byte-identity CI, and generated sync-target guardrails.
- #135 migrated raw contract material into v0.
- #136 established the scope-first executable contract structure.
- #137 authored TypeScript contract files and typed mocks.
- #139 authored backend behavioural contracts without duplicating shared shapes.
- #138 replaced runtime contract mirrors with synced v0 imports.
- #391 reconciled app baselines through bounded v0 adoption slices.
- #124 added the v0 freshness gate and deploy contract checks.
- #401 owns the final readiness work: realistic v0 app mocks/state, stale documentation cleanup, one v0-authored UI proof, and #390 closeout.

**Key outcomes**

*Workflow infrastructure:*

- `scripts/sync-v0.sh` implemented — pulls v0 contracts into gitignored sync target in Claude repo
- v0 repo access credential (PAT or GitHub App) configured in Claude repo's GitHub Actions secrets
- CI verification implemented — Claude repo's CI runs sync, then verifies byte-identical match between sync target and v0 repo's contracts at HEAD; CI fails on any divergence
- Mechanical guardrails: gitignore configured for sync target; sync target README warning against direct edits; sync script refuses to run if it detects local modifications
- CLAUDE.md cross-references the contracts authoring discipline so Claude Code working in the repo picks it up automatically
- v0 freshness gate validates UI-affecting runtime PRs have linked v0 work or an explicit no-impact reason
- v0 sandbox freshness workflow documented: start from latest `transformotion-apps-b8/main` before UI implementation
- One v0-authored UI change validated through the freshness-gated runtime workflow
- v0 workflow documentation covers mock-mode mechanics, sync mechanism, contract authoring, and runtime follow-up expectations

*Contracts migration:*

- All contracts migrated from Claude repo (`contracts/`, `apps/*/contracts/`) to v0 repo as canonical location per #114
- v0 repo contracts restructured into scope-first executable bundles per #136
- `contracts/platform/` established with platform-shared contracts per #118
- `aws-infrastructure.md` dispersed per #116: normative pieces relocated to per-domain backend contracts and platform-domain contracts; descriptive pieces moved to ops docs or deleted; file itself goes away
- `gap-analysis.md` and `changelog.md` moved out of active contract authority (not contracts per #116)
- Contract format converted to TypeScript-first executable bundles plus markdown behavioural files, with TypeScript authoritative for shape and markdown semantic-only
- Per-domain backend contracts authored per #133's pattern, replacing the per-Lambda framing of earlier scope
- Per-Lambda permission models from M2.2's `auth.md` (M2.2 #111) migrated into per-domain backend contracts; `auth.md` retains high-level model with cross-references
- Independent type declarations in runtime code (the `AuthService` triplication per M2.2 #130, plus other runtime mirrors of contract types) replaced with imports from synced contracts location per #115's strict rule

**Goals served**

Goal 2 (clean v0 development workflow). Cross-cutting since the v0 constraint is foundational and affects Goals 1, 3, and 4 indirectly. Goal 4 (single source of truth for contracts).

**Gate**

End-to-end v0-canonical workflow operational:
- All contracts in v0 repo only; Claude repo has no `contracts/` or `apps/*/contracts/` directories
- Sync mechanism running in CI; byte-identity verification active
- One real v0-authored UI change demonstrated through the #124 freshness-gated runtime workflow
- All runtime code uses imports from synced contracts location; no independent type declarations matching contracts
- Backend behavioural contracts exist for each active M15 scope
- v0 app mocks are realistic, contract-backed, and documented enough for UI work
- v0 sandbox freshness workflow is documented

**Dependencies**

- M2.1 complete (canonical persistence pattern with v0 swap point established)
- M2.3 complete (contracts policy ratified — contracts are the v0 interface)
- M6 in progress or complete (real-world test of v0→app sync via Budget Tracker activation)

**Internal sequencing**

The migration issues within M15 have dependencies on each other and on infrastructure:

```
#134 (sync mechanism + CI enforcement)
   → #135 (location migration: Claude repo → v0 repo)
       → #136 (bucket restructure + cleanup)
           → #137 (format conversion, depends on #133 settled — done)
               → #138 (mirror removal in runtime code)
               → #139 (per-domain backend contract authoring, depends on #133 settled — done)
```

#124 (the original v0 development workflow infrastructure issue) is broader infrastructure that complements but doesn't strictly block the migration sequence above.

Can run in parallel with M7 once M2.1 lands. Migration depends on infrastructure (#134) landing first within M15.

---

## 20. M16 — Account lifecycle and invitation

**Design baseline** (read before any implementation work):

- [`docs/transformotion-user-account-permissions-model.md`](./docs/transformotion-user-account-permissions-model.md) — canonical product/permission model (entities, roles, policy matrix, invitation/redemption lifecycle).
- [`docs/adr-m16-runtime-architecture.md`](./docs/adr-m16-runtime-architecture.md) — M16 runtime architecture decision document (D1–D11, all confirmed 2026-06-11). Milestone-scoped per CONTRIBUTING §11; decisions ratified into `docs/architecture/auth.md` and `docs/architecture/data.md` as implementing PRs land.
- [`docs/auth-md-revision-map.md`](./docs/auth-md-revision-map.md) — per-phase normative-document update obligations for `docs/architecture/auth.md`.

**v0 contract baseline:** `m16.0.0` (v0 PR #38, commit `71219385`).

**Runtime status:** contracted in v0 / synced into runtime / implementation not started.

---

## 21. M18 — Corporate rebrand and light/dark theming

### Purpose

Apply the real Transformotion corporate visual identity across the active
platform apps before production cutover. This milestone replaces the
early invented palette/logo with the owner's real corporate palette and
logo, establishes light/dark mode, and creates a canonical shared
brand-token source so future brand updates are made once and consumed
consistently.

### Outcome

- Shared, compile-time-only Transformotion brand-token package created
  for corporate palette, semantic light/dark tokens, typography tokens,
  radius/shadow tokens where needed, and token maps for non-CSS
  consumers.
- Package exports no React components, layouts, navigation, tabs,
  dashboards, app shells, or app-specific UI.
- Launchpad, Stock Analyser, and Budget Tracker consume the shared brand
  tokens through their app-owned styling integration points.
- Real Transformotion logo/brand assets replace invented/code-rendered
  runtime wordmarks where appropriate.
- Light/dark mode is implemented across the active apps, using existing
  `next-themes` infrastructure where suitable.
- Cognito Hosted UI CSS, email templates, charts, favicons/icons, and
  other non-CSS brand consumers are updated or explicitly dispositioned.
- Existing app tabs/navigation are retained.
- v0 freshness requirements are satisfied for UI-affecting work.
- Dev deployment validates the rebrand across active apps.

### Goals served

Goal 3 primarily — platform cohesion / update once, reuse everywhere.
Goal 1 secondarily — app-owned surfaces remain independent while
consuming a shared token contract. Goal 2 indirectly — future apps can
adopt the canonical brand-token package without reinventing the brand
layer.

### Gate to next

M18 is complete when Launchpad, Stock Analyser, and Budget Tracker are
deployed to dev with the real corporate palette/logo, light and dark
modes verified, token duplication removed or explicitly dispositioned,
non-CSS brand consumers updated or tracked, v0 freshness satisfied, and
visual QA confirms existing app surfaces remain functionally unchanged
apart from the approved rebrand/theming work.

### Dependencies

- **M15 complete or current v0 freshness workflow operational.** M18 is
  UI-affecting work and must satisfy the v0 freshness discipline before
  runtime PRs land.
- **M16 complete or sequenced such that M18 can safely rebrand the
  post-M16 surfaces before prod.**
- **Production cutover depends on M18.** M17 must not begin until M18
  reaches its gate.

### Scope/provenance notes

- Existing app surfaces: [prototyped]/existing runtime surfaces; M18 is
  a visual rebrand of existing surfaces, not new product functionality.
- Shared brand-token package: [net-new but owner-approved milestone
  architecture].
- Light/dark mode: [net-new but owner-approved milestone scope].
- Real logo and corporate palette: [owner-provided brand input].
- Existing tabs/navigation: keep.
- Mockup left sidebar navigation: cut / out of scope.
- Mockup dashboards: [net-new], deferred to later background-analysis
  milestone.
- Active apps in scope are Launchpad, Stock Analyser, and Budget
  Tracker. Framework app is out of scope.
- The owner's mockups are brand/style references only, not canonical
  runtime surfaces.
- "Live app" means the dev deployment for this milestone, not prod.

### Out of scope

- New dashboards.
- Background market analysis.
- Portfolio/watchlist scheduled refresh.
- Buy/sell notification rules or delivery.
- Framework app.
- Shared React component library beyond existing governed UI primitives.
- Production cutover.

---

## 22. M17 — Production cutover (go-live)

### Purpose

Bring the platform from dev-only (develop is canonical, single user =
owner) to a live prod environment on main with external users. This is
the gate the owner set: prod go-live requires invitee onboarding and the
corporate rebrand/theming work to be complete first. Prod cutover is
deliberate, milestone-scoped work — not plumbing to be done
incrementally.

Throughout the build phase, main is intentionally **unborn** — reserved
for prod and never touched; develop is canonical, and the default branch
was pointed at develop (2026-06-15) to match that reality. Go-live
reverses this: main becomes live, and the develop→main promotion **is**
the launch event. The specific cutover landmines surfaced during the M11
auth-mirror work are tracked in issue #454 ("Prod-cutover landmines
(branch/env/protection)").

### Outcome

- **main becomes the live prod trunk.** The go-live is the develop→main
  promotion, done consciously as the launch event — not as plumbing for
  some other task. Expect a large promotion (develop was 440+ commits
  ahead of a stale main during the build phase).
- **Branch protection exists on main before external users.** The repo
  has no branch protection today; at cutover, main (= prod) requires it:
  no force-push, require PRs, likely require CI.
- **Every workflow's branch-targeting is re-audited at cutover.** Deploy
  and auth-mirror workflows are currently keyed to `[develop, main]` /
  develop. Re-verify each workflow's trigger and checkout ref so nothing
  assumes the build-phase branch model. (The build-phase mismatch —
  workflows assuming main while the repo lived on develop — caused
  repeated surprises during M11; verify, don't assume.)
- **Default-branch decision revisited.** If/when main genuinely becomes
  the trunk at go-live, revisit whether the default branch should flip
  back to main (it points at develop now, correct for the build phase).
- **Prod environment, secrets, and credentials confirmed.** A prod
  environment with prod-scoped secrets and credentials exists and is
  separate from dev before go-live.

### Goals served

Goal 2 (deploy / operational hygiene) and the platform's transition to
serving external users. The cutover is the precondition for any
multi-user / external-user operation.

### Gate to next

A live prod environment on main: develop promoted to main, branch
protection in force, every workflow re-audited against the prod branch
model, and prod environment/secrets verified — with external users able
to onboard via the M11 invitation flow, and the active apps already
validated with the real Transformotion corporate brand and light/dark
theming from M18. (Terminal milestone: this is the go-live event, not a
gate into further build-phase work.)

### Dependencies

- **M16 — Account lifecycle and invitation, complete (hard gate).** Prod
  go-live requires invitee onboarding (the M11 invitation flow) to be
  complete first — the owner-set gate for external users.
- **M18 — Corporate rebrand and light/dark theming, complete (hard
  gate).** Prod go-live requires the active apps to carry the real
  Transformotion corporate visual identity and verified light/dark
  theming before external users see production.
- **M19 — Stock Analyser background intelligence and notifications,
  complete (hard gate).** M17 (go-live) depends on M19 (full Milestone B
  — background intelligence AND notifications). Prod cannot cut over with
  M19 incomplete.
- **M20 — UI reconciliation (v0 ↔ live parity), complete (hard gate).**
  Prod go-live requires the v0 prototype and the live runtime apps to be at
  UI parity, with v0 re-established as the authoritative source of truth.
  External users must not see a runtime UI that has drifted from the
  canonical v0 design. Cannot cut over with the apps mid-reconciliation.

Cutover does not begin until M16, M18, M19, and M20 are all done.

---

## 23. Beyond M14

The following items are scoped but not yet sequenced into milestones.
They live in the "Backlog" GitHub milestone (a holding area, not a
deliverable). Sequencing happens when prerequisite work completes and
the items become actionable — at which point an item gets promoted to
a numbered milestone, this section gets updated, and the issue moves
out of the Backlog milestone.

- **Admin UI screens.** Account settings (member list, invite, manage
  member app permissions, remove member, rename, transfer ownership)
  and platform admin (user list, platform invites, manage Cognito
  groups, disable/delete accounts, usage metrics). Originally Phase 5
  in `DEVELOPMENT_PLAN.md`.

- **Stock-analyser localStorage migration on first login.** Per
  inventory Section 5.3, this did not land. Decision deferred: add a
  migration handler analogous to budget-tracker's, or treat CMC CSV
  import as the only entry path.

- **PWA manifest and service worker.** Mobile installation, offline
  capability, push notifications (originally Phase 4).

- **Mobile-first audit and enforcement.** The mobile-first design
  constraint (375px-first, Tailwind mobile-first, bottom tab nav on
  mobile, sidebar on desktop, no max-width media queries) was declared
  at S1.1; current state of compliance is unknown.

- **Push notifications for cycle peak alerts.** Originally Phase 4 work
  via EventBridge + SES.

- **Test pyramid build-out.** Frontend tests, integration tests, E2E
  tests, CDK assertion tests, Lambda handler tests beyond
  pre-token-generation. CI test gating once tests exist.
  Coverage thresholds.

- **401 recovery path UX.** Expired refresh tokens currently result
  in a dead error state with no redirect to sign-in. Raised in
  Issue #18's comments and deferred to Phase 4 UX work.

- **NEXT_PUBLIC_RUNTIME_PROFILE default-flip.** Long-term flip of code
  defaults to production values (`live` profile). Issue #18 short-term
  fix reclassified as `[REQUIRED]`; this is the long-term fix.

- **Recommendations sector filter bug.** Issue #33 — the Stock Signal
  Recommendations tab computes a sector-filtered list but renders the
  unfiltered one.

- **rules-tab.tsx pattern.source bug.** Issue #37 — the budget-tracker
  rules tab passes a `RegExp` object where a `.source` string is
  expected.

- **Transformotion Framework app.** Entirely unscoped beyond placeholder.
  Detailed scoping deferred until Budget Tracker activation completes
  and the canonical patterns are stable enough that the third app can
  exercise them.

---

## 24. Discipline and update rules

### 24.1 Updating this document

When a milestone's scope changes mid-execution, this document is updated
in the same PR that lands the change. The plan does not get retrofitted
to describe whatever happened; the plan is the trajectory, and the
trajectory is updated when it changes.

When a new milestone is added, sequencing it requires deciding which
existing milestones it depends on and which depend on it. The dependency
graph is what the GitHub Project's roadmap view renders.

### 24.2 Milestone gates

Each milestone has a "gate to next" condition. The gate is the specific
observable that says the milestone is complete. Gates are not vibes —
they are testable conditions. If the gate cannot be tested, the gate is
not yet specified well enough.

When a milestone reaches its gate, the next dependent milestone is
unblocked. The GitHub Project's blocked-by relationships make this
visible at the issue level.

### 24.3 Beyond-M14 promotion

Items in Section 23 are promoted to numbered milestones when they become
actionable. Promotion is a PR that updates this document and creates the
corresponding GitHub Milestone with issues.

### 24.4 Operating principles apply

The operating principles in `CONTRIBUTING.md` Section 5 apply throughout:
verify before acting, audit cheerful framings, evaluate against the
goals. The discipline rule (`CONTRIBUTING.md` Section 2.1) applies to
this document — any PR changing what's described here updates this
document in the same PR.

---

## 25. Reference — milestone summary table

For quick visual reference. The full text above is the canonical source.

| ID | Name | Goals | Depends on |
|---|---|---|---|
| M-setup | Documentation and project tracking | All (indirectly) | — |
| M0 | Close the open signup gate | 4 | M-setup |
| M1 | Verification pass | All (indirectly) | M-setup |
| M2 | Architecture decision documents | All | M1 |
| M3 | Documentation reconciliation | 3 | M2 |
| M4 | appSlug writer and migration | 4 | M2.2 |
| M5 | Gateway consolidation | 2, 3 | M4 |
| M6 | Budget Tracker activation | 1, 4 | M2.1, M4, M5 |
| M7 | Deduplication and consolidation | 1, 2, 3 | M2, M3 |
| M8 | Cleanup of legacy auth substrate | 3, 4 | M2.2 |
| M9 | Per-app architecture (REST, WSS, auth, Claude proxy, IAM) | 1, 3, 4 | M7, M2.2 |
| M10 | Auth middleware extension | 3, 4 | M1, M2.2, M4 |
| M11 | Invitation API and UI | 3, 4 | M0, M4, M10 |
| M12 | Forgot-provider fix | 4 | (none hard) |
| M13 | Observability | 3, 1 | M12 |
| M14 | Deployment verification | 2, 1, 3 | M13 |
| M15 | v0-canonical transition | 2, 4 | M6 |
| M16 | Account lifecycle and invitation | 3, 4 | M11, M15 |
| M18 | Corporate rebrand and light/dark theming | 3, 1, 2 | M15, M16 |
| M17 | Production cutover (go-live) | 2 | M16, M18, M19, M20 |
| M19 | Stock Analyser background intelligence and notifications (PLANNING) | 1, 2, 3 | M18 (closed); ADR D8 |
| M20 | UI reconciliation — v0 ↔ live parity (PLANNING) | 3, 1 | (audit done); §8.A discipline |

M8, M9, M10 can run in parallel. M11 follows M10. M7 can run in parallel
with M6 once M2 and M3 complete. M13 and M14 are sequenced strictly
linear after M12, per the user preference for focused execution.

M19 is a PLANNING milestone; its full text is Section 26 below. It is
placed after the reference table deliberately — section order does not
encode implementation sequence, and Section 26 was appended without
renumbering the existing sections.

---

## 26. M19 — Stock Analyser background intelligence and notifications

**Status: PLANNING milestone (a.k.a. "Milestone B").** Phase 0 is
architecture/product **decision** work. This is **not** implementation-ready.
**No build tickets exist or may be created until the Phase-0 decisions are
ratified.** No runtime code lands under M19 until that gate is passed.

### Purpose

Add background automation to the Stock Analyser that:

- **(a)** runs Market Analysis across existing markets **on a schedule** and
  writes refreshed results to the shared cache;
- **(b)** **background-refreshes** user portfolios and watchlists across **all
  accounts**;
- **(c)** **notifies** users when a held stock should be sold or a watchlisted
  stock should be bought.

These are the "full Milestone B" components: scheduled market-analysis
generation + cache-write; background portfolio/watchlist refresh; and buy/sell
notifications.

### Provenance split

| Area | Provenance | Notes |
|---|---|---|
| Market-analysis logic | `[prototyped]+[contracted]` — VERIFIED | Market Analysis + Recommendations tabs are real, web-search-grounded, and contracted. |
| Scheduled execution + cache write | `[net-new]` | New background-job infrastructure. |
| Cross-account background reads/writes | `[net-new]`, extends ADR D8 | Cron has no user JWT; service-principal auth undefined. |
| Portfolio/watchlist refresh | `[contracted entities]` + `[net-new job]` | Data exists; scheduled refresh does not. |
| Buy/sell notifications | `[net-new]` | Rule, delivery channel, UI surface, preferences all unresolved. |

### Phase-0 decision batch

Gate: **all** of the following are ratified into an ADR/contract; any net-new
user-facing surface is v0-prototyped first; **then** build tickets are
sequenced. Until then there are no build tickets. The decisions are tracked as
GitHub DECISION issues under the M19 milestone:

1. **[GATING] Service-principal authorization** (#529) — EventBridge/Lambda
   jobs read/write account-scoped data with **no user JWT**, fail-closed and
   auditable. Extends ADR D8 and must be **additive** to it (introduces no read
   path that trusts a claim a real user's request would not; preserves the
   "writes fail closed on the live membership row" property). Blocks (a) and
   (b). **Sequence FIRST.**
2. **Cache design** (#530) — `PARTIALLY PRE-ANSWERED`: the existing
   analysis-cache Lambda already writes a SHARED partition for `MARKET`/`RECS`
   at 24h TTL. Narrows to: reuse SHARED vs dedicated market-cache table; refresh
   interval; stale-vs-empty on FAILED refresh. (ADR D2 does **not** apply.)
3. **Scheduler design** (#531) — `PATTERN EXISTS` (cycle-check 8AM AEST
   EventBridge cron, Phase 4). Decide cadence, retry, fan-out, throttling, cost;
   build on the existing pattern.
4. **[OWNER/PRODUCT] Buy/sell signal rule** (#532) — reuse existing SA signal
   logic, or a new portfolio/watchlist-specific rule? The partner will **not**
   design this.
5. **Notification delivery + surface** (#533) — `[net-new]`: in-app centre /
   SES / push / staged. Any user-facing surface is v0-prototyped first.
6. **Notification preferences / opt-out** (#534) — `[net-new]`: likely a
   settings surface. Kept separate from #533.
7. **Market-data source seam** (#535) — `CONCRETE`: the swap point is
   `getStockAnalyserClient().getOhlcvData` (today Yahoo, unofficial/no-SLA).
   Candidates: Twelve Data / EODHD / Alpha Vantage. Open contract Q: does the
   stored `MarketAnalysisResult` gain a `source`/`provider` field? China out of
   scope; Japan deferred to the universe-expansion backlog item.

### Named seams

`notification delivery`; `market-data feed`.

### Goals served

Goal 1 (active apps deliver real user value) and Goal 2 (operational hygiene),
via background intelligence and proactive user notifications, plus Goal 3
(architecture coherence) through the additive-to-D8 service-principal model.

### Gate to next

All seven Phase-0 decisions ratified into ADR/contract; every net-new
user-facing surface v0-prototyped; build tickets then sequenced (gating
decision #529 first). M19 only becomes implementation-ready at that point. As a
PLANNING milestone, M19's own gate is "Phase-0 decisions ratified," not "code
shipped."

### Dependencies

- **M18 — Corporate rebrand and theming (closed).** The dashboard surfaces
  deferred out of M18 (portfolio cards, market-signals panel, notification
  surfaces) are M19's user-facing presentation layer.
- **ADR D8 (request-scoped authorization).** Decision #529 extends D8 and must
  be additive to it.
- **M17 (go-live) depends on M19 (full Milestone B — background intelligence
  AND notifications).** Prod cannot cut over with M19 incomplete. (Recorded on
  both sides: see M17's Dependencies in Section 22.)

---

## 27. M20 — UI reconciliation (v0 ↔ live parity; v0 as source of truth)

**Status: PLANNING milestone (decision-gated).** Phase 0 is direction
decisions + discipline. No reconciliation build work ramps until the Phase-0
decisions ratify. Placed after the reference table deliberately — section order
does not encode sequence, and this section was appended without renumbering.

### Purpose

A one-time reconciliation to bring the v0 prototype
(`transformotion-apps-b8`) and the live runtime apps back to **UI parity**, and
to re-establish **v0 as the authoritative source of truth for the UI** — so that
from this point on, every UI change is v0-first and runtime is wire-up-only.

### Why this exists

An audit comparing **every** UI surface (Stock Analyser, Budget Tracker,
Launchpad) against v0 `main` found the runtime and v0 have diverged
**extensively and bidirectionally** — dozens of substantive deltas per app.
Most of "live ahead of v0" is legitimate product work that reached the live app
**without going through v0**: a design-system typography change (`font-display`
stripped from primitives, pushed to per-call `titleClassName`), copy hygiene
(removal of "mock"/"prototype" wording in favour of "authorized server-side"),
pervasive async/degradation states (loading / error / `—` placeholders / busy
spinners), and whole features (SA Price History chart; BT's
Projects→Capital-Expenditure model change and AI-feature removals; Launchpad
redemption inline flow + AI-engine redesign + callback screen). Several items are
**v0-ahead**, where blindly "making v0 = live" would delete legitimate v0 work
(M18 theme-scope, the contract-gated pending-invitations block, the mock-signup
seam). So this is a real reconciliation with **directional decisions** and
**land-mines**, not a mechanical copy. The full per-surface audit of record is
preserved in the milestone's per-app issues.

### Phases

- **Phase 0 (gate).** (a) Ratify the reconciliation-direction decisions — for
  each bidirectional / feature-level / v0-ahead item, owner rules *v0 adopts
  live* / *live adopts v0* / *keep deliberately divergent* (#545). (b) Land the
  v0-authoritative discipline in `CONTRIBUTING.md` §8.A + `AGENTS.md` / `CLAUDE.md`
  (#546). No build work ramps before Phase 0 ratifies.
- **Phase 1.** Reconcile each app to parity, v0-first: Stock Analyser (#548),
  Budget Tracker (#549), Launchpad (#550). Mostly v0 catch-up; some runtime
  adoption per the Phase-0 rulings.
- **Phase 2.** Final parity verification + reconciled-baseline record (#547):
  re-run the per-surface comparison, `pnpm sync:v0` clean, visual diffs, and
  capture the reconciled "v0 == live" baseline commit.

### Goals served

Goal 3 (architecture coherence) primarily — restoring the v0-canonical UI
discipline established at M15 — and Goal 1 (active apps deliver real user value)
by ensuring external users see the canonical design, not drifted runtime UI.

### Gate to next

v0 and the live apps are presentation-identical (modulo items deliberately ruled
"keep divergent"); the reconciled baseline commit is recorded; the §8.A
discipline is in force. As a PLANNING milestone, M20's own gate is "Phase-0
decisions ratified + discipline landed," after which Phase-1/2 are
implementation work.

### Dependencies

- **The completed UI audit (done).** The per-surface delta across all three apps
  is captured in issues #548 / #549 / #550; this is the milestone's input.
- **§8.A discipline (#546).** Should land alongside the Phase-0 decisions so the
  reconciliation operates under the v0-authoritative rule.
- **M17 (go-live) depends on M20.** Prod cannot cut over with the apps
  mid-reconciliation — external users must see the canonical v0 design. (Recorded
  on both sides: see M17's Dependencies in Section 22.)
