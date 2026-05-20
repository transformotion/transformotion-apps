# Authentication and permissions

## Overview

The platform uses AWS Cognito as the single source of identity. Authentication is handled at the Cognito Hosted UI layer; authorization operates in two independent dimensions: **app access** (via Cognito groups) and **account membership** (via DynamoDB records). Dimension A is the ceiling — it determines whether a user can access an app at all. Dimension B determines what they can do within a specific account's data.

A pre-token generation Lambda injects structured claims into every issued token. API handlers and the launchpad consume these claims rather than raw group strings. This means authorization logic is centralised in the token, not duplicated across handlers.

Social identity providers (Google, Facebook, Microsoft) are wired at the Cognito layer. Social sign-in happens only at the launchpad; subsequent app access uses the shared Hosted UI domain session cookie.

See [cdk.md](./cdk.md) for CDK stack names. See [data.md](./data.md) for account and membership table schemas.

---

## Cognito user pool

- **Pool name:** `transformotion-{stage}` (dev / prod)
- **Region:** `ap-southeast-2`
- **Account ID:** `959516291617`
- **Username:** Cognito-generated UUID (`sub`) — not email
- **Sign-in alias:** email address
- **Email:** required; auto-verified

### Password policy

- Minimum 8 characters
- Requires uppercase, lowercase, digits
- Symbols not required
- Temporary password validity: 7 days

### Custom attributes

The Cognito user pool declares these custom attributes:

| Attribute | Type | Status | Purpose |
|---|---|---|---|
| `custom:accounts` | String (max 2048) | Active | Comma-separated account IDs the user belongs to (all apps combined). Maintained by the Lambdas that modify account membership; read by the pre-token Lambda. Not consulted directly by frontend or API handlers. |
| `custom:active_account` | String (max 36) | Inert (writes pending removal) | Currently still written by `account-provisioning` (`/auth/setup` and `/auth/switch`). The writes and the `/auth/switch` route are removed in M8 — they reflect a server-side approach to account switching that has been superseded by client-side switching (X-Account-Id header). The attribute itself remains declared in the user pool schema permanently — Cognito does not permit removal of existing user pool schema attributes — but is inert (no writers, no readers) post-M8. Account switching as a working feature is provided by the client-side header-based design described in *Auth middleware* below. |

**Active account is not a Cognito attribute.** Which account a user is currently viewing in an app is browser-local UI state, persisted in localStorage per-app. API requests include the `accountId` as a request parameter. The auth middleware validates the parameter against the token's `accounts` claim and rejects requests where the caller is not a member of the stated account.

### Token lifetime

| Token | Validity |
|---|---|
| Access token | 1 hour |
| ID token | 1 hour |
| Refresh token | 30 days |

### MFA

Optional TOTP. Users may enrol if they wish; it is not required.

### Account recovery

Email only.

### Lambda triggers

| Trigger | Function | Purpose |
|---|---|---|
| Pre-token generation | `transformotion-pre-token-generation-{stage}` | Injects `apps`, `site_admin`, `accounts` custom claims — see below |

---

## App clients

Three distinct Cognito app clients, one per deployable app. All share the same user pool; SSO works via the shared Hosted UI domain session cookie.

| Client | Serving path | Identity providers | CDK logical ID |
|---|---|---|---|
| `LaunchpadAppClient` | `/`, `/sign-in/*`, `/launchpad/*` | Cognito, Google, Facebook, Microsoft | `LaunchpadAppClient` in `AuthStack` |
| `StockAnalyserAppClient` | `/stock-signal/*` | Cognito only | `StockAnalyserAppClient` in `AuthStack` |
| `BudgetTrackerAppClient` | `/budget-tracker/*` | Cognito only | `BudgetTrackerAppClient` in `AuthStack` |

Social sign-in is enabled on the launchpad client only. Per-app clients are Cognito-only because social identity sessions established at the launchpad propagate via SSO.

**Dev client IDs** (set in GitHub `dev` environment variables after each auth stack deploy):

| Variable | Client |
|---|---|
| `NEXT_PUBLIC_LAUNCHPAD_COGNITO_CLIENT_ID` | LaunchpadAppClient |
| `NEXT_PUBLIC_STOCK_ANALYSER_COGNITO_CLIENT_ID` | StockAnalyserAppClient |
| `NEXT_PUBLIC_BUDGET_TRACKER_COGNITO_CLIENT_ID` | BudgetTrackerAppClient |

**Callback URL convention:** `{host}/{app-slug}/callback`
**Logout URL convention:** `{host}/sign-in`

For current client IDs, read from CloudFormation outputs:

```bash
aws cloudformation describe-stacks \
  --stack-name TransformotionDev-Auth \
  --query "Stacks[0].Outputs[?OutputKey=='BudgetTrackerAppClientId'].OutputValue"
```

---

