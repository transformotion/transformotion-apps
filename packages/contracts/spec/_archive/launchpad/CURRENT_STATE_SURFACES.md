# Launchpad Current-State Contract Surfaces

> M15 #135 correction note: this is raw post-M9 migration input from the
> runtime repo. It is not the final #136 scope-first structure and it is not
> executable #137/#139 contract material.

## Runtime Sources Inspected

- `apps/launchpad/infrastructure/launchpad-auth-stack.ts`
- `apps/launchpad/infrastructure/launchpad-control-plane-stack.ts`
- `apps/launchpad/functions/pre-token-generation/src/index.ts`
- `apps/launchpad/functions/account-provisioning/src/index.ts`
- `apps/launchpad/functions/forgot-provider/src/index.ts`
- `apps/launchpad/functions/user/src/index.ts`
- `apps/launchpad/functions/accounts/src/index.ts`
- `apps/launchpad/functions/invitations/src/index.ts`
- `apps/launchpad/lib/config/index.ts`
- `apps/launchpad/lib/services/*`
- `apps/launchpad/components/launchpad/launchpad.tsx`
- `packages/auth-client/src/*`
- `packages/lambda-middleware/src/*`
- `docs/architecture/auth.md`
- `docs/architecture/inventory.md`

## Ownership Baseline

Launchpad owns the active auth domain and control plane:

- Cognito User Pool.
- Hosted UI domain and Hosted UI customization.
- app clients for Launchpad, Stock Analyser, and Budget Tracker.
- Cognito groups for `site-admin`, app access groups, and legacy groups.
- auth-domain tables: users, accounts, account members, invitations, rate
  limits.
- pre-token generation claim enrichment.
- Launchpad control-plane REST API.
- Launchpad frontend auth/control-plane environment wiring.

Platform does not own these surfaces after M9.

## Auth And Hosted UI Surfaces

Current Cognito app clients:

- Launchpad app client:
  - dev callbacks: `/sign-in/callback`, `/launchpad/callback`, and localhost
    equivalents.
  - prod callbacks: `/sign-in/callback`, `/launchpad/callback`.
  - logout: `/signed-out/`.
- Stock Analyser app client:
  - callback: `/stock-analyser/callback`.
  - logout: `/signed-out/`.
- Budget Tracker app client:
  - callback: `/budget-tracker/callback`.
  - logout: `/signed-out/`.

All clients use authorization-code grant with openid, email, and profile scopes.
Current app clients are public clients (`generateSecret: false`) and use
Cognito plus currently configured identity providers.

Frontend auth provider selection:

- `NEXT_PUBLIC_RUNTIME_PROFILE=mock` defaults auth to `mock`.
- `NEXT_PUBLIC_RUNTIME_PROFILE=live` defaults auth to `cognito`.
- `NEXT_PUBLIC_AUTH_OVERRIDE` may override only auth.

Auth-client contract inputs:

- `AuthService.getCurrentUser()`
- `AuthService.getSession()`
- `AuthService.signIn(credentials)`
- `AuthService.signUp(credentials)`
- `AuthService.signOut()`
- `AuthService.signInWithRedirect({ provider? })`
- `AuthService.handleRedirectCallback()`
- `AuthService.refreshSession()`
- `AuthService.getAccessToken()`
- `AuthService.getIdToken()`
- `AuthService.getAccountIdForApp(appSlug)`
- `AuthService.listAccounts()`
- `AuthService.switchAccount(accountId)`

## Token Claim Surfaces

Pre-token generation reads account memberships and account app ownership, then
adds or overrides these ID-token claims:

- `apps`: JSON string array of app slugs the user may access.
- `accounts`: JSON string object keyed by app slug. Each value is an array of
  `{ accountId, role }` memberships.
- `site_admin`: string boolean (`"true"` or `"false"`).

Current rule:

- site admins receive all registered app slugs in `apps`.
- non-admin users receive only app slugs for accounts they belong to.
- app access group membership is reconciled against account membership.
- app access must fail closed when `apps`/`accounts` claims are missing or
  malformed.

Later #137/#139 work must turn these into executable/shared auth shapes instead
of keeping duplicated runtime declarations in `packages/auth-client` and
`packages/lambda-middleware`.

## Launchpad Control-Plane API Surfaces

Base URL:

- `NEXT_PUBLIC_LAUNCHPAD_CONTROL_PLANE_API_URL`
- exported by `Transformotion{Stage}-LaunchpadControlPlane` as
  `ControlPlaneApiUrl`.

Common protected headers:

