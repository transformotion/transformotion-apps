<!-- GENERATED — DO NOT EDIT -->
# Auth model (generated mirror)

> **GENERATED from `transformotion-apps/docs/architecture/auth.md` — DO NOT EDIT.**
> Runtime owns this; conform to it, never edit or regenerate it; if it seems
> wrong, raise against the runtime source.
>
> This is the normative auth MODEL, extracted from the `mirror:start`/`mirror:end`
> spans of the canonical runtime auth.md. It lives in `contracts/` so it inherits
> the "conform to contracts/" binding and the existing contract divergence check.

---

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

### Scenario D: Removing all access to an app (the app-removal cascade)

Removing a user from an app entirely is a **cascade**, because app-scoped state spans three places. Removing app-access alone (Scenario above under lifecycle) does *not* clean these up; the full removal must, in order:

1. **Remove the app-access group** — `AdminRemoveUserFromGroup(<app>-access)`. The user can no longer enter the app shell.
2. **Remove the app-admin group if present** — `AdminRemoveUserFromGroup(<app>-admin)`. App-admin must not outlive app access — an app-admin for an app the user can no longer enter is exactly the dangling-authority state the groups model forbids.
3. **Deactivate the user's account memberships for that app** — remove/disable every `launchpad-account-members-{stage}` row for accounts in `appSlug`. Accounts are app-scoped, so losing the app means losing the app's account memberships. The single-owner guard applies: if the user is the sole `owner` of an account, ownership must be transferred (or the account emptied/deleted) first, by the same 409 rule as user deletion.
4. **Clear the active account** for that app (D7 `activeAccounts` map) so no inaccessible selection is retained.
5. **Invalidate refresh tokens** — `AdminUserGlobalSignOut` — so the cascade takes effect at next token issuance rather than lingering the full access-token window.

**Invariant enforced by the cascade:** because membership ⟹ app-access (groups maintained from membership) and app-admin presupposes app access, losing app access must drop app-admin and app-scoped membership together. The `requireAppAdminForApp` guard reads the live `{app}-app-admin` group, so a removed group denies immediately on the admin axis; app-data writes fail closed on the missing membership row. The grants-table projection is updated to reflect the removed group.

Authorization: `requireSiteAdmin` (platform-supervisory removal). This is distinct from a user **removing themselves** from a single account (account-member self-removal) and from account-member removal by an owner/manager (Scenario A) — the cascade is whole-app removal, not single-account.