## Hosted UI domain

```
transformotion-{account}-{stage}.auth.ap-southeast-2.amazoncognito.com
```

For dev: `transformotion-959516291617-dev.auth.ap-southeast-2.amazoncognito.com`

The Hosted UI domain provides the OAuth 2.0 / PKCE flow endpoint for all three app clients and is the redirect target for all social IDPs.

---

## Social identity providers

Google, Facebook, and Microsoft IDPs are registered **manually in the Cognito console** (not managed by CloudFormation, because they were configured before CDK). The `AuthStack` creates Secrets Manager entries to hold credentials and references them via dynamic `{{resolve:secretsmanager:...}}` syntax.

Apple Sign-In has placeholder secrets but is not yet active.

All social IDP callback URIs point to:
```
https://transformotion-959516291617-{stage}.auth.ap-southeast-2.amazoncognito.com/oauth2/idpresponse
```

For setup instructions see `docs/social-idp-setup.md`.

---

## Permission model — two dimensions

### Dimension A: App access (Cognito groups)

Three Cognito groups control app access:

| Group | Grants |
|---|---|
| `stock-app-access` | User has access to Stock Signal |
| `budget-app-access` | User has access to Budget Tracker |
| `site-admin` | Platform-wide admin: can invite anyone to any app; implicit access to all apps at owner level on all accounts |

**Single-tier app access is deliberate.** Capability-level within an app (who can read, write, invite, delete) is expressed entirely by Dimension B (account roles). A user either has access to an app or they do not; *what they can do* within the app is determined by which accounts they belong to and in what role.

**App-access groups are derived from account membership.** The pre-token Lambda enforces the invariant: a user is in `stock-app-access` iff they have at least one Stock Signal account. Same pattern for `budget-app-access`. If the two diverge (e.g., due to manual manipulation or a bug), the pre-token Lambda reconciles by trusting account membership as the authoritative source and updating group membership to match.

**`site-admin` is first-class and explicit.** It is not derived from any other state; it is an explicit Cognito group grant and represents platform-level administrative authority.

> **Migration note:** Currently deployed groups are `admin`, `stock-app`, `budget-app`, `transformotion`, `family`. Target groups (`stock-app-access`, `budget-app-access`, `site-admin`) are introduced in sub-phase 7e-prep-1. During migration both old and new groups coexist; handlers accept either. Old groups (and `transformotion`, `family` which reference features not in current scope) are removed at 7e-cleanup.

### Dimension B: Account membership (DynamoDB)

Accounts are per-app data containers. Each app has its own set of accounts; a user's "Stock Signal account" and "Budget Tracker account" are independent records with independent IDs and independent membership lists.

Account membership is stored in `platform.account-members-{stage}` (PK: `accountId`, SK: `userId`) with a `role` attribute:

| Role | Capability | Allowed multiplicity per account |
|---|---|---|
| `owner` | Full control: read, write, invite others, remove any member, delete the account, transfer ownership | Exactly one |
| `manager` | Full use + can invite; can remove non-owner members (cannot remove the owner or other managers) | Any number |
| `member` | Read and write the account's data | Any number |
| `viewer` | Read-only | Any number |

**Single-owner invariant.** Every account has exactly one owner at all times. Operations that would remove or demote the owner are rejected unless ownership is transferred to another user atomically in the same operation. Site-admin can override to reassign ownership administratively.

**Ownership transfer.** The current owner can transfer ownership to any other member or manager of the account. The previous owner becomes a manager; they can choose to remove themselves afterwards. The account retains exactly one owner throughout.

**Role hierarchy** (for `requireAccountAccess` minRole checks):
`owner > manager > member > viewer`. A check for `minRole: 'manager'` succeeds for `owner` and `manager`; fails for `member` and `viewer`.

### Conflict resolution between dimensions

Dimensions A and B describe different axes and can express potentially conflicting states (e.g., user has app-access but is `viewer` on all accounts; user lacks app-access but somehow has a `member` row).

The resolution rule is: **Dimension A is the ceiling.**

- If a user lacks app-access for Stock Signal (Dimension A), they cannot perform any operation in Stock Signal, regardless of any Dimension B roles they might have on Stock Signal accounts.
- If a user has app-access for Stock Signal (Dimension A), their capability within a specific Stock Signal account is determined entirely by Dimension B (their role on that account).
- Dimension B can only restrict, never grant beyond Dimension A.

In practice: Dimension A governs *whether the user can use the app at all*. Dimension B governs *what operations they can perform on a specific account's data*.

**`site-admin` bypasses both dimensions.** A site-admin user can perform any operation on any app's data on any account, even without explicit app-access group or account membership. Every authorization helper checks site-admin first as an override.

---

## Pre-token generation Lambda

**Function:** `transformotion-pre-token-generation-{stage}`
**Trigger:** Cognito pre-token-generation — invoked on every token issuance (sign-in and refresh).

