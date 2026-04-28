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
- `/MONOREPO.md` updated to reference branch-naming convention from
  `CONTRIBUTING.md`.
- `/SECURITY.md` exists (minimum-viable; expanded later as needed).
- `docs/archive/` exists with `DEVELOPMENT_PLAN.md` and
  `STABILISATION_FREEZE.md` archived.
- GitHub Milestones M0–M12 created with names, descriptions, and "gate to
  next" conditions in their descriptions.
- GitHub Issues created under each milestone, including a "kickoff" issue
  per milestone.
- GitHub Project (Projects v2) created with kanban and roadmap views,
  filtered/grouped by milestone.
- Project automation rules configured: new issues added to milestone
  auto-add to Project; cards move on assignment, PR-open, issue-close.

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
- Public Create Account screen removed from the launchpad if it exists.
- Cognito hosted UI no longer accepts public signup. Account creation
  requires invitation (the invitation flow itself is M11).
- The compound vulnerability (gap #1 + gap #2 from the inventory's Section
  3.4) reduces to a single vulnerability pending M10's app-access gate
  enforcement.

### Goals served

Goal 4 primarily. Indirectly Goal 3 (one-key-per-platform secrets
hygiene by ensuring only invited users can reach platform resources).

### Gate to next

Setting deployed to production via the platform stack. Hosted UI signup
attempts return the expected "self-signup disabled" response.

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
  findings:
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
  catalogued: `docs/architecture/data.md`, `docs/architecture/cdk.md`,
  `docs/architecture/urls-and-deploy.md`, `docs/architecture/README.md`,
  `apps/<app>/CLAUDE.md` (per app).
- Diff of inventory Section 2.10 schema view against `data.md`.
- Diff of inventory Section 5.6 CDK topology against `cdk.md`.
- Diff of inventory's auth substrate against `auth.md`.
- Verification findings written up either as an appendix to the inventory
  (v5) or as a standalone verification report at
  `docs/verification-pass-M1.md`.

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

**Decision M2.1 — Data-access content placement and substance.**

- Whether to fold data-access content into the existing
  `docs/architecture/data.md` or write a sibling
  `docs/architecture/data-access.md`. (User-expressed preference: fold
  into `data.md`. To be ratified.)
- The canonical persistence pattern for the frontend, given the v0 swap
  point requirement. (User-expressed preference: repository-or-equivalent
  above ApiClient. To be ratified.)
- Where the swap point lives — interface in a domain package,
  implementations selected by config.
- Cache reclassification: `platform.analysis-cache` as stock-analyser
  data (currently misnamed); pattern-vs-data separation for future apps.
- The `/migrate-from-localstorage` → `/import` rename target documented
  (implementation in M6).
- DynamoDB table-naming policy and ownership (per-app vs platform vs
  shared).
- Account-scoping invariant: every account-scoped Lambda must read
  `account.accountId` from `withAuth`.

**Decision M2.2 — `auth.md` extension.**

- Per-app account model ratified: each `platform.accounts` row carries an
  `appSlug`. (User-expressed preference recorded in inventory Section
  3.2. To be ratified.)
- Writer pattern: `account-provisioning` and `accounts/createAccount`
  take `appSlug` (or split into per-app variants).
- UI invariant: the account switcher shows only accounts for the current
  app.
- Helper interface documented: `requireAppAccess`, `requireAccountAccess`,
  `requireSiteAdmin`, `requireAccountOwner`,
  `requireSelfOrAccountManager`.
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

- Existence of `contracts/platform/` and `contracts/stock-analyser/` (the
  current `contracts/` directory has only `budget-tracker/`).
- Normative-vs-descriptive classification rules.
- Single-source-of-truth-per-shape rule.
- Position on the "v0-sufficient subset" pattern (is the contract the
  production interface, or the v0-sufficient subset that production
  extends?).
- Where platform-shared types (Account, User, AccountMember) live
  canonically.
- Final document location (per `CONTRIBUTING.md` Section 2.3, default is
  `/docs/architecture/contracts.md` but may be folded elsewhere by
  ratification).

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
  `CONTRIBUTING.md` Section 4.1).

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

## 8. M4 — appSlug writer and account migration

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

