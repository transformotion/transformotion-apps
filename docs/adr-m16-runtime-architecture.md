# M16 Account Lifecycle — Runtime Architecture Decision Document

**Status:** Accepted — all flagged items confirmed by owner, 2026-06-11 (see §9)
**Date:** 2026-06-11 (v1.2 — §9 items and Goal 4 amendment confirmed)
**Goals served:** 4 primarily; 3 (per CONTRIBUTING §1.1 convention)
**Scope:** Physical persistence, authorization mechanics, token/claims strategy, and middleware structure for the M16 runtime implementation in `transformotion/transformotion-apps`.
**Document type:** Milestone-scoped decision document (CONTRIBUTING §10). Not itself normative; its decisions are **ratified into the normative documents** as the implementing PRs land, per the discipline rule (CONTRIBUTING §2.1):

- Authorization model, claims, middleware, supervisory semantics, invitations → `docs/architecture/auth.md` (per-phase section map in the companion auth.md revision map)
- Table schemas, GSIs, denormalization rules (D1, D3–D6) → `docs/architecture/data.md`
- Goal 4 wording in `CONTRIBUTING.md` §1.1 ("app access via Cognito groups") is amended by M16 ("app access derives from account membership"); Section 1 changes are escalated per CONTRIBUTING §10 and require explicit owner sign-off as a standalone, conscious edit.

## Relationship to canonical sources

This ADR does **not** define product semantics. It layers runtime implementation decisions on top of two authoritative sources, in this precedence order:

1. **v0 contracts at `m16.0.0`** (`transformotion/transformotion-apps-b8`, merge commit `7121938`) — canonical types, routes, and `behaviour.md`.
2. **`transformotion-user-account-permissions-model.md`** — canonical product/permission model (entities, roles, policy matrix, invitation/redemption lifecycle).

If anything in this ADR conflicts with those sources, those sources win and this ADR must be amended. Conversely, nothing in this ADR may be re-decided ad hoc during implementation; if a decision here proves wrong, stop and amend the ADR first.

Where this document conflicts with the *current* text of `docs/architecture/auth.md`, that is deliberate: the v0 `m16.0.0` contracts supersede the affected auth.md sections (notably the site-admin bypass and the single-owner invariant — see D9, D11, §9), and auth.md is updated per phase under the discipline rule. The companion **auth.md revision map** lists every affected section, the phase that updates it, and its current status tag.

---

## D1. Invitation persistence: new bundle/grant table, item-per-grant

**Consumed by:** Phases 1 (infra prep), 6 (pending projection), 8, 9.

### Decision

Create a new table. Do not extend `launchpad-invitations-${stage}`.

| Property | Value |
|---|---|
| Table | `launchpad-invitation-bundles-${stage}` |
| PK | `bundleId` |
| SK | `itemKey` — `META` for bundle metadata, `GRANT#{grantId}` per grant |
| GSI `inviter-index` | PK `createdByUserId`, SK `createdAt` — "bundles I created" |
| GSI `grant-target-index` | PK `targetAccountId`, SK `status#createdAt` — pending invites per account |
| GSI `grant-email-index` | PK `emailLower`, SK `createdAt` — redemption discovery, duplicate detection |
| TTL | `expiresAt + 90-day grace` (see D2) |

Grant items carry top-level attributes (`grantKind`, `targetAccountId`, `targetAppSlug`, `emailLower`, `status`, `role`, decision/result fields) so the GSIs can project them.

### Rationale

- DynamoDB key schemas are immutable after creation; the legacy table (`PK invitationId`, no SK) can never hold a bundle as an item collection. The only extend-in-place option is embedding grants in one item, and embedded grants cannot be indexed — GSIs cannot reach attributes nested in lists/maps. That kills the two projections M16 requires: pending grants by account (member page) and by email (redemption/duplicates).
- Item-per-grant makes the contract's per-grant semantics — independent authorization, partial acceptance, individual cancellation, idempotent state transitions — each a single conditional write on one item.

