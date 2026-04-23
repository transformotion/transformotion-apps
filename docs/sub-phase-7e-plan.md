# Sub-phase 7e — Auth and permissions migration plan

**Status:** Planning  
**Target architecture:** [/docs/architecture/auth.md](/docs/architecture/auth.md)  
**Ephemeral document:** deleted at 7e-cleanup once the migration is complete and `auth.md` is verified against deployed reality.

---

## Current state (as of 2026-04-24)

**Deployed groups:** `admin`, `stock-app`, `budget-app`, `transformotion`, `family`

**App clients (deployed — three-client model, sub-phase 7b.5-alpha):**
- `LaunchpadAppClient` — social IDPs
- `StockAnalyserAppClient` — Cognito only
- `BudgetTrackerAppClient` — Cognito only

**Pre-token generation Lambda:** Absent. `UserPool.LambdaConfig` is null. No custom claims are injected.

**Auth middleware (`packages/lambda-middleware`):** Supports `requireGroup(auth, ...groups)` — flat string equality check against `cognito:groups`.

**Authorization state per app:**
- Stock Analyser: `requireGroup(auth, 'stock-app', 'admin')` — Lambda-layer gating only
- Budget Tracker: `requireGroup(auth, 'budget-app', 'admin')` — Lambda-layer gating only
- Platform Lambdas (accounts, user, invitations, first-login): ungated (tracked as Issue #42)
- Claude proxy: `requireGroup(auth, 'stock-app', 'budget-app', 'admin')`

**Custom attributes:** `custom:active_account` (singular UUID), `custom:accounts` (comma-separated UUIDs)

**Invitation flow:** `functions/invitations` creates pending invitation records but does not send email, does not include `perApp` field, does not trigger group assignment or account creation on redemption.

---

## Target state delta (current → target)

| Component | Current | Target |
|---|---|---|
| Cognito groups | `admin`, `stock-app`, `budget-app`, `transformotion`, `family` | `site-admin`, `stock-app-view/user/admin`, `budget-app-view/user/admin` |
| Custom attributes | `custom:active_account` (UUID), `custom:accounts` | `custom:active_accounts` (per-app JSON map), `custom:accounts` |
| Pre-token Lambda | None | Injects `apps`, `site_admin`, `accounts` claims |
| Auth middleware | `requireGroup(auth, ...groups)` | + `requireAppAccess`, `requireAccountAccess` helpers |
| Lambda authorization | `requireGroup` call sites | `requireAppAccess` + `requireAccountAccess` |
| Invitation Lambda | Creates record, no email, no `perApp` | Full `perApp` model, SES email, reconciliation on redemption |
| Launchpad tiles | `MOCK_USER` | Reads `apps` claim; three-state tile model |

---

## Sub-sub-phases

### 7e-prep-1 — CDK: new group structure (additive)

Create new three-tier Cognito groups in `AuthStack` alongside existing groups:
- `site-admin`, `stock-app-view`, `stock-app-user`, `stock-app-admin`, `budget-app-view`, `budget-app-user`, `budget-app-admin`

Also add the new `custom:active_accounts` custom attribute to the user pool (string, mutable, maxLen 2048).

**Old groups are NOT removed in this step** — they coexist during migration.

After deploy: manually add Steve to `site-admin`, `stock-app-admin`, `budget-app-admin`.

**Verification:** Steve signs in; `cognito:groups` claim includes both `admin` (old) and `site-admin` (new).

### 7e-prep-2 — Lambda-layer: dual-gate authorization

Update `requireGroup` calls in Lambda handlers to accept both old and new group names. Transitional — allows the migration to proceed without locking out existing access.

Files affected (10+ call sites — search codebase for `requireGroup` before starting):
- `apps/stock-analyser/functions/portfolio`
- `apps/stock-analyser/functions/watchlist`
- `apps/stock-analyser/functions/analysis-cache`
- `functions/claude-proxy`
- All Budget Tracker Lambda handlers
- Platform Lambdas once they receive auth gating (Issue #42)

Pattern: `requireGroup(auth, 'stock-app', 'admin', 'stock-app-user', 'stock-app-admin', 'site-admin')` — temporarily broad.

### 7e-pretoken — Pre-token generation Lambda

Write and deploy `functions/pre-token-generation`. Register as Cognito pre-token-generation trigger in `AuthStack`.

Responsibilities per [auth.md](/docs/architecture/auth.md#pre-token-generation-lambda).

**Verification:** Steve signs in; ID token decoded (`jwt.io`) shows `apps`, `site_admin`, `accounts` custom claims.

### 7e-auth-middleware-extend

Extend `packages/lambda-middleware` to parse the new claims and expose authorization helpers:
- `auth.apps` — from `apps` custom claim
- `auth.siteAdmin` — from `site_admin` claim
- `auth.accounts` — from `accounts` claim
- `requireAppAccess(auth, appSlug, minRole?)` helper
- `requireAccountAccess(auth, appSlug, accountId, minRole?)` helper

Keep existing `auth.groups` and `requireGroup` for the transitional period.

This sub-sub-phase is independent of `7e-pretoken` and can run in parallel.

### 7e-lambda-authorization-migration

Replace `requireGroup` calls with `requireAppAccess` + `requireAccountAccess` across all Lambda handlers.

For account-scoped handlers: add `requireAccountAccess` before every DynamoDB query.

This sub-sub-phase depends on `7e-auth-middleware-extend` completing first.

### 7e-invitation-api

Significantly extend `functions/invitations` to implement the full invitation model from [auth.md](/docs/architecture/auth.md#invitation-flow):
- Add `perApp` field to invitation records
- Authorization: `site-admin` or `{app}-admin` with scope validation
- SES email delivery with redemption link
- Handle `new-personal-account` and `join-existing` account membership types

### 7e-invitation-ui

Launchpad admin UI for creating invitations. Shows a matrix of apps × capability levels × account assignment. Input form scoped to caller's permissions (an `{app}-admin` only sees their app).

### 7e-signup-reconciliation

New Lambda `functions/reconcile-invitation` serving `POST /auth/reconcile-invitation`.

Reads `invitation=<token>` from the OAuth callback, validates the invitation, and for each app in `perApp`:
1. Adds user to the Cognito group (`AdminAddUserToGroup`)
2. Creates account (`new-personal-account`) or adds to existing (`join-existing`)
3. Sets `custom:active_accounts[appSlug]`
4. Marks invitation `redeemed`

### 7e-launchpad-tiles

Wire real Cognito session into `apps/launchpad` — replace `MOCK_USER`:
- `packages/auth-client` `getAppAccess()` reads `apps` claim from ID token
- Launchpad renders tiles per three-state model (see [auth.md](/docs/architecture/auth.md#three-state-tile-model))
- Tile navigation uses path-relative links (`/stock-signal/`, `/budget-tracker/`)

### 7e-forgot-provider-fix

Fix federated-user lookup bug in `functions/forgot-provider`:
- `AdminGetUser(Username: email)` fails for users whose Cognito username is `Google_{sub}`
- Fix: also query `ListUsers` with filter `email = "{email}"` as a fallback
- Track fix against the Stabilisation backlog issue

### 7e-cleanup

After all the above sub-sub-phases are verified in dev and deployed to prod:

1. Remove old Cognito groups (`admin`, `stock-app`, `budget-app`, `transformotion`, `family`) from `AuthStack`
2. Remove old group names from `requireGroup` transitional calls — or delete `requireGroup` if no consumers remain
3. Remove `auth.groups` from middleware if no remaining consumers
4. Verify `docs/architecture/auth.md` matches deployed reality: walk through each section and confirm it reflects the live system
5. Update `docs/architecture/data.md` to confirm `custom:active_accounts` custom attribute is live
6. Delete this file (`docs/sub-phase-7e-plan.md`)

---

## Ordering constraints

```
7e-prep-1
  ↓
7e-prep-2
  ↓
7e-pretoken ─────────────────┐
7e-auth-middleware-extend ───┴─→ 7e-lambda-authorization-migration
                                   ↓
                             7e-invitation-api
                                   ↓
                             7e-invitation-ui + 7e-signup-reconciliation (parallel)
                                   ↓
                             7e-launchpad-tiles
                                   ↓
                             7e-forgot-provider-fix (any time, independent)
                                   ↓
                             7e-cleanup
```

---

## Open decisions

None at this point. All architectural decisions are captured in [auth.md](/docs/architecture/auth.md). Decisions that arise during execution must update `auth.md` before the implementing PR is written.
