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
| `POST /accounts` | accounts | ~~withAuth~~ → `withAuthOnly` | `auth-only` (creator-owns) | **ruling #4 CONFIRMED & FIXED: withAuth forced X-Account-Id via resolveAccountContext; create has no account → switched handler to withAuthOnly** | Resolved | **PR-6A** |
| `GET /accounts/{accountId}` | accounts | ad-hoc `members.some` + 404 leak → `requireAccountMember` | `requireAccountAdmin(account-member)` | R1 — account metadata (app selectors); uniform-deny (existence not probeable) | **ruling #3: any member** | **PR-6A** |
| `GET /accounts/{accountId}/members/detail` | accounts | *(new route)* | `requireAccountAdmin(account-member)` | **R2 — full ListAccountMembersResponse (isLastOwner; pendingInvitations:[] until Phase 8)**; v0 account-management-view target; displayName enrichment (D6) deferred | **ruling #3: any member** | **PR-6A** |
| `GET /accounts/{accountId}/members` | accounts | ad-hoc `members.some` (unchanged) | *(legacy thin — superseded by `/members/detail`)* | legacy thin list; unwired-to-UI; retire once `/members/detail` is the sole reader (see §8 retirement map) | legacy / retire | unwired |
| `PUT /accounts/{accountId}` | accounts | ad-hoc `ownerId===userId` → owner-or-manager | `requireAccountAdmin(account-owner-or-manager)` + field-guard | R3 — account settings; manager+owner write `{name}`; `ownerId`/billing owner-only (ruling #2 field-guard) | **ruling #2: owner-or-manager** | **PR-6A** |
| `DELETE /accounts/{accountId}` | accounts | withAuthOnly + ad-hoc owner | `requireAccountAdmin(owner)` + sole-owner deletion (D9 §9.3) + GlobalSignOut | destructive | Status-uncertain-resolved | **Phase 6 / PR-6B** |
| `DELETE /accounts/{accountId}/members/{userId}` | accounts | withAuthOnly + ad-hoc | `requireAccountAdmin(anyOf(owner-or-manager + last-owner-guard, supervisory-site-admin))` + GlobalSignOut | remove member | Aspirational (manager-removal rules never built) | **Phase 6 / PR-6B** |
| `POST /accounts/{accountId}/invitations` | invitations | withAuth + ad-hoc `ownerId===userId` | `requireAccountAdmin(owner-or-manager / canCreateInvitationGrant)` | legacy single-invite | Aspirational (owner/manager in-app invite never built) | **Phase 8** (bundles) |
| `GET /api/admin/...access-summary` (access-summary) | access-summary | requireSiteAdmin (claim) | `requireAccountAdmin(supervisory-site-admin)` | directory read; app-admin app-scope = Phase 7 | Confirmed (extended P7) | PR-B |
| `GET /api/admin/ai-runtime-config` | ai-runtime-config | requireSiteAdmin | `operational-config` (supervisory-site-admin read) | platform AI config | Confirmed | PR-B / PR-C |
| `PUT …/ai-runtime-config/platform-default` | ai-runtime-config | requireSiteAdmin | `operational-config` (site-admin **default**, D9) | platform default | Confirmed | PR-B / PR-C |
| `PUT/DELETE …/ai-runtime-config/apps/{appSlug}/override` | ai-runtime-config | requireSiteAdmin | `operational-config` → **app-admin override** (D9) | per-app override | Status-uncertain-resolved | **PR-C** |

> **Phase-6 split (launchpad `accounts` handler).** The `accounts` Lambda was deferred whole from PR-B (its ad-hoc `ownerId===userId` / `members.some` checks were never a site-admin bypass, so PR-B's D9 goal was met without it). Phase 6 migrates it in two PRs: **PR-6A** (this PR) does the non-destructive reads + name + loader wiring — R1 `GET /accounts/{accountId}`, R2 the new `GET …/members/detail`, R3 `PUT …` with the field-guard, and R7 the `withAuthOnly` fix; **PR-6B** does the destructive mutations — `removeMember` and `deleteAccount` with `requireAccountAdmin`, last-owner/sole-owner guards, and `AdminUserGlobalSignOut`. `access-summary` (site-admin) and the `/api/user/*` self routes are correct as-is.

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

## 7. Role model & Phase-6 decisions (PR-6A)

### (a) Role model (canonical, owner-settled)

`owner > manager > member/viewer`. An actor may only manage roles **strictly
below** their own.

- **Owner** — full control: change any role, remove anyone (bounded only by the
  last-owner floor); ownership transfer is deferred (see R6).
- **Manager** — change roles **within `{member, viewer}`**, remove members/viewers,
  and **may self-demote** (manager → member/viewer). MAY NOT create, modify, or
  remove another manager or an owner; MAY NOT promote anyone to manager or owner.
- **Member / viewer** — no management powers.

Removal symmetry (keep remove + role-change aligned): a manager may remove
members/viewers only; only an **owner** removes or demotes a manager or owner;
manager self-removal/self-demote is allowed (still subject to the last-owner floor).

### (b) Multi-owner affirmation

Multi-owner is **permitted** at the contract + policy-helper level. The last-owner
guard is a **FLOOR** (an account must retain ≥1 owner; never zero) — **NOT a cap**.
No product path that **creates a second owner** or **transfers ownership** is built
yet; it is deferred with role-change (R6). In practice every account has exactly one
owner because no feature mints another. This is intentional, not an oversight — do
not add a single-owner cap, and do not change `decideLastOwnerGuard` /
`decideRoleChange` to enforce `=1`.

### (c) `decideRoleChange` correction (carried into PR-6B)

`packages/lambda-middleware/src/policy.ts:decideRoleChange` is currently **broader
than the model in (a)**: its manager branch allows `member→manager` promotion and
editing peer managers (it only denies `newRole==='owner'` and changing an existing
owner). It has **zero callers** today (role-change route is not built). When **PR-6B**
wires `PUT /accounts/{accountId}/members/{userId}/role`, `decideRoleChange` MUST be
tightened to: manager may act only when **both** `currentTargetRole ∈ {member,viewer}`
**and** `newRole ∈ {member,viewer}`; deny otherwise. Plus a **handler-level
self-demote carve-out** (actor === target may lower their own role) and the **R5
self-removal carve-out** (a manager may remove themselves; last-owner floor still
applies). `decideLastOwnerGuard` is floor-based and correct as-is.

### (d) Phantom-resolution note (6A0)

The missing **"Admin"** menu entry on the live launchpad is **EXPECTED, not a
regression** — the admin UI / nav shell is unmerged (it lives in the v0 repo), so
nothing sits behind the site-admin gate yet. 6A0 group-derivation is **verified
correct** on a real native-array `cognito:groups` token (`siteAdmin=true` end-to-end,
confirmed via fresh-incognito console). `parseCognitoGroups`, the `site_admin` claim
removal, and the group-derivation are confirmed correct.

### (e) Legacy-row retirement map (`launchpadRoutes`)

A future collapse is a **real migration with a tail**, NOT a clean delete — roughly
half of `launchpadRoutes` is PERMANENT and still consumed.

| Legacy route | Retires when | Owning PR |
|---|---|---|
| `GET /accounts/{accountId}/members` (thin) | `/members/detail` is the sole reader | retireable as of **PR-6A** (successor shipped) |
| `DELETE /accounts/{accountId}/members/{userId}` | API-table policy version + GlobalSignOut ships | **PR-6B** |
| `PUT /accounts/{accountId}` / `DELETE /accounts/{accountId}` | 6A/6B successors live + zero consumers | **PR-6A (PUT) / PR-6B (DELETE)** |
| `POST` / `GET /accounts/{accountId}/invitations` (single-invite) | bundle routes ship | **Phase 8** |
| **PERMANENT — not retirement candidates** (distinct responsibility, still consumed): `/health`, `/auth/lookup-provider`, `/auth/setup`, `/api/user/profile`, `/api/user/preferences`, `GET /api/admin/ai-runtime-config`, `PUT …/platform-default`, and `GET /accounts/{accountId}` (account-metadata for selectors). | — | — |

(See the full read-only legacy-route audit for per-row successor / shape-conflict /
consumer data.)

## 8. auth.md verification summary (feeds the revision map)

- **Confirmed:** all SA/BT data routes; user self routes; ws-authorizer claims check; access-summary site-admin; auth/setup; lookup-provider public.
- **Aspirational-never-built:** owner/manager in-app invitations (invitations handler is owner-only single-invite, not the bundle model); manager member-removal rules; site-admin write of per-account AI config (was permitted by `requireSiteAdmin` but contradicts D9 — corrected via PR-C).
- **Status-uncertain-resolved:** analysis-cache write row-check (added); member-list/account-metadata visibility (ruling #3); ai-config read tier (PR-C); createAccount account-context requirement (ruling #4).
