# M16 Route Classification (Phase 5 / ADR D9)

**Status:** Draft for owner adjudication — produced as the first artifact of Phase 5 PR-B, *before* the bulk route migration, so disagreements surface here rather than inside a large diff (per owner instruction).
**Date:** 2026-06-12
**Consumes:** ADR v1.3 D5/D8/D9/D11/D12; permissions model §6.3 matrix, §8 discovery, §10 settings; #416 rulings.

This table is the **security-review artifact** for the site-admin-bypass removal (ADR D9): every existing route is mapped to its new middleware. It doubles as the **auth.md verification sweep** (CONTRIBUTING §8 tags). Completeness over speed.

## Legend

**New middleware / policy**
- `requireAccountData(app).read` — D9 data tier, claims-only membership (viewer **allowed**). **No site-admin branch.**
- `requireAccountData(app).write` — D9 data tier, claims + live row read; viewer / disabled / missing → 403. **No site-admin branch.**
- `requireAccountAdmin(policy)` — D9 admin tier (Launchpad control plane); target-resolved table policy.
- `auth-only` — authenticated, self-scoped (no account target).
- `public` — no auth.
- `operational-config` — D9 administrative-axis service config (site-admin default / app-admin override); grants no account-data access.
- `ws-authorizer` / `internal-invoke` / `health` — non-REST-route Lambdas.

**auth.md verification tag** (CONTRIBUTING §8): `Confirmed` · `Aspirational-never-built` · `Status-uncertain-resolved`.

**Migrates in:** which phase actually swaps the guard. PR-B = this phase. Phase 6/8/9 = deferred mutation/invitation/redemption surfaces (out of Phase 5 scope). PR-C = AI-config rehoming.

---

## 1. Stock Analyser — app-data routes (`requireAccountData('stock-analyser')`)

| Route | Handler | Current guard | New middleware | Row-class / notes | Tag | Migrates |
|---|---|---|---|---|---|---|
| `GET /cycle-data` | cycle-data | requireAppAccess + requireAccountAccess(member) | `requireAccountData.read` | account-scoped read | Confirmed | PR-B |
| `GET /market-data` | market-data | requireAppAccess + requireAccountAccess(member) | `requireAccountData.read` | account-scoped read | Confirmed | PR-B |
| `GET /portfolio` | portfolio | …+ requireAccountAccess(member) | `requireAccountData.read` | account-shared read | Confirmed | PR-B |
| `POST/PATCH/DELETE /portfolio` | portfolio | …+ requireAccountWrite | `requireAccountData.write` | account-shared write | Confirmed | PR-B |
| `GET /watchlist` | watchlist | …+ requireAccountAccess(member) | `requireAccountData.read` | account-shared read | Confirmed | PR-B |
| `POST/PATCH/DELETE /watchlist` | watchlist | …+ requireAccountWrite | `requireAccountData.write` | account-shared write | Confirmed | PR-B |
| `GET /analysis-cache/{key}` | analysis-cache | …+ requireAccountAccess(member) | `requireAccountData.read` | account-scoped cache read | Confirmed | PR-B |
| `PUT/DELETE /analysis-cache/{key}` | analysis-cache | …+ requireAccountAccess(member) **only** | `requireAccountData.write` | **cache WRITE currently has no row-check** — write tier adds it | Status-uncertain-resolved | PR-B |
| `GET /settings` | settings | …+ requireAccountAccess(member) | `requireAccountData.read` | **D12 user-scoped** `SK=USER#{userId}#PREFERENCES` | Confirmed | PR-B |
| `PATCH /settings` | settings | …+ requireAccountAccess(member) | `requireAccountData.read` **+ handler SK-owner match** | **D12 user-scoped: viewer MAY write OWN prefs** — NOT `.write` (which rejects viewer) | Confirmed | PR-B |
| `GET /ai-config` | settings | …+ requireAccountAccess(member) | `operational-config` (read) | effective AI config; retiring | Status-uncertain-resolved | PR-C |
| `PUT/DELETE /ai-config/override` | settings | …+ **requireSiteAdmin** | `operational-config` → **app-admin** (D9) | per-account `APP#AI_RUNTIME`; **rehomed app-level** | Aspirational-never-built (site-admin write of account config) | PR-C |