**Responsibilities:**

1. Read the user's Cognito groups from the event (`event.request.groupConfiguration.groupsToOverride`).
2. Query `platform.account-members-{stage}` for all rows where `userId = <event.userName>` — returns all of the user's account memberships across all apps.
3. **Reconcile the app-access invariant.** For each app slug (`stock-signal`, `budget-tracker`):
   - If user has any accounts for the app but is not in `<app>-access`: call `AdminAddUserToGroup`, update the in-memory group list for claim construction.
   - If user is in `<app>-access` but has no accounts: call `AdminRemoveUserFromGroup`, update the in-memory list.
   - `site-admin` membership overrides the "no accounts" removal — site-admin keeps all access regardless of account memberships.
4. Build the `apps` claim: JSON-stringified array of app slugs the user has access to (derived from reconciled groups plus site-admin override).
5. Build the `accounts` claim: JSON-stringified map of app slug to `[{accountId, role}]`, grouped from the membership query results.
6. Build `site_admin`: the string `"true"` or `"false"` (Cognito requires claim values to be strings).
7. Set `event.response.claimsAndScopeOverrideDetails.accessTokenGeneration.claimsToAddOrOverride` with the three claims.
8. Also set the same on `idTokenGeneration.claimsToAddOrOverride` so both tokens carry the claims.

**On failure:** Return the event unchanged. Cognito issues tokens without custom claims. Consumers (launchpad, API handlers) fail closed — empty or missing `apps`/`accounts` means the user has no access.

**Latency budget:** One DynamoDB query per token issuance plus zero-to-two `AdminAddUserToGroup` / `AdminRemoveUserFromGroup` calls in the reconciliation step. Invoked only on sign-in and token refresh (roughly every hour per active user, not every API call). Cost and latency are negligible at family-platform scale.

---

## Claim shape

The pre-token generation Lambda injects three custom claims on every token issuance:

```json
{
  "apps": "[\"stock-signal\",\"budget-tracker\"]",
  "site_admin": "false",
  "accounts": "{\"stock-signal\":[{\"accountId\":\"uuid-1\",\"role\":\"owner\"}],\"budget-tracker\":[{\"accountId\":\"uuid-2\",\"role\":\"manager\"}]}"
}
```

The values are JSON-stringified strings (Cognito requires claim values to be primitive strings). Frontend and auth middleware parse the stringified JSON back into objects on receipt.

Logical shape after parsing:

```
apps:       string[]                                     — app slugs the user can access
site_admin: boolean
accounts:   Record<appSlug, Array<{accountId, role}>>   — per-app membership list
```

Plus the standard Cognito claims (`sub`, `email`, `cognito:groups`, token lifetime fields) and the custom attribute `custom:accounts`.

**Launchpad renders tiles by inspecting the `apps` claim.**
**API handlers enforce per-account authorization by inspecting `accounts`.**

---

## Token creation flow (end-to-end)

How a user gets from "not signed in" to "making authenticated API calls":

**Step 1 — Sign-in initiation.** The launchpad app redirects the user's browser to the Cognito Hosted UI:

```
https://transformotion-959516291617-{stage}.auth.ap-southeast-2.amazoncognito.com/login
  ?client_id=<LaunchpadAppClientId>
  &response_type=code
  &scope=openid+email+profile
  &redirect_uri=https://dev.apps.transformotion.com.au/sign-in/callback
  &state=<random-nonce-or-invitation-token>
```

The `state` parameter is arbitrary data the app preserves through the auth flow; Cognito echoes it back unchanged.

**Step 2 — User authenticates.** The Hosted UI presents the sign-in page. The user either:
- Enters email + password → Cognito verifies credentials, or
- Clicks a federated IDP button → redirects to Google / Facebook / Microsoft → returns with user attributes → Cognito creates or updates the federated user record

**Step 3 — Pre-token Lambda fires.** Cognito invokes the pre-token-generation Lambda synchronously. The Lambda runs the reconciliation and claim-building logic described above and returns the enriched event.

**Step 4 — Cognito issues tokens.** Cognito constructs three JWTs signed with its RSA key:
- **ID token** — identity + custom claims; used by the frontend to know who is signed in
- **Access token** — identity + custom claims; sent as `Authorization: Bearer <token>` on API calls
- **Refresh token** — opaque string; used to obtain new access and ID tokens when they expire

**Step 5 — Redirect with code.** Cognito redirects the browser to the callback URL:
```
https://dev.apps.transformotion.com.au/sign-in/callback?code=<auth-code>&state=<original-state>
```

**Step 6 — Code-for-token exchange.** The launchpad's callback handler POSTs the authorization code to Cognito's token endpoint (`/oauth2/token`) with the app client ID. Cognito returns the three tokens as JSON.