`BudgetTrackerApi` currently has its own API Gateway, separate from the
platform API Gateway. This is documented in code as a "workaround for
cross-stack CDK dependency cycle." `MONOREPO.md` declares that apps share
the platform API Gateway — currently true for stock-analyser, false for
budget-tracker. New apps onboarding will hit the same dependency cycle
unless the structural problem is resolved.

This milestone retires `BudgetTrackerApi`'s separate gateway and moves its
handlers onto the platform gateway. The CDK dependency-cycle workaround
goes away.

### Outcome

- Budget-tracker Lambda routes (transactions, rules, settings, ai,
  export, migrate) mounted on the platform API Gateway.
- `BudgetTrackerApi` stack retired.
- `NEXT_PUBLIC_BUDGET_API_URL` and equivalent env vars removed.
- CDK dependency-cycle workaround code removed; structural fix
  documented in `cdk.md`.
- CORS verification: platform gateway covers Budget Tracker frontend
  needs.
- Single platform gateway serves all apps. The "shared API gateway" rule
  in `MONOREPO.md` is fully honoured.

### Goals served

Goal 2 primarily (platform deployment substrate now supports shared
gateway across all apps cleanly). Goal 3 (one gateway, one place to
configure CORS, one place to monitor traffic).

### Gate to next

`BudgetTrackerApi` stack absent from CDK output. All budget-tracker
routes responding from platform gateway. End-to-end test confirms
budget-tracker app functions with the consolidated gateway.

### Dependencies

