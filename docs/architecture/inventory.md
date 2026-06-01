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

- `apps/` — three subdirectories: `budget-tracker/`, `launchpad/`,
  `stock-analyser/`. `apps/web/` was deleted in M7 / PR #250.
- `packages/` — nine subdirectories: `api-client/`, `auth-client/`,
  `budget-domain/`, `cache/`, `data-access/`, `lambda-middleware/`, `logger/`, `runtime-config/`, `ui/`
  (organisational directory; two sub-packages: `ui-error-boundaries`,
  `ui-primitives`). `cycle-engine/` was removed — see Section 1.5.
- `infrastructure/` — root CDK entrypoint only (`bin/app.ts` and per-deploy entrypoints under `bin/`);
  platform stacks live under `platform/infrastructure/`; app stacks live
  under `apps/<app>/infrastructure/`.
- `platform/functions/` — platform Lambda source: `accounts/`, `auth/` (with
  `account-provisioning/`, `pre-token-generation`, `invitations`, legacy
  rollback `forgot-provider/`), `claude-proxy/`, `user/`. Resolved by M7 /
  PR #250.
- `contracts/` — only `budget-tracker/` exists. M2.3 ratifies the
  contracts policy; subsequent work creates `platform/` and
  `stock-analyser/` siblings.
- `docs/` — `architecture/` (5 files: README.md, auth.md, cdk.md,
  data.md, urls-and-deploy.md), `archive/` (DEVELOPMENT_PLAN.md,
  STABILISATION_FREEZE.md)
- `migration-artifacts/` — `budget-tracker/` only

AGENTS.md is the canonical root AI-agent guide, with CLAUDE.md retained as
the Claude Code compatibility mirror. `apps/stock-analyser/` and
`apps/budget-tracker/` have paired AGENTS.md/CLAUDE.md files;
`apps/launchpad/` is missing a per-app pair (M3 outcome).

`pnpm-workspace.yaml` covers `apps/*`,
`apps/stock-analyser/functions/*`, `apps/budget-tracker/functions/*`,
`packages/*`, `platform/functions/*`, `platform/functions/auth/*`, `infrastructure`.

