# M9 Execution Plan

This document is the working migration control document for M9. It does not
replace `PLAN.md`, `AGENTS.md`, architecture documents, or GitHub Issues.
GitHub Issues remain the unit of work. This document translates the M9 issue
set into execution strategy, dependency order, validation expectations, and
migration safety rules.

## 1. Purpose

M9 is a controlled platform migration from shared platform runtime to
independently deployable app ownership.

The repository is currently in a transitional architecture state. Several
runtime concerns are still platform-owned or platform-coupled: shared REST API
Gateway resources, shared WebSocket infrastructure, shared Claude proxy paths,
platform-owned Cognito/auth resources, shared deploy IAM, and CloudFormation
exports consumed by app stacks.

M9 normalizes those concerns toward bounded app ownership:

- App runtime belongs to the app.
- Platform runtime shrinks to shared substrate only.
- Deployment isolation becomes real rather than aspirational.
- Shared runtime is retained only while needed for migration compatibility.
- Decommissioning happens after traffic has moved and been observed.

Migration safety is more important than migration speed.

## 2. Target End State

After M9:

- Launchpad owns auth substrate: Cognito ownership, auth Lambdas, auth API,
  app access presentation, and claim-driven tile rendering.
- Stock Analyser owns its REST API, WebSocket API, Claude proxy wrapper,
  job-results table, rate-limit table, app IAM, and deploy lifecycle.
- Budget Tracker owns its REST API, WebSocket API, Claude proxy wrapper,
  AI/cache concerns, rate-limit table, app IAM, and deploy lifecycle.
- Migration Utilities remain separate from app runtime and platform runtime.
- Platform retains CloudFront, DNS, ACM, build tooling, and explicitly shared
  packages/config only.
- Shared platform runtime REST, WSS, Claude proxy, and app-route ownership are
  removed after traffic has migrated.
- App deploys do not require platform API deployment snapshots.
- App deploys do not affect sibling app runtime.

M9's REST target is strictly separate per-app API Gateways. App-owned
resources on the shared platform API Gateway are not an acceptable M9 target.
That shape is current-state transitional debt only.

## 3. Execution Principles

- Governance before migration. Correct known documentation drift before moving
  live infrastructure.
- Create app-owned replacements before deleting shared runtime.
- Dual-run where needed. Shared platform resources remain available until all
  app traffic has moved.
- Preserve rollback paths. Cutovers should be reversible by env/config where
  possible.
- Observe before decommission. Deletion follows verified zero traffic, not
  successful deploy alone.
- Never treat transitional shared runtime as precedent for new architecture.
- Every architecture-changing PR updates the relevant docs in the same PR:
  `docs/architecture/*`, `docs/architecture/inventory.md`, `MONOREPO.md`,
  `CONTRIBUTING.md`, root/app `AGENTS.md`, or corresponding `CLAUDE.md`
  mirrors as applicable.
- CloudFormation exports are migration tools, not permanent justification for
  shared runtime ownership.
- No Cognito resource may be recreated as part of ownership transfer unless the
  issue explicitly approves a destructive migration. M9 does not approve that.
- App-specific runtime must not move into `platform/` or `packages/` without an
  explicit architecture decision.

## 4. Phase Plan

### Phase 0 - Governance Baseline

**Objective**

Establish accurate architecture guidance and minimum enforcement before any
risky migration begins.

**Issues included**

- #360 - Correct normative document inaccuracies.
- Additional blocker work if filed separately: handler-authz path drift,
  topology/enforcement drift, and deploy trigger matrix recon.

**Blockers**

- None.

**Why this phase comes here**

M9 changes high-value topology. Implementation should not begin from documents
that misstate routes, Lambda ownership, or Claude proxy usage.

**Expected repo/architecture changes**

- `docs/architecture/cdk.md` corrected for Budget Tracker Claude proxy usage.
- Stock Analyser `AGENTS.md` / `CLAUDE.md` route table corrected.
- Budget Tracker `AGENTS.md` / `CLAUDE.md` Lambda table corrected.
- Any newly discovered governance gaps are captured as issues before fixes.

**Validation requirements**

- Verify corrected docs against current CDK source.
- Verify no runtime code or infrastructure changes are included.
- Confirm M9 implementers can rely on the corrected route/Lambda inventory.

