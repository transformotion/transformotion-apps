# Authentication and permissions

## Overview

The platform uses AWS Cognito as the single source of identity. Authentication is handled at the Cognito Hosted UI layer; authorization operates in two independent dimensions: **app access** (via Cognito groups) and **account membership** (via DynamoDB records). Dimension A is the ceiling — it determines whether a user can access an app at all. Dimension B determines what they can do within a specific account's data.

A pre-token generation Lambda injects structured claims into every issued token. API handlers and the launchpad consume these claims rather than raw group strings. This means authorization logic is centralised in the token, not duplicated across handlers.

Social identity providers (Google, Facebook, Microsoft) are wired at the Cognito layer and offered by ALL three app-clients (launchpad, Stock Analyser, Budget Tracker). Each app authenticates via its own client. Native users cross between apps silently via the reusable Cognito session; federated users need a per-app re-federation, which the Launchpad triggers by passing a provider hint (#490). See [App clients](#app-clients) → "Federated cross-app SSO".

See [cdk.md](./cdk.md) for CDK stack names. See [data.md](./data.md) for account and membership table schemas.

### Ownership

Launchpad owns the auth domain: auth lookup, onboarding,
profile/preferences, account administration, member administration,
invitations, invitation bundles, app-admin grants, active account selection,
Cognito, app clients, pre-token claims, and auth-domain tables.
Platform owns neutral substrate only and does not own auth-domain resources.

---

## Cognito user pool

- **Pool name:** `launchpad-auth-{stage}` (dev / prod)
- **Region:** `ap-southeast-2`
- **Account ID:** `959516291617`
- **Username:** Cognito-generated UUID (`sub`) — not email
- **Sign-in alias:** email address
- **Email:** required; auto-verified

The Launchpad-owned pool is created by `Transformotion{Stage}-LaunchpadAuth`.
Live traffic uses this pool after the #386 cutover and runtime validation.

### Password policy

- Minimum 8 characters
- Requires uppercase, lowercase, digits
- Symbols not required
- Temporary password validity: 7 days

### Custom attributes

The Cognito user pool declares these custom attributes:

| Attribute | Type | Status | Purpose |
|---|---|---|---|
| `custom:accounts` | String (max 2048) | Inert (M16) | Previously maintained by membership-modifying Lambdas. Pre-token Lambda reads the members table directly — this attribute has no reader. New M16 code paths do not write it. The schema attribute remains declared (Cognito forbids removal); documented as inert. (*Status uncertain — verify: the pre-token section previously described it as read by the trigger; the current implementation queries DynamoDB directly. Confirmed inert by Phase 2 inspection.*) |
| `custom:active_account` | String (max 36) | Inert (M16, **Stale-by-decision**) | Previously written by `/auth/setup` for first-account bootstrap. Superseded by D7 (`activeAccounts` map on the user item, owned by the control plane). Write removed in Phase 2. The schema attribute remains declared permanently (Cognito forbids removal); documented as inert. |

**Active account is control-plane-owned (M16 D7).** Active account selection per user per app is stored as the `activeAccounts` map on the `launchpad-users-{stage}` item (`{ [appSlug]: accountId }`). It is read and set via the control-plane API (`GET/PUT /api/user/active-accounts/{appSlug}`). The `X-Account-Id` request header remains the transport for *which account is active right now* on each request; the header value is validated server-side against the caller's membership claims on app-data reads.

> **Stale-by-decision (M16 Phase 2):** Previous statement was "Active account is not a Cognito attribute — it is browser-local UI state." This is superseded. Active account is now control-plane-owned, not browser-local. The `X-Account-Id` header and claims validation survive unchanged.

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

The Launchpad-owned trigger is active for dev authentication.
`LaunchpadAuthStack` attaches `launchpad-pre-token-generation-{stage}` to the
Launchpad-owned User Pool. The trigger reads Launchpad-owned tables and emits
the `apps` and `accounts` claims used by Launchpad, Stock Analyser, and Budget
Tracker. (Both platform admin status **and** app-admin status are read from
Cognito groups — `site-admin` and `{app}-app-admin` respectively — not from
claims. There is no `site_admin` claim and no `app_admin` claim.)

| Trigger | Function | Purpose |
|---|---|---|
| Pre-token generation | `launchpad-pre-token-generation-{stage}` | Injects `apps`, `accounts` custom claims - see below |

---

## App clients

Three distinct Cognito app clients, one per deployable app. All share the same user pool. Cross-app SSO differs by sign-in type: a **native** (Cognito directory) user has a reusable Hosted-UI session, so crossing from one app-client to another issues tokens silently. A **federated** (Google/Facebook/Microsoft) user does NOT — Cognito's login-session cookie is keyed to the (client, provider) it was set with, and a different app-client's `/authorize` shows the chooser unless the request names the IdP (`identity_provider=<X>`, which "redirects silently to your IdP"). See [Federated cross-app SSO](#federated-cross-app-sso-provider-hint) (#490).

| Client | Callback URLs | Logout URLs | Identity providers | CDK logical ID |
|---|---|---|---|---|
| `LaunchpadAppClient` | `{host}/launchpad/callback`, `{host}/sign-in/callback` | `{host}/signed-out/` | Cognito, Google, Facebook, Microsoft where configured | `LaunchpadAppClient` in `LaunchpadAuthStack` |
| `StockAnalyserAppClient` | `{host}/stock-analyser/callback` | `{host}/signed-out/` | Cognito, Google, Facebook, Microsoft where configured | `StockAnalyserAppClient` in `LaunchpadAuthStack` |
| `BudgetTrackerAppClient` | `{host}/budget-tracker/callback` | `{host}/signed-out/` | Cognito, Google, Facebook, Microsoft where configured | `BudgetTrackerAppClient` in `LaunchpadAuthStack` |

Social sign-in is enabled on ALL THREE app-clients (#488): each client must list the
social IdPs in its `SupportedIdentityProviders`, or the Hosted UI cannot issue that
client's tokens for a federated user at all (the earlier launchpad-only config left
SA/BT unable to admit federated users). Listing the IdPs is necessary but **not
sufficient** for *silent* cross-app entry — see below.

### Federated cross-app SSO (provider hint)

For a **native** user, crossing Launchpad → app SSOs silently: the user pool holds a
reusable Cognito session and the app's `/authorize` mints tokens directly, no IdP hop.

For a **federated** user there is no reusable local session — the authentication is the
IdP federation. Cognito's login-session cookie is scoped to the (client, provider) it
was set with, so a *different* app-client's `/authorize` does not reuse it, and because
the app's `signInWithRedirect` names no IdP, Cognito falls back to the managed-login
chooser (per the [AWS docs](https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-pools-identity-federation.html):
"if you provide an `identity_provider` parameter… it redirects silently to your IdP…
otherwise, it redirects to the managed login Login endpoint").

So the Launchpad passes a **provider hint** on cross-app launch (#490): it reads which
IdP the user federated with from the idToken `identities` claim and appends
`?idp=<google|facebook|microsoft>` to the app URL. The app maps the hint to the Amplify
`signInWithRedirect` provider (`identity_provider=<X>`) and re-federates silently — the
IdP already has a session, so there is no prompt. The mapping is shared in
`@transformotion/auth-client` (`providerHintFromIdToken`, `idpHintToProvider`) so all
three apps agree. **Native users carry no hint** (no `identities` claim) and keep their
silent local-session SSO; an unknown/absent hint maps to no provider and falls back to
the chooser (fail-open). Microsoft is a **custom** OIDC provider, so the hint maps to
`{ custom: 'Microsoft' }` (a bare string would not emit `identity_provider=Microsoft`).

`LaunchpadAuthStack` creates Launchpad, Stock Analyser, and Budget Tracker app
clients and emits `LaunchpadAppClientId`, `StockAnalyserAppClientId`, and
`BudgetTrackerAppClientId` outputs consumed by the deploy workflows.

**Dev client IDs** (set in GitHub `dev` environment variables after each auth stack deploy):

| Variable | Client |
|---|---|
| `NEXT_PUBLIC_LAUNCHPAD_COGNITO_CLIENT_ID` | LaunchpadAppClient |
| `NEXT_PUBLIC_STOCK_ANALYSER_COGNITO_CLIENT_ID` | StockAnalyserAppClient |
| `NEXT_PUBLIC_BUDGET_TRACKER_COGNITO_CLIENT_ID` | BudgetTrackerAppClient |

**Callback URL convention:** `{host}/{app-slug}/callback`
**Logout URL convention:** `{host}/signed-out/`

**Launchpad dual callback:** The launchpad app client registers two callback URLs: `{host}/launchpad/callback` (flows initiated from launchpad pages) and `{host}/sign-in/callback` (flows initiated via the sign-in route). Both are registered; SSO flows may originate from either path.

For current client IDs, read from CloudFormation outputs:

```bash
aws cloudformation describe-stacks \
  --stack-name TransformotionDev-LaunchpadAuth \
  --query "Stacks[0].Outputs[?OutputKey=='BudgetTrackerAppClientId'].OutputValue"
```

---

## Hosted UI domain

```
transformotion-launchpad-{account}-{stage}.auth.ap-southeast-2.amazoncognito.com
```

For dev: `transformotion-launchpad-959516291617-dev.auth.ap-southeast-2.amazoncognito.com`

The Hosted UI domain provides the OAuth 2.0 / PKCE flow endpoint for all three app clients and is the redirect target for all social IDPs.

---

## Social identity providers

Google, Facebook, and Microsoft IdPs are registered on the Launchpad-owned pool
as `CfnUserPoolIdentityProvider` resources in `LaunchpadAuthStack`, and added to
ALL THREE app-clients' `SupportedIdentityProviders` (launchpad, Stock Analyser,
Budget Tracker) so they appear in each Hosted-UI chooser — required for cross-app
SSO to work for federated users (#488).

| Provider | `ProviderName` | `ProviderType` | Scopes | Notable detail |
|---|---|---|---|---|
| Google | `Google` | `Google` | `openid email profile` | — |
| Facebook | `Facebook` | `Facebook` | `public_profile,email` | `api_version` `v17.0`; no reliable `email_verified` |
| Microsoft | `Microsoft` | `OIDC` | `openid email profile` | `oidc_issuer` `https://login.microsoftonline.com/9188040d-6c67-4c5b-b112-36a304b66dad/v2.0` — the **consumers** tenant (PERSONAL Microsoft accounts only). Cognito exact-matches the token `iss`; `/common`'s discovery `issuer` is the `…/{tenantid}/v2.0` placeholder, so it was rejected as "Bad id_token issuer". Work/school accounts carry their org tenant issuer and would need a separate provider/tenant. The Azure app registration must also list the pool's `…/oauth2/idpresponse` as a redirect URI (provider-side). |

Attribute mappings send `email`→`email`, `name`→`name`, and `email_verified`→
`email_verified` (Google/Microsoft; Facebook omits `email_verified`). All three
providers map `given_name`/`family_name` (#494): Google and Microsoft from the
OIDC `given_name`/`family_name` claims, Facebook from its `first_name`/`last_name`
fields. This lets the apps show a true first name. Mappings apply at each
federation, so an already-provisioned user populates given/family on their next
sign-in; until then the auth client's `name`-claim fallback (below) still yields a
correct first name. The `ProviderName` values are deliberately
`Google`/`Facebook`/`Microsoft` so the redemption seam's `providerFromClaims()`
(`apps/launchpad/lib/redemption/seam.ts`) resolves the `identities` claim to the
contract `IdpProvider`.

**Display name from claims (#494).** The auth client composes `User.name` from the
ID-token claims as `given + family → OIDC name claim → given alone → email LOCAL
part` — **never the full email** (`composeDisplayName`,
`packages/auth-client/src/display.ts`). The earlier composition fell back to the
full email, which the app sidebars then rendered whole (they take
`name.split(' ')[0]`, and an email has no space). Apps derive the first name and
initials via the shared `userFirstName`/`userInitials` helpers. The Launchpad home
view additionally prefers an **explicitly user-set** control-plane `displayName`:
the `user` Lambda (`GET /api/user/profile`) now omits `displayName` unless the user
set one (the contract field is optional), so an unset name falls through to the
token name rather than the email-derived value. A name set via
`PUT /api/user/preferences` is still stored and wins. Per-app duplication of the
first-name/initials derivation is unified under #491.

`LaunchpadAuthStack` creates Launchpad-owned secret paths under
`/launchpad/{stage}/cognito/*`; each IdP reads its client-id/secret from these via
a CloudFormation **dynamic reference** (`{{resolve:secretsmanager:…}}`) — no
credential value appears in source or in the synthesised template. The stack also
outputs each secret name so provider credentials can be managed without Platform
ownership.

> **Provider-console redirect URI (owner-side).** Each provider's app
> registration (Google/Facebook/Azure console) must allow-list the pool's
> Hosted-UI callback `https://{cognito-domain}/oauth2/idpresponse`. This is
> outside the IaC. A provider appears in the chooser after deploy but completes a
> real login only once its console redirect URI is in place.

Dev rollout: providers wired in the `m11`/`#386` social-IdP cutover.

### Launchpad-owned auth tables

`LaunchpadAuthStack` now creates Launchpad-owned auth-domain tables:

| Table | Purpose |
|---|---|
| `launchpad-users-{stage}` | User profile/preferences target table for the Launchpad-owned auth domain |
| `launchpad-accounts-{stage}` | Account records, including `appSlug` used by pre-token claims |
| `launchpad-account-members-{stage}` | Account membership rows; includes `userId-index` for claim generation |
| `launchpad-invitations-{stage}` | Invitation records with `email-index` and TTL |
| `launchpad-rate-limits-{stage}` | Rate-limit state for Launchpad auth/control-plane endpoints |

These tables back live Launchpad control-plane APIs and token-claim generation.
The historical dev cutover checklist is
[`m9-386-dev-auth-cutover-checklist.md`](../migrations/m9-386-dev-auth-cutover-checklist.md).

Apple Sign-In has placeholder secrets but is not yet active.

All social IDP callback URIs point to:
```
https://transformotion-959516291617-{stage}.auth.ap-southeast-2.amazoncognito.com/oauth2/idpresponse
```

For setup instructions see `docs/social-idp-setup.md`.

---

<!-- mirror:start -->
## Permission model — two dimensions

> **Status — groups-authoritative correction (canonical target).** This section
> describes the corrected, canonical permission model: **Cognito groups are the
> sole authority** for the administrative + app-access dimension (site-admin,
> app-access, app-admin), projected into the token; the **`accounts` claim** is
> the sole authority for account membership and role. There are **no
> `site_admin` / `app_admin` claims** — group membership in the token *is* the
> signal. This is now fully realized in runtime: the `{app}-app-admin` Cognito
> groups exist (M11 A1) and the `app_admin` claim has been struck from the
> pre-token Lambda in favour of those groups (M11 A2); the `requireAppAdminForApp`
> guard reads the `{app}-app-admin` group from `cognito:groups`. Everything here
> is current.

The two dimensions are: **Dimension 1 — Cognito groups** (authority for site-admin, app-access, app-admin) and **Dimension 2 — the `accounts` claim** (authority for account memberships and roles). No custom token claim may duplicate a group-controlled permission.

### Dimension A: Cognito groups (site-admin, app-access, app-admin)

Cognito groups are authoritative for three things:

| Group | Grants |
|---|---|
| `site-admin` | Platform-level **supervisory** authority. Sourced from the `site-admin` group (no claim). Does **not** grant private app data, account membership, or any account role. |
| `stock-app-access` / `budget-app-access` | The user may enter that app's shell. App-access alone does **not** grant private data — account membership is still required. |
| `stock-app-admin` / `budget-app-admin` | App-scoped control-plane authority (invitee discovery, app-grant invitations, app-level config). Grants **no** private data, **no** account membership, and does **not** satisfy `account-member` / `account-owner-or-manager`. Created/removed only by site-admin. |

**Single-tier app access is deliberate.** Capability-level within an app (who can read, write, invite, delete) is expressed entirely by Dimension B (account roles). A user either has access to an app or they do not; *what they can do* within the app is determined by which accounts they belong to and in what role.

**App-access is independently held — the invariant is one-directional.**

- **Membership ⟹ app-access.** Any account grant (account-invite, or self-service account creation) ensures the user holds the app's access group; the pre-token Lambda also adds the access group for any user who has ≥1 account in the app and lacks it. You can never be an account member of an app without app-access.
- **App-access ⇏ membership.** "Has app-access, no accounts" is a **valid, designed state** (see [App-access with no accounts](#app-access-with-no-accounts-permitted-state)). App-access is granted independently (an **app-grant** invitation, or a direct site-admin grant) and is **NOT** removed when a user's account count for the app reaches zero. The previous biconditional — "a user is in `stock-app-access` *iff* they have ≥1 account", with the access group auto-removed at zero accounts — is **superseded**: the pre-token Lambda keeps only the add-on-membership direction, never the remove-on-zero direction.

**App-admin is a Cognito group, not a claim — and the grants table is a projection.** App-admin authority is `cognito:groups` membership in `{app}-app-admin`; the policy guard `requireAppAdminForApp` resolves from the group, never from a table. The `launchpad-app-admin-grants-{stage}` table is a **non-authoritative read-projection** maintained from group membership; it exists only to populate admin/discovery UI efficiently (the site-admin directory, and Phase 7 "who admins app X" enumeration, which `ListUsersInGroup` serves poorly). Nothing reads it for an authorization decision.

**`site-admin` is first-class and explicit.** It is not derived from any other state; it is an explicit Cognito group grant and represents platform-level supervisory authority. It does not, by itself, grant app data, account membership, or app-access.

> **Migration note:** Deployed groups are `site-admin`, `stock-app-access`, `stock-app-admin`, `budget-app-access`, `budget-app-admin`, plus legacy `admin`, `stock-app`, `budget-app`, `transformotion`, `family`. The `{app}-app-admin` groups (`stock-app-admin`, `budget-app-admin`) were created in M11 A1 as part of the groups-authoritative correction; any table-derived app-admins are migrated into real group membership by granting the group. Legacy groups are removed at 7e-cleanup.

### Dimension B: Account membership (DynamoDB)

Accounts are per-app data containers. Each app has its own set of accounts; a user's "Stock Signal account" and "Budget Tracker account" are independent records with independent IDs and independent membership lists.

Account membership is stored in `launchpad-account-members-{stage}` (PK: `accountId`, SK: `userId`) with a `role` attribute:

| Role | Capability | Allowed multiplicity per account |
|---|---|---|
| `owner` | Full control: read, write, invite others, remove any member, delete the account, transfer ownership | Exactly one |
| `manager` | Full use + can invite; can remove non-owner members (cannot remove the owner or other managers) | Any number |
| `member` | Read and write the account's data | Any number |
| `viewer` | Read-only | Any number |

**Single-owner invariant.** Every account has exactly one owner at all times. Operations that would remove or demote the owner are rejected unless ownership is transferred to another user atomically in the same operation. Site-admin can override to reassign ownership administratively.

**Ownership transfer.** The current owner can transfer ownership to any other member or manager of the account. The previous owner becomes a manager; they can choose to remove themselves afterwards. The account retains exactly one owner throughout.

**Role hierarchy** (exported as `ROLE_HIERARCHY` from `packages/lambda-middleware`, consumed by the policy layer):
`owner > manager > member > viewer`. A minimum-role check for `manager` succeeds for `owner` and `manager`; fails for `member` and `viewer`. The policy layer's `roleAtLeast` / `decideMinRole` (D9) evaluate against this ordering; `viewer` is the read floor (read-only), `member` the write floor.

**Write-path row check (D8, M16).** App-data **writes** (Stock Analyser / Budget Tracker mutations) go through the policy layer's `requireAccountData(appSlug).write(...)` (`packages/lambda-middleware`), which folds `requireAccountWrite`: the claims membership check **plus** a live read of the caller's `launchpad-account-members` row. The live row is the authority because claims can be stale — a user demoted to `viewer`, disabled, or removed after token issuance still carries the old claim for up to the access-token lifetime. The write is rejected (403) when the row is missing (**fail closed**), the row's `status` is not `active`, or the role is `viewer` (read-only). There is **no site-admin bypass** on this path: membership is the only grant of data authority (D9). Reads go through `requireAccountData(appSlug).read(...)` — claims-only, no table read on the hot path, and a `viewer` claim passes (read visibility).

The write gate applies to handlers that mutate **account-shared** data, classified by the item's key shape, not by the route alone (see `docs/architecture/route-classification-m16.md` for the per-route migration record). Worked examples: Stock Analyser portfolio/watchlist and Budget Tracker transactions/rules/budget-data/settings/export are write-gated; **Budget Tracker settings is gated** because its rows are account-scoped (`PK=accountId, SK=settingKey`, no user dimension), whereas **Stock Analyser settings is NOT write-gated** because its rows are per-user within the account (`SK=USER#{userId}#PREFERENCES`, D12) — a viewer may set their own preference. SA analysis-cache writes are now write-gated (member-tier; previously had no row check). Budget Tracker AI routes are write-gated (member-tier, owner ruling #1). AI-config overrides remain member-tier write plus an interim `requireSiteAdmin`; the operational-config admin axis rehomes them in PR-C (#416).

### Conflict resolution between dimensions

Dimensions A and B describe different axes and can express potentially conflicting states (e.g., user has app-access but is `viewer` on all accounts; user lacks app-access but somehow has a `member` row).

The resolution rule is: **Dimension A is the ceiling.**

- If a user lacks app-access for Stock Signal (Dimension A), they cannot perform any operation in Stock Signal, regardless of any Dimension B roles they might have on Stock Signal accounts.
- If a user has app-access for Stock Signal (Dimension A), their capability within a specific Stock Signal account is determined entirely by Dimension B (their role on that account).
- Dimension B can only restrict, never grant beyond Dimension A.

In practice: Dimension A governs *whether the user can use the app at all*. Dimension B governs *what operations they can perform on a specific account's data*.

**`site-admin` does NOT grant data authority (D9, M16 — reversed).** This is the single largest normative change in M16. The platform now operates on two distinct axes:

- **Data authority** — the right to read or write an account's app data. **Membership is the only grant of data authority.** A site-admin with no membership row on an account is denied (404/403) on that account's data, exactly as any non-member is. `requireAccountData` has **no site-admin branch**. The superseded model — "every authorization helper checks site-admin first as an override" — is deleted.
- **Administrative authority** — supervisory and operational-config operations (member removal, account disable/delete, cross-app directory, app-admin config). These are governed by `requireAccountAdmin` and the `requireSiteAdmin` / app-admin policy guards. Site-admin is supervisory here: it can *remove* members and disable/delete accounts, but it can **never grant itself a role or write account data**. A supervisory action carries no data visibility.

Dimension A (app access) remains the ceiling for data operations as described above. The reversal concerns only the former blanket site-admin data bypass.

---

## App-access with no accounts (permitted state)

A user who holds an app-access group but has **no account** in that app is a valid, designed state — not an error to reconcile away. It arises two ways: **(a)** an **app-grant** invitation — the invitee is granted app-access with **no account** and self-creates their first account on arrival, becoming its `owner`; and **(b)** a **direct app-access group grant** (e.g. a site-admin adds the user to the `{app}-app-access` group). The former `app-provision` invitation — where an inviter pre-created and **named** the account for the invitee — is **retired** from the model: invitees always create and name their own first account.

What such a user can do, and only this:

- **Enter the app shell.** The access group admits them to the app.
- **See a no-account / "create account" setup state.** No private data is loaded; there is no global or default account fallback. (See [Three-state tile model](#three-state-tile-model) for the launchpad-side empty state.)
- **Create their own account** if product policy allows self-service creation — `POST /accounts`, which requires the app-access group and an active user, does **not** require a pre-existing membership, and makes the creator the `owner` of the new account.

They **cannot** read or write any account's private data until a membership exists.

## App-access and app-admin lifecycle (Cognito group operations)

Because groups are authoritative, granting and removing app-access or app-admin are **Cognito group operations**, and any control-plane grant record is a downstream projection.

- **Grant app-access** — `AdminAddUserToGroup(<app>-access)`. The user may enter the shell; gains no membership, no app-admin, no private data.
- **Remove app-access** — `AdminRemoveUserFromGroup(<app>-access)`. The user can no longer enter the shell; app-data routes fail closed; the active account for that app is cleared. Account memberships are **not** automatically removed (retained for audit/reactivation) unless the operation is the full app-removal cascade below.
- **Grant app-admin** — `AdminAddUserToGroup(<app>-admin)`, **site-admin only**. Confers app-scoped control-plane authority; confers no app-access (grant separately if the admin also needs the shell), no membership, no private data. The grants table projection is updated to match.
- **Remove app-admin** — `AdminRemoveUserFromGroup(<app>-admin)`. App-access and memberships are untouched.

**Account grant ⟹ app-access (implicit).** Granting account membership — whether via account-invite or self-service creation — **ensures the user holds the app-access group**. An account-invite to a user who does not yet have app-access grants it as part of redemption; a member can never lack the access group. This closes the gap where account membership and app-access could be granted independently: in this model, membership always implies access (the converse does not hold — see the one-directional invariant above).

<!-- mirror:end -->

---

## Pre-token generation Lambda

**Function:** `transformotion-pre-token-generation-{stage}`
**Trigger:** Cognito pre-token-generation — invoked on every token issuance (sign-in and refresh).

**Responsibilities:**

1. Read the user's Cognito groups from the event (`event.request.groupConfiguration.groupsToOverride`).
2. Query `launchpad-account-members-{stage}` for all rows where `userId = <event.userName>` — returns all of the user's account memberships across all apps.
3. **Maintain the membership ⟹ app-access direction.** For each app slug (`stock-analyser`, `budget-tracker`):
   - If the user has any accounts for the app but is not in `<app>-access`: call `AdminAddUserToGroup`, update the in-memory group list for claim construction.
   - **The reverse is NOT applied.** A user in `<app>-access` with no accounts is a valid state ("access, no accounts") and the access group is **left in place** — the former remove-on-zero branch is removed (groups-authoritative correction). App-access is removed only by an explicit grant-removal/app-removal operation, never by the pre-token reconciliation.
   - The `site-admin` Cognito group drives supervisory surfaces; it does not retain app-access groups or app-data authority for apps the user has no access group for.
4. Build the `apps` claim: JSON-stringified array of app slugs the user has access to (derived from the user's app-access groups).
5. Build the `accounts` claim: JSON-stringified map of app slug to `[{accountId, role}]`, grouped from the membership query results.
6. **No admin claims are emitted.** Site-admin and app-admin status both travel in `cognito:groups` (`site-admin`, `{app}-app-admin`) and are read group-side by consumers. The former `app_admin` claim (table-derived) and `site_admin` claim are **not** emitted (groups-authoritative correction). The Lambda therefore does **not** read `launchpad-app-admin-grants-{stage}` — that table is a UI/discovery projection read elsewhere, not a claim source.
7. Set `event.response.claimsAndScopeOverrideDetails.accessTokenGeneration.claimsToAddOrOverride` with the claims.
8. Also set the same on `idTokenGeneration.claimsToAddOrOverride` so both tokens carry the claims.

**On failure:** Return the event unchanged. Cognito issues tokens without custom claims. Consumers (launchpad, API handlers) fail closed — empty or missing `apps`/`accounts` means the user has no access.

**Latency budget:** One DynamoDB query per token issuance plus zero-to-N `AdminAddUserToGroup` calls in the reconciliation step (**add-only** — the reconcile never removes a group; #473). Invoked only on sign-in and token refresh (roughly every hour per active user, not every API call). Cost and latency are negligible at family-platform scale.

---

<!-- mirror:start -->
## Claim shape

> **Groups-authoritative correction (Stale-by-decision):** the `app_admin` claim is **removed**, alongside the already-removed `site_admin` claim. App-admin status is sourced solely from the `{app}-app-admin` Cognito groups (`cognito:groups`); it was a duplicate of group state, never an independent authority. Phase 2's lean-triple `accounts` remains; the only custom claims are `apps` and `accounts`.

The pre-token generation Lambda injects two custom claims on every token issuance:

```json
{
  "apps": "[\"stock-analyser\",\"budget-tracker\"]",
  "accounts": "{\"stock-analyser\":[{\"accountId\":\"uuid-1\",\"role\":\"owner\"}],\"budget-tracker\":[{\"accountId\":\"uuid-2\",\"role\":\"manager\"}]}"
}
```

The values are JSON-stringified strings (Cognito requires claim values to be primitive strings). Frontend and auth middleware parse the stringified JSON back into objects on receipt.

Logical shape after parsing (M16 D8 lean triples):

```
apps:       string[]                                           — app slugs the user can access (from the user's app-access groups)
accounts:   Record<appSlug, Array<{accountId, role}>>          — per-app lean membership triples; role vocabulary owner|manager|member|viewer
```

**Admin status is NOT a claim — neither platform nor app.** Platform admin is read from the `site-admin` Cognito group via `cognito:groups`; app-admin is read from the `{app}-app-admin` Cognito groups via `cognito:groups` (both tokens carry groups). Backend (`extractAuthClaims` → `auth.siteAdmin`, and the app-admin policy guard) and frontend derive both from groups; there is no `site_admin` claim and no `app_admin` claim.

**Staleness is bounded and accepted (D8).** Access-token lifetime is 1 hour; a removed user's stale token retains read visibility for up to an hour. **Staleness gives lingering read visibility, never lingering write capability.** The moment a removed or demoted user attempts any app-data write, the table check fails closed.

**No display names, statuses, or pending state in tokens.** These are what the access-summary API is for. Memberships per user may grow under M16; lean triples keep token size bounded.

Plus the standard Cognito claims (`sub`, `email`, `cognito:groups`, token lifetime fields). `custom:accounts` is inert (see Custom attributes above).

**Launchpad renders tiles GROUPS-AUTHORITATIVELY** (M11): a tile shows when the user holds the app's `{app}-app-access` Cognito group (or is site-admin / app-admin for it), NOT from membership. A holder of the access group with **zero** accounts (the "access, no accounts" state) sees a *create-first-account* tile; membership only distinguishes that state from the normal-open tile — see [Three-state tile model](#three-state-tile-model).
**API handlers enforce per-account authorization by inspecting `accounts`.**

<!-- mirror:end -->

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

**Step 8 — API calls.** When the frontend calls a Lambda-backed API, it includes the access token in the `Authorization: Bearer <token>` header. API Gateway's Cognito authorizer validates the JWT signature against Cognito's public keys and confirms the token has not expired. The auth middleware in the Lambda handler parses the custom claims (`apps`, `accounts`) plus `cognito:groups` (the `site-admin` group → `auth.siteAdmin`; the `{app}-app-admin` groups → app-admin authority) and constructs the `auth` object for the handler to use.

**Step 9 — Token refresh.** Every hour (default access token lifetime), the frontend detects the token is about to expire and calls the refresh endpoint. Cognito invokes the pre-token Lambda again and issues new access + ID tokens. The fresh token reflects any changes to the user's groups or account memberships since the last issuance (up to the 1-hour staleness window).

---

## Three-state tile model

> **M11 — groups-authoritative.** Tile VISIBILITY derives from the `{app}-app-access` Cognito group (`cognito:groups`, surfaced client-side as `User.metadata.appAccess`), plus site-admin / `{app}-app-admin`. NOT from membership. Membership (apps with ≥1 account, read via `GET /api/user/active-accounts`) only distinguishes the *create-first-account* state from the normal-open state. The earlier "tiles from membership" and "tiles from the `apps` claim + hardcoded list" rules are both **Stale-by-decision**. **Admin/control-plane surfaces gate on the `site-admin` / `{app}-app-admin` groups, never on app membership.**

The launchpad resolves each app tile group-authoritatively (gated, deployed apps):

| Viewer (for the app) | Has ≥1 account | Tile state |
|---|---|---|
| Holds the access group | Yes | Active — clickable, launches the app |
| Holds the access group | No | **Create-first-account** — "Access granted, create your first account" CTA → `POST /accounts` (A4) |
| site-admin / app-admin only (no access group) | Any | Active — normal launch tile (not create-first-account) |
| None of the above | Any | Not rendered |
| Any of the above, app NOT deployed | Any | Not rendered |

Each app's tile reflects its OWN state independently (a viewer can have an account in one app beside an access-no-account tile in another). A viewer with **no** access groups (and not admin) sees the explicit empty state ("No apps yet — access arrives by invitation"). Backfill tolerant: missing/legacy data resolves to "not visible", never a crash. Coming-soon/not-deployed catalogue entries stay hidden. Admin surfaces (AI runtime settings, Users & Access) show from the `site-admin` / `{app}-app-admin` groups independently of any tile.

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
| `auth.siteAdmin` | `boolean` | derived from `cognito:groups` (true iff the `site-admin` group is present) — no `site_admin` claim |
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

requireAccountData(appSlug)
// The data-authority middleware factory (D9). Returns an object with:
//   .read(auth, accountId)          — claims-only membership check; viewer passes
//                                      (read visibility). No table read on the hot path.
//   .write(auth, accountId, loader) — folds requireAccountWrite: claims membership
//                                      PLUS a live members-row read via `loader`.
//                                      Rejects (403) on missing row (fail closed),
//                                      non-active status, or viewer role.
// NO site-admin branch — membership is the only grant of data authority.
// Replaces requireAccountAccess for all app-data routes.

requireAccountAdmin(...guards)
// Administrative-authority composition (D9), built from anyOf(...) over policy
// guards (requireAccountOwnerRole, requireAccountOwnerOrManager,
// requireSupervisorySiteAdmin, requireAppAdminForApp, ...). Use for supervisory
// and ownership-class operations. Replaces requireAccountOwner.
```

**`requireAccountAccess` and `requireAccountOwner` were deleted in M16 Phase 5 (D9)** — not deprecated, deleted, with zero remaining callers. Both folded a blanket site-admin override that the two-axis model removes. App-data routes use `requireAccountData`; supervisory/ownership routes use `requireAccountAdmin`. The full per-route migration is recorded in `docs/architecture/route-classification-m16.md`.

**Authorization tier table (D8/D9).** Three tiers, distinguished by what they consult:

| Tier | Helper | Consults | Site-admin |
|---|---|---|---|
| App-data read | `requireAccountData(app).read` | Claims only (`auth.accounts`) | No branch — membership only |
| App-data write | `requireAccountData(app).write` | Claims **+ live members row** | No branch — membership only |
| Control-plane / supervisory | `requireAccountAdmin(...)`, `requireSiteAdmin` | Policy guards (live tables / `site-admin` Cognito group) | Supervisory: can remove/disable, never grants data authority |

**Fail-closed semantics.** When `auth.apps` or `auth.accounts` are absent or empty (e.g., due to a pre-token Lambda failure), helpers deny access rather than granting it. The data-path policy guards additionally resolve the target first and return a **uniform not-found** response so missing-membership and missing-resource are indistinguishable. The pre-token Lambda documents the empty-claims case under "On failure" above.

### Claim-consumption layering

Raw JWT claim reads occur only in the middleware layer (`packages/lambda-middleware/`). Business-logic Lambdas access claims via the typed `auth` object provided by `withAuth` / `withAuthOnly`, using documented helpers (`requireAccountData`, `requireAccountAdmin`, `requireAppAccess`, `requireSiteAdmin`, etc.) when authorization decisions are needed. New Lambdas never read claims directly; the middleware layer is the only place raw claim access belongs.

This is a layering rule of the same shape as the data-access layered architecture (see `CONTRIBUTING.md` Section 5). Concerns are separated by layer: the middleware layer encapsulates raw-claim concerns; business logic operates on typed values.

### Deprecated helpers (retiring in M8)

- `requireGroup(auth, group)` — group-name-based pattern superseded by claim-based helpers. Retained only for legacy compatibility if needed; new Launchpad-owned forgot-provider work must not use it.
- `userInGroup(auth, group)` — utility check, also group-name-based; zero current callers; retires alongside `requireGroup`.

Handlers do NOT call `requireGroup` for new work.

---

## Handler authorization patterns

Every Lambda handler follows this pattern. Deviations require a written justification in the handler's code.

### Standard app-scoped handler (data routes)

The data-authority middleware factory is constructed once at module scope, then `.read` / `.write` is called per branch:

```typescript
const appData = requireAccountData('app-slug');               // module scope
const membershipLoader = dynamoMembershipLoader(ddb, process.env.ACCOUNT_MEMBERS_TABLE!);

export const handler = withAuth(async ({ auth, account, event }) => {
  if (event.requestContext.http.method === 'GET') {
    appData.read(auth, account.accountId);                    // read tier: claims-only, viewer passes
    // ... read logic
  } else {
    await appData.write(auth, account.accountId, membershipLoader); // write tier: claims + live row, viewer denied
    // ... mutation logic
  }
  // accountId comes from request context; all DynamoDB keys use account.accountId
});
```

`requireAppAccess` is no longer the explicit first call on data routes: `requireAccountData` subsumes app-access (a user with no membership for the app has no account row to match). Supervisory/ownership routes use `requireAccountAdmin(...)` instead of the data factory.

### Multi-app platform handler (currently: claude-proxy only)

```typescript
export const handler = withAuth(async ({ auth, account, event }) => {
  requireAnyAppAccess(auth, ['stock-analyser', 'budget-tracker']); // user must have at least one app

  // ... handler logic
});
```

### Rules

1. **A policy guard runs before any DynamoDB access.** Data routes call `requireAccountData(app).read`/`.write`; supervisory/ownership routes call `requireAccountAdmin(...)`; platform routes call `requireSiteAdmin`. Multi-app platform handlers (claude-proxy) still call `requireAnyAppAccess` first.
2. **Read vs write is a tier decision, not a route decision.** Reads use `.read` (claims-only, viewer passes); mutations of account-shared data use `.write` (claims + live members row, viewer denied). User-scoped rows within an account (e.g. SA per-user preferences, D12) use `.read` for the owner's own writes.
3. **`accountId` always comes from request context** (`account.accountId`, sourced from the `X-Account-Id` request header). Never derive `accountId` from `auth.accounts` or any other JWT claim.
4. **Elevated / supervisory operations** (member removal, account disable/delete) use `requireAccountAdmin(...)` composed from the relevant policy guards. There is no site-admin data bypass.
5. **Platform-admin operations** (cross-app user management, user disable/delete, cross-app directory) use `requireSiteAdmin`.
6. **`requireGroup` must not appear in new handler code.** It is deprecated and will be removed at 7e-cleanup.

---

## Per-Lambda permission models

The auth/control-plane Lambdas have explicit permission models. Each is documented here for reference; the patterns reflect what each Lambda does and the authorization shape it requires.

| Lambda | Wrapper | Authorization | IAM scope |
|---|---|---|---|
| `apps/launchpad/functions/accounts` | `withAuthOnly` (M16 P6, ruling #4 — keys off **path** `accountId` + `auth.userId`; never reads `X-Account-Id`, so it must not require one) | Per-request shared wiring loads the account row + all member rows once and closes an in-memory `MembershipLoader` over the array; reads (R1 `GET`, R2 `GET …/members/detail`) gate on `requireAccountAdmin(requireAccountMember)`, write (R3 `PUT`) on `requireAccountAdmin(requireAccountOwnerOrManager)` + field-guard whitelist; uniform-deny so account existence is not probeable. PR-6B mutations: `removeMember` (owner-or-manager + `decideRemoval` / LIVE supervisory-site-admin + last-owner floor + `AdminUserGlobalSignOut`), `deleteAccount` (owner-only, **block-if-members → 409** + GlobalSignOut). | `launchpad-accounts` RW + `launchpad-account-members` RW + `cognito-idp:AdminUserGlobalSignOut` & `AdminListGroupsForUser` on the user pool ARN |
| `apps/launchpad/functions/user` | `withAuthOnly` | User owns their own profile/preferences/active-account. Active-account SET verifies membership via table check (D8 control-plane) | `launchpad-users` RW + `launchpad-accounts` R + `launchpad-account-members` R |
| `apps/launchpad/functions/account-provisioning` | `withAuthOnly` | None — profile-bootstrap; user has JWT but no account yet (M16 D11: no longer creates accounts) | `launchpad-users` RW + `launchpad-account-members` R + `AdminGetUser` on user pool ARN |
| `apps/launchpad/functions/access-summary` | `withAuthOnly` | `requireSiteAdmin` — site-admin directory only | `launchpad-users` R + `launchpad-accounts` R + `launchpad-account-members` R + `launchpad-app-admin-grants` R + `ListUsersInGroup` on user pool ARN |
| `apps/launchpad/functions/invitations` | `withAuth` | Inline owner check against `launchpad-accounts` | `launchpad-accounts` R + `launchpad-invitations` RW |
| `apps/launchpad/functions/invitation-bundles` | `withAuthOnly` | **sender authorization per grant** (`canCreateInvitationGrant`: site-admin OR `{app}-app-admin` for the grant's app, from cognito:groups); same-app conflict enforced server-side; writes the bundle (M11 Chunk 3) | `launchpad-invitations` RW + `launchpad-accounts` R (no Cognito — grants are CONFERRED at redemption) |
| `apps/launchpad/functions/invitation-redemption` | `withAuthOnly` | NORMAL `…/redeem`: **invitee-only** (caller email == bundle email). DEV-ONLY `…/redeem-as` (demo bypass / impersonation): **structurally refused unless STAGE != prod** (server-side env guard — NOT the client flag) AND a site-admin caller; redeems FOR the bundle's invitee. Per-grant redemption of `account-invite` / `app-grant` (M11 A5 + Chunk 3) | `launchpad-invitations` RW + `launchpad-accounts` R + `launchpad-account-members` RW + `launchpad-users` R + `cognito-idp:AdminAddUserToGroup` / `AdminListGroupsForUser` / `ListUsers` (the latter two serve the dev-only redeem-as) on the user pool ARN |
| `apps/launchpad/functions/forgot-provider` | None (raw handler - pre-authentication) | None | `launchpad-rate-limits` RW + `AdminGetUser` on user pool ARN + SES `SendEmail` |

**Launchpad `accounts`, Launchpad `user`, Launchpad `account-provisioning`, and Launchpad `invitations`** are user-facing control-plane API endpoints. Each uses the appropriate middleware wrapper based on whether account context is required, and inline authorization based on what the operation needs to verify. The platform copies of `accounts`, `user`, `auth/account-provisioning`, and `auth/invitations` remain deployed only as decommission debt after #386 cutover.

**`apps/launchpad/functions/forgot-provider`** is pre-authentication by necessity (the user has forgotten their identity provider; they cannot authenticate). It uses no middleware wrapper - the handler reads the request directly. Abuse-resistance is provided by Lambda-side IP-based rate limiting. The legacy platform `auth/forgot-provider` route remains deployed only as decommission debt. See *Forgot-provider flow* below.

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

Table: `launchpad-invitations-{stage}`.

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
   c. Writes the record to `launchpad-invitations-{stage}` with `status: 'pending'`.
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
   b. Looks up the invitation by `invitationId` in `launchpad-invitations-{stage}`.
   c. Validates:
      - `status === 'pending'`
      - Current time < `expiresAt`
      - Invitation `email` matches caller's Cognito email (case-insensitive) — prevents a different user from redeeming a link they intercepted
   d. Executes the grant **transactionally** (DynamoDB `TransactWriteItems`) across all `perApp` entries:
      - For `new-personal-account`: create a new account record in `launchpad-accounts-{stage}`, add the user to `launchpad-account-members-{stage}` as `owner`.
      - For `join-existing`: verify the accountId exists, add the user to `launchpad-account-members-{stage}` with the specified role.
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

An account owner or manager removes someone from a specific account (or a supervisory site-admin removes a member). Implemented in the `accounts` Lambda (M16 Phase 6 / PR-6B).

Endpoint: `DELETE /accounts/{accountId}/members/{userId}`.

Authorization — `requireAccountAdmin` (anyOf):
- **owner-or-manager** of the account AND the removal is role-legal (`decideRemoval`): an owner may remove anyone; a manager may remove `member`/`viewer` members ONLY (never another manager or an owner); self-removal is allowed; OR
- **supervisory site-admin**, verified **LIVE** via `AdminListGroupsForUser` (not the token claim — supervisory removal is a sensitive mutation that must not trust a stale claim).
- **Last-owner floor** (`decideLastOwnerGuard`) applies to EVERYONE incl. supervisory site-admin: the sole owner cannot be removed (409 — transfer or delete the account). Orphaning a populated account is only the §9.3 cleanup (separate).

Steps (fail-closed ordering):
1. Resolve the account + members; authorize per above. Loader/Cognito errors → **503** (never proceed).
2. Enforce the last-owner floor (409 if the target is the sole owner).
3. Delete the row in `launchpad-account-members-{stage}` for `(accountId, userId)` — the authoritative control-plane removal. From this instant the removed user's app-data **writes** fail closed via the live row-check (D8), and their next token refresh drops the account.
4. Call `AdminUserGlobalSignOut` on the target — invalidates refresh tokens immediately. A sign-out failure is **surfaced as 502, never a silent success**; the row-delete is idempotent on retry. (No `custom:accounts` write — D11.)

After this: the target's existing access token remains valid until expiry (≤1h), but writes already fail closed. On next refresh the pre-token Lambda issues a token without the account. If it was the user's last account in an app, the access group is **retained** — the reconcile is one-directional (membership ⟹ app-access, never the reverse, see Pre-token generation Lambda above), so the user lands in the valid "access, no accounts" state (a create-first-account tile), **not** removed from the app. Dropping app-access entirely is only the explicit app-removal cascade (§ below), never the pre-token reconcile (#473).

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

**Account-ownership constraint.** Before deletion, query `launchpad-account-members-{stage}` for rows where `userId = <target>` AND `role = 'owner'`. If any exist: reject with 409 Conflict, listing the affected accounts with ownership-transfer instructions. The caller must transfer each account's ownership to another user before retrying the delete.

If no ownership rows remain: proceed:
1. Delete all membership rows from `launchpad-account-members-{stage}` where `userId = <target>`.
2. Call `AdminDeleteUser` on the Cognito user.

After this: the user record is gone from Cognito. Existing access tokens remain valid for up to 1 hour, then expire naturally.

<!-- mirror:start -->
### Scenario D: Removing all access to an app (the app-removal cascade)

Removing a user from an app entirely is a **cascade**, because app-scoped state spans three places. Removing app-access alone (Scenario above under lifecycle) does *not* clean these up; the full removal must, in order:

1. **Remove the app-access group** — `AdminRemoveUserFromGroup(<app>-access)`. The user can no longer enter the app shell.
2. **Remove the app-admin group if present** — `AdminRemoveUserFromGroup(<app>-admin)`. App-admin must not outlive app access — an app-admin for an app the user can no longer enter is exactly the dangling-authority state the groups model forbids.
3. **Deactivate the user's account memberships for that app** — remove/disable every `launchpad-account-members-{stage}` row for accounts in `appSlug`. Accounts are app-scoped, so losing the app means losing the app's account memberships. The single-owner guard applies: if the user is the sole `owner` of an account, ownership must be transferred (or the account emptied/deleted) first, by the same 409 rule as user deletion.
4. **Clear the active account** for that app (D7 `activeAccounts` map) so no inaccessible selection is retained.
5. **Invalidate refresh tokens** — `AdminUserGlobalSignOut` — so the cascade takes effect at next token issuance rather than lingering the full access-token window.

**Invariant enforced by the cascade:** because membership ⟹ app-access (groups maintained from membership) and app-admin presupposes app access, losing app access must drop app-admin and app-scoped membership together. The `requireAppAdminForApp` guard reads the live `{app}-app-admin` group, so a removed group denies immediately on the admin axis; app-data writes fail closed on the missing membership row. The grants-table projection is updated to reflect the removed group.

Authorization: `requireSiteAdmin` (platform-supervisory removal). This is distinct from a user **removing themselves** from a single account (account-member self-removal) and from account-member removal by an owner/manager (Scenario A) — the cascade is whole-app removal, not single-account.

<!-- mirror:end -->

---

## Forgot-provider flow

Users who do not remember which identity provider they signed up with can request a reminder.

**Endpoint:** `POST /auth/lookup-provider` (public — no JWT required)

The live Lambda `launchpad-forgot-provider-{stage}` (in `LaunchpadControlPlaneStack`):
1. Rate-limits by IP/email
2. Queries the Launchpad-owned Cognito User Pool via `AdminGetUserCommand`
3. Reads the `identities` attribute to detect which IDP was used
4. Sends an SES email to the user naming the sign-in method and a link

The handler is pre-authentication by necessity. It uses no `withAuth` / `withAuthOnly` wrapper — there is no JWT to extract. Abuse-resistance is the load-bearing security property.

### Abuse-resistance posture
Lambda-side IP-based rate limiting (5 requests per IP per 15 minutes, stored in `launchpad-rate-limits-{stage}`). The current handler fails open if the rate-limit table is unavailable, preserving the existing behavior.

Future hardening can add API Gateway throttling, CORS allowlisting to the sign-in page origin, tighter SES resource scoping, and fail-closed rate limiting.

**Known limitation:** For federated users, `AdminGetUser(Username=email)` fails because their Cognito username is `Google_{sub}` (not email). The fix using `ListUsersCommand` resolves this. See sub-phase `7e-forgot-provider-fix` in `docs/sub-phase-7e-plan.md`.

---

## Launchpad onboarding and user profile APIs

Launchpad owns the live onboarding, user profile/preference, account administration, member management, and invitation API surface in `LaunchpadControlPlaneStack`:

| Route | Live Lambda | Notes |
|---|---|---|
| `POST /auth/setup` | `launchpad-account-provisioning-{stage}` | First-login **profile** bootstrap (D11, contract m16.1.0): ensures the user item exists in `launchpad-users-{stage}`; never auto-creates an account. Returns `AccountSetupResponse { accountId?, userCreated, profileComplete }` — `accountId` omitted unless the user already holds one. |
| `GET /api/user/profile` | `launchpad-user-{stage}` | Reads the caller's profile/preferences from `launchpad-users-{stage}`. |
| `PUT /api/user/preferences` | `launchpad-user-{stage}` | Merges caller-owned preferences into `launchpad-users-{stage}`. |
| `POST /accounts` | `launchpad-accounts-{stage}` | M11 A4 — self-service create-first-account. Request `{ name, appSlug }` (m16.6.0: `appSlug` in the body — the multi-app launchpad token can't say which app the user clicked). **Requires the `{appSlug}-app-access` group** (groups-authoritative) + active user — the body says WHICH app, the access group AUTHORIZES it (a caller without it → 403, whatever appSlug is sent; unknown appSlug → 400). Creates the account + **owner** membership; ensures the access group (`AdminAddUserToGroup`, idempotent). No pre-existing membership required. |
| `GET /accounts/{accountId}` | `launchpad-accounts-{stage}` | R1 — account + member list to any **active member** (`requireAccountMember`); uniform-deny. |
| `GET /accounts/{accountId}/members/detail` | `launchpad-accounts-{stage}` | R2 — full `ListAccountMembersResponse` (members with `isLastOwner`; `pendingInvitations: []` until Phase 8) to any active member; the v0 account-management-view target. |
| `PUT /accounts/{accountId}` | `launchpad-accounts-{stage}` | R3 — updates `name` for **owner-or-manager** + field-guard whitelist (`ownerId`/billing owner-only). |
| `DELETE /accounts/{accountId}` | `launchpad-accounts-{stage}` | PR-6B — **owner-only**; **BLOCKS if other members exist (409)**, never cascades (empty via removeMember first); + GlobalSignOut. Populated-account cascade is ADR §9.3 only. |
| `GET /accounts/{accountId}/members` | `launchpad-accounts-{stage}` | Legacy thin member list — retained, unwired-to-UI; superseded by `…/members/detail`. |
| `DELETE /accounts/{accountId}/members/{userId}` | `launchpad-accounts-{stage}` | Removes a member after owner verification. |
| `POST /accounts/{accountId}/invitations` | `launchpad-invitations-{stage}` | Creates an invitation after owner verification. |
| `POST /api/invitations/bundles` | `launchpad-invitation-bundles-{stage}` | M11 Chunk 3 — create an invitation bundle (the composer's real backend; auth-only). Each grant authorized INDEPENDENTLY by the SENDER (site-admin OR `{app}-app-admin` for the grant's app); same-app conflict (app-grant + account-invite for one app) refused server-side; partial acceptance (bundle holds only authorized grants; zero → no bundle). Two kinds only (m16.5.0): `account-invite`, `app-grant`. Grants are CONFERRED at redemption, not here. |
| `POST /api/invitations/bundles/{bundleId}/redeem` | `launchpad-invitation-redemption-{stage}` | M11 A5 — redeems a bundle's grants (auth-only; **invitee-only** in-handler: caller email must match the bundle). `account-invite` → membership at the grant role + ensure `{app}-app-access`; `app-grant` → ensure `{app}-app-access` only (zero accounts/memberships, the "access, no accounts" state). Idempotent (re-redeem yields `duplicate`). Email delivery is the separate SES seam. |
| `POST /api/invitations/bundles/{bundleId}/redeem-as` | `launchpad-invitation-redemption-{stage}` | M11 Chunk 3 — **DEV-ONLY** demo bypass: impersonates the bundle's invitee and redeems on their behalf (no invitee auth), so the real A5 flow is testable in dev before SES. **SERVER-SIDE GUARD**: structurally refused (404) unless `STAGE != prod` — the deployed environment, NOT the client `NEXT_PUBLIC_DEV_TOOLS` flag (which only hides UI and is not a security boundary). Site-admin caller only; the impersonated invitee must already exist as a Cognito user. |

Dev live traffic now uses `TransformotionDev-LaunchpadAuth` for Cognito,
pre-token claims, app clients, Launchpad control-plane tables, and SA/BT
authorizers. Platform does not own live or rollback auth/control-plane routes.
There is no live production environment; `TransformotionProd-*` resources are
non-live unless they affect synth/shared code.

---

## Client-side auth

Frontend code follows the same layered architecture pattern as data access (see `CONTRIBUTING.md` Section 5).

A domain interface (`AuthService`) lives in contracts. Implementations are named for what they wrap: `CognitoAuthService` (production; reads JWT claims from a Cognito session) and `MockAuthService` (v0; returns mocked auth state without any real auth backend). Selection is build-time per the layered architecture pattern.

Components, services, and hooks access claim-derived data only via the `AuthService` interface — never by reading JWT claims directly. The interface is the canonical access path for any claim-derived value (active account ID, app access flags, user identity, etc.).

**Account role vocabulary (D10, M16).** The client `Account` type in `packages/auth-client` uses `owner | manager | member | viewer`, matching the contract `AccountRole`; the legacy `owner | admin | member` is removed. No membership rows used `admin` (verified on dev: 0 rows), so this is a type-level correction with no data backfill.

**Stable identity vs reactive account state (#210).** `AuthService.getCurrentUser()` is the read-once stable-identity accessor (name, email, userId from cached token claims). The reactive, mutable **per-app active account** is control-plane-owned (D7) and lives in each app's account store — never in the stable-identity path. `getAccountIdForApp` (first membership from the token's `accounts` claim) is a legacy convenience superseded by the control-plane active-account read in the app layer (Phase 4 SA/BT wiring).

**Active-account consumption (D7, M16 Phase 4).** Stock Analyser and Budget Tracker read and set their active account through the Launchpad control plane via a shared `ControlPlaneClient` (`@transformotion/api-client`, built on the stage-safe HttpClient): `GET /api/user/active-accounts` (the active account per app) and `PUT /api/user/active-accounts/{appSlug}` (switch; the server fails closed on non-membership). The selected account is the single source of truth for the `X-Account-Id` header on every app-data request — never first-account-from-token, never browser-local state as authority. A reactive account store loads the selection at startup; an **AccountGate** blocks private surfaces until access is confirmed, and **admin status grants nothing here** — a site-admin or app-admin (Cognito group) without a membership for the app sees the same no-access state as any non-member (D9). A control-plane **failure** renders a distinct error/retry state ("couldn't determine your access"), never the no-access state, so an outage cannot masquerade as revocation.

The current state has the interface duplicated across `packages/auth-client/`, `apps/stock-analyser/`, and `apps/budget-tracker/`, with the production implementation only existing for stock-analyser. Migration to the canonical pattern (interface in contracts, both implementations in `packages/auth-client/`, build-time selection) happens alongside the production bug fix for the missing `accounts` JWT claim.

---

## Out of scope (future)

- OAuth resource server custom scopes as an alternative or complement to group-based checks — tracked as Issue #42.
- Capability-level permissions within an app beyond `view/user/admin`.
- Per-browser-session active account (alternative to `custom:active_accounts`).

(Multi-owner accounts are **in scope** as of `m16.0.0` — permitted at contract/policy level with the last-owner guard as a floor; see `route-classification-m16.md` §7b.)