### Consequences

- Bundle reads are a single Query on PK (META + grants in one round trip).
- Bundle creation writes N+1 items; use `TransactWriteItems` so a bundle is never persisted half-formed.
- **Legacy freeze:** `launchpad-invitations-${stage}` is frozen. Legacy single-invitation routes keep reading it (read-only, marked transitional per the contract); no in-flight invitations are migrated; no new writes after the M16 surface ships. Decommission is a separate, later decision.

---

## D2. TTL is garbage collection, not business logic

**Consumed by:** Phases 8, 9.

Expiry, cancellation, and redemption are **status fields evaluated in code**, never inferred from item absence. TTL is set to expiry plus a 90-day grace window so terminal-state bundles remain readable.

**Rationale:** the contract requires distinct fail-closed outcomes — `expired`, `cancelled`, `duplicate`, already-`redeemed` — and idempotent re-redemption. If TTL fires at expiry, a re-redeem returns 404 instead of the correct outcome, and admin review of recent bundles breaks. After the grace window, deletion of long-terminal items is safe.

---

## D3. Membership table: extend in place

**Consumed by:** Phases 2, 5, 6, 7, 10.

`launchpad-account-members-${stage}` (`PK accountId`, `SK userId`, GSI `userId-index`) already has the right key schema: member list = Query on PK; user access summary = Query on GSI. Extend with attributes and one GSI:

- `appSlug` — denormalized from the account. Safe write-once denormalization: an account's app never changes, so there is no propagation problem.
- `role` — M16 vocabulary `owner | manager | member | viewer`.
- `status` — active/disabled/etc. per contract.
- New GSI `appSlug-index` (PK `appSlug`, SK `userId`).

The `appSlug-index` is what makes app-admin scoped discovery ("users with membership in any account of app X") a Query, and provides the app-provision duplicate check ("does this user already have active access to app X").

Owner/manager discovery scope ("people known through accounts I manage") needs **no new infrastructure**: Query `userId-index` for the requester, filter to owner/manager rows, Query each managed account's partition. Managed-account counts are small; fan-out is acceptable.

---

## D4. Users table: minimal extension; no search infrastructure

**Consumed by:** Phases 2, 7, 9, 10.

- Add profile attributes per contract: `displayName`, `profileComplete`, `status`, preferences.
- Add `emailLower` attribute + GSI `email-index`. Exact-email lookup is required regardless (redemption identity matching, duplicate detection).
- Add `activeAccounts` map attribute: `{ [appSlug]: accountId }` (see D7).
- **Site-admin name/email search is a filtered scan** behind a site-admin-only route. No directory projection, no OpenSearch.

**Rationale for the scan:** current scale is households and small teams; a rarely-used admin convenience must not drive table design. The upgrade path (single-partition directory projection, or real search) does not get harder by waiting. **This is a documented scaling ceiling** — revisit if site-admin search becomes a daily-driver surface or the user count makes scans slow.

`launchpad-accounts-${stage}`: ensure `appSlug` is set consistently (backfill, D10); add an `appSlug-index` GSI if app/account discovery queries need it during Phase 7.

---

## D5. App-admin grants: small dedicated table

**Consumed by:** Phases 2 (access summaries), 5, 7.

| Property | Value |
|---|---|
| Table | `launchpad-app-admin-grants-${stage}` |
| PK | `appSlug` |
| SK | `userId` |
| GSI `userId-index` | reverse lookup for access summaries / claims |

**Rationale:** the M16 model's central invariant is that app-admin must **never** imply account membership. Synthetic rows in the members table invite exactly that policy bug (a synthetic row leaking into an access summary or membership check). An attribute list on the user item answers "what does this user admin" but makes "who admins app X" a scan. A dedicated table answers both directions as point lookups, and makes the policy primitive unambiguous: `isAppAdmin(userId, appSlug)` is a GetItem against a table that contains nothing else and cannot be confused with membership. For a security-boundary primitive, explicitness is worth one extra table.

