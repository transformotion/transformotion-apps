# Authentication and permissions

## Overview

The platform uses AWS Cognito as the single source of identity. Authentication is handled at the Cognito Hosted UI layer; authorization operates in two independent dimensions: **app access** (via Cognito groups) and **account membership** (via DynamoDB records). These two dimensions are orthogonal — a user must satisfy both to perform a data operation.

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

| Attribute | Type | Purpose |
|---|---|---|
| `custom:accounts` | String (max 2048) | Comma-separated UUIDs of all accounts the user belongs to (all apps combined) |
| `custom:active_accounts` | String (max 2048) | JSON map of per-app active account: `{"stock-signal":"uuid","budget-tracker":"uuid"}` |

> **Migration note:** The deployed attribute is currently `custom:active_account` (singular, UUID only). The target `custom:active_accounts` (plural, per-app JSON map) is introduced in sub-phase 7e. The migration plan is in `docs/sub-phase-7e-plan.md`.

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

Groups determine which apps a user can access and at what capability level.

| Group | App | Grants |
|---|---|---|
| `stock-app-view` | Stock Signal | Read-only: view portfolio, watchlist, analysis results |
| `stock-app-user` | Stock Signal | Full use: add/edit/delete holdings, trigger analysis |
| `stock-app-admin` | Stock Signal | Full use + can invite others to Stock Signal |
| `budget-app-view` | Budget Tracker | Read-only: view transactions, budget, cashflow |
| `budget-app-user` | Budget Tracker | Full use: import, categorise, set budgets |
| `budget-app-admin` | Budget Tracker | Full use + can invite others to Budget Tracker |
| `site-admin` | All apps | Platform-wide admin; can invite to any app; implicit admin-level in all apps |

Rules:
- A user is in at most one `{app}-{level}` group per app.
- `site-admin` is orthogonal to app groups. A `site-admin` user does not need `stock-app-admin` to access Stock Signal at admin level.
- A user with no group for a given app cannot access that app, even if they have a valid Cognito session.

> **Migration note:** The currently deployed groups are `admin`, `stock-app`, `budget-app`, `transformotion`, `family`. The target groups above are introduced in sub-phase 7e. During migration, both old and new groups coexist; handlers accept both. Old groups are removed at 7e-cleanup.

### Dimension B: Account membership (DynamoDB)

Accounts are per-app data containers. Each app has its own set of accounts; a user's "Stock Signal account" and "Budget Tracker account" are independent.

Account membership is stored in `platform.account-members-{stage}` (PK: `accountId`, SK: `userId`) with a `role` attribute:

| Role | Capability |
|---|---|
| `owner` | Created the account; can transfer ownership; can delete |
| `manager` | Can manage members (add/remove/change role); cannot delete the account |
| `member` | Read and write the account's data |
| `viewer` | Read-only |

A user can be `owner` of their own accounts and any role in others' accounts. Multiple memberships per app are permitted (e.g. owner of personal account + member of a shared household account).

---

## Pre-token generation Lambda

**Function name:** `transformotion-pre-token-generation-{stage}`

**Trigger:** Cognito pre-token-generation — invoked on every token issuance (sign-in and token refresh).

**Responsibilities:**

1. Read the user's Cognito groups from the trigger event
2. Map groups to a structured `apps` claim:
   - `stock-app-view/user/admin` → `apps["stock-signal"] = "view" | "user" | "admin"`
   - `budget-app-view/user/admin` → `apps["budget-tracker"] = "view" | "user" | "admin"`
   - `site-admin` → sets `site_admin: true` AND populates all-app entries at `admin` level
3. Query `platform.account-members-{stage}` for the user's memberships, shape into `accounts` claim
4. Inject via `event.response.claimsAndScopeOverrideDetails`

**On failure:** The Lambda returns the event unchanged; the token is issued without custom claims. All API handlers fail closed — absent claims means no access.

---

## Claim shape in ID tokens

The pre-token generation Lambda adds three custom claims. These are consumed by the launchpad and API handlers.

```json
{
  "apps": {
    "stock-signal": "view | user | admin",
    "budget-tracker": "view | user | admin"
  },
  "site_admin": true,
  "accounts": {
    "stock-signal": [
      { "accountId": "uuid", "role": "owner | manager | member | viewer" }
    ],
    "budget-tracker": [
      { "accountId": "uuid", "role": "owner | manager | member | viewer" }
    ]
  }
}
```

Plus standard Cognito claims (`sub`, `email`, `cognito:groups`) and the custom attributes `custom:accounts` and `custom:active_accounts`.

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

All API Lambda handlers use `withAuth` to validate the Cognito JWT from the `Authorization: Bearer` header. The middleware exposes:

| Property | Type | Source |
|---|---|---|
| `auth.userId` | `string` | Cognito `sub` |
| `auth.email` | `string` | `email` claim |
| `auth.apps` | `Record<string, 'view'\|'user'\|'admin'>` | `apps` custom claim |
| `auth.siteAdmin` | `boolean` | `site_admin` custom claim |
| `auth.accounts` | `Record<string, Array<{accountId, role}>>` | `accounts` custom claim |

**Authorization helpers** (use these instead of `requireGroup`):

```typescript
requireAppAccess(auth, 'stock-signal')
// Throws 403 if caller doesn't have 'stock-signal' in auth.apps
// and is not site_admin

requireAppAccess(auth, 'stock-signal', 'admin')
// Also requires role === 'admin'

requireAccountAccess(auth, 'stock-signal', accountId)
// Throws 403 if caller is not a member of accountId for stock-signal
// and is not site_admin

requireAccountAccess(auth, 'budget-tracker', accountId, 'manager')
// Also requires role in ['owner', 'manager'] (manager-or-above check)
```

Handlers do not call `requireGroup` directly. The claim-based helpers replace it.

---

## Invitation flow

Invitations are admin-initiated and carry full preconfiguration of the invitee's access.

### Invitation record (`platform.invitations-{stage}`)

```typescript
{
  invitationId:         string       // UUID (PK)
  email:                string       // normalised lowercase
  invitedBy:            string       // userId of the inviting admin
  createdAt:            string       // ISO 8601
  expiresAt:            number       // epoch-seconds (TTL attribute — 7 days)
  status:               'pending' | 'redeemed' | 'expired'
  perApp: {
    [appSlug: string]: {
      groupRole: 'view' | 'user' | 'admin'
      accountMembership:
        | { type: 'new-personal-account'; accountName?: string }
        | { type: 'join-existing'; accountId: string; accountRole: 'manager' | 'member' | 'viewer' }
    }
  }
}
```

### Who can create invitations

| Caller | Can invite to |
|---|---|
| `site-admin` | Any app, any account |
| `{app}-admin` | Their app only; `join-existing` accounts must be ones they own or manage |
| Account `owner` or `manager` | Can add a user to their account with `join-existing` (no new Cognito group granted) |

### Redemption flow

1. Admin creates invitation via `POST /accounts/{accountId}/invitations`
2. SES email is sent containing a redemption link: `{host}/sign-in?invitation=<token>`
3. Invitee clicks the link; the launchpad preserves the token in the OAuth `state` parameter through the Cognito Hosted UI flow
4. On callback, the launchpad POSTs the token to `POST /auth/reconcile-invitation` along with the user's session
5. The reconciliation Lambda validates the token, looks up the invitation, and for each app in `perApp`:
   - Adds the user to the appropriate Cognito group (`{app}-{groupRole}`)
   - Creates a new account (`new-personal-account`) OR adds the user to an existing account (`join-existing`)
   - Sets `custom:active_accounts[appSlug]` to the resolved accountId
6. Marks the invitation as `redeemed`

**Same email, different identity provider:** invitation redemption is not dependent on the social IDP's email matching the invitation's email. The OAuth state carries the invitation token; the reconciliation Lambda matches on the authenticated session, not email.

---

## Revocation

When access is revoked (group removal or account membership deletion):

1. Remove the relevant row from `platform.account-members-{stage}` and/or remove the user from their Cognito group
2. Call `AdminUserGlobalSignOut(username)` — invalidates all refresh tokens immediately
3. Existing access tokens remain valid until natural expiry (up to 1 hour). This staleness window is accepted.
4. On the user's next token refresh, Cognito invokes the pre-token generation Lambda, which reads updated state and issues a token without the revoked access

**Full disable:** `AdminDisableUser` blocks sign-in immediately on the next token refresh. Active tokens remain valid until expiry.

No per-request DynamoDB lookup is performed for revocation; the system relies on claim-based authorization with an accepted 1-hour staleness window.

---

## Forgot-provider flow

Users who do not remember which identity provider they signed up with can request a reminder.

**Endpoint:** `POST /auth/lookup-provider` (public — no JWT required)

The Lambda `transformotion-forgot-provider-{stage}` (in `AuthApiStack`):
1. Rate-limits by IP/email
2. Calls `AdminGetUser(Username: email)` on the Cognito user pool
3. Reads the `identities` attribute to detect which IDP was used
4. Sends an SES email to the user naming the sign-in method and a link

**Known limitation:** For federated users whose Cognito `username` is `Google_{sub}` (not email), the `AdminGetUser(email)` lookup fails silently — no email is sent to those users. Tracked in the Stabilisation backlog for fix.

---

## Out of scope (future)

- OAuth resource server custom scopes as an alternative or complement to group-based checks — tracked as Issue #42.
- Capability-level permissions within an app beyond `view/user/admin`.
- Multi-owner accounts.
- Per-browser-session active account (alternative to `custom:active_accounts`).