**Step 7 — Token storage.** The launchpad stores tokens client-side:
- Access and ID tokens: in-memory (application state)
- Refresh token: handled via the Cognito Hosted UI session cookie set on the Cognito domain

The Hosted UI session cookie is what enables SSO across the three app clients — when the user navigates from the launchpad to Stock Signal, the Stock Signal client's auth flow finds the existing session cookie and silently re-authenticates without re-prompting.

**Step 8 — API calls.** When the frontend calls a Lambda-backed API, it includes the access token in the `Authorization: Bearer <token>` header. API Gateway's Cognito authorizer validates the JWT signature against Cognito's public keys and confirms the token has not expired. The auth middleware in the Lambda handler parses the custom claims (`apps`, `accounts`, `site_admin`) and constructs the `auth` object for the handler to use.

**Step 9 — Token refresh.** Every hour (default access token lifetime), the frontend detects the token is about to expire and calls the refresh endpoint. Cognito invokes the pre-token Lambda again and issues new access + ID tokens. The fresh token reflects any changes to the user's groups or account memberships since the last issuance (up to the 1-hour staleness window).

---

## Three-state tile model

The launchpad renders app tiles based on two conditions:

| User has app in `apps` claim | App is deployed | Tile state |
|---|---|---|
| Yes | Yes | Active — clickable link to app |
| Yes | No | Visible, greyed out, "Coming Soon" label |
| No | Any | Not rendered |

App deployment state is statically known to the launchpad (hardcoded list of deployed app slugs). The `apps` claim controls visibility; deployment state controls interactivity.

---

## Auth middleware (`packages/lambda-middleware`)

The middleware has two layers:

**Middleware wrappers** (`middleware.ts`) — the consumer-facing entry points that wrap Lambda handlers. Two wrappers exist:

| Wrapper | Provides | Use case |
|---|---|---|
| `withAuth(handler)` | `{ auth, account, event }` | JWT + active account context (X-Account-Id header). Most account-scoped handlers. |
| `withAuthOnly(handler)` | `{ auth, event }` | JWT only, no account context. Routes that operate on the user themselves rather than account-scoped data — e.g., user profile reads, first-login flows. |

Both wrappers internally call `extractAuthClaims` to read JWT claims. Consumers do not import `extractAuthClaims` directly; it is the internal extractor for the wrappers.

**Claim-based helpers** (`auth.ts`) — operate on the typed `auth` object that the wrappers provide:

| Property | Type | Source |
|---|---|---|
| `auth.userId` | `string` | Cognito `sub` |
| `auth.email` | `string` | `email` claim |
| `auth.apps` | `string[]` | `apps` custom claim (parsed from JSON string) |
| `auth.siteAdmin` | `boolean` | `site_admin` custom claim (parsed from `"true"`/`"false"`) |
| `auth.accounts` | `Record<string, Array<{accountId: string, role: string}>>` | `accounts` custom claim (parsed from JSON string) |

`resolveAccountContext(handler)` — middleware that adds `account.accountId` to the wrapped handler context by reading the X-Account-Id header. If the header is absent, throws `badRequest("No active account context")`. There is no fallback to JWT-claim-based account resolution. Account switching is a client-side concern (the client tracks active-account state and sends the appropriate header value); this middleware reads the result.

`resolveAccountContext` is composed with `withAuth` rather than replacing it: handlers that need both JWT and account context get both. Handlers that only need JWT (no account context) use `withAuthOnly` and do not include `resolveAccountContext`.

### Authorization helpers

The following helpers are provided by `packages/lambda-middleware` and operate on the `auth` object. Handlers use these instead of inspecting the `auth` object directly.

```typescript
requireSiteAdmin(auth)
// Throws 403 unless auth.siteAdmin === true.
// Use for platform-wide operations (cross-app invitations,
// user disable/delete, cross-account admin).

requireAppAccess(auth, appSlug)
// Throws 403 unless auth.apps includes appSlug OR auth.siteAdmin === true.
// Use at the top of every handler scoped to a specific app.

requireAnyAppAccess(auth, appSlugs)
// Throws 403 unless auth.apps includes at least one of appSlugs OR auth.siteAdmin === true.
// Use only in platform handlers that serve multiple apps (currently: claude-proxy).

requireAccountAccess(auth, appSlug, accountId, minRole?)
// Throws 403 unless the caller is a member of accountId for appSlug
// with role >= minRole (or is site-admin).
// Role hierarchy (ascending): viewer < member < manager < owner.
// Default minRole is 'member'. Use before any DynamoDB query for account-scoped data.

requireAccountOwner(auth, appSlug, accountId)
// Throws 403 unless caller is the owner of accountId for appSlug
// (or is site-admin).
// Use for account deletion, ownership transfer, and similar
// operations only the owner can perform.
```