- M4 complete (the auth substrate works end-to-end; gateway consolidation
  doesn't add value if the auth chain underneath is broken).

---

## 10. M6 — Budget Tracker activation

### Purpose

Budget Tracker has been built to a point where it has Lambdas, tables,
contracts, and frontend code, but it is not wired to the real backend —
it runs against mock auth and localStorage repositories. This milestone
wires the frontend to the real backend, completes the data-import flow,
and makes Budget Tracker usable end-to-end with real users.

### Outcome

- Budget Tracker frontend wired to real backend through the canonical
  persistence pattern ratified in M2.1.
- `/api/budget/v1/migrate-from-localstorage` renamed to
  `/api/budget/v1/import` (Issue #17 from the stabilisation backlog).
- The localStorage middleman removed: client posts file contents
  directly to the import endpoint without an intermediate localStorage
  hop.
- 726-transaction historical fixture
  (`migration-artifacts/budget-tracker/budget-tracker-export-2026-04-18.json`)
  backfilled.
- CSV import UI for ANZ and Macquarie statements implemented.
- Mock auth removed from Budget Tracker; replaced with real Cognito
  auth.
- localStorage repositories removed; replaced with real
  DynamoDB-via-Lambda implementations through the canonical pattern.
- Tab-level error-boundary support: new `packages/ui/error-boundaries/`
  package implementing a generic `TabErrorBoundary` component that
  wraps tab content so a crash in one tab does not unmount the whole
  app. Both budget-tracker tabs and stock-analyser tabs wrapped using
  the same package (per Issue #16; bilateral application avoids leaving
  stock-analyser shipping without boundaries while waiting for a later
  milestone).
- Budget Tracker functional end-to-end with the live user account.

### Goals served

Goal 4 (the budget-tracker permissions model is now exercised by real
use). Goal 1 (Budget Tracker is now genuinely an app, not a mock; it
exercises the platform substrate the same way stock-analyser does).

### Gate to next

Live user can log in to Budget Tracker, import the historical fixture,
view transactions, run AI categorisation, edit rules, and persist
changes. All paths go through real Cognito and real DynamoDB.

### Dependencies

- M4 complete (auth substrate functional).
- M5 complete (single gateway).
- M2.1 complete (canonical persistence pattern ratified).

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

### Outcome

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
- Shared CDK construct library at `packages/cdk-constructs/` populated
  with the shared infrastructure constructs identified during the lift
  (the missing library from inventory finding 5.6 #4).
- Infrastructure reorganisation per `CONTRIBUTING.md` Section 3.7:
  per-app stacks moved to `apps/<app>/infrastructure/`, platform stacks
  moved to `platform/infrastructure/`, root `infrastructure/` reduced to
  CDK app entrypoint only.
- The `apps/web/` 0-LOC shell cleanup (if not done in M3) folded in
  here.

### Goals served

Goal 1 primarily (work on one app without affecting another becomes
structurally possible after this milestone). Goal 3 (update once, reuse
everywhere becomes structurally possible). Goal 2 indirectly (a future
new app can copy a clean app shape rather than inheriting 75% of
irrelevant code).

### Gate to next

Bilateral duplication reduced to whatever the canonical pattern dictates.
Lint re-enabled and passing. Cross-app file copies caught at CI. Per-app
infrastructure split into the canonical structure.

### Dependencies

- M2 complete (canonical pattern ratified).
- M3 complete (documentation set accurate so the migration is against
  documented targets).
- M6 useful but not blocking (Budget Tracker activation is its own
  trajectory; deduplication can run in parallel with M6 once M2 is done).

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
- `custom:active_account` Cognito attribute removed (now dead code with
  no writers under the new model).
- Old group names removed from any remaining `requireGroup` calls.
- `requireGroup` helper itself removed if unused after the call-site
  migrations.
- `resolveAccountContext` JWT-claim fallback to `custom:active_account`
  removed (per M2.2 decision on the fallback's fate).

### Goals served

Goal 4 (the permissions model is now expressed cleanly without legacy
artefacts). Goal 3 (one canonical naming, not two).

### Gate to next

Legacy groups absent from `auth-stack.ts`. No code references to the
old names. No references to `custom:active_account`.

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

`auth.md` documents a helper interface (`requireAppAccess`,
`requireAccountAccess`, `requireSiteAdmin`, `requireAccountOwner`,
`requireSelfOrAccountManager`). Whether these helpers are implemented in
`packages/lambda-middleware` is currently uncertain (M1 verifies). This
milestone implements any missing helpers and migrates consumer Lambdas
to use them.

### Outcome

- All five helpers implemented in `packages/lambda-middleware` per
  `auth.md`.
- Stock-analyser Lambdas (`portfolio`, `watchlist`, `analysis-cache`)
  now enforce `requireAppAccess('stock-signal')`. This closes inventory
  Section 3.4 finding #2 (the compound vulnerability with M0).
- Budget-tracker Lambdas migrated from legacy `requireGroup('budget-app',
  'admin')` calls to `requireAppAccess('budget-tracker')` and equivalent.
- Member-role enforcement now possible at the Lambda layer:
  `requireAccountAccess(auth, app, accountId, minRole)` rejects
  insufficient-role calls with 403.
- Site-admin paths use `requireSiteAdmin(auth)`.
- Account-owner-only operations use `requireAccountOwner(auth, app,
  accountId)`.

### Goals served

Goal 4 primarily (role enforcement is now real, not decorative). Goal 3
(every Lambda's auth check uses the same helper interface).

### Gate to next

All consumer Lambdas migrated. End-to-end test: a user with viewer role
calls a write endpoint and receives 403; a user with member role calls
the same endpoint and succeeds.

### Dependencies

- M1 complete (helper-availability verification finding informs scope).
- M2.2 complete (the helper interface is ratified).
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

- M0 complete (closed-signup model is what makes invitations the only
  path).
- M4 complete (per-app accounts created via invitation follow the
  ratified model).
- M10 complete (admin-role enforcement on the create-invitation
  endpoint depends on the helpers).

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

- Prod GitHub Actions environment populated with all `[REQUIRED]`
  env vars per the documentation set in PRs #19–24. First prod deploy
  passes the env-var check.
- Deploy workflow path filters extended to cover `.github/workflows/**`
  and `scripts/ci/**` for both `deploy-stock-analyser.yml` and
  `deploy-budget-tracker.yml`. Changes to CI machinery trigger the
  workflows they modify.
- Post-deploy smoke testing: a known-good request hits each app's
  primary endpoint after deploy, asserts a 2xx response or expected
  redirect. Failure rolls back or alerts. Existing PR #28 verification
  reviewed and extended if it doesn't already do this.
- A first prod deploy executed against the populated environment as
  the milestone's verification — confirms the pipeline works
  end-to-end against prod.

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

## 19. Beyond M14

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

- **NEXT_PUBLIC_USE_MOCK_DATA default-flip.** Long-term flip of code
  defaults to production values. Issue #18 short-term fix
  reclassified as `[REQUIRED]`; this is the long-term fix.

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

## 20. Discipline and update rules

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

## 21. Reference — milestone summary table

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
