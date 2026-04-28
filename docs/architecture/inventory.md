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

Whether budget-tracker Lambdas read the new Cognito group names
(`stock-app-access`, `budget-app-access`, `site-admin`) or still
reference the legacy ones (`stock-app`, `budget-app`, `admin`) is
uncertain. M8 (legacy auth substrate cleanup) depends on knowing.

**M1 #80 will populate the group-name read findings.**

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
| `platform.accounts-{stage}` | accountId | — | Currently lacks `appSlug` field; see Section 3.2. |
| `platform.account-members-{stage}` | accountId | userId | Has `userId-index` GSI for reverse lookup. |
| `platform.invitations-{stage}` | invitationId | — | Used by invitation flow (M11). |
| `platform.users-{stage}` | userId | — | |
| `platform.rate-limits-{stage}` | (cf. claude-proxy) | | |
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

**Status uncertain — verify (M1 issue #84, partial)**

The `functions/claude-proxy/` Lambda proxies requests to the Anthropic
API. It is invoked by Lambda-to-Lambda calls (e.g., from `budget-ai/`).
The authorization on its invocation, the IAM scope of which Lambdas
have permission to call it, and whether per-user attribution is
possible from the current invocation pattern all need verification.

Per-user / per-account observability of Claude consumption is M13
scope; the input it needs from this verification is whether the
current invocation pattern can support attribution at all.

Forward-reference from M1 #78: `apps/budget-tracker/functions/budget-ai/`
calls the Claude proxy via Lambda-to-Lambda invocation, constructing
the invocation event payload directly. The constructed payload
propagates the *full caller auth context* — `requestContext.authorizer.claims`
including `sub`, `email`, `cognito:groups`, `apps`, `accounts`, and
`site_admin` (lines 33-40). The X-Account-Id header is also included.

This means the Claude proxy receives identifiable, fully-formed caller
context — not an anonymous invocation. Per-user attribution is
achievable, and authorization based on caller claims is possible. M1
#84 verifies whether the proxy *uses* this propagated context
appropriately (authorization check, attribution capture).

The X-Account-Id propagation specifically is part of the X-Account-Id
chain verified by M1 #78. Whether the proxy applies authorization
based on the broader propagated context is M1 #84.

**M1 #84 will populate verified findings.**

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

### 3.2 appSlug not written on platform.accounts

**Status: Confirmed (active blocker, addressed in M4)**

The pre-token-generation Lambda joins `platform.account-members`
through `platform.accounts` to populate the `accounts` JWT claim.
The join logic reads `appSlug` from the accounts row to bucket each
account into `accountsByApp[appSlug]`. However, neither writer
(`account-provisioning/handleSetup` or `accounts/createAccount`)
currently writes `appSlug` onto the accounts row.

Consequence: `accountsByApp` is empty for every JWT. The `accounts`
claim ships empty. Every account-scoped Lambda call fails
authorization. This is the single biggest active blocker in the
inventory.

M4 closes this. The user-expressed preference recorded during M-setup
is per-app accounts (one `platform.accounts` row per app per user-account
relationship); M2.2 ratifies the model formally before M4's writer
update lands.

### 3.3 Frontend auth store and JWT claims

**Status uncertain — verify (M1 issue #85, partial — overlaps with auth.md read)**

The frontend auth store needs to retain `apps`, `accounts`, and
`site_admin` claims atomically with rendering decisions. If claim
state is updated piecemeal (e.g., during token refresh), there's a
window where rendering uses stale values from one claim and fresh
from another.

The current shape of the store, and whether it preserves claims
atomically, needs verification. M9 (launchpad tile rendering migration)
specifically requires this invariant to hold.

**M1 #85's architecture document read will surface this.**

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

**Status: Confirmed in part (deploy paths verified during initial inventory; packages/** trigger pending)**

GitHub Actions workflows in `.github/workflows/`:

- `ci.yml` — PR typecheck, lint, CDK synth
- `cd.yml` — manual full-platform redeploy
- `deploy-platform.yml` — triggers on `infrastructure/lib/platform/**`,
  `infrastructure/bin/**`, `functions/**`
- `deploy-stock-analyser.yml` — triggers on `apps/stock-analyser/**`,
  `infrastructure/lib/stock-analyser/**`
- `deploy-budget-tracker.yml` — triggers on `apps/budget-tracker/**`,
  `infrastructure/lib/budget-tracker/**`

Path filter completeness is incomplete:

- `.github/workflows/**` and `scripts/ci/**` are not covered by any
  app's deploy workflow trigger; changes to CI machinery don't
  auto-trigger the workflows they modify. M14 covers.
- Whether `packages/**` triggers both `deploy-stock-analyser.yml` and
  `deploy-budget-tracker.yml` (as `MONOREPO.md` declares) needs
  verification.

**M1 #81 will resolve the packages/** trigger verification.**

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
- `NEXT_PUBLIC_AI_PROVIDER` and `NEXT_PUBLIC_AUTH_PROVIDER` — same
  pattern.
- `NEXT_PUBLIC_BUDGET_API_URL` — points at the BudgetTrackerApi
  gateway. Removed in M5.

There is no runtime feature-flag library; toggles are deployment-mode
flags only (build-time, global). Adding runtime feature-flag support
is a Stage 0b consideration if relevant.

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