## 2. Budget Tracker — app-data routes (`requireAccountData('budget-tracker')`)

| Route | Handler | Current guard | New middleware | Row-class / notes | Tag | Migrates |
|---|---|---|---|---|---|---|
| `GET /api/budget/v1/transactions` | budget-transactions | …+ requireAccountAccess(member) | `requireAccountData.read` | account-shared read | Confirmed | PR-B |
| `POST(bulk)/PATCH/DELETE …/transactions` | budget-transactions | …+ requireAccountWrite | `requireAccountData.write` | account-shared write | Confirmed | PR-B |
| `GET /api/budget/v1/rules` | budget-rules | …+ requireAccountAccess(member) | `requireAccountData.read` | account-shared read | Confirmed | PR-B |
| `POST/PATCH/DELETE …/rules` | budget-rules | …+ requireAccountWrite | `requireAccountData.write` | account-shared write | Confirmed | PR-B |
| `GET /api/budget/v1/budget-data` | budget-data | …+ requireAccountAccess(member) | `requireAccountData.read` | account-shared read | Confirmed | PR-B |
| `PATCH /api/budget/v1/budget-data` | budget-data | …+ requireAccountWrite | `requireAccountData.write` | account-shared write | Confirmed | PR-B |
| `GET /api/budget/v1/settings` | budget-settings | …+ requireAccountAccess(member) | `requireAccountData.read` | **D12 account-shared** `SK=settingKey` | Confirmed | PR-B |
| `PATCH /api/budget/v1/settings` | budget-settings | …+ requireAccountWrite | `requireAccountData.write` | **D12 account-shared → viewer rejected** | Confirmed | PR-B |
| `GET /api/budget/v1/business-export` | budget-export | …+ requireAccountAccess(member) | `requireAccountData.read` | export = read tier | Confirmed | PR-B |
| `POST /api/budget/v1/ai/review` | budget-ai | …+ requireAccountAccess(member) | **see Needs-owner-ruling #1** | AI action; not a data mutation | Status-uncertain | **HOLD** |
| `POST /api/budget/v1/ai/csv-analysis` | budget-ai | …+ requireAccountAccess(member) | **see Needs-owner-ruling #1** | AI action | Status-uncertain | **HOLD** |
| `GET /api/budget/v1/ai-config` | budget-ai-config | …+ requireAccountAccess(member) | `operational-config` (read) | effective AI config; retiring | Status-uncertain-resolved | PR-C |
| `PUT/DELETE …/ai-config/override` | budget-ai-config | …+ **requireSiteAdmin** | `operational-config` → **app-admin** (D9) | per-account `AI_CONFIG#APP#budget-tracker`; **rehomed app-level** | Aspirational-never-built | PR-C |

## 3. Launchpad — control-plane routes

