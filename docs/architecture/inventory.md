# Architectural inventory

This document is the living current-state inventory of the Transformotion
Apps platform. It describes what is true about the platform now, and is
updated as state changes per the discipline rule (`CONTRIBUTING.md`
Section 2.1).

When work addresses a finding here, the PR doing that work updates the
relevant finding in this document in the same PR.

## How this document is used

- **Findings describe state.** Each finding is a specific, testable claim
  about the codebase, infrastructure, or operating state.
- **Status tags** indicate the confidence level and lifecycle of each
  finding (per `CONTRIBUTING.md` Section 6, with two extensions for
  living-document use).
- **Section numbering is stable.** PLAN.md and milestone issues reference
  findings by section number (e.g., "inventory Section 3.2"). Numbering
  changes only when a section is genuinely retired.
- **Interpretive content lives in `PLAN.md` or architecture decision
  documents**, not here. This document records what *is*, not what *should
  be*.

## Status tag legend

| Tag | Meaning |
|---|---|
| **Confirmed** | Verified against current code, infrastructure, or runtime evidence. |
| **Inferred** | Derived from code patterns or surrounding evidence, not directly verified. |
| **Status uncertain — verify** | Known to have been planned or partially built; needs verification before being treated as either pending or done. |
| **Stale-by-decision** | The divergence is the result of a deliberate choice; cleanup is sequenced in a milestone. |
| **Aspirational-never-built** | Documented as intent, no implementation has caught up. |
| **Deferred** | Scaffolded with intent to complete, paused for orthogonal reasons. |
| **Resolved by M*N* / PR #*N*** | Finding addressed; text describes new state with a note on what changed. |
| **Superseded by [reference]** | Finding subsumed by another; description preserved for context. |

---

## 1. Code structure and ownership

### 1.1 Top-level repository structure

**Status: Confirmed (current state)**

The repository contains the following top-level directories:

- `apps/` — five subdirectories: `budget-tracker/`, `launchpad/`,
  `stock-analyser/`, `web/` (0-LOC shell, M3 cleanup), `web-vite-backup/`
  (M3 cleanup, excluded from workspaces)
- `packages/` — six subdirectories: `api-client/`, `auth-client/` (stub),
  `budget-domain/`, `cycle-engine/` (stub), `lambda-middleware/`, `ui/`
  (stub)
- `infrastructure/` — CDK app with `bin/app.ts` entrypoint and
  `lib/{platform,stock-analyser,budget-tracker}/` per-scope subdirs
- `functions/` — platform Lambda source: `accounts/`, `auth/` (with
  `account-provisioning/`, `pre-token-generation/`, `invitations/`,
  `forgot-provider/`), `claude-proxy/`, `user/`. Migrating to
  `platform/functions/` per M7.
- `contracts/` — only `budget-tracker/` exists. M2.3 ratifies the
  contracts policy; subsequent work creates `platform/` and
  `stock-analyser/` siblings.
- `docs/` — `architecture/` (5 files: README.md, auth.md, cdk.md,
  data.md, urls-and-deploy.md), `archive/` (DEVELOPMENT_PLAN.md,
  STABILISATION_FREEZE.md)
- `migration-artifacts/` — `budget-tracker/` only

CLAUDE.md exists at root (1371 bytes); `apps/stock-analyser/` and
`apps/budget-tracker/` have per-app CLAUDE.md; `apps/launchpad/` is
missing one (M3 outcome).

`pnpm-workspace.yaml` covers `apps/*`,
`apps/stock-analyser/functions/*`, `apps/budget-tracker/functions/*`,
`packages/*`, `functions/*`, `functions/auth/*`, `infrastructure`.
`apps/web-vite-backup` is explicitly excluded.

The migration toward the canonical structure documented in
`CONTRIBUTING.md` Section 3 is tracked across PLAN.md milestones — M3
removes `apps/web/` and `apps/web-vite-backup/`; M7 creates `platform/`
and reorganises `infrastructure/`.

### 1.2 Import boundaries

**Status: Confirmed (current state)**

Cross-app imports are forbidden per `MONOREPO.md`. Enforcement via
`eslint-plugin-boundaries` is currently disabled because of an ESLint
10 incompatibility — the rule is in the lint baseline as "investigated,
deferred." M7 re-enables enforcement after the upstream fix lands.

The rules don't address cross-app *code residence* — that is, code
about app X living in app Y's tree. This is currently happening (see
1.3) and isn't captured by the import-boundary rules because import
boundaries only fire on import statements, not file location.

### 1.3 Bilateral code duplication between stock-analyser and budget-tracker

**Status: Confirmed (verified during initial inventory)**

Approximately 75% of stock-analyser's codebase exists as duplicate code
in budget-tracker. Of the duplicated content:

- ~60% is byte-identical (UI primitives, hooks, utility files)
- ~40% has drifted (layouts, app shells, integration tabs — exactly the
  files where coordination matters most)

