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
| `GET /accounts/{accountId}` | accounts | withAuth + ad-hoc `members.some` | `requireAccountAdmin(account-member)` | account metadata; used by app selectors | **ruling #3: any member** | **Phase 6** † |
| `GET /accounts/{accountId}/members` | accounts | withAuth + ad-hoc `members.some` | `requireAccountAdmin(account-member)` | member list | **ruling #3: any member** | **Phase 6** † |
| `PUT /accounts/{accountId}` | accounts | withAuth + ad-hoc `ownerId===userId` | `requireAccountAdmin(account-owner-or-manager)` | account settings | **ruling #2: owner-or-manager** | **Phase 6** † |
| `DELETE /accounts/{accountId}` | accounts | withAuth + ad-hoc owner | `requireAccountAdmin(owner)` + sole-owner deletion (D9 §9.3) | destructive | Status-uncertain-resolved | **Phase 6** (mutation) |
| `DELETE /accounts/{accountId}/members/{userId}` | accounts | withAuth + ad-hoc | `requireAccountAdmin(anyOf(owner-or-manager + last-owner-guard, supervisory-site-admin))` | remove member | Aspirational (manager-removal rules never built) | **Phase 6** (mutation) |
| `POST /accounts/{accountId}/invitations` | invitations | withAuth + ad-hoc `ownerId===userId` | `requireAccountAdmin(owner-or-manager / canCreateInvitationGrant)` | legacy single-invite | Aspirational (owner/manager in-app invite never built) | **Phase 8** (bundles) |
| `GET /api/admin/...access-summary` (access-summary) | access-summary | requireSiteAdmin (claim) | `requireAccountAdmin(supervisory-site-admin)` | directory read; app-admin app-scope = Phase 7 | Confirmed (extended P7) | PR-B |
| `GET /api/admin/ai-runtime-config` | ai-runtime-config | requireSiteAdmin | `operational-config` (supervisory-site-admin read) | platform AI config | Confirmed | PR-B / PR-C |
| `PUT …/ai-runtime-config/platform-default` | ai-runtime-config | requireSiteAdmin | `operational-config` (site-admin **default**, D9) | platform default | Confirmed | PR-B / PR-C |
| `PUT/DELETE …/ai-runtime-config/apps/{appSlug}/override` | ai-runtime-config | requireSiteAdmin | `operational-config` → **app-admin override** (D9) | per-app override | Status-uncertain-resolved | **PR-C** |

> **† PR-B scope boundary (launchpad `accounts` handler).** The `accounts` Lambda co-locates the read/settings routes above with the **member-management mutation** routes (`removeMember`, `deleteAccount`) that are explicitly **Phase 6**, plus `createAccount`. Migrating it onto `requireAccountAdmin` is done as **one coherent pass in Phase 6** rather than partially in PR-B, to avoid touching the Phase-6 mutation paths in this security PR. Its current ad-hoc checks (`ownerId===userId`, `members.some`) are **not** a site-admin bypass — they already gate on ownership/membership — so the D9 site-admin-bypass-removal goal is fully met by PR-B without them. The rulings above are recorded as the authority for that Phase-6 migration. `access-summary` (site-admin) and the `/api/user/*` self routes ARE correct as-is and need no migration.

## 4. Non-REST-route functions (no route classification; documented for completeness)

| Function | Type | Auth mechanism | Notes |
|---|---|---|---|
| SA/BT `ws-authorizer` | ws-authorizer | jwtVerify + `accountId ∈ token.accounts[app]` (claims membership) | WS-handshake equivalent of `requireAccountData.read`; **no site-admin branch** — Confirmed |
| SA/BT `ws-connect` / `ws-disconnect` / `ws-default` | post-authorizer | consume authorizer context | no independent auth decision |
| SA/BT `ai-proxy` | internal-invoke | none (sync Lambda invoke) | caller (data route) already gated; not API-exposed |
| BT `budget-ai/review-worker` | internal-invoke | none (async Event invoke) | dispatched by reviewStart after its gate |
| SA `cycle-check` | health | none | returns 200; no account data |

---

## 5. Owner rulings — RESOLVED (2026-06-12)

> Adjudicated by owner before the bulk migration. Recorded here as the authority for PR-B.

1. **BT AI routes — `POST /ai/review`, `POST /ai/csv-analysis` (budget-ai).** **RULING: member-tier (`requireAccountData.write` semantics)** — claims + live membership row, **viewer rejected**. Running AI consumes provider cost and writes a job row; viewers stay read-only. *Implementation note: budget-ai gains a membership loader + `dynamodb:GetItem` grant on `launchpad-account-members-{stage}` (it previously had claims only).*

2. **`PUT /accounts/{accountId}` (updateAccount).** **RULING: owner-or-manager** → `requireAccountAdmin(account-owner-or-manager)`. Managers may edit account settings (matrix default). *Field-guard caveat: owner-or-manager applies to general account settings ONLY. Ownership and billing fields (e.g. `ownerId`, ownership transfer) remain owner-only and MUST be enforced via a field-level guard inside the Phase-6 updateAccount handler. A manager must not be able to PUT a change to `ownerId`.*

3. **`GET /accounts/{accountId}` and `GET …/members`.** **RULING: any active member** → `requireAccountAdmin(account-member)`. Any active member may view their account's metadata + member list.

4. **`POST /accounts` under `withAuth` (createAccount).** Verify during migration whether account creation wrongly requires an `X-Account-Id` (should be `withAuthOnly`). Not a policy ruling — a code-fact check; if confirmed a latent bug, fix in PR-B, else note.

---

## 6. Deletion & sweep scope (PR-B)

- **`requireAccountAccess` — DELETE.** 14 callers (all SA/BT app-data handlers above) migrate to `requireAccountData`. Zero callers remain → helper deleted from `packages/lambda-middleware/src/auth.ts`.
- **`requireAccountOwner` — DELETE.** **0 callers** in the repo (launchpad uses ad-hoc `ownerId` checks, migrated to `requireAccountAdmin(owner…)`). Clean delete.
- **`requireAppAccess` — RETAINED**, but no longer on app-data routes: `requireAccountData.read/write` checks `accounts[app]` membership, which subsumes app entitlement. Its site-admin branch therefore no longer sits on any app-data path. (Still used by `requireAnyAppAccess`/legacy; not in scope to delete.)
- **Pre-token Lambda (D11.1):** remove the site-admin group-retention override in `reconcileInvariant` — the invariant applies uniformly; the `site-admin` Cognito group drives supervisory surfaces only. (M16 Phase 6 additionally removes the `site_admin` token claim — admin status is read from the group.)
- **Group-based admin sweep (#416):** `cognito:groups` site-admin fallback already removed in PR-A (auth-client). PR-B confirms no remaining group-based authorization in backend handlers (only `requireSiteAdmin`, which reads the `siteAdmin` claim — Confirmed, not group-based).

## 7. auth.md verification summary (feeds the revision map)

- **Confirmed:** all SA/BT data routes; user self routes; ws-authorizer claims check; access-summary site-admin; auth/setup; lookup-provider public.
- **Aspirational-never-built:** owner/manager in-app invitations (invitations handler is owner-only single-invite, not the bundle model); manager member-removal rules; site-admin write of per-account AI config (was permitted by `requireSiteAdmin` but contradicts D9 — corrected via PR-C).
- **Status-uncertain-resolved:** analysis-cache write row-check (added); member-list/account-metadata visibility (ruling #3); ai-config read tier (PR-C); createAccount account-context requirement (ruling #4).