| Route | Handler | Current guard | New middleware | Notes | Tag | Migrates |
|---|---|---|---|---|---|---|
| `POST /auth/lookup-provider` | forgot-provider | none (generic OK) | `public` | no enumeration oracle | Confirmed | PR-B (doc only) |
| `POST /auth/setup` | account-provisioning | withAuthOnly | `auth-only` (self bootstrap) | D11 profile bootstrap | Confirmed | PR-B (doc only) |
| `GET /api/user/profile` | user | withAuthOnly | `auth-only` (self) | own profile | Confirmed | PR-B (doc only) |
| `PUT /api/user/preferences` | user | withAuthOnly | `auth-only` (self) | own prefs | Confirmed | PR-B (doc only) |
| `GET /api/user/active-accounts` | user | withAuthOnly | `auth-only` (self) | own selections (D7) | Confirmed | PR-B (doc only) |
| `PUT /api/user/active-accounts/{appSlug}` | user | withAuthOnly + table membership verify | `auth-only` (self) + membership verify (D7) | self-service; verifies own membership | Confirmed | PR-B (doc only) |
| `POST /accounts` | accounts | withAuth | `auth-only` (creator-owns) | **withAuth requires X-Account-Id to CREATE an account — see ruling #4** | Status-uncertain | verify |
| `GET /accounts/{accountId}` | accounts | withAuth + ad-hoc `members.some` | `requireAccountAdmin(account-member)` | account metadata; used by app selectors | **see ruling #3** | PR-B |
| `GET /accounts/{accountId}/members` | accounts | withAuth + ad-hoc `members.some` | `requireAccountAdmin(account-member)` | member list | **see ruling #3** | PR-B |
| `PUT /accounts/{accountId}` | accounts | withAuth + ad-hoc `ownerId===userId` | `requireAccountAdmin(owner-or-manager)` | account settings | **see ruling #2** (manager scope) | PR-B |
| `DELETE /accounts/{accountId}` | accounts | withAuth + ad-hoc owner | `requireAccountAdmin(owner)` + sole-owner deletion (D9 §9.3) | destructive | Status-uncertain-resolved | **Phase 6** (mutation) |
| `DELETE /accounts/{accountId}/members/{userId}` | accounts | withAuth + ad-hoc | `requireAccountAdmin(anyOf(owner-or-manager + last-owner-guard, supervisory-site-admin))` | remove member | Aspirational (manager-removal rules never built) | **Phase 6** (mutation) |
| `POST /accounts/{accountId}/invitations` | invitations | withAuth + ad-hoc `ownerId===userId` | `requireAccountAdmin(owner-or-manager / canCreateInvitationGrant)` | legacy single-invite | Aspirational (owner/manager in-app invite never built) | **Phase 8** (bundles) |
| `GET /api/admin/...access-summary` (access-summary) | access-summary | requireSiteAdmin (claim) | `requireAccountAdmin(supervisory-site-admin)` | directory read; app-admin app-scope = Phase 7 | Confirmed (extended P7) | PR-B |
| `GET /api/admin/ai-runtime-config` | ai-runtime-config | requireSiteAdmin | `operational-config` (supervisory-site-admin read) | platform AI config | Confirmed | PR-B / PR-C |
| `PUT …/ai-runtime-config/platform-default` | ai-runtime-config | requireSiteAdmin | `operational-config` (site-admin **default**, D9) | platform default | Confirmed | PR-B / PR-C |
| `PUT/DELETE …/ai-runtime-config/apps/{appSlug}/override` | ai-runtime-config | requireSiteAdmin | `operational-config` → **app-admin override** (D9) | per-app override | Status-uncertain-resolved | **PR-C** |

## 4. Non-REST-route functions (no route classification; documented for completeness)

| Function | Type | Auth mechanism | Notes |
|---|---|---|---|
| SA/BT `ws-authorizer` | ws-authorizer | jwtVerify + `accountId ∈ token.accounts[app]` (claims membership) | WS-handshake equivalent of `requireAccountData.read`; **no site-admin branch** — Confirmed |
| SA/BT `ws-connect` / `ws-disconnect` / `ws-default` | post-authorizer | consume authorizer context | no independent auth decision |
| SA/BT `ai-proxy` | internal-invoke | none (sync Lambda invoke) | caller (data route) already gated; not API-exposed |
| BT `budget-ai/review-worker` | internal-invoke | none (async Event invoke) | dispatched by reviewStart after its gate |
| SA `cycle-check` | health | none | returns 200; no account data |

---

## 5. Needs owner ruling (HOLD — bulk migration proceeds on the rest)

> Per instruction: routes that resist clean classification are listed here for adjudication; everything else is classified and ready to migrate.