---

## D6. No displayName denormalization — read-time enrichment only

**Consumed by:** Phases 2, 6, 7, 8. **This is a standing rule for implementers, not a one-time choice.**

`displayName` lives **only** on the user item. Member lists, grant rows, access summaries, and discovery results are enriched at read time via `BatchGetItem` on the users table. Do not copy display names onto membership or grant items, however tempting for one-query rendering.

**Rationale:** M16 has an explicit display-propagation requirement across all surfaces. Denormalized copies turn every rename into a fan-out update that must be remembered everywhere; read-time enrichment makes propagation automatic from one source of truth. Member lists are small; the batch read is cheap.

---

## D7. Active account: control-plane owned, never a claim

**Consumed by:** Phases 2, 4, 10.

- Stored as the `activeAccounts` map on the user item (`{ [appSlug]: accountId }`), exactly the shape in the permissions model §5.2.
- Read comes free with the profile fetch; set is a mutation and therefore **table-verified** (D8): setting an active account the user is not a member of for that app fails closed.
- Cognito custom active-account attributes are retired; `/auth/setup` behavior that writes them is superseded.
- Apps transmit the *currently selected* account per request via `X-Account-Id` (or the existing equivalent header). Claims answer "*may* this user touch accounts in this app"; the header answers "*which* account right now" — different cadences, different transports.
- Stale stored selection (membership since removed): runtime clears it and falls back to the deterministic default (D10 rules).

**Rationale:** active account changes constantly (every switch). Pushing it through Cognito means an admin-update plus forced token refresh per switch — the worst of both worlds. It is per-user-per-app state owned by the control plane.

---

## D8. Authorization tiers: claims for reads, table checks for writes

**Consumed by:** Phases 2, 4, 5, 6, 8, 9. **This is the load-bearing decision; do not erode it in either direction.**

| Operation class | Check | Cost |
|---|---|---|
| App-data **reads** (SA/BT GET) | Token claims only: `X-Account-Id` must appear in the token's membership claims for the app | Zero table reads on the hot path |
| App-data **writes** (SA/BT mutations) | Claims check **plus** live membership-row read (role + status) | One GetItem per write |
| Control-plane operations (member mgmt, invitations, redemption, account settings, active-account set) | Policy helpers reading current table state; tokens identify the principal only | Table reads by design |

Accepted consequences, decided deliberately:

- **Revocation latency is bounded by access-token lifetime (60 minutes) and this is accepted.** A removed user's stale token retains read visibility for up to an hour. No token-lifetime shortening, no claims-epoch mechanism, no per-request read verification.
- **Staleness gives lingering read visibility, never lingering write capability.** The moment a removed/demoted user attempts any write, the table check fails closed. Put this sentence verbatim in `behaviour.md` — it is intentional, and it will look like a bug to whoever discovers it undocumented.
- **Do not add "defense in depth" table reads to the read path.** That re-imports the cost the claims architecture exists to avoid, for a threat explicitly accepted. Likewise, do not let any control-plane decision trust token claims "for speed."
- A *revoked site-admin's* stale token must not retain supervisory power — automatic, since all supervisory operations are control-plane and table-checked.
- **Preserve the existing `AdminUserGlobalSignOut` pattern on member removal and user disable** (auth.md, Revocation flows). It invalidates refresh tokens immediately, so the 60-minute window is access-token-only with no refresh extension — a removed user cannot renew their stale claims. M16 removal/disable paths (Phase 6) must keep this call.

