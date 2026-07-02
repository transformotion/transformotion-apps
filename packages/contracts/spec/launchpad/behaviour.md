# Launchpad Behaviour Contract

## Authorization

Launchpad owns auth UX, account setup, app access presentation, and
control-plane APIs. Protected APIs use Cognito ID tokens and the shared
`TransformotionTokenClaims` contract.

The `apps` and `accounts` claims are authoritative for app/account access; App
access must fail closed when claims are missing or malformed. Platform admin
status is sourced from the `site-admin` Cognito group, not a token claim.

## Account And Invitation Behaviour

Account, member, invitation, and setup APIs use the shapes in `types.ts`,
`invitations.ts`, and `api.ts`. Account-context routes require a valid
authenticated user and account membership. Owner-only behaviors, such as
destructive account operations, must be enforced by the backend.

The provider lookup flow returns a generic success response for normal requests
to avoid user enumeration. Rate-limit failures may return an explicit limit
error.

## Access Model (M16)

The normative app-access / app-admin model — app access as a Cognito **group**,
the one-directional `membership ⟹ access` invariant ("has access, no accounts"
is a valid state; the access group is **not** removed at zero accounts), where
app-admin authority lives, and the app-removal cascade — is defined CANONICALLY
in the generated mirror of the runtime auth model and is **not restated here**:

> `contracts/auth-model.md` — generated, read-only mirror of
> `transformotion-apps/docs/architecture/auth.md` (the source of truth).

The remaining points are v0 behaviour the model above does not cover:

- Accounts are app-scoped: every account belongs to exactly one entitled app.
- Users can hold multiple accounts per app.
- Active account is per user per app (see `ActiveAccountSelection`). Switching
  active account changes only the caller's own view.
- App data is account-scoped. Switching accounts must never leak another
  account's data; users with no membership in an app hit an access gate.
- Disabled users (`UserStatus = 'disabled'`) fail closed everywhere: no app
  access, no invitation redemption, no discovery visibility as senders.

## Authorization Policies (M16)

Route-level `auth` stays coarse (`public` / `auth-only` / `account` /
`site-admin`). Fine-grained checks are documented per route via
`PolicyRequirement` and MUST be enforced by the backend:

- `site-admin` — platform-wide supervisory role.
- `app-admin-for-app` — app-scoped admin authority over the route's target app.
- `account-owner-or-manager` — owner or manager of the target account.
- `account-member` — any role in the target account.
- `invitee-only` — caller's verified email must match the bundle's email.
- `supervisory-site-admin` — site-admin may pass this check in a read-only,
  mapping-visibility capacity (no private data, no write authority).
- `canSearchInvitees` — caller has a non-`none` invitee discovery scope.
- `canCreateInvitationGrant` — caller can author at least one grant kind.

Visibility boundaries (all four are hard rules):

- Discovery permission is SEPARATE from grant authorization.
- Site-admin visibility does NOT grant private account invitation authority.
- App-admin visibility does NOT grant private account invitation authority.
- App-admin/site-admin visibility does NOT grant private app data access.

Target-resolved policy: when a route addresses a specific resource by path
(`GET`/`DELETE /api/invitations/bundles/{bundleId}`, cancel-grant), the backend
MUST resolve the bundle/grant to its target app + account BEFORE evaluating
`account-owner-or-manager` vs `app-admin-for-app`. The required policy is a
property of the resolved target, not of the route alone. A `{bundleId}` (or
`{grantId}`) that does not resolve to an existing target MUST fail closed.

## Account Roles (M16)

- Owner and manager can invite and manage members of their account.
- Owners may assign any role. Managers may assign `viewer`/`member`/`manager`
  but may NOT grant `owner` (pending explicit product approval otherwise).
- Members and viewers cannot invite, manage members, or search invitees.
- Last-owner guard: the sole owner of an account cannot be demoted, removed,
  or disabled out of ownership. Ownership must be transferred first.

## Invitee Discovery (M16)

Scopes (`InviteeSearchScope`), evaluated in this order:

- Site-admin: may search ALL users.
- App-admin: may search users who have access to an administered app.
- Account owner/manager: may search people from accounts they manage.
- Member/viewer: NO search.