**Rollback notes**

Documentation-only rollback is simple. Avoid combining with implementation.

**Exit criteria**

- #360 merged.
- Known doc inaccuracies from M9 recon no longer mislead implementation.
- Mandatory blocker list below is either resolved or filed as explicit work.

### Phase 1 - Shared Foundations Without Deploy Impact

**Objective**

Create shared code foundations required by per-app Claude proxies and rate
limiting without changing deployed runtime.

**Issues included**

- #361 - Extract `@transformotion/fn-claude-proxy-core` and create
  `@transformotion/rate-limit-middleware`.

**Blockers**

- #360.

**Why this phase comes here**

The shared packages are prerequisites for SA and BT app-owned Claude proxies,
but they can land before any traffic moves. This reduces later cutover size.

**Expected repo/architecture changes**

- New package for Claude proxy core logic supporting sync and async modes.
- New package for rate limiting using per-Lambda env vars and per-app tables.
- Package listings updated in normative docs where required.
- Platform proxy source remains deployed and active.

**Validation requirements**

- Workspace package compile/typecheck.
- Importability from app Lambda workspaces.
- Sync/async mode behaviour documented.
- No deployed Lambda or CDK behaviour changes.

**Rollback notes**

Rollback is package-only until consumers adopt the packages.

**Exit criteria**

- Both packages compile and are ready for #366/#367.
- No local path hacks or app-specific package coupling.

### Phase 2 - Per-App Deploy Identity and IAM

**Objective**

Establish app-owned deploy identity before moving high-value app/auth resources.

**Issues included**

- #362 - Per-app Cognito app clients and per-app GitHub Actions IAM deploy
  roles.

**Blockers**

- #360.
- #361.

**Why this phase comes here**

Every later app-owned infrastructure migration should deploy using the owning
app's deploy role. Launchpad must have its own role before it takes auth
ownership.

**Expected repo/architecture changes**

- Per-app deploy roles for Launchpad, Stock Analyser, and Budget Tracker.
- Workflows updated to assume app-specific roles.
- Cognito app client ownership moved into app-owned stacks where safe.
- CDK docs and inventory updated.

**Validation requirements**

- Branch or dev deploy using each new role.
- Negative policy check: SA role cannot modify BT resources; BT role cannot
  modify SA resources; app roles cannot mutate Cognito except where intended.
- CDK synth and diff for each affected stack.
- Verify app client IDs are read from app-owned outputs.

**Rollback notes**

Workflow `role-to-assume` can temporarily revert to the shared role if a new
role is under-scoped. App-client ownership rollback is more sensitive and must
avoid replacement.

**Exit criteria**

- Each app deploys with its own role.
- App client output consumption is stable.
- #363 can proceed without using a shared platform deploy role for auth.

### Phase 3 - WSS Isolation Before Claude Cutover

**Objective**

Split shared platform WebSocket runtime into app-owned WSS stacks while keeping
platform WSS available for remaining traffic.

**Issues included**

- #364 - SA per-app WebSocket API Gateway.
- #365 - BT per-app WebSocket API Gateway.

**Blockers**

- #361.
- #362.

**Why this phase comes here**

SA's async Claude proxy requires app-owned WSS outputs. BT's AI review flow
also pushes over WSS. Moving WSS before Claude proxy cutover preserves clearer
traffic paths and rollback.

**Expected repo/architecture changes**

- `StockAnalyserWsStack` and `BudgetTrackerWsStack` introduced.
- App-owned WSS connection tables introduced.
- WS Lambda source copied into each app's function tree.
- Frontend WSS env vars renamed to app-specific values.
- Platform WSS remains during dual-run.

**Validation requirements**

- End-to-end SA analysis over SA WSS.
- End-to-end BT AI review batch/complete messages over BT WSS.
- Connection rows written to app-owned tables.
- Platform WSS still works for any app not yet migrated.
- CDK deploy for each app WSS stack is independent.

**Rollback notes**

Frontend env vars can point back to platform WSS while platform WSS remains
deployed. Existing WebSocket calls naturally drain because connections are
short-lived per operation.

**Exit criteria**

- SA no longer depends on platform WSS.
- BT no longer depends on platform WSS.
- Platform WSS is retained only for observation until #372.