The infrastructure split (M7 #250) is complete: per-app stacks are at
`apps/<app>/infrastructure/`, platform stacks are at `platform/infrastructure/`,
and root `infrastructure/` retains only `bin/app.ts`. `apps/web/` and
`apps/web-vite-backup/` have been deleted.

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

**Status: Confirmed (updated by M7 cycle-data PR)**

No sub-packages in `packages/ui/` remain as stubs; both are fully populated:

- `packages/ui/primitives/` (`@transformotion/ui-primitives`) — fully populated
  by M7 #298/#299/#300. Contains: 56 shadcn/ui components (lifted from
  `apps/*/components/ui/`), `useIsMobile` hook, `useToast`/`toast` hooks
  (co-lifted with `toast.tsx` by #300). All 28 Radix UI packages, plus
  `clsx`, `tailwind-merge`, `lucide-react`, `class-variance-authority`,
  `sonner`, `vaul`, `recharts`, and other UI deps are direct dependencies.
  Note: `cn()` exists in both this package (`src/lib/utils.ts`) and in each
  app's `lib/utils.ts` by design — the package copy serves lifted components;
  the app copies serve app-level code and the v0 sync workflow.
- `packages/ui/error-boundaries/` (`@transformotion/ui-error-boundaries`) —
  houses `TabErrorBoundary`; 6 vitest tests; 2 consumers
  (`budget-tracker-app.tsx`, `apps/stock-analyser/app/page.tsx`).

`packages/ui/` is now an organisational directory per §3.4, not itself a
package. Split landed in M7 / PR #298:

- `packages/ui/error-boundaries/` (`@transformotion/ui-error-boundaries`) —
  houses `TabErrorBoundary`; 6 vitest tests; 2 consumers
  (`budget-tracker-app.tsx`, `apps/stock-analyser/app/page.tsx`).

`packages/data-access/` (`@transformotion/data-access`) was created by M7 / PR #292:
- Exports: `Repository<T,ID>`, `RepositoryOptions`, `QueryOptions<T>`, `PaginatedResult<T>` interfaces
- Lifted from `apps/*/lib/repositories/base-repository.ts` (byte-identical in both apps)
- BT's concrete implementations use domain-specific interfaces from `@transformotion/budget-domain`; none directly implement `Repository<T,ID>`
- Both apps' `lib/repositories/index.ts` now re-exports types from the package

`packages/logger/` (`@transformotion/logger`) was created by M7 / PR #291:
- Exports: `Logger`, `LogLevel`, `LogContext`, `LogEntry`, `LoggerConfig` interfaces; `ConsoleLogger`, `createLogger`, `getLogger`
- `ConsoleLogger` lifted from `apps/*/lib/services/logger/console-logger.ts` (byte-identical in both apps)
- `AppName` union type removed from package — `app` fields broadened to `string`; per-app `AppName` types removed
- `createLogger(app?, level?)` defaults `level` to `'info'` (matches env-var default in both apps)
- Both apps' `lib/services/logger/index.ts` re-exports from the package; `lib/logging.ts` imports from `@transformotion/logger` directly

`packages/cache/` (`@transformotion/cache`) was created by M7 / PR #290:
- Exports: `CacheService`, `CacheOptions`, `CacheEntry`, `CacheConfig` interfaces; `MemoryCacheService`, `createCacheService`
- `MemoryCacheService` lifted from `apps/*/lib/services/cache/memory-cache.ts` (byte-identical in both apps)
- `DynamoTTLCacheService` stays SA-only (`apps/stock-analyser/lib/services/cache/dynamo-ttl-cache.ts`)
- Both apps' `lib/services/cache/index.ts` now re-exports types and `MemoryCacheService` from the package

Two packages were previously described as stubs but are fully
implemented:

- `packages/auth-client/` — full `CognitoAuthService` +
  `createMockAuthService` implementations; `aws-amplify ^6` dependency;
  4 source files. Not a stub. Description corrected by M7 / PR #304.
- `packages/runtime-config/` — `selectProvider()`, `resolveProfile()`,
  `normaliseCrossAppUrl()`, `RuntimeProfile` exports. Previously absent
  from this section; added by M7 / PR #304. Extended by M7 / PR #293
  to export 7 shared config sub-types (`APIConfig`, `AuthConfig`,
  `StorageConfig`, `LoggingConfig`, `ClaudeConfig`, `FeaturesConfig`,
  `AppsConfig`) and `createConfig<T>()` factory. Both apps' `lib/config/index.ts`
  now import sub-types and factory from the package; `AppsConfig.peers`
  replaces the per-app `budgetTrackerUrl`/`launchpadUrl` fields.
  Extended by M7 / PR #335 (Bucket A'') to add the canonical app registry:
  `APPS` const (slug, cognitoGroup, urlPrefix, label per app), `APP_SLUGS`
  derived array, `AppDescriptor`/`AppSlug` types, and `LP_AUTH_ROUTES`
  (signIn/signedOut path constants). Consumed by platform Lambdas
  (account-provisioning, pre-token-generation, claude-proxy), CDK stacks
  (PlatformWsStack, AuthStack, NetworkStack), launchpad, and both app
  configs. WebSocket URL env var unified at that point:
  `NEXT_PUBLIC_PLATFORM_WSS_URL` replaced the per-app
  `NEXT_PUBLIC_CLAUDE_WSS_URL` (SA) and `NEXT_PUBLIC_BUDGET_WSS_URL` (BT)
  in both deploy workflows and configs. M9 #365 moves Budget Tracker back to
  an app-owned WSS URL via `NEXT_PUBLIC_BT_WSS_URL`, with
  `NEXT_PUBLIC_PLATFORM_WSS_URL` retained only as rollback fallback.
  **Resolved by M7 / PR #346:** The `APPS` const, `APP_SLUGS`, `AppDescriptor`,
  and `AppSlug` exports were removed from `packages/runtime-config/` as part of
  the deploy-isolation work. The canonical app registry moved to
  `platform/config/app-registry.json`; CDK stacks read it via `loadAppRegistry()`
  at synth time and inject values as Lambda env vars (`APP_REGISTRY`, `APP_SLUGS`,
  `PERMITTED_APPS`). Lambdas read env vars at runtime — no longer importing from
  the package. `@transformotion/runtime-config` now exports only:
  `selectProvider()`, `resolveProfile()`, `normaliseCrossAppUrl()`,
  `createConfig<T>()`, and the 7 config sub-types. SA/BT deploy workflows no
  longer trigger on `packages/runtime-config/**` changes.

`packages/cycle-engine/` was deleted in this PR. Its RSI/MACD/cycle
scoring implementation was app-specific (Stock Analyser only), so it
was migrated to `apps/stock-analyser/lib/cycle/` per `CONTRIBUTING.md`
§3.6 (app-specific code lives in `apps/<app>/lib/`), and the empty
package deleted. The cycle lib now has 25 vitest tests in
`apps/stock-analyser/lib/cycle/cycle.test.ts`.

### 1.6 Launchpad as control-plane app

**Status: Confirmed (current state — Hosted UI auth landed, M6)**

`apps/launchpad/` is the platform shell — sign-in flow, account
switcher, app tile rendering. Treated as an app for structural
purposes (consumes platform services through packages like any other
app) per `CONTRIBUTING.md` Section 3.2.

M9 #363 extends Launchpad from frontend-only platform shell into the
control-plane app. Launchpad-owned infrastructure lives under
`apps/launchpad/infrastructure/` and is synthesised by
`infrastructure/bin/launchpad.ts`, matching the Stock Analyser and Budget
Tracker app-owned infrastructure pattern.

For #386, `deploy-launchpad.yml` is hardened as the Launchpad backend deploy
lane. It deploys all `Transformotion{Stage}-Launchpad*` stacks from the
Launchpad CDK entrypoint, extracts current control-plane outputs, and is ready
to consume future Launchpad-owned auth outputs without Platform deploy
orchestration.

Per M0 verification: `apps/launchpad/` contains no public signup UI
(no `signUp`, `register`, `createAccount` references in any `.ts` or
`.tsx` file).

As of M6 PR (canonical auth), Launchpad hosts real Cognito Hosted UI
sign-in via `signInWithRedirect`. The sign-in stub (setTimeout/console.log)
is removed. Social providers (Google, Microsoft, Facebook) and email
sign-in all route through the Cognito Hosted UI. Launchpad has its own
Cognito App Client (`LaunchpadAppClient`) and dedicated
`/launchpad/callback` OAuth return route. Auth store persist key:
`launchpad-auth`.

`Transformotion{Stage}-LaunchpadAuth` is the staged Launchpad-owned
Cognito/auth foundation. It creates a new User Pool, Hosted UI domain, app
clients, groups, Hosted UI customisation, and Launchpad-owned social credential
secret placeholders. It also creates `launchpad-users-{stage}`,
`launchpad-accounts-{stage}`, `launchpad-account-members-{stage}`,
`launchpad-invitations-{stage}`, `launchpad-rate-limits-{stage}`, and the
`launchpad-pre-token-generation-{stage}` trigger attached to the staged User
Pool. It becomes live for dev when the dev deploy jobs run with
`LAUNCHPAD_AUTH_CUTOVER_ENABLED=true` after reseed and staged validation. PR 6
adds flag-driven wiring via
`LAUNCHPAD_AUTH_CUTOVER_ENABLED`: false-mode keeps Platform auth exports and
tables; true-mode makes Launchpad control-plane, Stock Analyser, and Budget
Tracker synthesize against `LaunchpadAuth` outputs for authorizers and relevant
Launchpad auth-domain table references. The workflow-level default remains
false for prod safety.

`Transformotion{Stage}-LaunchpadControlPlane` is the Launchpad-owned
control-plane API. It exposes `GET /health` and owns the live
`POST /auth/lookup-provider`, `POST /auth/setup`,
`GET /api/user/profile`, `PUT /api/user/preferences`,
`POST /accounts`, `GET/PUT/DELETE /accounts/{accountId}`,
`GET /accounts/{accountId}/members`,
`DELETE /accounts/{accountId}/members/{userId}`, and
`POST /accounts/{accountId}/invitations` routes after #363 PR 5. Cognito User
Pool, Hosted UI domain, app clients, pre-token trigger, and shared account
tables used by live traffic remain physically platform-owned as migration debt.

Target ownership is Launchpad physical and logical ownership of the auth
domain. #386 owns the physical re-home of Cognito, auth-domain tables,
pre-token claims infrastructure, rate limits, and remaining platform rollback
routes.

The hard-coded `userCanAccessFramework` prop in launchpad currently
governs tile visibility for the Transformotion Framework app. M9
(per-app architecture restructure) includes LP's frontend refactor;
tile rendering migration to the `apps` JWT claim is subsumed into M9.

### 1.7 Stale-by-decision artefacts

**Status: Stale-by-decision**

Several artefacts in the repo describe earlier states that have been
superseded:

- `apps/web/` — Deleted (M7 #250). Was a 0-LOC shell from the launchpad rename.
- `apps/web-vite-backup/` — Deleted (M7 #250). Was contributing 18 lint baseline entries.
- Branch naming convention in root `AGENTS.md` / `CLAUDE.md`
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
  `getStockAnalyserClient()` directly; no swap point at the data-access
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
  → getStockAnalyserClient().getPortfolio()
  → ApiClient → HttpClient.request()
  → fetch(baseUrl + '/portfolio')
    with Authorization: Bearer <idToken>
    and X-Account-Id: <accountId>
  → transformotion-portfolio-{stage} Lambda
  → stock-analyser.portfolio-{stage} DynamoDB
```

No localStorage anywhere in this path. The same shape applies to
watchlist (`watchlist-service.ts` → `getStockAnalyserClient().getWatchlist()`
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

- `requireAppAccess(auth, 'stock-analyser')` — fail-fast app gate
- `requireAccountAccess(auth, 'stock-analyser', account.accountId)` —
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

Platform Lambdas (`platform/functions/`):

- `accounts/` — legacy rollback copy of account management routes
- `auth/account-provisioning/` — legacy rollback copy of first-sign-in
  account creation and superseded `/auth/switch`
- `auth/pre-token-generation/` — Cognito pre-token trigger; emits
  the `apps`, `accounts`, `site_admin` claims into JWTs
- `auth/invitations/` — legacy rollback copy of invitation route
- `auth/forgot-provider/` — legacy rollback copy of the federated identity
  recovery route after #363 PR 3
- `claude-proxy/` — Anthropic API proxy
- `user/` — legacy rollback copy of user profile/preferences routes

Launchpad control-plane Lambdas (`apps/launchpad/functions/`):

- `forgot-provider/` — live federated identity recovery route
- `account-provisioning/` — live first-sign-in account creation
- `user/` — live user profile/preferences routes
- `accounts/` — live account administration and member-management routes
- `invitations/` — live invitation creation route

Stock-analyser Lambdas (`apps/stock-analyser/functions/`):

- `portfolio/`
- `watchlist/`
- `analysis-cache/`
- `cycle-check/` (EventBridge scheduled — no HTTP route)
- `cycle-data/` — `GET /cycle/ohlcv?ticker=` — fetches OHLCV from
  Yahoo Finance, computes RSI/MACD cycle position, caches result under
  `OHLCV#{ticker}` in the analysis-cache table (1h TTL). Added in this
  PR as part of SA Live mode cycle computation.

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

### 2.9 Shared platform API Gateway runtime coupling

**Status: Confirmed (current state after #367; legacy platform gateway retained for rollback/decommission)**

The platform previously used the shared platform REST API Gateway for
app runtime routes. After #366/#367, Stock Analyser and Budget Tracker
own their app runtime REST APIs:

- **Platform gateway** — defined in `platform/infrastructure/platform-api-stack.ts`,
  still serves platform routes and remains deployed for rollback and later
  #372 decommissioning of legacy app runtime paths.
- **BudgetTrackerApiStack** — defined in
  `apps/budget-tracker/infrastructure/budget-tracker-api-stack.ts`,
  owns the Budget Tracker REST API Gateway after #367.
- **StockAnalyserApiStack** — defined in
  `apps/stock-analyser/infrastructure/stock-analyser-api-stack.ts`,
  owns the Stock Analyser REST API Gateway after #366.

Shared platform gateway app-runtime ownership is legacy transitional debt.
It must not be treated as the target pattern for new app runtime routes.

### 2.10 DynamoDB schema

**Status: Confirmed in part (initial inventory); SK schema mismatch verification pending (M1 issue #82)**

#### 2.10.1 Platform tables

| Table | PK | SK | Notes |
|---|---|---|---|
| `platform.accounts-{stage}` | accountId | — | Schema has `appSlug` field; not written at runtime — see Section 3.2. |
| `platform.account-members-{stage}` | accountId | userId | Has `userId-index` GSI for reverse lookup. |
| `platform.invitations-{stage}` | invitationId | — | Used by invitation flow (M11). |
| `platform.users-{stage}` | userId | — | |
| `platform.rate-limits-{stage}` | pk | — | Owned by `AuthApiStack` (not PlatformTablesStack). PK: `lookup-provider#<ip>`. Current migration-debt table consumed by Launchpad-owned `forgot-provider` after #363 PR 3; legacy platform route also uses it while retained for rollback. #386 owns physical re-home/rename. |
| `platform.analysis-cache-{stage}` | accountId | cacheKey | Misnamed — see Section 2.7. |
| `platform.job-results-{stage}` | accountId | cacheKey | Added M7 / PR #334 (Bucket A'). Platform-owned async AI job state (pending → retrying → complete/error). Written by `claude-proxy`, read by `analysis-cache` Lambda via `job-*` key prefix routing. TTL: 2h. |

#### 2.10.1a Launchpad auth tables

These tables are staged in `Transformotion{Stage}-LaunchpadAuth` for #386 and
are not live until reseed/cutover:

| Table | PK | SK | Notes |
|---|---|---|---|
| `launchpad-users-{stage}` | userId | — | Staged replacement for `platform.users-{stage}` |
| `launchpad-accounts-{stage}` | accountId | — | Staged replacement for `platform.accounts-{stage}`; `appSlug` is required for claims |
| `launchpad-account-members-{stage}` | accountId | userId | Staged replacement for `platform.account-members-{stage}`; includes `userId-index` |
| `launchpad-invitations-{stage}` | invitationId | — | Staged replacement for `platform.invitations-{stage}`; includes `email-index`, TTL `expiresAt` |
| `launchpad-rate-limits-{stage}` | key | — | Staged replacement for `platform.rate-limits-{stage}`; TTL `expiresAt` |

#### 2.10.2 Stock-analyser tables

**Status: Confirmed (verified by M1 #82)**

| Table | PK | SK |
|---|---|---|
| `stock-analyser.portfolio-{stage}` | accountId | ticker |
| `stock-analyser.watchlist-{stage}` | accountId | ticker |
| `stock-analyser.analysis-cache-{stage}` | accountId | cacheKey |
| `stock-analyser.ws-connections-{stage}` | connectionId | — |
| `stock-analyser.job-results-{stage}` | accountId | cacheKey |

CDK source declares all three tables with composite keys
(`apps/stock-analyser/infrastructure/stock-analyser-tables-stack.ts`
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

WebSocket connection state for Stock Analyser is app-owned in
`stock-analyser.ws-connections-{stage}`. Async AI job state is app-owned in
`stock-analyser.job-results-{stage}`. After #366, live Stock Analyser AI uses
Stock Analyser REST, AI proxy, job-results, and WSS runtime.

#### 2.10.3 Budget-tracker tables

**Status: Resolved by budget-data-restructure PR (data model updated)**

| Table | PK | SK |
|---|---|---|
| `budget-tracker.transactions-{stage}` | accountId | transactionId |
| `budget-tracker.rules-{stage}` | accountId | ruleId |
| `budget-tracker.settings-{stage}` | accountId | settingKey |
WebSocket connection state for Budget Tracker is now in the app-owned table `budget-tracker.ws-connections-{stage}` (owned by `BudgetTrackerWsStack`). The older platform table `platform.ws-connections-{stage}` remains deployed for other transitional platform WSS consumers until M9 decommissioning.

Categories, subcategories, and budget amounts are stored as a single
`budgetData` value in the settings table (key: `budgetData`), with
shape `{ categories: Category[], budgetAmounts: Record<subcategoryId, number>,
budgetFrequencies: Record<subcategoryId, BudgetFrequency> }`.
`Category` objects carry `type: 'regular'|'capital'` and support soft
deletion (`deleted: true`). The old `categoryTree` / `budgetOverrides`
/ `budgetFreqs` separate keys are superseded.

`BudgetSettings` is now slim — only `csvFormatMappings` remains as a
separate settings key.

The `rules` table stores `MatchingRule` objects (renamed from
`CustomRule`); rules reference `categoryId`/`subcategoryId` UUIDs
instead of category name strings. There are no built-in rules compiled
into the codebase.

`Transaction` rows have `categoryId`/`subcategoryId` UUID FK fields;
the deprecated `category`/`subcategory` string fields remain for
migration fallback display until transactions are re-categorised via
the rules engine.

A `budget-tracker.accounts-{stage}` table also exists but appears
dormant — no runtime code references it. Likely a leftover from an
earlier design (Inferred). M3 may resolve.

### 2.11 Claude proxy

**Status: Confirmed (Resolved by M1 #84)**

`platform/functions/claude-proxy/` proxies requests to the Anthropic API.
It is a platform Lambda mounted at `POST /api/claude` on the shared
API Gateway behind the JWT authoriser.

#### Invocation paths

The handler distinguishes two event shapes:

1. **API Gateway path** — standard `APIGatewayProxyEvent`. Passes
   through `withAuth` middleware then calls
   `requireAnyAppAccess(auth, ['stock-analyser', 'budget-tracker'])`.
   This is the path taken for Lambda-to-Lambda calls from `budget-ai`
   (which constructs a synthetic API Gateway event with full propagated
   claims). The propagated `requestContext.authorizer.claims` — including
   `sub`, `email`, `cognito:groups`, `apps`, `accounts`, `site_admin`,
   and `X-Account-Id` — are used by `withAuth` for authorization.
   Documented in auth.md lines 325 and 363–367.

2. **Async job path** — event has `__asyncJob: true`. Routes to
   `executeAsyncJob()`, which carries no auth check. This path is only
   reachable via the proxy self-invoking itself (see IAM boundary below).

#### DynamoDB grants

As of M7 / PR #334 (Bucket A'), `claude-proxy` writes async job records to
`platform.job-results-{stage}` (PlatformTablesStack) and has **no IAM
access** to `stock-analyser.analysis-cache-{stage}`. The prior coupling
(writing job records to SA's table) was resolved by this PR.

#### IAM trust boundary

Two callers have `lambda:InvokeFunction` on the proxy ARN:

- `budget-ai` Lambda (`budget-tracker-api-stack.ts` lines 140–143) —
  direct Lambda-to-Lambda invocation from Budget Tracker AI handlers.
- The proxy itself (`platform-api-stack.ts` lines 163–168) — used for
  async self-invocation (`InvocationType: 'Event'`, `__asyncJob: true`).

No stock-analyser Lambda has direct IAM permission to invoke the proxy.
Stock-analyser reaches the proxy only via the API Gateway path
(if it has `stock-analyser` app access).

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
the store). M9 (per-app architecture restructure) needs this verified
during its recon phase.

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
analysis-cache) all enforce `requireAppAccess(auth, 'stock-analyser')`
plus `requireAccountAccess(auth, 'stock-analyser', accountId)` per the
documented pattern. The v4 finding was carried forward without
re-verification.

**Implication for M10 scope:** PLAN.md M10's outcomes previously
listed "Stock-analyser Lambdas now enforce
`requireAppAccess('stock-analyser')`" as in-scope. That work is already
done. M10's remaining substance is migrating budget-tracker Lambdas
from any legacy `requireGroup` calls to the new helpers (Section 2.6
territory; pending M1 #80 verification) and adding role-based
enforcement via `requireAccountAccess(..., minRole)` where it isn't
already in use.

#### 3.4.3 forgot-provider Lambda fails on federated users

**Status: Confirmed (open; addressed in M12)**

Per Issue #49: the forgot-provider implementation uses
`AdminGetUserCommand(Username=email)` which works for native Cognito
users but fails for federated users because Cognito indexes federated
users by sub, not email. M12 fixes.

#### 3.4.4 Cognito authoriser accepts all three app clients

**Status: Resolved by M1 #83 (verified clean)**

The API Gateway authoriser is constructed as
`CognitoUserPoolsAuthorizer` taking the user pool reference (not
specific app clients) at `platform/infrastructure/platform-api-stack.ts`
lines 67-68:

`cognitoUserPools: [userPool]`

The AWS `CognitoUserPoolsAuthorizer` accepts any valid JWT issued by
the supplied user pool, regardless of which app client was used to
obtain it. A user who signs in via the launchpad client receives a
JWT that authenticates against stock-analyser, budget-tracker, and
launchpad routes — exactly what cross-app navigation requires.

A single shared authoriser (`JwtAuthoriser`) is defined in
`platform-api-stack.ts` and reused across all platform routes. The
Launchpad control-plane stack defines its own Cognito authoriser over the same
platform-owned User Pool. The auth-api-stack now retains only the rollback
copy of the public lookup-provider Lambda; the live route is owned by
`LaunchpadControlPlaneStack`.

The v4 inventory's uncertainty on this finding was well-founded;
the answer is clean.

### 3.6 Canonical Hosted UI auth flow — landed (M6)

**Status: Resolved by M6 canonical auth PR**

All three apps now use Cognito Hosted UI (`signInWithRedirect`) as
the canonical sign-in mechanism. SRP (direct email/password via
Amplify) is removed from all frontends.

**Per-app state:**
- **Launchpad** — real Hosted UI sign-in with social providers (Google,
  Microsoft, Facebook); `/launchpad/callback` route; `LaunchpadAppClient`;
  `launchpad-auth` persist key; deploy workflow: `deploy-launchpad.yml`.
- **Stock Analyser** — `signInWithRedirect` replaces the SRP email/password
  form; `/stock-analyser/callback` route; `StockAnalyserAppClient`;
  `stock-analyser-auth` persist key (was `auth-store`).
- **Budget Tracker** — `signInWithRedirect` trigger when unauthenticated;
  `/budget-tracker/callback` route; `BudgetTrackerAppClient`;
  `budget-tracker-auth` persist key (was `auth-store`).

**Auth store persist key collision resolved:** All three apps previously
used `auth-store` as the Zustand persist key. Each now uses a namespaced
key (`launchpad-auth`, `stock-analyser-auth`, `budget-tracker-auth`) with
`version: 1`, preventing stale data bleed between apps sharing
`localStorage` on the same origin.

**`NEXT_PUBLIC_CALLBACK_URL` introduced:** `CognitoAuthService` now reads
`NEXT_PUBLIC_CALLBACK_URL` (explicit full URL) instead of deriving the
callback from `NEXT_PUBLIC_APP_URL + /callback`. Fixes a `redirect_uri_mismatch`
bug where SA's derived URL (`/callback`) didn't match the CDK-registered
URL (`/stock-analyser/callback`).

**SSO session cookie** is set by the Hosted UI on the Cognito domain.
Users who sign in via Launchpad are silently re-authenticated by SA and
BT (each finds the cookie and exchanges it for app-specific tokens without
re-prompting). This is the SSO precursor for cross-app navigation.

### 3.5 Control-plane Lambda permission model

**Status: Resolved by #363 control-plane migration**

The former platform control-plane Lambdas (`accounts`, `user`,
`auth/invitations`, `auth/account-provisioning`) were deliberately not gated
during sub-phase 7b.5-beta because their permission model needed dedicated
thought. #363 resolves this by moving live product-level control-plane
behavior to Launchpad-owned Lambdas with route-specific authorization.

The forgot-provider lookup route, account setup route, user
profile/preferences routes, account administration routes, member-management
routes, and invitation creation route are now Launchpad-owned control-plane behavior
(`apps/launchpad/functions/forgot-provider`,
`apps/launchpad/functions/account-provisioning`,
`apps/launchpad/functions/user`, `apps/launchpad/functions/accounts`,
`apps/launchpad/functions/invitations`). The legacy platform copies remain
only for rollback. `/auth/switch` is not migrated because there is no current
Launchpad caller and account switching is handled via `X-Account-Id`.

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
`apps/<app>/contracts/` are forbidden. Both inversions resolved by M7 / PR #301:
- `contracts/budget-tracker/` populated (8 files moved from `apps/budget-tracker/contracts/`); later archived to `docs/archive/contracts-budget-tracker-v0/` by M7 #333 (SC1+SC2 — content was stale)
- `contracts/stock-analyser/` created; `DATA_CONTRACTS.md` moved from `apps/stock-analyser/contracts/`

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
deferred" lint rule violations. 18 of these were from `apps/web-vite-backup/`
and `v0-reference/` ("rule not found" violations from un-discovered
plugin configs). `apps/web-vite-backup/` has been deleted (M7 #250);
the baseline entries from it are now stale and can be removed.

`eslint-plugin-boundaries` is in the lint baseline due to ESLint 10
incompatibility. M7 re-enables once the upstream fix lands.

### 5.2 CI/CD workflows and path filters

**Status: Resolved by M1 #81 (gaps confirmed, fix scoped to M14)**

GitHub Actions workflows in `.github/workflows/`:

- `ci.yml` — PR typecheck, lint, CDK synth
- `cd.yml` — explicit manual full redeploy
- `deploy-platform.yml` — triggers on `platform/infrastructure/**`,
  `infrastructure/bin/platform.ts`, `platform/functions/**`; deploys platform
  substrate only and does not cascade into app workflows
- `deploy-stock-analyser.yml` — triggers on `apps/stock-analyser/**`,
  `apps/stock-analyser/infrastructure/**`, `packages/**`
- `deploy-budget-tracker.yml` — active Budget Tracker deployment;
  triggers on `apps/budget-tracker/**`, `infrastructure/bin/budget-tracker.ts`,
  and package paths consumed by Budget Tracker.
- `deploy-launchpad.yml` - active Launchpad deployment; triggers on
  `.github/workflows/deploy-launchpad.yml`, `apps/launchpad/**`,
  `infrastructure/bin/launchpad.ts`, `infrastructure/lib/**`,
  `platform/config/app-registry.json`, and Launchpad package dependencies.
  It deploys all `Transformotion{Stage}-Launchpad*` stacks.
- `deploy-migration-utilities.yml` — migration utilities deployment; triggers
  on `migration-utilities/**`, `infrastructure/bin/migration-utilities.ts`,
  and package paths consumed by migration utilities.

Verified gaps (M1 #81):

1. **Package path-filter completeness remains worth review.**
   `deploy-budget-tracker.yml` is active and includes the package paths
   consumed by Budget Tracker explicitly rather than a blanket
   `packages/**` filter. M14 remains the right place to verify path
   filter completeness across all deploy workflows.
2. **`platform/functions/**` boundary.** Platform Lambda source moved to
   `platform/functions/**` (M7 / PR #250). `deploy-platform.yml` path
   filter covers platform-owned functions only; app workflows intentionally do
   not trigger on `platform/functions/**` after #363 deployment decoupling.
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
total LOC of tests). Notable: `platform/functions/auth/pre-token-generation/`
has tests; other auth/control-plane Lambdas (`account-provisioning`,
`accounts`, `user`, Launchpad `forgot-provider`) do not. Tests are
non-uniform.

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

CDK stacks — M7 #250 infrastructure split complete:

**Platform stacks** (`platform/infrastructure/`):
- `auth-stack.ts` — Cognito user pool, app clients, groups
- `auth-api-stack.ts` — auth-related API endpoints
- `github-actions-role-stack.ts` — GitHub Actions deploy IAM roles
- `network-stack.ts` — CloudFront, S3, certificates
- `platform-api-stack.ts` — shared API Gateway (the platform gateway
  per Section 2.9); receives `wsApiEndpoint`+`wsApiId` from
  `PlatformWsStack` to wire claude-proxy WSS push
- `platform-tables-stack.ts` — platform DynamoDB tables
- `platform-ws-stack.ts` — `PlatformWsStack`; API Gateway v2 WebSocket
  (`platform-ws-{stage}`), custom Lambda authoriser (Cognito ID token
  via `?token=`; multi-app gate via `?app=`), 4 WS Lambdas
  (`platform-ws-authorizer-{stage}`, `platform-ws-connect-{stage}`,
  `platform-ws-default-{stage}`, `platform-ws-disconnect-{stage}`),
  `platform.ws-connections-{stage}` DynamoDB table. Migrated from
  `apps/budget-tracker/infrastructure/` by M7 / PR #295.
- `storage-stack.ts` — S3 backups bucket

**Launchpad stacks** (`apps/launchpad/infrastructure/`):
- `launchpad-auth-stack.ts` — staged Launchpad-owned Cognito/auth foundation
  (`launchpad-auth-{stage}` User Pool, Hosted UI domain, app clients, groups,
  Hosted UI customisation, social credential secret placeholders,
  Launchpad-owned auth-domain tables, and `launchpad-pre-token-generation-{stage}`).
  Not live until #386 cutover.
- `launchpad-control-plane-stack.ts` — Launchpad-owned control-plane API
  (`launchpad-control-plane-{stage}`), with `GET /health` and
  `POST /auth/lookup-provider`, `POST /auth/setup`,
  `GET /api/user/profile`, `PUT /api/user/preferences`, account
  administration, member-management, and invitation routes. Cognito and shared
  account tables remain platform-owned migration debt until #386.
- Future #386 Launchpad auth-domain stacks belong under
  `apps/launchpad/infrastructure/`, use `Transformotion{Stage}-Launchpad*`
  names, and deploy through `deploy-launchpad.yml`.

**Stock-analyser stacks** (`apps/stock-analyser/infrastructure/`):
- `stock-analyser-api-stack.ts` — Stock Analyser-owned REST API Gateway,
  portfolio, watchlist, analysis-cache, market-data, cycle-data, and
  `stock-analyser-ai-proxy-{stage}` Lambdas
- `stock-analyser-tables-stack.ts` — Stock Analyser data tables, including
  `stock-analyser.job-results-{stage}` after #366
- `sa-ws-stack.ts` — Stock Analyser-owned WebSocket API
  (`stock-analyser-ws-{stage}`), custom Lambda authorizer, connect/default/
  disconnect Lambdas, and `stock-analyser.ws-connections-{stage}`

**Budget-tracker stacks** (`apps/budget-tracker/infrastructure/`):
- `budget-tracker-api-stack.ts` — Budget Tracker-owned REST API Gateway,
  app Lambdas, and `budget-tracker-ai-proxy-{stage}` after #367; receives
  Budget Tracker-owned `wsConnectionsTableName` + `wsApiId` from
  `BudgetTrackerWsStack`
- `budget-tracker-tables-stack.ts`
- `bt-ws-stack.ts` — Budget Tracker-owned WebSocket API
  (`budget-tracker-ws-{stage}`), custom Lambda authorizer, connect/default/
  disconnect Lambdas, and `budget-tracker.ws-connections-{stage}`

Budget Tracker no longer uses `PlatformWsStack` for AI review streaming after
#365 and no longer uses the platform REST API Gateway or platform Claude proxy
for live Budget Tracker runtime after #367. Stock Analyser no longer uses
`PlatformWsStack` for live AI completion notifications after #366. Platform WSS
and platform REST/Claude runtime remain deployed for rollback, any remaining
transitional consumers, and later decommissioning.

There is no `MonitoringStack`. M13 creates it.

There is no shared CDK construct library at `packages/cdk-constructs/`.
Each new Lambda or table reimplements boilerplate. M7 populates
`packages/cdk-constructs/` as part of deduplication.

**CloudFront behaviors and S3 prefix occupancy — current state (post canonical basePath restructure):**

The `NetworkStack` CloudFront distribution has three configured behaviors plus the default:

| Behavior pattern | S3 occupant | Function | Status |
|---|---|---|---|
| Default (`*`) | Launchpad (root) | `IndexRewrite` | Implemented — Launchpad owns `/`, `/sign-in/`, `/signed-out/`, `/launchpad/callback/` — verified M7 #251 |
| `/budget-tracker/*` | BT (`budget-tracker/` prefix) | `IndexRewrite` | Implemented — verified M7 #251 |
| `/stock-analyser/*` | SA (`stock-analyser/` prefix) | `IndexRewrite` | Implemented — verified M7 #251; prefix updated #286 |

Launchpad deploy syncs to S3 root (excluding `stock-analyser/*` and `budget-tracker/*`). Stock Analyser deploys to the `stock-analyser/` prefix. Budget Tracker deploys to `budget-tracker/` prefix. The SPA fallback (403/404 → `/index.html`) serves Launchpad's root page.

**Verified 2026-05-21 (M7 #251):** All three behaviors confirmed live on CloudFront distribution `E1128DYYBLMWYK` (dev.apps.transformotion.com.au). Launchpad confirmed at root — issue #203 closed as resolved.

### 5.7 Environment variables

**Status: Confirmed (verified during initial inventory)**

Approximately 22 environment variables are exposed to the client side
(`NEXT_PUBLIC_*`). Notable:

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
`data.md`, `urls-and-deploy.md`, `cdk.md`) and both app agent guide files
(`apps/stock-analyser/AGENTS.md` / `CLAUDE.md`,
`apps/budget-tracker/AGENTS.md` / `CLAUDE.md`).
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

3. data.md previously referenced analysis-cache type definitions at
   `apps/stock-analyser/contracts/DATA_CONTRACTS.md`. Resolved by M7 / PR #301:
   file moved to `contracts/stock-analyser/DATA_CONTRACTS.md`; data.md reference updated.

**urls-and-deploy.md gaps:**

4. Deploy trigger table for `deploy-stock-analyser.yml` lists three
   path filters but omits `platform/functions/**`. The actual workflow (confirmed
   by M1 #81) included `functions/**` at verification time; that path moved to
   `platform/functions/**` per M7 / PR #250. Table completeness review deferred to M3.

5. Resolved after M5: `deploy-budget-tracker.yml` now performs real CDK
   deployment, static build/sync, and CloudFront invalidation. Any
   remaining work here is path-filter completeness validation, not
   activation of the Budget Tracker deploy workflow.

**cdk.md notes:**

6. `auth.md` documents an `invitations-reconcile` Lambda
   (`POST /auth/reconcile-invitation`) in detail. This Lambda does not
   exist in `platform/functions/auth/` or in any CDK stack — it is part of the
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

There is no `MonitoringStack`. M13 creates it.

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