The duplication is the primary structural barrier to Goal 1 ("work on
one app without affecting another"). M7 is the corrective work; its
scope explicitly covers refining the 60/40 split into semantic vs
cosmetic drift, deciding per-concern lift targets, and migrating
sequentially.

### 1.4 v0 development workflow

**Status: Confirmed (operating constraint)**

The frontend is developed using v0 (vercel.com/v0) with mocked
persistence (localStorage). The same components run against real
DynamoDB-via-Lambda persistence in production. Operationally:

- v0 commits to a separate repo (`transformotion-apps-b8`)
- `scripts/sync-v0.sh` pulls from that repo into a gitignored
  `v0-reference/` directory
- Claude Code adapts components from `v0-reference/` into the main
  repo's `apps/<app>/` structure

This workflow is documented in `CONTRIBUTING.md` Section 1.2 as a
cross-cutting constraint on architectural decisions involving
frontend, persistence, contracts, and build pipeline.

### 1.5 Stub packages

**Status: Confirmed (current state)**

Three packages exist in `packages/` as stubs (single-file or
near-single-file with no runtime dependencies):

- `packages/auth-client/` — single `src/index.ts`, type definitions
  only, no dependencies beyond TypeScript
- `packages/cycle-engine/` — single `src/index.ts`, has vitest test
  script but no runtime dependencies declared
- `packages/ui/` — minimal stub

The disposition of each (build out as canonical, retire as orphan, or
leave as type-only contracts) is unresolved. M7 (deduplication)
should resolve this in the course of lifting duplicated code.

### 1.6 Launchpad as platform shell

**Status: Confirmed (current state)**

`apps/launchpad/` is the platform shell — sign-in flow, account
switcher, app tile rendering. Treated as an app for structural
purposes (consumes platform services through packages like any other
app) per `CONTRIBUTING.md` Section 3.2.

Per M0 verification: `apps/launchpad/` contains no public signup UI
(no `signUp`, `register`, `createAccount` references in any `.ts` or
`.tsx` file).

The hard-coded `userCanAccessFramework` prop in launchpad currently
governs tile visibility for the Transformotion Framework app. M9
migrates tile rendering from `cognito:groups` (the legacy substrate)
to the `apps` JWT claim, removing this hard-coded prop.

### 1.7 Stale-by-decision artefacts

**Status: Stale-by-decision**

Several artefacts in the repo describe earlier states that have been
superseded:

- `apps/web/` — 0-LOC shell from the launchpad rename. M3 cleanup.
- `apps/web-vite-backup/` — backup directory from earlier scaffolding.
  Contributes 18 lint baseline entries. M3 cleanup.
- Branch naming convention in root `CLAUDE.md` (`claude-code/<n>` only)
  is partial — the actual practice (per `CONTRIBUTING.md` Section
  4.1) includes `v0/<n>` and `<author>/<n>` prefixes. M3 reconciles.
- Various stale `first-login` references in code or docs that didn't
  propagate from the rename to `account-provisioning`. M3 covers.

---

## 2. Data, persistence, and APIs

### 2.1 Persistence patterns coexist without canonical rule

**Status: Confirmed (verified during initial inventory)**

Three persistence patterns currently exist in the codebase, with no
documented rule for which is canonical:

- **Service layer pattern** — used by stock-analyser portfolio and
  watchlist. `portfolio-service.ts` and `watchlist-service.ts` call
  `getStockSignalClient()` directly; no swap point at the data-access
  layer.
- **Repository pattern** — used by what was Budget Tracker drift in
  `apps/stock-analyser/lib/repositories/budget-tracker/` (now removed).
  Featured a swap point: `createSettingsRepository()` and
  `createTransactionRepository()` returned either localStorage or
  Dynamo-backed implementations based on config.
- **Service-class pattern** — used by `DynamoTTLCacheService` for the
  analysis cache. A class with methods, not a repository interface or
  service object.

The v0 development workflow (1.4) requires a swap point at the data-
access layer — components must work against localStorage in v0 and
DynamoDB in production. Only the repository pattern currently has
this seam. M2.1 ratifies the canonical pattern.

### 2.2 Stock-analyser portfolio production data path

**Status: Confirmed (verified during initial inventory)**

Production path:

```
portfolioService.getHoldings()
  → getStockSignalClient().getPortfolio()
  → ApiClient → HttpClient.request()
  → fetch(baseUrl + '/portfolio')
    with Authorization: Bearer <idToken>
    and X-Account-Id: <accountId>
  → transformotion-portfolio-{stage} Lambda
  → stock-analyser.portfolio-{stage} DynamoDB
```

No localStorage anywhere in this path. The same shape applies to
watchlist (`watchlist-service.ts` → `getStockSignalClient().getWatchlist()`
→ `transformotion-watchlist-{stage}` Lambda → `stock-analyser.watchlist-{stage}`).

### 2.3 X-Account-Id contract

**Status: Resolved by M1 #78 (verified clean)**

The full X-Account-Id chain is implemented and matches `auth.md`'s
documented contract exactly:

**Client side** (`packages/api-client/src/http.ts` lines 58-68): The
`getAccountId` callback is optionally injected at construction. When
present, its return value is sent as `X-Account-Id` on every outbound
request. When absent (routes that don't need account context), the
header is omitted.

**Server middleware** (`packages/lambda-middleware/src/auth.ts` lines
50-59): `resolveAccountContext` reads `x-account-id` from the request
headers and populates `account.accountId` for the handler. Throws
400 if absent. Called by `withAuth` as step 2 of the middleware
chain.

**Handler authorization layer**: Account-scoped handlers call
`requireAccountAccess(auth, app, account.accountId)` which looks up
`auth.accounts[app]` from the JWT for a matching accountId and
throws 403 if the user doesn't have access to the supplied account.
M1 #79 verified all 9 consumer Lambdas implement this pattern.

The middleware deliberately does *not* validate the header against
the JWT's `accounts` claim at middleware level. This is by design,
documented in `auth.md`:
- Rule 3: separation of intent (header) from authorization
  (`requireAccountAccess`)
- Rule 2: `requireAccountAccess` always follows `resolveAccountContext`
- Line 377: "accountId always comes from request context
  (`account.accountId`, which is sourced from the X-Account-Id
  request header). Never derive accountId from `auth.accounts`."

The header is the *intent*; `requireAccountAccess` makes the intent
safe. A handler reading `account.accountId` without calling
`requireAccountAccess` would be a real gap — but per M1 #79's
adoption check, all 9 consumer Lambdas use `requireAccountAccess`,
so the obligation is met everywhere.

### 2.4 Stock-analyser Lambdas enforce app access (corrected finding)

**Status: Resolved by M1 #79 (v4 finding was stale)**

All three stock-analyser Lambdas (portfolio, watchlist, analysis-cache)
call the documented helper pair:

- `requireAppAccess(auth, 'stock-signal')` — fail-fast app gate
- `requireAccountAccess(auth, 'stock-signal', account.accountId)` —
  account-membership check before data access

This matches the pattern prescribed in `auth.md` lines 356-357.
Verified during M1 #79 by inspection of
`apps/stock-analyser/functions/{portfolio,watchlist,analysis-cache}/src/index.ts`.

The v4 inventory finding "Stock-analyser Lambdas don't enforce app
access" was stale — likely true at some earlier point but the
helper-call pattern landed in code before the inventory was last
updated. The finding was carried forward without re-verification
during v4 inventory production.

**Implication for M0 framing:** The "compound vulnerability"
description used during M0 scoping was based on this stale Section
2.4 finding. In retrospect, the compound never existed at deploy time
— stock-analyser Lambdas were already gated by `requireAppAccess`
when M0 ran. M0's value was real (closing the public signup gate),
but the framing overstated the exposure.

### 2.5 Auth helpers in packages/lambda-middleware

**Status: Resolved by M1 #79 (verified)**

`auth.md` documents the helper interface for Lambda authorization, and
`packages/lambda-middleware/` implements it. Five helpers are exported,
all matching `auth.md`'s documented signatures exactly:

- `requireSiteAdmin(auth)` — line 94
- `requireAppAccess(auth, app)` — line 102
- `requireAnyAppAccess(auth, apps)` — line 113
- `requireAccountAccess(auth, app, accountId, minRole?)` — line 126
- `requireAccountOwner(auth, app, accountId)` — line 146

The v4 inventory listed `requireSelfOrAccountManager` as a sixth
helper. This was incorrect — `auth.md` describes the
self-or-account-manager *policy pattern* but does not define a helper
of that name. The pattern is covered by
`requireAccountAccess(..., minRole: 'manager')` plus a self-id check
in the handler.

**Adoption.** All nine consumer Lambdas use these helpers:

- Stock-analyser (3/3): analysis-cache, portfolio, watchlist
- Budget-tracker (6/6): budget-ai, budget-export, budget-migrate,
  budget-rules, budget-settings, budget-transactions

The helper interface is not theoretical — it is the actual pattern in
production code across all consumer Lambdas. M2.2's role is to
document this existing pattern as canonical rather than ratifying a
proposal.

**M1 #79 will populate this section with verified findings.**

### 2.6 Lambda inventory and group-name reads

**Status uncertain — verify (M1 issue #80, partial)**

Platform Lambdas (`functions/`):

- `accounts/` — account management
- `auth/account-provisioning/` — first-sign-in account creation
  (renamed from `first-login/`)
- `auth/pre-token-generation/` — Cognito pre-token trigger; emits
  the `apps`, `accounts`, `site_admin` claims into JWTs
- `auth/invitations/` — invitation flow handlers
- `auth/forgot-provider/` — federated identity recovery (has known bug
  per M12)
- `claude-proxy/` — Anthropic API proxy
- `user/` — platform user data

Stock-analyser Lambdas (`apps/stock-analyser/functions/`):

- `portfolio/`
- `watchlist/`
- `analysis-cache/`
- `cycle-check/`

Budget-tracker Lambdas (`apps/budget-tracker/functions/`):

- `transactions/`
- `rules/`
- `settings/`
- `ai/`
- `export/`
- `migrate/` (the `/api/budget/v1/migrate-from-localstorage` endpoint;
  M6 renames to `/import`)

**Status: Resolved by M1 #80 (verified clean)**

Budget-tracker Lambdas do not read Cognito group names directly —
neither legacy nor new. The auth helpers in
`packages/lambda-middleware/` are claim-based, not group-based:

- `requireAppAccess` checks `auth.apps` (injected `apps` JWT claim)
- `requireAccountAccess` checks `auth.accounts` (injected `accounts`
  JWT claim)
- `isSuperUser` / `requireSiteAdmin` check `auth.siteAdmin` (injected
  `site_admin` JWT claim, line 82 of `auth.ts`)

Tests in `packages/lambda-middleware/src/auth.test.ts` confirm:
legacy group names like `budget-app` and `stock-app` cause helpers
to throw 403 — the group name is irrelevant because helpers never
read it. The `site-admin` *group* alone also throws 403 on
`requireSiteAdmin`; only the `site_admin` *claim* passes.

The only `cognito:groups` reference in any budget-tracker Lambda is
`budget-ai/src/index.ts:36` — propagating the already-parsed
`auth.groups` array into a synthetic event for the Claude proxy
Lambda-to-Lambda call. This is claim propagation, not a group-name
check.

**M8 scope implication:** Handler-level callsite migration for group
names is not needed and never was — the handlers never read group
names. M8's substantive scope is Cognito group cleanup (deleting
legacy groups from the user pool) and pre-token Lambda reconciliation
logic. See PLAN.md Section 12 for the updated M8 scope.

### 2.7 Platform-cache misnomer

**Status: Confirmed (verified during initial inventory)**

The `platform.analysis-cache-{stage}` DynamoDB table is named with the
`platform.` prefix (consistent with the platform table-naming pattern)
but is functionally stock-analyser data — it caches per-ticker analysis
results scoped by accountId.

The misnomer has IAM consequence: any Lambda with platform-table access
can read it; the reclassification to stock-analyser scope implies
tightening to stock-analyser Lambdas only. M2.1 ratifies the
reclassification as a Stage 0b decision; the consequent IAM policy
update follows in M7.

### 2.8 Budget Tracker migration endpoint

**Status: Confirmed (verified during initial inventory)**

The endpoint `POST /api/budget/v1/migrate-from-localstorage` exists,
implemented at `apps/budget-tracker/functions/budget-migrate/`. It
accepts a JSON body of `{ transactions, rules, settings }` and writes
to DynamoDB. The "from-localstorage" naming reflects the client side's
historical pattern (read from localStorage, post the result), not any
server-side constraint — the server doesn't know or care about
localStorage.

M6 renames this endpoint to `/api/budget/v1/import` and removes the
client-side localStorage middleman. The 726-transaction historical
fixture at `migration-artifacts/budget-tracker/budget-tracker-export-2026-04-18.json`
is backfilled via the renamed endpoint.

### 2.9 Two-gateway architecture (drift)

**Status: Confirmed (verified during initial inventory)**

The platform currently has two API Gateways:

- **Platform gateway** — defined in `infrastructure/lib/platform/platform-api-stack.ts`,
  serves stock-analyser and (eventually) launchpad routes.
- **BudgetTrackerApi gateway** — defined separately, serves budget-
  tracker routes. Documented in code as a workaround for a CDK
  cross-stack dependency cycle.

`MONOREPO.md` declares apps share the platform gateway — true for
stock-analyser, false for budget-tracker. M5 retires the separate
gateway and moves budget-tracker handlers onto the platform gateway,
removing the dependency-cycle workaround.

### 2.10 DynamoDB schema

**Status: Confirmed in part (initial inventory); SK schema mismatch verification pending (M1 issue #82)**

#### 2.10.1 Platform tables

| Table | PK | SK | Notes |
|---|---|---|---|
| `platform.accounts-{stage}` | accountId | — | Schema has `appSlug` field; not written at runtime — see Section 3.2. |
| `platform.account-members-{stage}` | accountId | userId | Has `userId-index` GSI for reverse lookup. |
| `platform.invitations-{stage}` | invitationId | — | Used by invitation flow (M11). |
| `platform.users-{stage}` | userId | — | |
| `platform-rate-limits-{stage}` | pk | — | Owned by `AuthApiStack` (not PlatformTablesStack). PK: `lookup-provider#<ip>`. Used for rate-limiting by `forgot-provider` Lambda. Note: uses hyphen not dot — does NOT follow `{scope}.{entity}` convention. |
| `platform.analysis-cache-{stage}` | accountId | cacheKey | Misnamed — see Section 2.7. |

#### 2.10.2 Stock-analyser tables

**Status: Confirmed (verified by M1 #82)**

| Table | PK | SK |
|---|---|---|
| `stock-analyser.portfolio-{stage}` | accountId | ticker |
| `stock-analyser.watchlist-{stage}` | accountId | ticker |
| `stock-analyser.analysis-cache-{stage}` | accountId | cacheKey |

CDK source declares all three tables with composite keys
(`infrastructure/lib/stock-analyser/stock-analyser-tables-stack.ts`
lines 32-33, 41-42, 52-53). Deployed schemas in dev confirm: portfolio
and watchlist both have HASH `accountId` + RANGE `ticker`. Runtime
handler code using `Key: { accountId, ticker }` for Delete operations
is consistent with the schema. No data-integrity risk.

**v4 inventory finding was stale.** The previous entry recorded a
schema mismatch and -v2 table naming variant. Neither was current:
the CDK source uses plain `-${stage}` suffix (no `-v2`), deployed
table names match (`stock-analyser.portfolio-dev`,
`stock-analyser.watchlist-dev`), and the composite keys are present
in both source and deployment. The mismatch concern likely originated
before a CDK fix landed and was carried forward without re-verification
during v4 inventory production.

#### 2.10.3 Budget-tracker tables

| Table | PK | SK |
|---|---|---|
| `budget-tracker.transactions-{stage}` | accountId | transactionId |
| `budget-tracker.rules-{stage}` | accountId | ruleId |
| `budget-tracker.settings-{stage}` | accountId | settingKey |

Original plan called for separate `categories` and `budgets` tables.
These were collapsed into the `settings` table — `categoryTree` and
`budgetOverrides` are stored as values keyed by `settingKey`. The
deviation is reasonable (matches the BudgetSettings shape in
`packages/budget-domain/`) but constitutes a plan-vs-actual divergence
M3 may want to record.

A `budget-tracker.accounts-{stage}` table also exists but appears
dormant — no runtime code references it. Likely a leftover from an
earlier design (Inferred). M3 may resolve.

### 2.11 Claude proxy

**Status: Confirmed (Resolved by M1 #84)**

`functions/claude-proxy/` proxies requests to the Anthropic API.
It is a platform Lambda mounted at `POST /api/claude` on the shared
API Gateway behind the JWT authoriser.

#### Invocation paths

The handler distinguishes two event shapes:

1. **API Gateway path** — standard `APIGatewayProxyEvent`. Passes
   through `withAuth` middleware then calls
   `requireAnyAppAccess(auth, ['stock-signal', 'budget-tracker'])`.
   This is the path taken for Lambda-to-Lambda calls from `budget-ai`
   (which constructs a synthetic API Gateway event with full propagated
   claims). The propagated `requestContext.authorizer.claims` — including
   `sub`, `email`, `cognito:groups`, `apps`, `accounts`, `site_admin`,
   and `X-Account-Id` — are used by `withAuth` for authorization.
   Documented in auth.md lines 325 and 363–367.

2. **Async job path** — event has `__asyncJob: true`. Routes to
   `executeAsyncJob()`, which carries no auth check. This path is only
   reachable via the proxy self-invoking itself (see IAM boundary below).

#### IAM trust boundary

Two callers have `lambda:InvokeFunction` on the proxy ARN:

- `budget-ai` Lambda (`budget-tracker-api-stack.ts` lines 140–143) —
  direct Lambda-to-Lambda invocation from Budget Tracker AI handlers.
- The proxy itself (`platform-api-stack.ts` lines 163–168) — used for
  async self-invocation (`InvocationType: 'Event'`, `__asyncJob: true`).

No stock-analyser Lambda has direct IAM permission to invoke the proxy.
Stock-analyser reaches the proxy only via the API Gateway path
(if it has `stock-signal` app access).

The lack of an auth check on the async path is safe given the IAM
boundary: only the proxy itself can trigger that branch.

#### Attribution

`accountId` is logged in the async job path. User `sub` is not logged
in any path. Per-user attribution is achievable — `sub` is present in
the propagated claims on the API Gateway path — but not currently
captured. M13 makes consumption observable; the propagated `sub` is
available for attribution when that work runs.

#### Rate limiting

Client-side retry logic: 3 attempts on Anthropic 429 responses (delays
20 s, 45 s, 90 s). No server-side per-user or per-account quota
enforcement currently exists. M2.2 may add quotas; M13 adds
observability.

#### Trust path duality

The two invocation paths use the same authorization layer
(`withAuth` + `requireAnyAppAccess`) but reach it via different trust
paths:

- **Through API Gateway** — JWT signature validation happens at the
  API Gateway Cognito authoriser before the Lambda runs.
  `requestContext.authorizer.claims` is populated by API Gateway with
  cryptographically vouched-for claims. `withAuth` then reads
  validated claims; `requireAnyAppAccess` enforces authorization on
  trusted input.
- **Through direct Lambda invoke** — `budget-ai` constructs a
  synthetic API Gateway event with claims set by code, not by API
  Gateway. JWT signature validation never happens because API Gateway
  isn't in the path. `withAuth` reads the claims as if validated;
  `requireAnyAppAccess` enforces authorization on caller-controlled
  input.

The second path is safe given the IAM trust boundary: only
`budget-ai` and the proxy's own self-invoke have
`lambda:InvokeFunction`. A compromised or buggy caller could
otherwise synthesize claims for any user. The architectural choice
is "Pattern B with tight IAM scope" rather than per-hop JWT
re-validation. Stock-analyser deliberately has no invoke permission
on the proxy — it must reach the proxy via the API Gateway path,
where claims are signature-validated.

This pattern (constructing synthetic API Gateway events for
Lambda-to-Lambda invocations) is currently in use only between
`budget-ai` and `claude-proxy`. M2.2 ratifies the canonical pattern
for cross-Lambda trust — whether to:
- formalise the synthetic-event + IAM-scope approach as canonical,
- require per-hop JWT validation (move to Pattern A consistently), or
- keep the synthetic-event approach but with explicit constraints on
  when it can be used.

---

## 3. Auth, accounts, and permissions

### 3.1 Two-dimension permission model

**Status: Confirmed (documented in auth.md)**

The permission model has two orthogonal dimensions:

- **Dimension A — App access (ceiling)**: Cognito group membership
  determines which apps a user can use at all. Groups:
  `stock-app-access`, `budget-app-access`, `site-admin`. Surfaced in
  the JWT as the `apps` claim.
- **Dimension B — Within-account capability (restriction)**:
  `account-members` table determines what a user can do within a
  specific account. Roles: `owner | manager | member | viewer`.
  Surfaced in the JWT as the `accounts` claim.

Site-admin bypasses both dimensions. Dimension A is the ceiling;
Dimension B can only restrict within it.

### 3.2 appSlug not written on platform.accounts (code gap; current dev works via manual seeding)

**Status: Confirmed code gap — latent impact only; tracked at M4 #144**

Neither writer (`accounts/createAccount` or
`auth/account-provisioning/handleSetup`) currently writes `appSlug`
onto the accounts row. Both put `{ accountId, name, ownerId, plan,
createdAt, updatedAt }` and nothing else. The pre-token Lambda reads
`appSlug` from `platform.accounts` to build the JWT's `accounts` claim
— when `appSlug` is missing, the claim ships empty, and account-scoped
Lambda calls fail authorization for that user.

**Current dev state:** the two existing dev accounts
(`a03f9cd4-951f-463a-8b34-73c0f046e672` and
`aed9dcdf-81b5-47a1-a0d5-5afbae940e93`) have `appSlug` populated via
manual seeding on 2026-04-25T00:05:41Z. CloudWatch shows no Lambda
invocations during that window; CloudFormation shows no stack activity
until 7 minutes later; the same-second `createdAt` timestamp on both
rows is consistent with a single `batch-write-item` operation. As a
result, the pre-token Lambda finds `appSlug` data, the `accounts` claim
populates correctly, and account-scoped endpoints work for these
specific accounts.

**Latent impact:** any new account created through normal code paths
(`createAccount` or `handleSetup`) until M4 lands will have no
`appSlug`, and that user's `accounts` claim will be empty. The
"active blocker" framing from earlier inventory versions was overstated
— the code gap is real but currently affects only new accounts, not
existing ones.

M4 #144 fixes this: both writers updated to populate `appSlug` based
on which app initiated the account creation or first-login flow. M2.2
ratifies the per-app accounts model formally before M4's writer update
lands.

### 3.2a Pre-token-generation trigger not durably wired

**Status: Resolved by Issue #141 / PR replacing AwsCustomResource with addTrigger()**

The pre-token-generation Lambda was wired via an `AwsCustomResource`
that called `UpdateUserPool` with `LambdaConfig`. This approach has a
structural flaw: `AwsCustomResource.onUpdate` only re-fires when the
custom resource's *own* properties change. If any other UserPool
property is updated by CloudFormation (e.g., a Schema change, a
client update), the UserPool CFN resource is updated directly, and
`UpdateUserPool` is called without `LambdaConfig` — silently clearing
the trigger wiring.

This happened on 2026-04-28 when a UserPool-only stack update cleared
`LambdaConfig`. Symptom: JWTs lacked the `accounts` claim; Stock
Analyser Market Analysis broke for affected users.

**Fix:** replaced the custom resource with `userPool.addTrigger(
UserPoolOperation.PRE_TOKEN_GENERATION, preTokenFn)`. `addTrigger()`
inlines `LambdaConfig` into the `AWS::Cognito::UserPool` CloudFormation
resource so it is treated as first-class UserPool state and can never
be cleared by a future stack update.

The writer issue described in Section 3.2 is the other half of the
JWT-claim production bug — together, the trigger wiring fix (this
section) and the writer fix (M4 #144) resolve the bug for existing
and new accounts respectively. For currently-seeded dev accounts the
`accounts` claim already works; for new accounts it will be empty
until M4 #144 lands.

### 3.3 Frontend auth store and JWT claims

**Status uncertain — code verification still needed (M9 scope)**

The frontend auth store needs to retain `apps`, `accounts`, and
`site_admin` claims atomically with rendering decisions. If claim
state is updated piecemeal (e.g., during token refresh), there's a
window where rendering uses stale values from one claim and fresh
from another.

M1 #85 read `auth.md` in full. auth.md describes general token storage
("Access and ID tokens: in-memory (application state)") but does not
address atomic update semantics for the three custom claims. The concern
is not resolvable from the architecture document — it requires reading
the frontend auth store code (`apps/launchpad/`, or whichever app owns
the store). M9 (launchpad tile rendering migration) needs this verified
before it begins.

### 3.4 Security gaps with material impact

This subsection lists security/integrity findings that affect Goal 4.

#### 3.4.1 Open signup gate

**Status: Resolved by M0 / PR #77**

Pre-M0: `selfSignUpEnabled: true` in `auth-stack.ts` allowed anyone to
create a Cognito account via the hosted UI without invitation.

M0 set `selfSignUpEnabled: false`. Cognito hosted UI no longer offers
public signup. Verified post-deploy: hosted UI shows no Sign Up link;
account creation now requires invitation flow (M11).

The "compound vulnerability" framing used during M0 scoping (Sections
3.4.1 + 3.4.2 combining to create exposure) was based on the v4
inventory's stale Section 2.4 finding. M1 #79 verification revealed
stock-analyser Lambdas were already gated by `requireAppAccess` —
there was no compound. M0's value was real (closing the public signup
gate); the framing overstated the exposure. See Section 2.4 for
detail.

#### 3.4.2 Stock-analyser Lambdas — verified to enforce app access

**Status: Resolved by M1 #79 (v4 finding was stale — see Section 2.4)**

The v4 inventory recorded this as an open security gap. M1 #79
verification revealed stock-analyser Lambdas (portfolio, watchlist,
analysis-cache) all enforce `requireAppAccess(auth, 'stock-signal')`
plus `requireAccountAccess(auth, 'stock-signal', accountId)` per the
documented pattern. The v4 finding was carried forward without
re-verification.

**Implication for M10 scope:** PLAN.md M10's outcomes previously
listed "Stock-analyser Lambdas now enforce
`requireAppAccess('stock-signal')`" as in-scope. That work is already
done. M10's remaining substance is migrating budget-tracker Lambdas
from any legacy `requireGroup` calls to the new helpers (Section 2.6
territory; pending M1 #80 verification) and adding role-based
enforcement via `requireAccountAccess(..., minRole)` where it isn't
already in use.

#### 3.4.3 forgot-provider Lambda fails on federated users

**Status: Confirmed (open; addressed in M12)**

Per Issue #49: `functions/auth/forgot-provider/` uses
`AdminGetUserCommand(Username=email)` which works for native Cognito
users but fails for federated users because Cognito indexes federated
users by sub, not email. M12 fixes.

#### 3.4.4 Cognito authoriser accepts all three app clients

**Status: Resolved by M1 #83 (verified clean)**

The API Gateway authoriser is constructed as
`CognitoUserPoolsAuthorizer` taking the user pool reference (not
specific app clients) at `infrastructure/lib/platform/platform-api-stack.ts`
lines 67-68:

`cognitoUserPools: [userPool]`

The AWS `CognitoUserPoolsAuthorizer` accepts any valid JWT issued by
the supplied user pool, regardless of which app client was used to
obtain it. A user who signs in via the launchpad client receives a
JWT that authenticates against stock-analyser, budget-tracker, and
launchpad routes — exactly what cross-app navigation requires.

A single shared authoriser (`JwtAuthoriser`) is defined in
`platform-api-stack.ts` and reused across all platform routes. The
auth-api-stack handles only the public lookup-provider Lambda; no
authoriser config there. Aligns with `auth.md` line 277.

The v4 inventory's uncertainty on this finding was well-founded;
the answer is clean.

### 3.5 Platform Lambda permission model

**Status: Deferred (decision pending in M2.2)**

Five platform Lambdas (`accounts`, `user`, `auth/invitations`,
`auth/account-provisioning`, `auth/forgot-provider`) were deliberately
not gated during sub-phase 7b.5-beta because their permission model
needed dedicated thought. Each needs a documented decision on its
authorisation model — including how onboarding-stage users (no app
groups yet) interact with them.

M2.2 is the decision; M10 implements.

---

## 4. Contracts and types

### 4.1 Contracts directory asymmetry

**Status: Confirmed (verified during initial inventory)**

`contracts/` contains only `budget-tracker/`. There is no
`contracts/platform/` or `contracts/stock-analyser/`. Stock-analyser
contracts either live inline in `apps/stock-analyser/lib/` or aren't
called contracts at all.

M2.3 ratifies the contracts policy; subsequent work creates the
missing folders.

### 4.2 Bilateral contract mirrors forbidden

**Status: Confirmed (rule established in CONTRIBUTING.md Section 3.5)**

Per `CONTRIBUTING.md` Section 3.5, contracts have exactly one canonical
location at `contracts/<scope>/<file>.md`. Per-app mirrors at
`apps/<app>/contracts/` are forbidden. Currently
`apps/budget-tracker/contracts/ui-patterns.md` exists — M3 covers
resolving this against the canonical location.

### 4.3 v0-sufficient subset pattern

**Status: Deferred (M2.3 takes a position)**

Across budget-tracker contract files, a recurring pattern is that the
contract describes the *v0-sufficient subset* of an interface — what's
needed for v0 to mock it — rather than the production interface in
full. Production handlers extend this with additional fields.

Whether contracts should be the production interface (with v0 reading
a subset) or the v0-sufficient subset (with production extending) is
a Stage 0b decision. M2.3 takes the position.

### 4.4 Domain packages and type ownership

**Status: Confirmed (current state)**

`packages/budget-domain/` exists with TypeScript types and pure helpers
for Budget Tracker domain shapes. The equivalent for stock-analyser
does not exist — stock-analyser domain types live inline in
`apps/stock-analyser/lib/`.

M7 lifts shared concerns to packages; the stock-analyser domain
package question may be resolved as part of that work.

---

## 5. Build, test, deploy

### 5.1 ESLint baseline

**Status: Confirmed (current state)**

The lint baseline contains 36 entries documenting "investigated,
deferred" lint rule violations. 18 of these are from `apps/web-vite-backup/`
and `v0-reference/` ("rule not found" violations from un-discovered
plugin configs). M3 removes both directories, eliminating those
entries.

`eslint-plugin-boundaries` is in the lint baseline due to ESLint 10
incompatibility. M7 re-enables once the upstream fix lands.

### 5.2 CI/CD workflows and path filters

**Status: Resolved by M1 #81 (gaps confirmed, fix scoped to M14)**

GitHub Actions workflows in `.github/workflows/`:

- `ci.yml` — PR typecheck, lint, CDK synth
- `cd.yml` — manual full-platform redeploy
- `deploy-platform.yml` — triggers on `infrastructure/lib/platform/**`,
  `infrastructure/bin/**`, `functions/**`
- `deploy-stock-analyser.yml` — triggers on `apps/stock-analyser/**`,
  `infrastructure/lib/stock-analyser/**`, `packages/**`, `functions/**`
- `deploy-budget-tracker.yml` — triggers on `apps/budget-tracker/**`,
  `infrastructure/lib/budget-tracker/**`. **Currently a no-op
  placeholder** (the job echoes a message); active deployment is
  pending Issue #17 / M5.

Verified gaps (M1 #81):

1. **`packages/**` missing from `deploy-budget-tracker.yml`.**
   `MONOREPO.md` documents `packages/**` triggering both workflows;
   only stock-analyser does. Once #17/M5 activates the real
   budget-tracker deployment, a shared package change would not
   trigger budget-tracker redeploy. Currently latent (no-op
   workflow); becomes live bug at activation.
2. **`functions/**` asymmetry.** Stock-analyser deploy triggers on
   `functions/**` (platform Lambda changes); budget-tracker does
   not. Whether budget-tracker Lambdas depend on `functions/**`
   changes is worth investigating in M14 — could be intentional
   asymmetry or a gap.
3. **`.github/workflows/**` not in any deploy workflow.** Changes
   to a deploy workflow don't trigger that workflow itself.
   Changes to CI machinery (`ci.yml` etc.) don't propagate to
   downstream deploy workflows. Already in M14 scope.
4. **`scripts/ci/**` similarly uncovered.** Already in M14 scope.

Fix work belongs to M14 (deployment verification). New tracking
issue created under M14 captures gaps 1 and 2 specifically; gaps
3 and 4 are already in M14's outcome list.

`MONOREPO.md`'s deploy-table claim that `packages/**` triggers both
workflows is corrected in this PR (single-line change to reflect
actual state).

### 5.3 Production environment state

**Status: Confirmed (current state)**

- The `prod` GitHub Actions environment exists but has no variables
  populated. First prod deploy will hard-fail at the env-var check.
- The platform has not been deployed to prod yet — too many issues in
  develop. M14 covers prod-deploy verification when the platform is
  ready.

### 5.4 Test coverage

**Status: Confirmed (current state, partial)**

Test files exist in approximately 8 places across the monorepo (~951
total LOC of tests). Notable: `functions/auth/pre-token-generation/`
has tests; other auth Lambdas (`account-provisioning`, `accounts`,
`user`, `forgot-provider`) do not. Tests are non-uniform.

CI does not currently run tests on PRs — `ci.yml` runs typecheck,
lint, and CDK synth only. Test gating in CI is post-M-setup work
listed in PLAN.md Section 19 (Beyond M14).

### 5.5 Deploy verification

**Status: Confirmed (current state, partial)**

PR #28 added "verify deployed artefact after deploy" to the deploy
workflows. The depth of this verification is unclear — whether it's
"the artefact exists in S3" (insufficient) or "the artefact responds
correctly to a known request" (smoke-test sufficient) needs
investigation before M14 can scope its post-deploy work properly.

### 5.6 CDK stack topology

**Status: Confirmed in part (verified during initial inventory)**

CDK stacks under `infrastructure/lib/`:

**Platform stacks:**
- `auth-stack.ts` — Cognito user pool, app clients, groups
- `auth-api-stack.ts` — auth-related API endpoints
- `network-stack.ts` — CloudFront, S3, certificates
- `platform-api-stack.ts` — shared API Gateway (the platform gateway
  per Section 2.9)
- `platform-tables-stack.ts` — platform DynamoDB tables

**Stock-analyser stacks:**
- `stock-analyser-api-stack.ts`
- `stock-analyser-tables-stack.ts`

**Budget-tracker stacks:**
- `budget-tracker-api-stack.ts` — defines the BudgetTrackerApi gateway
  (the workaround per Section 2.9; M5 retires)
- `budget-tracker-tables-stack.ts`

There is no `MonitoringStack` despite `infrastructure/lib/README.md`
declaring one. M13 creates it.

There is no shared CDK construct library at `packages/cdk-constructs/`.
Each new Lambda or table reimplements boilerplate. M7 populates
`packages/cdk-constructs/` as part of deduplication.

### 5.7 Environment variables

**Status: Confirmed (verified during initial inventory)**

Approximately 22 environment variables are exposed to the client side
(`NEXT_PUBLIC_*`). Notable:

- `NEXT_PUBLIC_USE_MOCK_DATA` — defaults to mock-mode in code,
  reclassified as `[REQUIRED]` in PR #23. Long-term default-flip to
  production values is in PLAN.md Section 19 (Backlog).
- `NEXT_PUBLIC_RUNTIME_PROFILE` — profile + override pattern (M6 #189).
  Set to `mock` (default; local dev) or `live` (deployed). Per-concern
  overrides allow targeted swaps: `NEXT_PUBLIC_AUTH_OVERRIDE` (wired
  #189), `NEXT_PUBLIC_DATA_OVERRIDE` (wired #178 — `local|dynamo`),
  `NEXT_PUBLIC_AI_OVERRIDE` (pending #181). Auth and data axes now
  wired in both apps' configs via `selectProvider`; AI axis pending
  #181. Replaces the former per-axis env vars (`NEXT_PUBLIC_AUTH_PROVIDER`,
  `NEXT_PUBLIC_STORAGE_PROVIDER` removed). See CONTRIBUTING.md Section 5.8.
- `NEXT_PUBLIC_BUDGET_API_URL` — points at the BudgetTrackerApi
  gateway. Removed in M5.

There is no runtime feature-flag library; toggles are deployment-mode
flags only (build-time, global). Adding runtime feature-flag support
is a Stage 0b consideration if relevant.

### 5.8 auth.md migration note is stale (M3 reconciles)

**Status: Confirmed (documentation gap; addressed in M3)**

`auth.md` line 144 states: "During migration both old and new groups
coexist; handlers accept either."

This is misleading. Handler-side authorization never reads raw group
names — the helpers read `apps`, `accounts`, and `site_admin` claims
at all points in the migration. The migration note conflates:

- Cognito group management (where the pre-token Lambda's
  reconciliation logic manages coexistence of old and new groups)
- Handler-side authorization (where group names are never read)

The auth.md note implies a handler-level concern that doesn't exist.
M3 (documentation reconciliation) should clarify the migration note
to distinguish between Cognito-level group state (where coexistence
exists) and handler-level authorization (where it doesn't).

Surfaced by M1 #80.

### 5.9 Architecture document gaps found in M1 #85

**Status: Confirmed (Resolved by M1 #85 — gaps flagged for M3)**

M1 #85 read all five `docs/architecture/` files (`README.md`, `auth.md`,
`data.md`, `urls-and-deploy.md`, `cdk.md`) and both app CLAUDE.md files
(`apps/stock-analyser/CLAUDE.md`, `apps/budget-tracker/CLAUDE.md`).
The documents are broadly accurate. Gaps and inconsistencies found:

**data.md gaps:**

1. `platform.invitations` status values listed as `pending | redeemed |
   expired` — omits `cancelled`. auth.md documents `cancelled` as a
   valid state. M3 reconciles.

2. Account-relationships example (data.md lines 230–231) references
   `custom:active_accounts["budget-tracker"]` as if it is an active
   Cognito attribute. auth.md states "active account is not a Cognito
   attribute" and that `custom:active_account` (singular) is "Declared
   but unused." The data.md example is stale. M3 reconciles.

3. data.md references analysis-cache type definitions at
   `apps/stock-analyser/contracts/DATA_CONTRACTS.md` — an app-level
   path, not `contracts/stock-analyser/`. M2.3 ratifies the contracts
   policy; subsequent work determines the canonical location.

**urls-and-deploy.md gaps:**

4. Deploy trigger table for `deploy-stock-analyser.yml` lists three
   path filters but omits `functions/**`. The actual workflow (confirmed
   by M1 #81) includes `functions/**`. Table is incomplete. M3 reconciles.

5. Deploy trigger table describes `deploy-budget-tracker.yml` as doing
   real CDK + S3 deployment. The workflow is currently a no-op
   placeholder (pending Issue #17/M5). Table doesn't note this. M3
   reconciles (or M5 activates the real deployment first).

**cdk.md notes:**

6. `auth.md` documents an `invitations-reconcile` Lambda
   (`POST /auth/reconcile-invitation`) in detail. This Lambda does not
   exist in `functions/auth/` or in any CDK stack — it is part of the
   M11 forward-scope. auth.md describes future design; cdk.md correctly
   omits it. No action until M11.

7. `StorageStack` appears both as a standalone section and within the
   Platform stacks table in cdk.md. Minor duplication; M3 may tighten.

**auth.md notes:**

8. auth.md line 344 states: "`requireGroup` remains during the 7e
   migration for transitional purposes and is removed at 7e-cleanup."
   M1 #79 and #80 verified no handler calls `requireGroup`. Handler-side
   migration is complete; only the helper's removal from the middleware
   package remains. M8 (or M10 cleanup) removes it.

---

## 6. Cross-cutting platform concerns

### 6.1 Observability

**Status: Aspirational-never-built (addressed in M13)**

The platform has fragmented observability — to understand whether
Stock Signal or Budget Tracker is healthy, you visit multiple AWS
consoles. There are no per-app health dashboards, no cross-app
monitoring at the platform level, no per-user / per-account Claude
consumption visibility.

`infrastructure/lib/README.md` declares a `MonitoringStack` that does
not exist. M13 creates it.

### 6.2 Configuration and secrets

**Status: Confirmed (current state)**

Secrets are managed via AWS Secrets Manager (referenced via
`ANTHROPIC_SECRET_NAME` etc.). Configuration is deployment-mode env
vars (5.7).

The Claude proxy holds the Anthropic API key via
`CLAUDE_PROXY_FUNCTION_NAME` and `ANTHROPIC_SECRET_NAME` references.
Per-user / per-account quota or rate-limiting on Claude consumption
is not currently enforced. M13 makes consumption observable; M2.2 may
take a position on whether quota enforcement is in-scope for the
platform.

### 6.3 Account switcher

**Status: Aspirational-never-built**

The account switcher UI (per-app account selection in the launchpad
or per-app header) is not currently scoped in any numbered milestone.
It needs the per-app account model from M2.2 / M4 to be in place
first. PLAN.md Section 19 (Beyond M14) lists this as a future item.

### 6.4 Mobile-first design

**Status uncertain — verify**

The mobile-first design constraint (375px-first, Tailwind mobile-first,
bottom tab nav on mobile, sidebar on desktop, no max-width media
queries) was declared at S1.1. Current state of compliance across
components is unknown. PLAN.md Section 19 covers mobile-first audit
and enforcement.

### 6.5 PWA and push notifications

**Status: Aspirational-never-built**

PWA manifest, service worker, push notifications via EventBridge + SES
were Phase 4 work in the original plan. None are implemented. PLAN.md
Section 19 lists these as future items.