### Phase 4 - REST and Claude Proxy Isolation

**Objective**

Move app REST and Claude proxy runtime away from the shared platform API and
shared platform Claude proxy.

**Issues included**

- #366 - SA per-app REST API gateway, per-app Claude proxy, and
  `sa.job-results` table.
- #367 - BT per-app REST API gateway and per-app Claude proxy.

**Blockers**

- #361.
- #362.
- REST ownership decision resolved: M9 requires separate app-owned API
  Gateways for both Stock Analyser and Budget Tracker.

**Soft blockers**

- #364 before #366.
- #365 before #367.

**Why this phase comes here**

REST and Claude proxy cutover removes the API Gateway deployment snapshot
coupling and separates AI runtime. It is safer after app WSS exists and app
deploy roles are working.

**Expected repo/architecture changes**

- App API stacks stop importing `PlatformApiStack` REST exports.
- Stock Analyser creates and owns its own REST API Gateway.
- Budget Tracker creates and owns its own REST API Gateway.
- SA gets `sa-claude-proxy`, `sa.job-results`, and SA rate-limit table.
- BT gets `bt-claude-proxy` and BT rate-limit table.
- BT removes the unhandled `/api/budget/v1/ai/categorise` route.
- App handlers/env vars point at app-owned proxies.
- Platform Claude proxy remains until both apps are migrated and observed.
- No new SA or BT routes/resources are added to the shared platform API
  Gateway during M9. Existing shared-gateway usage is allowed only as
  temporary migration compatibility until cutover completes.

**Validation requirements**

- SA CDK deploy self-contained, with no `PlatformApiStack` REST imports.
- BT CDK deploy self-contained, with no `PlatformApiStack` REST imports.
- SA REST routes respond from the SA-owned API Gateway, not from
  `PlatformApiStack`.
- BT REST routes respond from the BT-owned API Gateway, not from
  `PlatformApiStack`.
- SA AI flow writes to and reads from `sa.job-results`.
- BT AI review invokes `bt-claude-proxy`.
- App rate-limit tables exist and are scoped per app.
- Frontend/API base URL changes verified in dev.
- Platform proxy references removed from app Lambdas.

**Rollback notes**

Keep platform API/proxy deployed. If app-owned REST or proxy fails, frontend
env vars and Lambda env vars can temporarily point back to shared platform
runtime while the app-owned issue is fixed. This rollback path is temporary
compatibility, not an alternative target architecture.

**Exit criteria**

- SA and BT runtime traffic no longer uses platform REST/Claude proxy.
- App stacks are deployable without platform API exports.
- Shared platform proxy is idle but not yet deleted.

### Phase 5 - AI Service Canonicalization

**Objective**

Normalize frontend/service AI patterns after app-owned runtime exists or behind
compatible configuration.

**Issues included**

- #368 - SA AI service canonical refactor.
- #369 - BT AI service hook wrapper, mock timing fix, and cache layer.

**Blockers**

- #360.

**Soft blockers**

- #366 before #368 for final production endpoint wiring.
- #367 before #369 for final BT Claude endpoint wiring.

**Why this phase comes here**

AI service refactors are less risky after the runtime targets exist. They also
strengthen the app boundary by moving cache/provider decisions into service
layers rather than component hooks.

**Expected repo/architecture changes**

- SA adopts `AIService` class plus thin React hook pattern.
- BT adds `useAIReview` hook and fixes mock timing fidelity.
- BT gets `budget-tracker.ai-cache-{stage}` if included in #369.
- Cache placement is service-layer, not hook-layer.

**Validation requirements**

- Mock mode tests for both apps.
- SA feature call sites continue to work.
- BT mock timing test proves `onBatch` fires before resolution.
- Cache hit/miss tests where practical.
- Frontend builds/typechecks.

**Rollback notes**

Frontend/service refactors are reversible independently of infrastructure if
runtime env compatibility is preserved.

**Exit criteria**

- SA and BT both use the canonical Hybrid A AI pattern.
- Mock and live behaviours are aligned enough for v0 workflow reliability.

### Phase 6 - Launchpad Auth Ownership

**Objective**

Transfer Cognito/auth runtime ownership from platform to Launchpad without
recreating Cognito resources or creating an auth outage.

**Issues included**