- `Authorization: Bearer <idToken>`
- `Content-Type: application/json` where a body is sent.
- `X-Account-Id` for routes that use account context.

Routes:

| Method | Path | Auth | Current purpose |
| --- | --- | --- | --- |
| `GET` | `/health` | public mock integration | health check |
| `POST` | `/auth/lookup-provider` | public | provider hint email flow |
| `POST` | `/auth/setup` | Cognito | first-account provisioning |
| `GET` | `/api/user/profile` | Cognito | load user profile/preferences |
| `PUT` | `/api/user/preferences` | Cognito | update preferences |
| `POST` | `/accounts` | Cognito/account context | create account |
| `GET` | `/accounts/{accountId}` | Cognito/account context | get account and members |
| `PUT` | `/accounts/{accountId}` | Cognito/account context | rename account |
| `DELETE` | `/accounts/{accountId}` | Cognito/account context | delete owner account |
| `GET` | `/accounts/{accountId}/members` | Cognito/account context | list members |
| `DELETE` | `/accounts/{accountId}/members/{userId}` | Cognito/account context | remove member |
| `POST` | `/accounts/{accountId}/invitations` | Cognito/account context | create invitation |

## User Profile And Preferences

Current user profile response:

```ts
{
  userId: string;
  email: string;
  preferences: {
    notificationsEnabled: boolean;
  };
}
```

`PUT /api/user/preferences` accepts partial preferences and stores the merged
preferences on the Launchpad users table.

## Account And Member Surfaces

Current account row inputs:

- `accountId`
- `appSlug` for account-provisioned app accounts.
- `name`
- `ownerId`
- `plan`
- `createdAt`
- `updatedAt`

Current member row inputs:

- `accountId`
- `userId`
- `email`
- `role`
- `joinedAt`

Current roles observed from runtime helpers and tests include:

- `owner`
- `manager`
- `member`
- `viewer`

Current account deletion deletes the account row and up to 99 member rows in a
single transaction. Owner cannot remove themselves via member deletion.

## Invitation Surfaces

Current invitation row inputs:

- `invitationId`
- `accountId`
- `email`
- `invitedBy`
- `createdAt`
- `expiresAt`
- `status: "pending"`

The current endpoint creates an invitation record only; any acceptance flow or
email sending contract needs reconciliation during #136/#139 if it exists
outside the inspected runtime code.

## Account Provisioning Surfaces

`POST /auth/setup`:

- requires a Cognito-authenticated token.
- derives the app slug from the token `aud` app-client ID.
- if existing account information exists in `custom:active_account` or
  `accounts`, returns `{ accountId, created: false }`.
- otherwise creates an account and owner membership, updates Cognito
  `custom:active_account` and `custom:accounts`, and returns
  `{ accountId, created: true }`.

Known reconciliation point:

- The function updates legacy custom attributes while pre-token generation now
  emits app-keyed `accounts`. #136/#139 should decide how to represent both
  current compatibility and target behaviour.

## Forgot Provider / Lookup Provider Surface

`POST /auth/lookup-provider`:

- public route.
- request: `{ email: string }`.
- validates email format.
- rate-limits by source IP with 5 requests per 15 minutes.
- looks up Cognito provider type.
- sends an SES email if a user exists.
- returns generic 200 message to avoid user enumeration.
- returns 429 only when the rate limit is exceeded.

## App Registry And Tile Visibility

Current Launchpad UI still has a local `APPS` array, but post-M9 #370 requires
tile visibility to be driven by LaunchpadAuth token entitlement claims:

- users should see only apps present in the `apps` claim.
- site admins see all registered apps.
- unavailable/future apps may still display as unavailable only when explicitly
  represented by the app registry/contract.

The runtime app registry source is `infrastructure/lib/app-registry.ts` and the
Launchpad auth stack uses it to define app groups and claim slugs.

## AI Runtime Config / Site Admin Surfaces

The user requested this as a #135 audit surface. No dedicated Launchpad AI
runtime config API was found in the inspected current Launchpad runtime source.
If it exists elsewhere, #136/#139 should either migrate it explicitly or mark it
as absent from current deployed Launchpad control-plane scope.

Site-admin behaviour currently exists as the `site_admin` token claim and
runtime authorization helper behaviour. No dedicated Launchpad site-admin
settings API was found in the inspected current Launchpad runtime source.

## Stale / Pre-M9 Risks

Do not carry forward any text that implies:

- Platform owns Cognito/auth-domain resources.
- Platform owns account/app entitlement administration.
- Platform owns Launchpad control-plane APIs.
- app access can be inferred from legacy groups when `apps` is missing.