All helpers check `auth.siteAdmin` first as an override. A site-admin caller passes all authorization checks regardless of app-access or account membership.

**Fail-closed semantics.** When `auth.apps` or `auth.accounts` are absent or empty (e.g., due to a pre-token Lambda failure), helpers deny access rather than granting it. The pre-token Lambda documents this under "On failure" above.

### Claim-consumption layering

Raw JWT claim reads occur only in the middleware layer (`packages/lambda-middleware/`). Business-logic Lambdas access claims via the typed `auth` object provided by `withAuth` / `withAuthOnly`, using documented helpers (`requireAccountAccess`, `requireAppAccess`, `requireSiteAdmin`, etc.) when authorization decisions are needed. New Lambdas never read claims directly; the middleware layer is the only place raw claim access belongs.

This is a layering rule of the same shape as the data-access layered architecture (see `CONTRIBUTING.md` Section 5). Concerns are separated by layer: the middleware layer encapsulates raw-claim concerns; business logic operates on typed values.

### Deprecated helpers (retiring in M8)

- `requireGroup(auth, group)` — group-name-based pattern superseded by claim-based helpers. Currently retained for the legacy `auth/forgot-provider` route's IP-based rate limiter; retires when `auth/forgot-provider` migrates to the canonical claim-based pattern.
- `userInGroup(auth, group)` — utility check, also group-name-based; zero current callers; retires alongside `requireGroup`.

Handlers do NOT call `requireGroup` for new work.

---

## Handler authorization patterns

Every Lambda handler follows this pattern. Deviations require a written justification in the handler's code.

### Standard app-scoped handler

```typescript
export const handler = withAuth(async ({ auth, account, event }) => {
  requireAppAccess(auth, 'app-slug');                         // (1) fail fast if user lacks app access
  requireAccountAccess(auth, 'app-slug', account.accountId); // (2) verify account membership before any data access

  // ... handler logic uses account.accountId for all DynamoDB keys
});
```

### Multi-app platform handler (currently: claude-proxy only)

```typescript
export const handler = withAuth(async ({ auth, account, event }) => {
  requireAnyAppAccess(auth, ['stock-signal', 'budget-tracker']); // user must have at least one app

  // ... handler logic
});
```

### Rules

1. **`requireAppAccess` (or `requireAnyAppAccess`) is the first call in every handler**, before any business logic or DynamoDB access.
2. **`requireAccountAccess` is called before every DynamoDB read or write** that operates on account-scoped data.
3. **`accountId` always comes from request context** (`account.accountId`, which is sourced from the `X-Account-Id` request header). Never derive `accountId` from `auth.accounts` or any other JWT claim.
4. **Elevated operations** (bulk delete, admin overrides) use `requireAccountAccess(auth, appSlug, accountId, 'manager')`.
5. **Ownership-only operations** (account deletion, ownership transfer) use `requireAccountOwner`.
6. **Platform-admin operations** (cross-app user management, user disable/delete) use `requireSiteAdmin`.
7. **`requireGroup` must not appear in new handler code.** It is deprecated and will be removed at 7e-cleanup.

---

## Per-Lambda permission models

Five platform Lambdas have explicit permission models. Each is documented here for reference; the patterns reflect what each Lambda does and the authorization shape it requires.

| Lambda | Wrapper | Authorization | IAM scope |
|---|---|---|---|
| `accounts` | `withAuth` | Per-route guards (`requireAccountAccess` / `requireAccountOwner`) | `platform.accounts` RW + `platform.account-members` RW |
| `user` | `withAuthOnly` | None — user owns their own data | `platform.users` RW |
| `auth/account-provisioning` | `withAuthOnly` | None — first-login flow; user has JWT but no app group memberships yet | `platform.accounts` RW + `platform.account-members` RW + `AdminUpdateUserAttributes` on user pool ARN |
| `auth/invitations` | `withAuth` | Account-context guards | `platform.accounts` R + `platform.invitations` RW |
| `auth/forgot-provider` | None (raw handler — pre-authentication) | None | `platform.rate-limits` RW + `AdminGetUser` on user pool ARN + SES `SendEmail` (scoped to verified sender identity ARN, pending tightening in M8) |

**`accounts`, `user`, `auth/account-provisioning`, `auth/invitations`** are user-facing API endpoints. Each uses the appropriate middleware wrapper based on whether account context is required, and authorization helpers based on what the operation needs to verify.

**`auth/forgot-provider`** is pre-authentication by necessity (the user has forgotten their identity provider; they cannot authenticate). It uses no middleware wrapper — the handler reads the request directly. Abuse-resistance is provided by Lambda-side IP-based rate limiting, plus tightenings scheduled for M8 (API Gateway throttling, CORS allowlist to the sign-in page origin, SES grant scoping, rate-limiter fail-closed behaviour). See *Forgot-provider flow* below.

### Cross-Lambda trust pattern

