# Transformotion Platform - AI Agent Operating Guide

This file is the root operating guide for AI coding agents working in this
repository. It is not a generic assistant prompt. It defines the architecture
governance, ownership boundaries, migration constraints, and behavioural rules
that keep Transformotion Platform coherent while it is being migrated toward
per-app deployment isolation.

Read this file before making substantive changes. Then read the more specific
documents named here.

## 1. Platform Overview

Transformotion Platform is a multi-app, multi-tenant application platform. It
currently contains:

- `apps/launchpad` - platform shell, sign-in entry point, app tile rendering.
- `apps/stock-analyser` - Stock Signal Analyser.
- `apps/budget-tracker` - Budget Tracker.
- `platform` - shared substrate and platform-owned runtime code.
- `packages` - explicitly shared libraries.

The platform direction is per-app ownership and independent deployment:

- Apps own their runtime infrastructure: REST, WSS, app Lambdas, app tables,
  app IAM, app auth integration, and app deploy workflows.
- The shared platform substrate shrinks to CloudFront, DNS, ACM, build tooling,
  and carefully governed shared packages/constructs.
- Cross-app runtime coupling is forbidden unless explicitly documented as a
  transitional migration state.
- Shared code exists only where the abstraction is truly cross-app or
  platform-wide.
- Contracts are explicit. Hidden API, auth, data, or Lambda-to-Lambda behaviour
  is architecture debt.

The repository is mid-transition. Some current-state documents still describe
shared platform REST/WSS/auth patterns. M9 is the milestone that normalizes the
platform toward per-app ownership of REST, WSS, auth substrate, Claude proxy,
and IAM. Agents must preserve current compatibility while avoiding any new
shared-runtime topology that M9 is actively retiring.

## 2. Authoritative Documents

Use these documents in this order:

- `AGENTS.md` - AI-agent operating rules and architecture safety rules.
- `PLAN.md` - milestone trajectory, especially M9 for per-app architecture.
- `docs/architecture/inventory.md` - living current-state inventory.
- `docs/architecture/*.md` - normative architecture invariants.
- `MONOREPO.md` - current repository topology, imports, deploy triggers.
- `CONTRIBUTING.md` - workflow, discipline rule, contracts policy, branch/PR
  expectations.
- `contracts/<scope>/` - explicit contract source of truth.
- `apps/<app>/CLAUDE.md` - app-specific operating notes when present.

If these documents conflict, do not silently choose one. Identify whether the
conflict is current-state vs target-state. For implementation work, preserve
current-state compatibility unless the task is explicitly part of the migration.
For architecture direction, prefer the M9 target state.

## 3. Repository Topology

### `apps/`

User-facing applications and app-owned runtime code. Each app owns its UI,
domain services, stores, app Lambdas, app infrastructure stacks, and app deploy
workflow.

Allowed dependencies:

- `apps/<app>` may import from `packages/*`.
- `apps/<app>` may not import from another `apps/<other-app>`.
- App Lambdas may use shared middleware/packages, but must not import another
  Lambda's handler or another app's implementation.

### `platform/`

Platform-owned substrate and transitional shared runtime. Current state includes
platform infrastructure, auth/account Lambdas, shared REST API pieces, shared
WSS pieces, and shared config.

Target state after M9:

- Platform retains shared substrate only: CloudFront, DNS, ACM, build-time
  tooling, and platform contracts/config where justified.
- Launchpad owns Cognito/auth substrate.
- Shared runtime REST/WSS/Claude proxy resources are decommissioned or split
  into per-app resources.

Do not add new platform runtime ownership for app-specific concerns unless an
architecture issue explicitly approves it.

### `packages/`

Shared libraries consumed by multiple apps or by platform/app Lambdas. Packages
must not import from `apps/`, `platform/functions/`, or `infrastructure/`.

Shared package additions must pass the "real shared concern" test. If the code
is app-specific, keep it in `apps/<app>`. If it is borderline, open an
architecture decision issue before creating the package.