- #363 - LP takes ownership of Cognito User Pool, auth Lambdas, and
  AuthApiStack.

**Blockers**

- #360.
- #361.
- #362.
- No-replacement CloudFormation audit.

**Why this phase comes here**

This is the highest-risk M9 migration. It should happen after app deploy roles
are stable and not be combined with app runtime cutovers.

**Expected repo/architecture changes**

- LP CDK owns auth stack and AuthApiStack.
- Auth Lambda source moves from `platform/functions/auth` and
  `platform/functions/user` into Launchpad-owned function paths.
- Platform API stack no longer defines auth Lambdas.
- Auth docs, CDK docs, inventory, MONOREPO, and LP guidance updated.

**Validation requirements**

- CFN diff proves no Cognito User Pool replacement.
- Hosted UI sign-in works.
- Token claims still include `apps`, `accounts`, and `site_admin`.
- Auth setup, user profile, forgot-provider, and invitations work in dev.
- LP workflow deploys auth resources using LP deploy role.
- Platform deploy after removal does not break auth.

**Rollback notes**

Rollback is difficult. Keep platform-managed auth resources until LP-managed
auth is deployed and verified. Use a two-step deploy: LP assumes/duplicates
ownership safely, then platform removes definitions.

**Exit criteria**

- LP deploy workflow successfully manages auth infrastructure.
- Platform CDK no longer owns auth Lambdas/AuthApiStack.
- Auth flows work end-to-end after platform cleanup deploy.

### Phase 7 - Launchpad Claim Rendering

**Objective**

Make Launchpad app tile rendering consume the `apps` JWT claim.

**Issues included**

- #370 - LP frontend tile rendering via `apps` JWT claim.

**Blockers**

- #362.
- #363.

**Why this phase comes here**

Launchpad should consume claim-based app access after its auth ownership and
client topology are settled.

**Expected repo/architecture changes**

- LP auth store exposes `apps` claim.
- Tile rendering uses app slugs in `apps`.
- Hardcoded or group-string tile visibility is removed.
- Empty/no-access state is explicit.

**Validation requirements**

- User with SA only sees SA tile.
- User with BT only sees BT tile.
- User with both sees both.
- User with neither sees the appropriate empty state.
- Verified against real dev JWTs.

**Rollback notes**

This is frontend-only. Previous tile logic can be restored if claims parsing
fails, but the rollback should be short-lived because claim rendering is the
target architecture.

**Exit criteria**

- LP renders app access from `apps` claim.
- Auth docs and inventory describe LP as claims consumer.

### Phase 8 - Deploy Cascade Removal

**Objective**

Remove workflow cascades and establish independent path-filtered deploy
triggers.

**Issues included**

- #371 - Deploy cascade restructure.

**Blockers**

- #362.
- #363.
- #366.
- #367.

**Why this phase comes here**

Deploy isolation should be enforced after ownership is actually isolated.
Removing cascades too early can strand required deploys during migration.

**Expected repo/architecture changes**

- App workflows trigger only on app-owned paths and consumed shared packages.
- Platform workflow triggers only on residual platform substrate paths.
- No app workflow calls sibling app workflows.
- Deploy trigger matrix documented in architecture docs and MONOREPO.

**Validation requirements**

- Test commit to SA scope triggers only SA deploy.
- Test commit to BT scope triggers only BT deploy.
- Test commit to LP scope triggers only LP deploy.
- Test commit to platform infrastructure triggers only platform deploy.
- Workflow run history confirms expected behaviour.

**Rollback notes**

Workflow cascade or broader path filters can be restored if path-filter gaps
cause missed deploys. Keep changes small and reviewed as deployment topology.

**Exit criteria**

- No `workflow_call` chains between app workflows.
- Deploy isolation is documented and empirically verified.

### Phase 9 - Observation and Decommission

**Objective**

Delete residual shared runtime only after app-owned replacements are deployed,
traffic has moved, and idle state is verified.

**Issues included**

- #372 - Decommission shared Claude proxy, platform WSS, and
  `platform.job-results`.

**Blockers**

- #364.
- #365.
- #366.
- #367.
- Observation window after app cutovers.

**Why this phase comes here**

Decommissioning is cleanup, not migration. It should only happen after shared
resources are demonstrably idle.

