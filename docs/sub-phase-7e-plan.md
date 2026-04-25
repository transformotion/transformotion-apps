# Sub-phase 7e — Auth and permissions migration plan

**Status:** In progress — 7e-pretoken pre-token generation Lambda (PR open, awaiting review)  
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
| Cognito groups | `admin`, `stock-app`, `budget-app`, `transformotion`, `family` | `site-admin`, `stock-app-access`, `budget-app-access` |
| Custom attributes | `custom:active_account` (UUID), `custom:accounts` | `custom:active_account` retained as deprecated no-op (Cognito does not permit schema attribute deletion); keep `custom:accounts` (now JSON-stringified map) |
| Pre-token Lambda | None | Injects `apps`, `site_admin`, `accounts` claims + reconciles group membership |
| Auth middleware | `requireGroup(auth, ...groups)` | + `requireSiteAdmin`, `requireAppAccess`, `requireAccountAccess`, `requireAccountOwner` helpers |
| Lambda authorization | `requireGroup` call sites | `requireAppAccess` + `requireAccountAccess` (+ `requireAccountOwner` for ownership ops) |
| Invitation Lambda | Creates record, no email, no `perApp` | Full `perApp` model, two entry points, SES email, transactional redemption |
| Launchpad tiles | `MOCK_USER` | Reads `apps` claim; three-state tile model |

---

## Sub-sub-phases

### 7e-prep-1 — CDK: new group structure (additive) ✓ complete

Create new Cognito groups in `AuthStack` alongside existing groups:
- `site-admin`, `stock-app-access`, `budget-app-access`

Deprecate `custom:active_account`: Cognito does not permit removing schema attributes once declared in a live user pool, so the attribute remains in the CDK schema as a no-op declaration. No code writes or reads it; Steve's user value has been cleared. The attribute is removed from all app client `readAttributes`/`writeAttributes` lists (this change IS permitted by Cognito).

**Old groups are NOT removed in this step** — they coexist during migration.

After deploy: manually add Steve to `site-admin`, `stock-app-access`, `budget-app-access`.

**Verification:** Steve signs in; `cognito:groups` claim includes both `admin` (old) and `site-admin` (new).