### `infrastructure/`

Root CDK entrypoint package. Root infrastructure should wire stack entrypoints;
stacks themselves live with their owner:

- app stacks in `apps/<app>/infrastructure/`
- platform stacks in `platform/infrastructure/`
- migration utility stacks in `migration-utilities/infrastructure/`

Do not reintroduce root `infrastructure/lib/<scope>` stack ownership.

### `contracts/`

Normative contracts by scope. Contract mirrors under `apps/<app>/contracts/`
are forbidden. Contract changes must be paired with code changes that depend on
them, or code must be held until the contract is ratified.

Target shape:

- `contracts/platform/`
- `contracts/stock-analyser/`
- `contracts/budget-tracker/`

Use TypeScript contract files for shapes and markdown for behaviour when
creating new contracts, following `CONTRIBUTING.md`.

### `docs/`

Architecture, planning, audit, and archive material. `docs/architecture/` and
`docs/architecture/inventory.md` are normative for current state and
architecture invariants. `docs/archive/` is historical only.

### `migration-artifacts/`

Historical exports and fixtures used for migration/backfill. Treat these as
evidence and source data. Do not rewrite, normalize, truncate, or delete them
unless the task is explicitly a governed migration-artifact change.

### `migration-utilities/`

Migration-specific infrastructure and Lambda utilities. Migration utilities are
not app runtime. They must be idempotent where possible, account-scoped where
they touch app data, and clearly separated from production app handlers.

## 4. Architectural Invariants

These rules are stronger than local convenience.

1. Apps own app runtime.
   REST APIs, WSS APIs, app Lambdas, app data tables, app-specific IAM, and app
   deploy workflows belong with the app. Current shared platform ownership is
   transitional where documented.

2. Platform owns shared substrate only.
   CloudFront, DNS, ACM, shared build tooling, platform accounts/auth
   contracts, and carefully governed shared constructs/packages may be platform
   scope. App-specific runtime behaviour is not platform scope.

3. Cross-app runtime coupling is forbidden.
   No app may import another app, call another app's internal Lambda, share
   another app's table, or depend on another app's deploy state.

4. Shared runtime dependencies require explicit governance.
   Do not add shared API gateways, shared WSS routing, shared auth handlers,
   shared AI proxies, or shared app data tables casually. M9 is removing these
   patterns where they prevent deployment isolation.

5. Account scoping is mandatory.
   Every per-app data record is keyed by `accountId`. Every handler touching
   account-scoped data must validate membership before DynamoDB access.

6. Auth middleware is mandatory for protected handlers.
   Account-scoped handlers use `withAuth`, then call `requireAppAccess` and
   `requireAccountAccess` or stronger helpers. Auth-only handlers use
   `withAuthOnly`. Public handlers require an explicit justification.

7. IAM boundaries must only get tighter or more explicit.
   Do not broaden IAM permissions to unblock code. If a new permission is
   required, scope it to the exact table, secret, API, function, stage, and
   operation set where feasible.

8. Contracts are explicit.
   API shapes, data models, Lambda-to-Lambda events, auth requirements, IAM
   expectations, and migration behaviours must be documented in contracts or
   architecture docs when they become load-bearing.

9. Deployment isolation is a primary goal.
   A change to one app should not require another app to build, synth, deploy,
   or inherit a new runtime dependency. Any exception must be documented as
   current-state transitional debt.

10. CloudFormation exports are transitional unless documented.
    `Fn.importValue` is acceptable for current independent CDK entrypoints, but
    it is not a license to create permanent shared-runtime ownership. Under M9,
    exports that couple apps to shared REST/WSS/auth resources should be retired
    or narrowed.

11. Architecture documents move with architecture.
    If code changes what `AGENTS.md`, `PLAN.md`, `MONOREPO.md`,
    `CONTRIBUTING.md`, `docs/architecture/*`, `inventory.md`, or contracts
    describe, update the relevant document in the same PR.

