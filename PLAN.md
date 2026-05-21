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

The plan is organised as 13 milestones (M0 through M12) plus a setup
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
- **Bucket structure: frontend/backend per scope (#117).** Within each scope, contracts are organised into `frontend/` (UI-facing contracts, what v0 mocks) and `backend/` (server-side contracts, Lambda interfaces, IAM, DynamoDB schemas). Platform-shared contracts live in `contracts/platform/` as a sibling scope.
- **Platform scope at sibling level (#118).** Platform-shared contracts (Account, User, AccountMember, AuthService) live in `contracts/platform/` — sibling to per-app scopes — with the same `frontend/` and `backend/` subdirectory pattern.
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
- `apps/budget-tracker/contracts/ui-patterns.md` mirror resolved against
  root: re-sync or formally diverge per M2.3 contracts policy.
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

The architectural inventory found that 75% of stock-analyser's codebase
exists as duplicate code in budget-tracker (60% byte-identical, 40%
drifted). The drifted 40% is connective tissue — layouts, app-shells,
integration tabs — exactly the files where coordination matters most.

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
contracts to v0 repo as canonical, restructuring into frontend/backend
buckets, format conversion, removing independent type declarations
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
  #247.
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
  CDK app entrypoint only. Tracked: #250.
- `platform/` top-level directory created. Platform Lambdas moved
  from root `functions/` to `platform/functions/` (with `auth/`,
  `accounts/`, `claude-proxy/`, `user/` substructure preserved).
  Platform infrastructure moved to `platform/infrastructure/` per
  the line above. CDK path constants and `pnpm-workspace.yaml` globs
  updated. **Partial: `platform/` exists with Lambda dirs at
  `platform/{name}/` (no `functions/` subdirectory). Target is
  `platform/functions/{name}/` — migration to this structure plus
  pnpm-workspace.yaml cleanup are #250 scope.**
- `MONOREPO.md` updated to reflect the new structure: `platform/`
  documented as a top-level directory, `apps/<app>/infrastructure/`
  documented in per-app structure, root `infrastructure/` reduced
  scope documented, deploy workflow path filters updated. Per
  `CONTRIBUTING.md` Section 2.1 discipline rule, structural
  migrations touch this document in the same PR. Tracked: #250.
- The `apps/web/` 0-LOC shell cleanup (if not done in M3) folded in
  here. Tracked: #250 (`apps/web-vite-backup/` deletion).
- Stock-analyser migrated from S3 root to `/stock-signal/` prefix:
  **Code complete (landed M6).** Remaining M7 work: formal verification
  against the dev deployment (basePath routing, sub-app behaviors,
  sign-in URLs). Tracked: #251.
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
  **Code complete (landed M6).** Remaining M7 work: formal verification
  against the dev deployment (root behavior, sub-app path isolation,
  deploy workflow trigger correctness). Tracked: #251.
  - `apps/launchpad/next.config.mjs` gains `output: 'export'` and
    `trailingSlash: true` (currently not static-export-ready)
  - New deploy workflow `deploy-launchpad.yml` mirroring
    `deploy-stock-analyser.yml`'s pattern but syncing to S3 root
    (`--exclude "stock-signal/*" --exclude "budget-tracker/*"`)
  - Default CloudFront behavior verified to serve launchpad correctly
    (root `index.html` resolves directly; no `SubAppIndexRewrite` needed)
  - Atomic swap concern: stock-analyser must be moved off root in the same
    milestone window; CloudFront cache invalidation for `/*` required at
    swap time to flush stale stock-analyser content from edge nodes
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

## 13. M9 — Launchpad tile rendering migration (sub-phase 7e-launchpad-tiles)

### Purpose

The launchpad currently filters app tiles by reading `cognito:groups`
from the legacy substrate, with a hard-coded `userCanAccessFramework`
prop covering one app. The pre-token-generation Lambda emits the new
`apps` claim correctly; the consumer side hasn't migrated.

### Outcome

- Launchpad tile rendering reads the `apps` JWT claim instead of
  `cognito:groups`.
- The hard-coded `userCanAccessFramework` prop removed.
- Frontend auth store retains all JWT claims (apps, accounts,
  site_admin) atomically with rendering decisions, per the migration
  invariant in inventory Section 3.3.
- Three-state tile rendering implemented: "active" (in apps + deployed),
  "coming soon" (in apps + not deployed), "not rendered" (not in apps).
- Per inventory Section 3.3: the auth store keeps claims through token
  refresh atomically — no transient over-render window during refresh.

### Goals served

Goal 4 primarily (permissions model drives the user-visible launchpad).
Goal 1 (the launchpad is now driven by data instead of hard-coded props).

### Gate to next

Live user logs in, launchpad tiles render based on the user's actual
`apps` claim. Manual test: changing a user's app-group membership and
re-authenticating updates which tiles appear.

### Dependencies

- M2.2 complete (the JWT claim shape is documented).

This milestone can run in parallel with M8 and M10.

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

## 19. M15 — v0-canonical transition (workflow infrastructure and contracts migration)

**Purpose**

The v0 development workflow is foundational to how the platform's frontend is built (CONTRIBUTING.md Section 1.2). v0 generates UI against documented data shapes with mocked persistence; the same components run against real persistence in production.

M2.3's contracts policy decisions established v0 repo as the canonical location for contracts (per #114), with Claude repo accessing via a one-way sync into a gitignored location. The cross-repo access asymmetry is the determining constraint: v0 cannot access the Claude repo; Claude Code can access the v0 repo. The v0 repo is the only location both AIs can read natively.

M15 makes the v0-canonical workflow real end-to-end: it builds the workflow infrastructure (sync mechanism, CI verification, bidirectional component sync) AND executes the contracts migration that consumes that infrastructure. The two are inseparable in practice — the migration assumes the infrastructure is in place; the infrastructure is purposeless without the migration that uses it.

The current state has gaps in both halves:

**Workflow infrastructure gaps:**
- `scripts/sync-v0.sh` is referenced but not yet implemented — it pulls v0 contracts into a gitignored Claude-repo location
- CI verification of byte-identical match between Claude repo's sync target and v0 repo's contracts at HEAD does not exist
- v0 repo access credentials (PAT or GitHub App) for Claude repo's CI not yet configured
- app→v0 sync (taking UI changes made in the Claude repo back to v0 repo) does not exist as tooling
- Mock-mode toggle behaviour validated per M0 but not validated against the canonical contracts pattern

**Contracts migration gaps:**
- Contracts currently exist in three locations (Claude repo `contracts/`, Claude repo `apps/<app>/contracts/`, v0 repo `contracts/budget-tracker/`) — only v0 repo is the canonical home per #114
- v0 repo lacks the bucket structure (frontend/backend per scope per #117)
- `aws-infrastructure.md` is mixed normative/descriptive content per #116 — needs dispersing
- Independent type declarations exist in runtime code that mirror contracts, conflicting with #115's strict no-mirrors rule
- Per-domain backend contracts per #133 do not yet exist; per-Lambda permission models in `auth.md` (M2.2 #111) await migration
- Existing markdown contracts await format conversion to hybrid `.ts` + `.md` per #133

**Key outcomes**

*Workflow infrastructure:*

- `scripts/sync-v0.sh` implemented — pulls v0 contracts into gitignored sync target in Claude repo
- v0 repo access credential (PAT or GitHub App) configured in Claude repo's GitHub Actions secrets
- CI verification implemented — Claude repo's CI runs sync, then verifies byte-identical match between sync target and v0 repo's contracts at HEAD; CI fails on any divergence
- Mechanical guardrails: gitignore configured for sync target; sync target README warning against direct edits; sync script refuses to run if it detects local modifications
- CLAUDE.md cross-references the contracts authoring discipline so Claude Code working in the repo picks it up automatically
- v0→app sync flow validated end-to-end with a real component round-trip
- app→v0 sync mechanism designed and implemented (script or process for taking UI changes back to v0 repo)
- Mock-mode toggle behaviour validated across both v0 development and production-build contexts
- v0 workflow documentation written as a dedicated doc covering both directions, mock-mode mechanics, sync mechanism, and the contracts-as-v0-interface principle

*Contracts migration:*

- All contracts migrated from Claude repo (`contracts/`, `apps/*/contracts/`) to v0 repo as canonical location per #114
- v0 repo contracts restructured into `frontend/` and `backend/` buckets per scope per #117
- `contracts/platform/` established with platform-shared contracts per #118
- `aws-infrastructure.md` dispersed per #116: normative pieces relocated to per-domain backend contracts and platform-domain contracts; descriptive pieces moved to ops docs or deleted; file itself goes away
- `gap-analysis.md` and `changelog.md` moved out of contracts (not contracts per #116)
- Contract format converted to hybrid `.ts` + `.md` per #133, with format authority rule applied (TypeScript authoritative for shape; markdown semantic-only)
- Per-domain backend contracts authored per #133's pattern, replacing the per-Lambda framing of earlier scope
- Per-Lambda permission models from M2.2's `auth.md` (M2.2 #111) migrated into per-domain backend contracts; `auth.md` retains high-level model with cross-references
- Independent type declarations in runtime code (the `AuthService` triplication per M2.2 #130, plus other runtime mirrors of contract types) replaced with imports from synced contracts location per #115's strict rule

**Goals served**

Goal 2 (clean v0 development workflow). Cross-cutting since the v0 constraint is foundational and affects Goals 1, 3, and 4 indirectly. Goal 4 (single source of truth for contracts).

**Gate**

End-to-end v0-canonical workflow operational:
- All contracts in v0 repo only; Claude repo has no `contracts/` or `apps/*/contracts/` directories
- Sync mechanism running in CI; byte-identity verification active
- Bidirectional sync demonstrated working with at least one full component round-trip — v0 component pulled into Claude repo, modified, pushed back to v0
- All runtime code uses imports from synced contracts location; no independent type declarations matching contracts
- Per-domain backend contracts exist for all platform Lambdas
- Mock-mode toggle behaviour observable and documented

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

## 20. Beyond M14

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

## 21. Discipline and update rules

### 20.1 Updating this document

When a milestone's scope changes mid-execution, this document is updated
in the same PR that lands the change. The plan does not get retrofitted
to describe whatever happened; the plan is the trajectory, and the
trajectory is updated when it changes.

When a new milestone is added, sequencing it requires deciding which
existing milestones it depends on and which depend on it. The dependency
graph is what the GitHub Project's roadmap view renders.

### 20.2 Milestone gates

Each milestone has a "gate to next" condition. The gate is the specific
observable that says the milestone is complete. Gates are not vibes —
they are testable conditions. If the gate cannot be tested, the gate is
not yet specified well enough.

When a milestone reaches its gate, the next dependent milestone is
unblocked. The GitHub Project's blocked-by relationships make this
visible at the issue level.

### 20.3 Beyond-M14 promotion

Items in Section 19 are promoted to numbered milestones when they become
actionable. Promotion is a PR that updates this document and creates the
corresponding GitHub Milestone with issues.

### 20.4 Operating principles apply

The operating principles in `CONTRIBUTING.md` Section 5 apply throughout:
verify before acting, audit cheerful framings, evaluate against the
goals. The discipline rule (`CONTRIBUTING.md` Section 2.1) applies to
this document — any PR changing what's described here updates this
document in the same PR.

---

## 22. Reference — milestone summary table

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
| M9 | Launchpad tile rendering | 1, 4 | M2.2 |
| M10 | Auth middleware extension | 3, 4 | M1, M2.2, M4 |
| M11 | Invitation API and UI | 3, 4 | M0, M4, M10 |
| M12 | Forgot-provider fix | 4 | (none hard) |
| M13 | Observability | 3, 1 | M12 |
| M14 | Deployment verification | 2, 1, 3 | M13 |

M8, M9, M10 can run in parallel. M11 follows M10. M7 can run in parallel
with M6 once M2 and M3 complete. M13 and M14 are sequenced strictly
linear after M12, per the user preference for focused execution.