1. **BT AI routes — `POST /ai/review`, `POST /ai/csv-analysis` (budget-ai).** These are **actions** (run AI over the caller's transactions, stream suggestions, create a job row keyed by account) — neither a pure read nor an account-data mutation. They fit neither `.read` (a POST that creates a job) nor cleanly `.write` (they don't mutate stored account data, but gating as write **excludes viewers** from a read-like analysis). **Ruling needed:** is running AI review a **member-tier action** (viewer excluded → `requireAccountData.write` semantics: claims + live row, viewer-reject) or a **viewer-permitted read-like op** (`requireAccountData.read`)? *Recommendation: member-tier (`.write`) — it consumes provider cost and writes a job row; viewers stay read-only.* Marked HOLD pending your call.

2. **`PUT /accounts/{accountId}` (updateAccount) — manager scope.** Code today is **owner-only** (ad-hoc `ownerId===userId`). Matrix §6.3 "Change account settings" = owner **Yes**, manager **"Yes, if allowed"** — the "if allowed" product rule is undefined. **Ruling needed:** may a **manager** edit account settings, or owner-only? *Recommendation: owner-or-manager (matrix default), but confirm.*

3. **`GET /accounts/{accountId}` and `GET …/members` — visibility tier.** Code today allows **any member** to read account metadata + the member list. The matrix is silent on plain-member member-list visibility (only "view users known through managed accounts" = owner/manager). The bundle-visibility rule (D9) says a member list *may* be shown but doesn't say to whom. **Ruling needed:** is the member list visible to **any member** (current) or **owner/manager only**? *Recommendation: any active member can view their own account's members (account-member); confirm.*

4. **`POST /accounts` under `withAuth` (createAccount).** `withAuth` resolves and requires an `X-Account-Id` header — but creating a *new* account has no existing account context. **Verify:** does this route actually require a (stale/arbitrary) `X-Account-Id` to create an account? If so it is a latent bug (should be `withAuthOnly`). Flagged for verification during migration; not blocking.

---

## 6. Deletion & sweep scope (PR-B)

- **`requireAccountAccess` — DELETE.** 14 callers (all SA/BT app-data handlers above) migrate to `requireAccountData`. Zero callers remain → helper deleted from `packages/lambda-middleware/src/auth.ts`.
- **`requireAccountOwner` — DELETE.** **0 callers** in the repo (launchpad uses ad-hoc `ownerId` checks, migrated to `requireAccountAdmin(owner…)`). Clean delete.
- **`requireAppAccess` — RETAINED**, but no longer on app-data routes: `requireAccountData.read/write` checks `accounts[app]` membership, which subsumes app entitlement. Its site-admin branch therefore no longer sits on any app-data path. (Still used by `requireAnyAppAccess`/legacy; not in scope to delete.)
- **Pre-token Lambda (D11.1):** remove the site-admin group-retention override in `reconcileInvariant` — the invariant applies uniformly; `site_admin` claim continues to drive supervisory surfaces only.
- **Group-based admin sweep (#416):** `cognito:groups` site-admin fallback already removed in PR-A (auth-client). PR-B confirms no remaining group-based authorization in backend handlers (only `requireSiteAdmin`, which reads the `siteAdmin` claim — Confirmed, not group-based).

## 7. auth.md verification summary (feeds the revision map)

- **Confirmed:** all SA/BT data routes; user self routes; ws-authorizer claims check; access-summary site-admin; auth/setup; lookup-provider public.
- **Aspirational-never-built:** owner/manager in-app invitations (invitations handler is owner-only single-invite, not the bundle model); manager member-removal rules; site-admin write of per-account AI config (was permitted by `requireSiteAdmin` but contradicts D9 — corrected via PR-C).
- **Status-uncertain-resolved:** analysis-cache write row-check (added); member-list/account-metadata visibility (ruling #3); ai-config read tier (PR-C); createAccount account-context requirement (ruling #4).