Combined roles merge their scopes. Discovery results carry display-safe
`reasons` explaining visibility; reason text is presentational, not contract.

Manual email entry: any sender who can create at least one grant may invite an
arbitrary email address, including addresses outside their discovery scope.
Privacy note: the compose flow must not confirm whether a manually-entered
email belongs to an existing user outside the sender's discovery scope.

## Invitation Bundles (M16)

- One email, one bundle, one redemption link. A bundle carries one or more
  grants (`account-invite` | `app-provision`).
- Each grant is authorized INDEPENDENTLY at creation. Unauthorized grants are
  rejected per-grant (`GrantAuthorizationDecision`); authorized grants in the
  same request still proceed.
- `app-provision` is blocked when the invitee already has active access to the
  target app.
- `account-invite` IS allowed for an existing app user joining another account
  in the same app.
- Duplicate account-member invitations are blocked: a grant targeting an
  account where the email is already an active member is rejected.
- Cancelling a grant removes it from its bundle; a bundle with no remaining
  grants is revoked. Cancelling a bundle revokes all its grants.
- A single bundle can be fetched (`GET /api/invitations/bundles/{bundleId}`)
  for redemption, admin review, pending-invitation detail, and direct links.
  Access is target-resolved (sender: owner/manager of a targeted account or
  app-admin of a targeted app; invitee: matching email).

### Directory pending-invitations (M11 / `UserAccessSummary`)

- The admin users directory read (`GET /api/admin/users/access` →
  `UserAccessSummary`) carries BOTH the pending-invitation `pendingInvites`
  COUNT and the `pendingInvitations` LIST behind it. The invariant
  `pendingInvites === pendingInvitations.length` always holds; the count is
  retained as the cheap badge read, the list backs the per-user detail display.
- `pendingInvitations` is ONE ROW PER GRANT (`UserPendingInvitation`): a bundle
  carrying N grants addressed to the user yields N rows. Every field is a
  projection of the canonical `InvitationBundle` / `InvitationGrant` it derives
  from — `bundleId`, `grantId`, `kind`, `appSlug`, `target` (account name for
  `account-invite`, app label for `app-grant` — the same label projection as
  `GrantRedemptionResult.target`), `status`, `createdAt` (sent), `expiresAt`.
- `role` is present ONLY for `account-invite` rows. `app-grant` rows are
  roleless by design (app-access with no account), so `role` is absent there.
- Like every directory read model, this is DERIVED (over live bundle state) and
  never stored in this shape. Scope is the user's own address (`bundle.email`),
  `status: 'pending'` — the same data the redemption flow mutates, so the
  directory never diverges from live invitation state.

## Redemption (M16)

- The invitee redeems the whole bundle; each grant resolves independently to a
  `GrantOutcome` (`accepted` / `rejected` / `expired` / `unauthorized` /
  `duplicate`).
- Newcomers get a user record created at redemption (`userCreated: true`) and
  enter first-time profile setup (`profileComplete: false` until done).
- Redemption is idempotent: re-redeeming an accepted bundle returns
  `duplicate` outcomes and never double-applies memberships or provisions a
  second account.
- Disabled invitees are blocked entirely.

## Sessions And Claims (M16)

Cognito remains authoritative for identity (`sub`, `email`, token issuance).
The Transformotion control-plane is authoritative for application profile and
access state. After any membership change (redemption, role change, removal,
provisioning), the affected user's claims are stale until token refresh; the
backend must enforce policy from control-plane state, never from claims alone.
Clients should refresh tokens after membership-changing flows.

## AI Runtime Settings

Launchpad owns the AI runtime configuration control plane for app AI proxies.
The current safe state is platform default `claude / claude-sonnet-4-6` with no
app overrides.

The UI and mocks must use `LaunchpadAiRuntimeConfigResponse` and
`LaunchpadAiRuntimeConfigUpdate`. Provider secrets are never part of Launchpad
settings data.

Resolution order is app override, then platform default, then environment
fallback. Runtime AI execution remains app-owned by Stock Analyser and Budget
Tracker.