## 5. AI Agent Rules

AI agents must follow these rules:

- Never introduce undocumented topology.
- Never add cross-app imports.
- Never move app-specific code into `platform/` or `packages/` without an
  explicit shared ownership rationale.
- Never bypass `packages/lambda-middleware` for protected API handlers.
- Never read or write account-scoped data before authorization checks.
- Never derive authorization from frontend state, localStorage, request bodies,
  or query params.
- Never weaken IAM boundaries, CORS restrictions, rate limits, or auth checks to
  make a change easier.
- Never add a new shared REST/WSS/auth/AI runtime dependency unless the work is
  explicitly scoped as architecture migration.
- Never reintroduce deprecated shared-platform patterns retired by M9 child
  issues.
- Prefer explicit contracts over inferred behaviour.
- Preserve migration compatibility unless explicitly instructed to perform a
  breaking migration.
- Keep migration code idempotent and auditable.
- Update `docs/architecture/inventory.md` when current-state facts change.
- Update `MONOREPO.md` when topology, import rules, workspace globs, or deploy
  trigger semantics change.
- Update `docs/architecture/*` when auth, data, CDK, URL, deploy, or substrate
  invariants change.
- Avoid broad unrelated edits. Architectural work should be incremental and
  reviewable.
- When discovering an architecture gap during implementation, surface it and
  create or reference a tracked issue before expanding scope.

## 6. Migration Awareness

The repository is in active architectural migration.

Current-state transitional patterns include:

- shared platform REST API Gateway used by app stacks
- shared platform WebSocket API for async AI notification
- shared platform Claude proxy paths
- platform-owned Cognito/auth substrate
- CloudFormation exports used by app stacks to consume platform resources
- incomplete contract coverage and some stale documentation references

M9 target state:

- Launchpad owns Cognito and auth Lambdas.
- Stock Analyser owns its REST API, WSS API, Claude proxy wrapper, job-results
  table, IAM role, and deploy lifecycle.
- Budget Tracker owns its REST API, WSS API, Claude proxy wrapper, AI cache,
  IAM role, and deploy lifecycle.
- Migration Utilities own their migration API/runtime separately from platform
  and app runtime.
- Shared platform runtime REST/WSS/Claude resources are decommissioned.
- Deploy cascade via `workflow_call` is replaced by independent path-filtered
  app deploys.

Agents must not treat transitional shared resources as precedent for new work.
When modifying them, preserve compatibility and prefer changes that make the
M9 split easier.

## 7. Deployment Model

Current model:

- GitHub Actions runs CI on pull requests to `main` and `develop`.
- Root scripts use pnpm workspaces and Turborepo.
- App workflows deploy app stacks and static exports.
- Platform workflow deploys platform substrate.
- Some workflows still cascade or share resources because M9 is not complete.
- CDK app entrypoints live under `infrastructure/bin/*.ts`.

Target model:

- Each app deploys independently at REST, WSS, auth integration, IAM, static
  assets, and app data layers.
- Platform deploys do not redeploy app runtime.
- App deploys do not require platform API deployment snapshots.
- Shared packages trigger only the apps that consume them.
- Workflow path filters are complete and verified.

Deployment rules:

- Do not add deploy coupling between apps.
- Do not add platform deploy requirements for app route activation.
- Do not use broad S3 syncs that can delete another app's assets.
- Do not deploy stacks outside their owning entrypoint.
- Do not add production-affecting changes without explicit user instruction and
  matching documentation.

## 8. Architecture Enforcement

Current enforcement:

- TypeScript strict mode is the primary active quality gate.
- ESLint flat config and `eslint-plugin-boundaries` define import boundaries,
  but parts of enforcement may be baseline-limited or incomplete.
- CI includes typecheck, lint baseline checks, coarse handler authz checks, and
  selected CDK synth checks.
- Tests exist but are not uniformly required across all workspaces.
- Contracts are partly present and partly still being normalized.