`claude-proxy` is invoked by `budget-ai` (a Lambda-to-Lambda call, not API-Gateway-to-Lambda). The trust model for this path is documented in `CONTRIBUTING.md` Section 5 as the canonical pattern for cross-Lambda invocations: **Pattern B with strict constraints** — the receiving Lambda does not validate JWT signatures itself; trust comes from IAM scope strictly limiting which callers can invoke. The caller propagates JWT claims via a synthetic event; the receiver reads them as if validated.

This pattern is binding only for cross-Lambda invocations between platform Lambdas under common operational control. External services or third-party callers must use API-Gateway-validated paths (the standard `withAuth` flow).

---

## Invitations

Invitations grant platform access to new or existing users with preconfigured app access and account memberships. Two entry points reflect the two scenarios in which invitations are issued.

### Invitation entry points

**Launchpad invitation UI (site-admin only).** Used to onboard a new person to the platform with granular control across multiple apps. Site-admin selects:
- Which apps to grant access to (any or all)
- For each app: create a new personal account, or join an existing account with a specified role

Endpoint: `POST /admin/invitations`. Authorization: `requireSiteAdmin`.

**In-app invitation UI (site-admin or account owner/manager).** Available inside each app's UI. Used to share an account or add someone to an app when the inviter has authority for that specific app. The invitation is scoped to the current app; multi-app invitations are not possible from this entry point.

Endpoint: `POST /apps/{appSlug}/invitations`. Authorization: `requireSiteAdmin` OR caller is `owner`/`manager` of at least one account in `appSlug` AND (for the specific accounts named in the invitation) is `owner`/`manager` of each.

### Invitation data model

Table: `platform.invitations-{stage}`.

```
invitationId       UUID (PK)
email              normalised lowercase
invitedBy          userId of the inviter
createdAt          ISO 8601 timestamp
expiresAt          epoch-seconds (7 days default; used by DynamoDB TTL
                   for eventual cleanup, but records persist for audit)
status             'pending' | 'redeemed' | 'cancelled' | 'expired'
redeemedAt         ISO 8601 (set on redemption)
cancelledAt        ISO 8601 (set on cancellation)
perApp             map of app slug → {
                     accountMembership: one of:
                       { type: 'new-personal-account',
                         accountName?: string }
                       | { type: 'join-existing',
                           accountId: string,
                           role: 'manager' | 'member' | 'viewer' }
                   }
```

Variant rules:
- `new-personal-account`: invitee becomes `owner` of the new account (always — not configurable)
- `join-existing`: role must be `manager`, `member`, or `viewer`, never `owner` (would violate the single-owner invariant)

GSIs:
- `email-index` (PK: `email`) — check pending invitations for a given email address
- `status-index` (PK: `status`) — admin queries like "list all pending invitations"

Status lifecycle: `pending` → `redeemed` | `cancelled` | `expired`. Records persist after status transition for audit purposes. Hard deletion via DynamoDB TTL applies after `expiresAt` + retention period.

### Invitation creation authorization

For site-admin (from either entry point): no restrictions. Can grant access to any app, with any combination of new accounts and joins.

For account owner/manager (in-app entry point only): the invitation must satisfy BOTH:
- The caller is `owner` or `manager` of at least one account in the target app
- If `accountMembership.type === 'join-existing'`: the caller is `owner` or `manager` of the specified `accountId`

This means: Kieran (owner of a Stock Signal account) can invite Ella to his Stock Signal account as a member, or create a new Stock Signal personal account for her as owner. He cannot invite her to Budget Tracker unless he also owns or manages a Budget Tracker account.

### Invitation creation flow

1. Admin fills out the invitation form in the launchpad or in-app UI.
2. Frontend POSTs to the appropriate creation endpoint.
3. The invitation Lambda (`invitations-create`):
   a. Authorizes the caller per the rules above.
   b. Generates an invitation ID (crypto-random UUID) — this is the invitation's single-use token.
   c. Writes the record to `platform.invitations-{stage}` with `status: 'pending'`.
   d. Composes the invitation email: "You've been invited to Transformotion. Click here to accept: `{link}`" where `link = https://{host}/sign-in?invitation=<invitationId>`.
   e. Sends the email via SES (`SendEmailCommand`) using a template.
   f. Returns 201 with the invitation ID.
4. SES handles delivery. The email arrives in the invitee's inbox.

### Invitation redemption flow

1. Invitee clicks the link. Browser opens `https://{host}/sign-in?invitation=<invitationId>`.
2. The launchpad sign-in page reads the `invitation` URL parameter and encodes it into the OAuth `state` parameter when redirecting to Cognito Hosted UI.
3. Invitee signs up or signs in with their preferred method (email/password, Google, Facebook, Microsoft).
   - Cognito creates or reuses their user record.
   - Pre-token Lambda fires. User has no accounts yet → token issued with empty `apps` and `accounts`.