**Viewer read-only enforcement rides this design for free** (closes the gap in the permissions model's "usually read-only"): app-data writes already fetch the membership row, so SA/BT reject writes when `role == viewer` with no additional reads. Assigned to Phase 4. Reads remain claims-based; viewers can read.

### Claims shape and refresh protocol

- Pre-token enrichment remains the claims source, updated to project **lean triples only**: `(appSlug, accountId, role)` per membership, plus site-admin flag and app-admin app slugs. No display names, statuses, or pending state in tokens — that is what the access-summary API is for. Memberships-per-user grows under M16 and claims ride every request header.
- The Cognito pre-token trigger fires on **every** issuance including refresh-token grants, so **no re-login is ever required** for new access — only a refresh.
- **Grant latency ≈ 0 via explicit refresh:** redemption responses, and role-change responses where the affected user is the actor, carry a `refreshRequired` signal; the client forces a token refresh (`forceRefresh`) before navigating to newly granted surfaces. Without this, a newly invited user waits up to an hour for their tile.

---

## D9. Middleware split and supervisory semantics

**Consumed by:** Phase 5 (primary), 4, 6.

### Two-axis principle

Every operation is classified on one of two axes, and the axes never blend:

- **Administrative authority** — acting on the control plane *about* an account (existence, metadata, member lists, removal, invitations).
- **Data authority** — reading/writing app data *inside* an account.

**The only grant of data authority is membership in the account.** Not site-admin, not app-admin, no exceptions. This explicitly includes financial data in Budget Tracker and portfolio data in Stock Analyser. **There is no self-service path:** a site-admin cannot create an account-invite into an account they don't own/manage — *including for themselves*. The only way any administrator gains data access to an account is an invitation **created by that account's owner or manager**, redeemed like any other invitee, leaving the standard invitation audit trail. (Owner clarification, 2026-06-11.)

**Trust-boundary note (honesty about scope):** this is application-layer enforcement. It protects against anyone holding application-level admin roles. It does not — and cannot — constrain infrastructure operators with direct AWS credentials, who can read DynamoDB regardless. The guarantee is "no application role grants data visibility," not encryption-grade confidentiality against the platform operator. Recording this so the boundary is never oversold in user-facing language.

### Two middlewares, not one with flags

- `requireAccountData(appSlug)` — every SA/BT app-data route. Claims check per D8 (plus the write-path row read). **No site-admin branch exists in this code path**, so there is nothing to misconfigure.
- `requireAccountAdmin(...)` — Launchpad control-plane routes. Resolves the target from the table first (target-resolved), then evaluates role/policy per the permissions-model matrix (§6.3).
- The existing `requireAccountAccess` is **deleted, not deprecated** — no new route may reach for it. Flag-parameterized security middleware (`allowSiteAdmin: true`) is prohibited: flags drift and copy-paste re-opens bypasses.
- **Deliverable:** a route-classification table listing every existing route and which middleware it landed on. This classification pass *is* the security review of the current site-admin bypass.

### Supervisory decisions (resolving the permissions model's open hooks)

The permissions model (§6.3) leaves two conditional hooks. This ADR resolves them:

1. **Site-admin remove-member is enabled** as a documented supervisory action (this ADR + `behaviour.md` constitute the "if documented" condition). Removal is protective and visible to the account owner.
2. **The site-admin role-change hook is intentionally unexercised: site-admin can remove but never grant or change roles.** Granting is the self-escalation path into private data; no supervisory role-change rule is defined. Closing this hook is deliberate, not an omission.

App-admin per the model: app-scoped directory/metadata/member-list visibility and app-provision invitations for their app; **no** removal or role powers, **no** data access — a growth/onboarding role, not a moderation role.

**Owner model supersession.** Current auth.md mandates a single-owner invariant with atomic ownership transfer and lists multi-owner as out of scope. The M16 contracts use a **last-owner guard** ("sole owner cannot be removed/demoted"), which presupposes multiple owners, and "managers cannot grant owner" implies owners can. The contracts win: multi-owner is in, the single-owner invariant, transfer-or-reject semantics, and "owner: exactly one" multiplicity are superseded. One consequence is unresolved — the sole-owner user-deletion path previously handled by site-admin ownership reassignment (a role-grant power D9 removes) — flagged in §9.

**Route classification doubles as documentation verification.** auth.md describes capabilities the runtime audit did not find implemented (manager removal rules, ownership transfer, owner/manager in-app invitations, scheduled invitation expiry). While classifying every route onto the new middlewares, also record which auth.md claims are **Confirmed** vs **Aspirational-never-built** vs **Status uncertain — verify** (CONTRIBUTING §8 tags), feeding the auth.md revision map. One pass, two outputs.

**Bundle visibility rule:** an account's member list (including supervisory viewers) may show pending invites *targeting that account*; the **bundle** — which can span accounts — is visible only to its creator and the invitee. Per-account viewers must never see a bundle's other grants.

### Fail-closed mechanics (rules for every policy helper)

1. **Resolve the target before evaluating policy.** Never authorize from request-body claims about the target; load the account/bundle/membership row first.
2. **Uniform not-found semantics across all principals.** Nonexistent and forbidden targets must be indistinguishable to the caller — no 404-vs-403 difference that lets anyone probe which accountIds exist.
3. **Deny is the default return path.** Unknown role, unrecognized operation, missing `appSlug` on a legacy row → deny. Un-backfilled rows hitting this path during transition is correct behavior, not a bug.

---

## D10. Migration/backfill and role mapping

**Consumed by:** Phase 10 (executed), Phases 2, 5 (must tolerate pre-backfill state via deny-by-default).

- **Roles: one-time backfill, not a read-time translation layer.** Note that auth.md's documented role model already uses `owner | manager | member | viewer` and contains no `admin` role — the stale `owner | admin | member` vocabulary lives in the **auth-client TypeScript types**, and may not exist in any membership row. Before assuming a data migration: query the members table for actual `admin` rows. If none exist, the "migration" is a type-level fix in `packages/auth-client` (Phase 4) and the backfill is vacuous. If rows exist, map `admin` → `manager` (conservative: no owner-grant power; promote specific users to `owner` manually where warranted). *(Confirmed — §9.)*
- **Users:** `displayName` defaults from Cognito name, else email local part (matching the model's display fallback chain); `profileComplete` defaults false unless criteria met; `status` defaults `active`.
- **Accounts:** backfill `appSlug` on every account; memberships then receive `appSlug` from their account.
- **Active account defaults:** exactly one account for an app → select it; multiple → prior stored valid selection, else first by deterministic order (createdAt, accountId tiebreak); none → no active account, app shows selection/no-access state.
- **Legacy invitations:** remain readable via legacy routes (D1); not migrated.
- **No destructive migration without explicit approval.** Backfills are additive attribute writes.

---

## D11. Cognito vestige retirement and pre-token changes

**Consumed by:** Phases 2, 3, 5, 10.

The pre-token Lambda remains the claims source (D8), but three Cognito-side behaviors documented in auth.md conflict with or are obsoleted by M16:

1. **Remove the site-admin override in pre-token group reconciliation.** Current behavior: "site-admin keeps all `-access` groups regardless of account memberships." Under M16 site-admin must not receive app-data access without membership; the reconciliation invariant (group membership ⇔ at least one account for the app) applies uniformly. Site-admin remains its own explicit group/claim driving *supervisory* surfaces only. Launchpad tiles derive from access summaries (Phase 3), with admin/control-plane surfaces shown from the `site_admin` / app-admin claims, not from app-access grants.
2. **Retire `custom:accounts` maintenance.** The attribute is written by membership-modifying Lambdas and during redemption, but the pre-token Lambda reads the members table directly — the attribute has fan-out cost and no reader. Stop writing it in all M16 paths (Phases 6, 9); do not write it in new code. Like `custom:active_account`, the schema attribute itself remains declared (Cognito forbids attribute removal) and is documented as inert.
3. **`custom:active_account` stays retired** per D7 and the existing transitional note; `/auth/setup` stops writing it when superseded in Phase 2.

The `apps` claim survives as a projection (lean derivation from memberships + reconciled groups), the `accounts` claim takes the lean-triple shape (D8), and `site_admin` is joined by an app-admin claim sourced from the D5 table.

---

## §9. Confirmed decisions (owner sign-off recorded 2026-06-11)

All three items flagged in v1.1 are confirmed, along with the Goal 4 wording amendment:

1. **`admin` → `manager` mapping (D10) — confirmed.** Procedure stands: first verify whether any `admin` membership rows exist at all (the stale vocabulary may be type-level only in `packages/auth-client`). If rows exist, map `admin` → `manager`; promote specific users to `owner` manually only where warranted, by explicit owner instruction.
2. **Site-admin search as filtered scan (D4) — confirmed.** Documented scaling ceiling stands; revisit only if site-admin user search becomes a frequent surface or user count makes scans slow.
3. **Sole-owner user-deletion path (D9) — confirmed as option (a).** Site-admin may delete/archive the orphaned account entirely: a destructive supervisory action that never views the data and never self-escalates. No supervisory ownership-transfer exception exists. Until the deletion executes, the existing 409-while-sole-owner behavior applies. Phase 6 implements; auth.md Scenario C is updated accordingly in that PR.
4. **Goal 4 wording amendment — sign-off recorded.** CONTRIBUTING §1.1 Goal 4 changes from "app access via Cognito groups; account membership and role via DynamoDB" to app access *deriving from account membership*, with Cognito groups maintained as a projection. The escalation requirement (CONTRIBUTING §10) is satisfied by this sign-off; the edit itself still lands as its own standalone PR, referencing this ADR, before or alongside Phase 5.

## §10. Known costs accepted

- Site-admin (i.e., you, during development) loses direct visibility into SA/BT data of accounts you're not a member of, immediately after Phase 5 — with **no self-invite escape hatch**: the only sanctioned path into any account's data is an invitation created by that account's owner/manager (D9). For dev-stage debugging, use seed tooling that *creates* test accounts with you as owner/member from the start — creating test data you own is not the same as entering someone else's account. Plan that tooling rather than be tempted into a backdoor flag.
- Two new tables and three new GSIs to provision and pay for; the two new tables' key schemas are the only one-way doors in this ADR — everything else is attribute-level and reversible.
- Removed users retain read access for up to 60 minutes (D8, accepted).

## Phase consumption map

| Phase | Decisions consumed |
|---|---|
| 1 — Contract sync | (none — ADR informs later infra only) |
| 2 — Access/profile foundation | D3, D4, D5, D6, D7, D8 (claims shape), D11 (`/auth/setup`, claim shape) |
| 3 — Launchpad UI | D11 (tile derivation: access summaries + admin claims) |
| 4 — SA/BT gates & selectors | D7, D8 (incl. viewer read-only), D10 (role vocab) |
| 5 — Policy foundation | D5, D8, D9 (middleware split, matrix, fail-closed, route classification deliverable incl. auth.md verification), D11 (pre-token override removal) |
| 6 — Member management | D1 (pending projection), D6, D8 (incl. GlobalSignOut), D9, D11 (stop writing `custom:accounts`) |
| 7 — Invitee discovery | D3 (`appSlug-index`), D4 (email GSI, scan ceiling), D5, D9 (bundle visibility) |
| 8 — Invitation bundles | D1, D2, D6, D9 |
| 9 — Redemption | D1, D2, D4, D8 (`refreshRequired`), D11 (no `custom:accounts` write) |
| 10 — Migration/backfill | D10, D11 |
| 11 — Validation | All — validation scenarios exercise the accepted trade-offs (e.g., refresh-after-redeem) |

Per the discipline rule, each phase PR also carries its normative-document updates; the companion **auth.md revision map** specifies which auth.md (and data.md) sections each phase owns.