Expected agent behaviour:

- Run the narrowest relevant verification for your change.
- Do not rely on CI to catch architecture violations.
- Treat lint baseline entries as debt, not permission.
- Add or update enforcement when a rule becomes important and automatable.
- Prefer structural checks over comments when feasible.

High-value enforcement direction:

- complete boundary coverage for `platform/**`, nested app functions, and
  migration utilities
- verify handler authz checks use current paths
- add contract/schema validation for API and Lambda boundaries
- add per-app deploy path-filter tests
- add IAM policy checks for least privilege
- add migration idempotency tests for migration utilities

## 9. Working Practices

- Branch from `develop`; do not commit directly to `develop` or `main`.
- Use source-prefixed branch names such as `claude-code/<descriptive-name>`.
- Every substantive PR references a GitHub issue.
- File an issue before fixing a newly discovered bug or architecture gap, even
  if the fix is small and lands in the same session.
- Keep PRs scoped. Split documentation ratification from broad implementation
  when necessary.
- Prefer incremental migrations over large rewrites.
- Preserve backwards compatibility during migrations unless the task explicitly
  authorizes a breaking cutover.
- Before changing AWS resources, IAM, workflows, or architecture topology,
  inspect sibling state, not only the one named attribute.
- After merging to `develop`, check whether changed paths trigger deploy
  workflows and watch/report the deploy result.

## 10. Directory-Specific Guidance

### `apps/`

- Keep app-specific domain logic, stores, hooks, services, and UI here.
- Keep app-specific Lambdas in `apps/<app>/functions/`.
- Keep app-specific stacks in `apps/<app>/infrastructure/`.
- Do not import sibling apps.
- Do not place app contracts under the app tree.

### `platform/`

- Keep platform substrate and platform-owned runtime here.
- Do not add app-specific runtime logic here.
- Treat shared REST/WSS/Claude/auth resources as M9 transitional unless the
  current issue says otherwise.
- Platform functions must not import app code.

### `packages/`

- Use for genuinely shared libraries only.
- Packages must be dependency-light and owner-neutral.
- Packages must not depend on app or infrastructure code.
- Do not use packages to hide cross-app coupling.

### `infrastructure/`

- Root infrastructure is for CDK entrypoints.
- Do not recreate root stack libraries.
- Each entrypoint should synthesize only the stacks it owns.

### `contracts/`

- Use one canonical contract location per scope.
- Keep shape authority in `.ts` files and behavioural authority in `.md` files
  for new hybrid contracts.
- Update contracts before or with implementation changes that depend on them.

### `docs/`

- Keep architecture docs current with code.
- Keep inventory factual and status-tagged.
- Do not cite archived documents as current architecture.

### `migration-artifacts/`

- Treat as source evidence.
- Avoid formatting-only churn.
- Do not mutate historical exports without explicit migration governance.

### `migration-utilities/`

- Keep separate from app runtime.
- Make utilities idempotent and account-scoped.
- Document required source artifacts, destination tables, and rollback/safety
  assumptions.

## 11. Future Direction After M9

The intended post-M9 architecture is:

- Launchpad owns auth substrate and app access presentation.
- Each app owns REST, WSS, app Lambdas, app tables, app IAM, app Claude proxy,
  app deploy workflow, and app-specific contracts.
- Platform owns CloudFront, DNS, ACM, shared build tooling, and explicitly
  platform-wide contracts/config.
- Shared packages contain stable cross-app code only.
- No app deploy depends on a shared API Gateway deployment snapshot.
- No shared WSS API routes messages for multiple apps.
- No shared Claude proxy owns app-specific AI job semantics.
- CloudFormation exports are limited to substrate values that are intentionally
  shared and stable.
- Architecture enforcement exists for import boundaries, handler authz,
  contracts, deploy path filters, and IAM scope.

When in doubt, choose the path that makes ownership clearer, deployment more
isolated, and migration state more explicit.