**Observations during execution:**
- Pre-flight found Steve had `custom:active_account` set to `6f28aaa4-9393-40b0-ad14-fe3ed5e325d4`. Cleared via `AdminDeleteUserAttributes` before deploy.
- Initial deploy attempt (PR #51 merge) failed: CDK attempted to delete the `custom:active_account` schema attribute, which Cognito rejected with "Existing schema attributes cannot be modified or deleted." The stack rolled back cleanly (`UPDATE_ROLLBACK_COMPLETE`); no production impact. New groups were also rolled back.
- PR #52 corrected the approach: `active_account` is retained in the CDK schema as a deprecated no-op; only the app client attribute lists are changed (permitted). `admin` group precedence bumped 1 → 2 so `site-admin` takes 1.

### 7e-prep-2 — Lambda-layer: dual-gate authorization ✓ complete

Update `requireGroup` calls in Lambda handlers to accept both old and new group names. Transitional — allows the migration to proceed without locking out existing access.

Search codebase for `requireGroup` before starting; expect call sites in:
- `apps/stock-analyser/functions/portfolio`
- `apps/stock-analyser/functions/watchlist`
- `apps/stock-analyser/functions/analysis-cache`
- `functions/claude-proxy`
- All Budget Tracker Lambda handlers
- Platform Lambdas once they receive auth gating (Issue #42)

Pattern for stock handlers: `requireGroup(auth, 'stock-app', 'admin', 'stock-app-access', 'site-admin')` — temporarily broad.  
Pattern for budget handlers: `requireGroup(auth, 'budget-app', 'admin', 'budget-app-access', 'site-admin')`.  
Pattern for claude-proxy: `requireGroup(auth, 'stock-app', 'budget-app', 'admin', 'stock-app-access', 'budget-app-access', 'site-admin')`.

**Observations during execution:**
- Pre-flight scanned for all `requireGroup` call sites. The string `'admin'` also appears in TypeScript type definitions (`role: 'owner' | 'admin' | 'member'`) in frontend/package files — these are account role types, not Cognito group checks; no dual-gating needed there.
- 10 handlers updated: 3 Stock Analyser (`portfolio`, `watchlist`, `analysis-cache`), 6 Budget Tracker (`transactions`, `settings`, `rules`, `migrate`, `export`, `ai`), 1 shared (`claude-proxy`).
- Pre-existing test failures on Windows (`vitest` not found) confirmed unrelated to this change.

### 7e-account-bootstrap — Account bootstrap + -v2 table rename ✓ complete (2026-04-25)

Brought orphan -v2 tables under CloudFormation management via `cdk import`. Created new per-app accounts (`stock-signal` accountId: `a03f9cd4`, `budget-tracker` accountId: `aed9dcdf`). Migrated 7 portfolio + 6 watchlist rows to new no-suffix tables with new accountIds. Rewrote 10 budget-tracker.settings rows. Deleted old shared account (6f28aaa4), debug account (fc2f6a09), cleared `custom:accounts`. Reverted UNBLOCK-WORKAROUND — PlatformApi now uses proper cross-stack prop for analysis-cache. -v2 tables destroyed.

### 7e-pretoken — Pre-token generation Lambda ⟳ in progress (PR open, awaiting review)

Write and deploy `functions/pre-token-generation`. Register as Cognito pre-token-generation trigger in `AuthStack`.

Responsibilities per [auth.md](/docs/architecture/auth.md#pre-token-generation-lambda). Key points:
- Reads `platform.account-members` to derive authoritative app access from account membership
- Calls `AdminAddUserToGroup` / `AdminRemoveUserFromGroup` to reconcile Cognito group membership with account membership (accounts are the authoritative source)
- Injects claims: `apps` (JSON-stringified `string[]`), `site_admin` (string `"true"`/`"false"`), `accounts` (JSON-stringified map of appSlug → `[{accountId, role}]`)

**Verification:** Steve signs in; ID token decoded at `jwt.io` shows `apps`, `site_admin`, `accounts` claims with correct JSON values.

**Observations during execution:**
- The `functions/` directory was reorganised: `invitations`, `first-login`, and `forgot-provider` moved to `functions/auth/` subdirectory. `first-login` renamed to `account-provisioning` (the name was misleading — this Lambda provisions accounts on signup, it is not a Cognito first-login trigger). Lambda function name changes from `transformotion-first-login-{stage}` to `transformotion-account-provisioning-{stage}`, causing a CloudFormation Lambda replacement; brief `POST /auth/setup` unavailability during deploy is expected and acceptable.
- `pnpm-workspace.yaml` updated to include `functions/auth/*`.
- `platform.account-members` does not carry `appSlug`. The pre-token Lambda uses two DynamoDB calls: `QueryCommand` on `userId-index` to get memberships, then `BatchGetCommand` on `platform.accounts` to resolve `appSlug` per account. No schema change required.
- Cognito admin calls (add/remove group) are wrapped in per-call try/catch so individual Cognito errors log and continue rather than crashing the entire claim construction.
- 10 unit tests all pass.

### 7e-auth-middleware-extend

Extend `packages/lambda-middleware` to parse the new claims and expose authorization helpers:
- `auth.apps` — from `apps` custom claim; parsed type is `string[]`
- `auth.siteAdmin` — from `site_admin` claim; parsed as boolean
- `auth.accounts` — from `accounts` custom claim; parsed type is `Record<appSlug, Array<{accountId: string, role: string}>>`
- `requireSiteAdmin(auth)` helper
- `requireAppAccess(auth, appSlug)` helper — no role parameter (Dimension A is binary)
- `requireAccountAccess(auth, appSlug, accountId, minRole?)` helper
- `requireAccountOwner(auth, appSlug, accountId)` helper

Keep existing `auth.groups` and `requireGroup` for the transitional period.

This sub-sub-phase is independent of `7e-pretoken` and can run in parallel.

### 7e-lambda-authorization-migration

Replace `requireGroup` calls with the appropriate helper across all Lambda handlers:
- Entry-point check (app access): `requireAppAccess(auth, appSlug)` — no role parameter
- Account-scoped operations (read/write): `requireAccountAccess(auth, appSlug, accountId)` — no minRole for standard reads/writes
- Elevated operations (e.g. bulk delete, settings wipe): `requireAccountAccess(auth, appSlug, accountId, 'manager')` with minRole
- Ownership operations (transfer, account deletion): `requireAccountOwner(auth, appSlug, accountId)`
- Admin-only platform ops: `requireSiteAdmin(auth)`

For account-scoped handlers: call `requireAccountAccess` before every DynamoDB query, not just at the handler entry point.

This sub-sub-phase depends on `7e-auth-middleware-extend` completing first.

### 7e-invitation-api

Significantly extend `functions/invitations` to implement the full invitation model from [auth.md](/docs/architecture/auth.md#invitation-flow):
- Two creation endpoints: `POST /admin/invitations` (site-admin only, cross-app) and `POST /apps/{appSlug}/invitations` (scoped to caller's app access)
- Two listing endpoints matching the same scope split
- Cancellation endpoint: `DELETE /invitations/{invitationId}`
- `perApp` field on invitation records: map of appSlug → `{ accountType: 'new-personal-account' | 'join-existing', accountId?, role }` — no `groupRole` field (Dimension A is binary; group membership is derived from account membership by the pre-token Lambda)
- Add `status-index` GSI to `platform.invitations` table (partition key `status`, sort key `expiresAt`) for expiry scan
- Scheduled Lambda to mark expired invitations `expired` (EventBridge rule, daily)
- SES email delivery with redemption link containing signed token
- Transactional redemption via `DynamoDBClient.send(TransactWriteItemsCommand)`: mark invitation `redeemed`, create/update account membership records, update `custom:accounts` attribute, add user to Cognito groups — all or nothing

### 7e-invitation-ui

Two UI entry points for creating invitations:
1. **Launchpad admin panel** (`site-admin` only): cross-app invitation form covering all apps and all `perApp` assignment options
2. **In-app invite UI** (per-app, for users with `manager` or `owner` role in an account): scoped to the current app; can only invite to accounts the caller owns or manages

Both UIs call the corresponding creation endpoint (`/admin/invitations` or `/apps/{appSlug}/invitations`). The in-app form is added to Stock Analyser and Budget Tracker settings/members screens as appropriate.

### 7e-signup-reconciliation

New Lambda `functions/reconcile-invitation` serving `POST /auth/reconcile-invitation`.

Reads `invitation=<token>` from the OAuth callback (passed as query parameter by the Launchpad callback handler), validates the invitation, and executes a single `TransactWriteItemsCommand` that:
1. Creates account record (`new-personal-account`) or writes membership record (`join-existing`) for each app in `perApp`
2. Updates `custom:accounts` attribute via `AdminUpdateUserAttributes` (JSON-stringified map)
3. Marks invitation status `redeemed`

Group membership (Cognito groups) is NOT set here — the pre-token Lambda derives groups from account membership on next token issue. No `AdminAddUserToGroup` call in reconciliation.

### 7e-launchpad-tiles

Wire real Cognito session into `apps/launchpad` — replace `MOCK_USER`:
- `packages/auth-client` `getAppAccess()` reads `apps` claim from ID token
- Launchpad renders tiles per three-state model (see [auth.md](/docs/architecture/auth.md#three-state-tile-model))
- Tile navigation uses path-relative links (`/stock-signal/`, `/budget-tracker/`)

### 7e-forgot-provider-fix

Fix federated-user lookup bug in `functions/forgot-provider`:
- `AdminGetUser(Username: email)` fails for users whose Cognito username is `Google_{sub}`
- Fix: replace `AdminGetUser` with `ListUsersCommand` filtered by `email = "{email}"` — this works for both native and federated users
- Track fix against the Stabilisation backlog issue

### 7e-cleanup

After all the above sub-sub-phases are verified in dev and deployed to prod:

1. Remove old Cognito groups (`admin`, `stock-app`, `budget-app`, `transformotion`, `family`) from `AuthStack` — 5 groups total
2. Delete `requireGroup` entirely from `packages/lambda-middleware` — all call sites should have been migrated in `7e-lambda-authorization-migration`
3. Remove `auth.groups` from the parsed auth context if no consumers remain
4. Verify `docs/architecture/auth.md` matches deployed reality: walk through each section and confirm it reflects the live system
5. Confirm `docs/architecture/data.md` accurately reflects all deployed tables and GSIs (including `status-index` on `platform.invitations`)
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