4. Cognito redirects back with the authorization code and the preserved `state` (containing the invitation ID).
5. Launchpad callback handler:
   a. Exchanges code for tokens.
   b. Decodes the OAuth state, recovers the invitation ID.
   c. POSTs `{invitationId}` to `POST /auth/reconcile-invitation` with the invitee's `Authorization` header.
6. The reconciliation Lambda (`invitations-reconcile`):
   a. Validates caller has a valid JWT (`withAuth`). No other authorization checks — the invitation itself is the authority.
   b. Looks up the invitation by `invitationId` in `platform.invitations-{stage}`.
   c. Validates:
      - `status === 'pending'`
      - Current time < `expiresAt`
      - Invitation `email` matches caller's Cognito email (case-insensitive) — prevents a different user from redeeming a link they intercepted
   d. Executes the grant **transactionally** (DynamoDB `TransactWriteItems`) across all `perApp` entries:
      - For `new-personal-account`: create a new account record in `platform.accounts-{stage}`, add the user to `platform.account-members-{stage}` as `owner`.
      - For `join-existing`: verify the accountId exists, add the user to `platform.account-members-{stage}` with the specified role.
      - Update the user's `custom:accounts` attribute via `AdminUpdateUserAttributes` to include the new account IDs.
      - Mark the invitation as `status: 'redeemed'`, set `redeemedAt`.
   e. If any part fails, the transaction rolls back; the invitation stays `pending` and the caller receives an error. No partial grants.
   f. Returns 200 with the redeemed invitation summary.
7. The frontend receives success and forces a token refresh. The next token from Cognito invokes the pre-token Lambda, which reads the now-updated account memberships and injects the full `apps` and `accounts` claims.
8. The invitee is returned to the launchpad with their granted tiles visible and clickable.

### Invitation listing and management

**`GET /admin/invitations`** — site-admin only. Lists all invitations across all apps. Filterable by status.

**`GET /apps/{appSlug}/invitations`** — in-app listing. Returns invitations where `perApp[appSlug]` is defined AND the caller is site-admin OR the caller is `owner`/`manager` of the target account in `perApp[appSlug]`. Display is filtered to show only the `appSlug` portion of each invitation's `perApp` map.

**Cancellation:** `DELETE /invitations/{invitationId}`. Authorization: site-admin, or the original inviter (`invitedBy` matches caller). Sets `status: 'cancelled'`, `cancelledAt`. Does not delete the record (audit trail preserved).

**Expiration:** A scheduled Lambda runs daily, queries via `status-index` for `status = 'pending'` records where `expiresAt < now()`, and updates each to `status: 'expired'`.

### Security properties

- **Authentication required for redemption.** Caller must have a valid Cognito JWT.
- **Email match enforced.** The invitation's email must match the redeemer's Cognito email (case-insensitive). Prevents an intercepted link being redeemed by a different user.
- **Single-use token.** Once status is not `pending`, the invitation cannot be redeemed again.
- **Time-bounded.** Default 7-day expiry.
- **Random token.** The invitation ID is a cryptographically random UUID, not guessable.
- **Rate limiting.** Apply on `POST /auth/reconcile-invitation` by caller `userId` — suggested 5 attempts per 15 minutes — to prevent brute-force against random invitation IDs.

**Known limitation — federated email mismatch.** If the invitation is sent to `steve@gmail.com` and Steve signs in with Apple (which uses `steve@privaterelay.appleid.com`), the email match fails and redemption is rejected. The invitation email body should include a hint: "Sign in using the email address this invitation was sent to (`{email}`)."

---

## Revocation flows

Three revocation scenarios, each with a specific entry point.

### Scenario A: Removing a user from an account

An account owner or manager removes someone from a specific account.

Endpoint: `DELETE /accounts/{accountId}/members/{userId}`. Lambda: `account-members-remove`.

Authorization:
- `requireAccountAccess(auth, appSlug, accountId, minRole: 'manager')`
- If the target `userId` is the `owner` of the account: reject. Ownership must be transferred first.
- If the caller is a `manager` (not owner) and the target is also a `manager`: reject. Managers cannot remove other managers; only the owner can.
- Self-removal (caller and target are the same user): allowed if the target is not the owner.

Steps:
1. Validate authorization per the rules above.
2. Delete the row in `platform.account-members-{stage}` for `(accountId, userId)`.
3. Update the target user's `custom:accounts` attribute to remove `accountId`.
4. Call `AdminUserGlobalSignOut` on the target user — refresh tokens invalidated immediately.

After this: the target user's existing access token remains valid until expiry (up to 1 hour). On their next token refresh, the pre-token Lambda reads the updated memberships and issues a token without the removed account. If this was the user's last account in a given app, the invariant reconciliation in the pre-token Lambda automatically removes them from that app's `-access` group.

