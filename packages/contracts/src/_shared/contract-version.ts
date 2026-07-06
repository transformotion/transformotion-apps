/**
 * m16.0.0 — M11 control-plane contract extraction: invitation bundles &
 * grants, redemption lifecycle, account membership records/read models,
 * app-admin grants, invitee discovery, active-account-per-user-per-app,
 * UserStatus, and formalized UserProfile.displayName/profileComplete.
 * Major bump: new route groups, new domain objects, and a materially
 * changed invitation/account lifecycle contract.
 *
 * m16.1.0 — `/auth/setup` corrected to profile-only bootstrap (D11):
 * AccountSetupResponse.accountId is now optional (omitted when no account),
 * `created` renamed to `userCreated`, `profileComplete` added.
 *
 * m16.2.0 — Breaking: removes the `site_admin` token claim. Platform admin
 * status is sourced solely from the `site-admin` Cognito group (the claim was
 * an unintended projection). Dropped from TransformotionTokenClaims,
 * AuthSession.siteAdmin, and exampleTokenClaims (M16 Phase 6 / D11).
 *
 * m16.3.0 — Breaking (groups-authoritative correction): adds
 * `groups: CognitoGroup[]` to TransformotionTokenClaims — `cognito:groups` is
 * the SOLE authority for site-admin / app-access / app-admin (no `site_admin` /
 * `app_admin` claim). Re-introduces AuthSession.siteAdmin plus appAccess /
 * appAdmin, ALL derived from `groups` (never a boolean / grant-record /
 * membership). Flattens AppAdminGrant to a NON-AUTHORITATIVE discovery
 * read-projection (drops `role`; app-admin is binary). Corrects the app-access
 * rule from the membership biconditional to one-directional (membership implies
 * the access group; the access group does not imply membership; not removed at
 * zero accounts). Canonical spec: docs/architecture/auth.md.
 *
 * m16.4.0 — Breaking (invitations): adds a new `'app-grant'` member to
 * `InvitationGrantKind`, a new `AppGrant` interface (person + app only; no
 * account, no role), and extends `CreateInvitationGrantInput` to admit it.
 * Grants app-ACCESS WITHOUT an account — redemption adds the `{app}-app-access`
 * group and creates ZERO accounts, landing the invitee in the app's
 * create-first-account setup where they self-create their first account and
 * become its owner. This is the contracted producer of the canonical
 * "app-access, no accounts" state (auth-model.md). Breaking because the grant
 * union / kind enum / create-input union widen, so exhaustive consumers must
 * handle the new variant.
 *
 * m16.5.0 — Breaking (invitations): RETIRES the `'app-provision'` invitation
 * grant kind. Removes the `'app-provision'` member of `InvitationGrantKind`,
 * deletes the `AppProvisionGrant` interface, and drops it from the
 * `InvitationGrant` union and `CreateInvitationGrantInput`. Conforms to the
 * canonical auth model (auth-model.md), which retires the inviter-named-account
 * flow: a user reaches "app-access, no accounts" ONLY via an `app-grant`
 * invitation (m16.4.0) or a direct app-access group grant, and always
 * self-creates and NAMES their own first account on arrival. Breaking because
 * the grant union / kind enum / create-input union NARROW — producers may no
 * longer emit `'app-provision'`. The account-creation primitive itself is
 * unchanged; only the inviter-driven provisioning grant is removed.
 *
 * m16.6.0 — Non-breaking (additive request shape): adds required
 * `appSlug: EntitledAppSlug` to `CreateAccountRequest` (now `{ name, appSlug }`)
 * for the launchpad-side create-first-account surface. The launchpad is
 * multi-app and the token cannot say which app the user clicked — that's
 * request data (the tile) — so `POST /accounts` now carries WHICH app the
 * account is being created in. AUTHORIZATION IS UNCHANGED: the handler still
 * gates on the caller holding the `{appSlug}-app-access` group; the body says
 * WHICH app, the caller's access group AUTHORIZES it, and a caller cannot
 * create an account in an app whose access group they do not hold (fail
 * closed). No new behaviour and no new auth rule — the access-group gate for
 * the "create their own account" path already exists in auth-model.md. Minor
 * bump: request-shape addition only, no route/domain-object changes.
 *
 * m16.7.0 — Non-breaking (additive, new file): adds `launchpad/redemption.ts`,
 * the canonical contract for the invitation REDEMPTION EXPERIENCE. Introduces
 * `IdpProvider` + `AuthenticatedIdentity` (the post-auth identity the IdP seam
 * returns — runtime maps to Cognito Hosted-UI), `RedemptionLinkState`
 * (valid/expired/revoked/already-redeemed/not-found — each a REAL backend
 * condition, none speculative), `EmailMatch`, `RedemptionPolicy`
 * (`requireVerifiedEmail`, default `false`), and the `RedemptionEvaluation`
 * discriminated union produced by the shared redemption state-machine
 * (link-invalid / needs-auth / email-mismatch / needs-verification /
 * ready-to-apply / applied). Conforms to auth-model.md: redemption is
 * post-authentication, Option D (email mismatch) CONFIRMS-and-binds rather than
 * blocking, and the `applied` outcome routes each grant kind to its correct
 * landing (app-grant -> create-first-account; account-invite -> joined account).
 * AUTHORIZATION IS UNCHANGED: grant redemption rules, idempotency, and the
 * access-group gate remain owned by invitations.ts + the control-plane; this
 * file only models the experience/decision surface that PRECEDES redeem. Minor
 * bump: purely additive new contract module, no existing shape changed.
 *
 * m16.8.0 — Non-breaking (additive request shape): adds optional
 * `displayName?: string` to `UpdateUserPreferencesRequest` (launchpad/api.ts).
 * Closes a typing gap: the profile-update path already SENT `displayName`
 * alongside `notificationsEnabled` and the server already persisted it to
 * `UserProfile.displayName` (_shared/auth.ts), but the field was sent untyped
 * ("no contract change" precedent). It is now properly typed and consistent
 * with where the resolved value is stored. Both fields are optional on a
 * preferences update. No behaviour change, no route/domain-object change, no
 * new auth rule — request-shape typing only. Minor bump: additive optional
 * field on an existing request type.
 *
 * m16.9.0 — Non-breaking (additive read): adds the invitee/self read for a
 * user's OWN pending invitations — `ListMyInvitationsResponse` (full
 * `InvitationBundle[]`) in launchpad/invitations.ts and route
 * `GET /api/user/invitations` (auth `auth-only`, policy `invitee-only` =
 * scoped to bundles where the caller is the invitee, by their token identity)
 * in launchpad/api.ts. Fills a gap CC found: no self-scoped invitation read
 * existed (only the per-account admin read and the sender read). Shaped to
 * serve BOTH the Profile "your pending invitations" sub-list (now) and #482's
 * future on-sign-in reconciliation (later) — one read, two consumers. No
 * existing shape changed, no new policy vocabulary, no domain-object change;
 * accept reuses the existing redeem route. Minor bump: additive route +
 * response type.
 *
 * m16.10.0 — Non-breaking (additive, M21 App Dashboards PR-1). Four additive
 * changes, no existing shape altered: (1) budget-tracker/types.ts gains
 * `CategoryRole = 'income' | 'savings'` and an optional `role?` on `Category`
 * and `Subcategory` (user-assigned classification signal; never affects budget
 * limits; supersedes the deprecated `name === "Income"` detection removed from
 * domain code in PR-2 after backfill); (2) `SavingsGoal` plus an optional
 * `BudgetData.savingsGoal?` (travels the existing budget-data routes — no new
 * route); (3) `DashboardInsightResponse`/`DashboardInsightRecord` and route
 * `GET /api/budget/v1/dashboard-insight` — a reader over the D12 account-shared,
 * service-principal-written, viewer-readable `AI_INSIGHT#DASHBOARD` derived row,
 * regenerated from the app-level AI config on miss/stale/invalidated;
 * (4) stock-analyser `CachedQuote`/`CachedQuotesResponse` and route
 * `GET /market/cached-quotes` — a read-only enumeration of the latest
 * SHARED-cached quote per ticker (never triggers a fetch/warm). Per-app version
 * lines bump additively (budget-tracker m15.1.0 -> m15.2.0, stock-analyser
 * m15.1.0 -> m15.2.0). Minor bump: purely additive types + routes.
 */
export const CONTRACT_VERSION = 'm16.10.0' as const;

export type ContractScope =
  | '_shared'
  | 'launchpad'
  | 'stock-analyser'
  | 'budget-tracker'
  | 'platform';

export interface ContractVersionInfo {
  scope: ContractScope;
  version: typeof CONTRACT_VERSION;
  canonicalRepo: 'transformotion-apps';
  canonicalPath: 'packages/contracts';
  archivedV0Reference: 'v0-reference/ARCHIVED.md';
}

export const sharedContractVersion = {
  scope: '_shared',
  version: CONTRACT_VERSION,
  canonicalRepo: 'transformotion-apps',
  canonicalPath: 'packages/contracts',
  archivedV0Reference: 'v0-reference/ARCHIVED.md',
} as const satisfies ContractVersionInfo;