**Expected repo/architecture changes**

- `transformotion-claude-proxy-{stage}` removed.
- `/api/claude` platform route removed.
- `PlatformWsStack` removed.
- Platform WS functions removed.
- `platform.job-results-{stage}` and `platform.ws-connections-{stage}` removed
  after safety checks.
- Platform API exports consumed by app stacks removed.
- StorageStack fate resolved or moved to Migration Utilities if applicable.

**Validation requirements**

- CloudWatch shows zero platform proxy invocations for 7+ days.
- CloudWatch/API metrics show zero platform WSS connections for 7+ days.
- Tables have no live app consumers.
- CF export consumer check proves no app stack imports retired exports.
- Backups/PITR strategy confirmed before table deletion.

**Rollback notes**

Rollback after deletion is expensive. Prefer staged removal:

1. Stop references.
2. Observe idle state.
3. Remove routes/functions.
4. Remove tables only after backup/PITR review.

**Exit criteria**

- Shared platform REST/WSS/Claude runtime no longer exists.
- Platform layer is limited to shared substrate and build-time concerns.
- Docs match deployed topology.

## 5. Dependency Graph

Hard blockers:

- #360 blocks all M9 implementation.
- #361 blocks #364, #365, #366, and #367.
- #362 blocks #363, #364, #365, #366, #367, #370, and #371.
- #363 blocks #370 and #371.
- #364, #365, #366, and #367 block #372.
- #366 and #367 block #371.

Soft blockers:

- #364 should precede #366 because SA Claude async needs SA WSS outputs.
- #365 should precede #367 because BT AI/WSS env alignment is cleaner.
- #366 should precede #368 for final SA production endpoint wiring.
- #367 should precede #369 for final BT production endpoint wiring.
- #368 and #369 should stay pattern-aligned; either can use the other as
  implementation reference.

Repo-wide coordination required:

- #362 changes workflow identity and IAM trust.
- #363 changes auth ownership and affects every app's sign-in/token path.
- #371 changes deploy trigger semantics across all apps.
- #372 removes shared resources and must verify all consumers first.

Hidden coupling to watch:

- App stacks importing `PlatformApiStack` exports.
- App stacks importing `PlatformWsStack` exports.
- Frontend env vars still pointing to platform WSS/API/proxy.
- Lambda env vars still referencing platform proxy, WSS API ID, or shared
  connection tables.
- Docs or scripts still referencing old `functions/` paths instead of
  `platform/functions/`.
- Workflow path filters that omit shared packages or workflow/script changes.

## 6. Mandatory Blockers

These must be resolved before risky migration work:

- #360 documentation correction.
- Handler authz path drift: checks must cover current `platform/functions/**`
  paths where applicable, not stale `functions/**` paths.
- #366 REST ownership ambiguity resolved: Stock Analyser must move to a
  separate Stock Analyser-owned API Gateway. "Owned resources on shared
  platform gateway" is not an acceptable M9 target.
- #367 follows the same rule: Budget Tracker must move to a separate
  Budget Tracker-owned API Gateway, not app-owned resources on a shared
  platform gateway.
- Deploy trigger matrix before #371: map current `workflow_call` and
  `on.push.paths` behaviour before changing workflows.
- No-replacement CloudFormation audit before #363 Cognito work.

## 7. Transitional Rules

Temporarily allowed legacy patterns:

- Shared platform REST API Gateway while app REST cutovers are incomplete.
- Shared platform WSS while at least one app still uses it.
- Shared platform Claude proxy until both app proxies are live.
- Platform-owned auth until Launchpad ownership transfer completes.
- CloudFormation exports for existing shared resources during migration.

Immediately forbidden patterns:

- New cross-app imports.
- New app-specific runtime in `platform/`.
- New app-specific runtime in `packages/` disguised as shared code.
- New consumers of shared platform REST/WSS/Claude runtime except for explicit
  migration compatibility.
- New SA or BT REST routes/resources on the shared platform API Gateway.
- Broad IAM grants to unblock deploys.
- Protected handlers that bypass auth middleware or account access checks.

Patterns that must not be reintroduced:

- Shared API Gateway deployment snapshot dependency for app route activation.
- App-owned resources on a shared platform API Gateway as a target topology.
- Shared WSS routing by app query parameter as the normal app pattern.
- Shared Claude proxy owning app-specific AI job semantics.
- Platform deploy workflow deploying app runtime.
- Contract mirrors under app directories.
- Root `infrastructure/lib/<scope>` stack ownership.

## 8. Risk Register

| Risk | Area | Mitigation |
|---|---|---|
| Cognito User Pool replacement | #363 auth ownership | Mandatory CFN no-replacement diff; import existing pool by ARN; deploy LP ownership before platform removal; test dev auth end-to-end. |
| Auth outage during handoff | #363 | Two-step deploy; keep old auth live until new LP-managed resources verified; avoid combining with app runtime changes. |
| API Gateway cutover breaks app API base URLs | #366/#367 | Dual-run old and new APIs; update env vars separately; smoke test app flows before removing shared routes. |
| App stack still imports platform REST exports | #366/#367/#372 | Add grep/script check before decommission; CDK synth each app independently. |
| WSS split loses in-flight app messages | #364/#365 | Deploy app WSS first; switch frontend/env after; keep platform WSS alive; verify connection table writes. |
| SA async Claude chain breaks job completion | #366 | Validate proxy pending record, self-invoke, job completion write, WSS push, and analysis-cache read from `sa.job-results`. |
| BT AI review WSS/backend mismatch | #365/#367/#369 | Verify `budget-ai-handler` env vars, connection table, WSS URL, and batch/complete messages together. |
| Workflow path filters miss deploys | #371 | Build trigger matrix first; test commits in each scope; include workflow/script path considerations. |
| IAM role under-scoped causes deploy failure | #362 | Branch deploy with each new role; iterate before removing shared role fallback. |
| IAM role over-scoped preserves blast radius | #362 | Negative permission tests and policy review for sibling app resources. |
| Premature decommission of shared runtime | #372 | Require 7+ day zero-traffic CloudWatch observation and consumer checks before deletion. |
| Poor observability during migration | All infra phases | Add temporary CloudWatch checks/runbooks; prefer explicit smoke tests and metric inspection per cutover. |

## 9. Validation Strategy

Doc validation:

- Every architecture-changing PR updates relevant normative docs.
- `docs/architecture/inventory.md` records current-state changes with status.
- App `AGENTS.md` files and corresponding `CLAUDE.md` mirrors reflect
  app-owned runtime after each app migration.

CI/lint validation:

- Run workspace typecheck for code/package changes.
- Run relevant lint/baseline checks.
- Ensure handler authz checks cover current paths.
- Add topology checks where a rule becomes automatable.

CDK synth/diff validation:

- Synthesize each owning app entrypoint independently.
- Use `cdk diff` for every stack ownership transfer.
- For #363, explicitly inspect Cognito resources for replacement.
- Confirm app stacks no longer require platform API/WSS exports after cutover.

Smoke testing:

- SA: sign-in, portfolio/watchlist API, analysis flow, WSS job completion.
- BT: sign-in, settings/transactions/rules API, AI review WSS batches, export.
- LP: sign-in, callback, tile visibility, signed-out flow.
- Auth: setup/user/preferences/forgot-provider/invitations where applicable.

CloudWatch and traffic observation:

- Monitor old and new proxy invocations during cutover.
- Monitor WSS connection counts on platform and app WSS APIs.
- Confirm zero traffic for 7+ days before #372 deletion.
- Inspect Lambda errors, throttles, API 4xx/5xx, and DynamoDB throttles.

IAM policy review:

- Review least-privilege scope for deploy roles and Lambda runtime roles.
- Verify negative access between SA and BT resources.
- Avoid wildcard permissions unless explicitly justified and tracked.

Rollback verification:

- For each cutover, identify the env/config pointer that returns traffic to
  old runtime.
- Keep old runtime live until rollback is no longer needed.
- Avoid deleting shared tables/routes/functions until observation criteria pass.

## 10. Relationship To Issues

GitHub Issues remain the unit of work. This document provides sequencing,
dependency framing, migration governance, and validation expectations across
the issue set.

M9 issues should reference this document where it informs execution order,
validation, or migration safety. If implementation changes the intended order,
coexistence model, or rollback strategy, update this document in the same PR.

This document does not replace issue acceptance criteria. It coordinates them.