### Scenario B: Disabling a user

Site-admin temporarily disables a user (suspected compromise, temporary hold).

Endpoint: `POST /admin/users/{userId}/disable`. Lambda: `admin-users-disable`.

Authorization: `requireSiteAdmin`.

Steps:
1. Call `AdminDisableUser` on the Cognito user — prevents future sign-ins.
2. Call `AdminUserGlobalSignOut` — invalidates refresh tokens.
3. Account-members records are NOT deleted (the disable is temporary and reversible).

After this: the user cannot sign in at all. Existing access tokens remain valid for up to 1 hour.

Reverse: `POST /admin/users/{userId}/enable`.

### Scenario C: Deleting a user

Site-admin permanently removes a user from the platform.

Endpoint: `DELETE /admin/users/{userId}`. Lambda: `admin-users-delete`.

Authorization: `requireSiteAdmin`.

**Account-ownership constraint.** Before deletion, query `platform.account-members-{stage}` for rows where `userId = <target>` AND `role = 'owner'`. If any exist: reject with 409 Conflict, listing the affected accounts with ownership-transfer instructions. The caller must transfer each account's ownership to another user before retrying the delete.

If no ownership rows remain: proceed:
1. Delete all membership rows from `platform.account-members-{stage}` where `userId = <target>`.
2. Call `AdminDeleteUser` on the Cognito user.

After this: the user record is gone from Cognito. Existing access tokens remain valid for up to 1 hour, then expire naturally.

---

## Forgot-provider flow

Users who do not remember which identity provider they signed up with can request a reminder.

**Endpoint:** `POST /auth/lookup-provider` (public — no JWT required)

The Lambda `transformotion-forgot-provider-{stage}` (in `AuthApiStack`):
1. Rate-limits by IP/email
2. Queries Cognito via `ListUsersCommand` with filter `email = "<email>"` (works for both native users and federated users regardless of Cognito username format)
3. Reads the `identities` attribute to detect which IDP was used
4. Sends an SES email to the user naming the sign-in method and a link

The handler is pre-authentication by necessity. It uses no `withAuth` / `withAuthOnly` wrapper — there is no JWT to extract. Abuse-resistance is the load-bearing security property.

### Abuse-resistance posture

Current state has Lambda-side IP-based rate limiting (5 requests per IP per 15 minutes, stored in `platform.rate-limits-{stage}`). The rate limiter currently fails open: if the rate-limit table is unavailable, requests proceed without limiting.

The following tightenings are scheduled for M8:

- **SES grant scoping.** Current grant is `ses:SendEmail` on `Resource: ['*']` — broader than necessary. M8 scopes the grant to the specific verified sender identity ARN.
- **API Gateway throttling.** A second layer independent of the Lambda's DDB-based limiter. Specific throttle parameters decided during M8 implementation.
- **CORS allowlist.** Current configuration is `ALL_ORIGINS`; M8 restricts to the sign-in page origin so browser-based requests from other origins are blocked.
- **Rate-limiter fail-closed.** The current fail-open behaviour is changed to fail-closed: if the rate-limit table is unavailable, requests are blocked rather than bypassed. The availability trade-off is accepted for this endpoint — it is not critical-path for active users; legitimate users can retry after DDB recovers; the abuse window stays closed during outages.

**Known limitation:** For federated users, `AdminGetUser(Username=email)` fails because their Cognito username is `Google_{sub}` (not email). The fix using `ListUsersCommand` resolves this. See sub-phase `7e-forgot-provider-fix` in `docs/sub-phase-7e-plan.md`.

---

## Client-side auth

Frontend code follows the same layered architecture pattern as data access (see `CONTRIBUTING.md` Section 5).

A domain interface (`AuthService`) lives in contracts. Implementations are named for what they wrap: `CognitoAuthService` (production; reads JWT claims from a Cognito session) and `MockAuthService` (v0; returns mocked auth state without any real auth backend). Selection is build-time per the layered architecture pattern.

Components, services, and hooks access claim-derived data only via the `AuthService` interface — never by reading JWT claims directly. The interface is the canonical access path for any claim-derived value (active account ID, app access flags, user identity, etc.).

The current state has the interface duplicated across `packages/auth-client/`, `apps/stock-analyser/`, and `apps/budget-tracker/`, with the production implementation only existing for stock-analyser. Migration to the canonical pattern (interface in contracts, both implementations in `packages/auth-client/`, build-time selection) happens alongside the production bug fix for the missing `accounts` JWT claim.

---

## Out of scope (future)

- OAuth resource server custom scopes as an alternative or complement to group-based checks — tracked as Issue #42.
- Capability-level permissions within an app beyond `view/user/admin`.
- Multi-owner accounts.
- Per-browser-session active account (alternative to `custom:active_accounts`).
