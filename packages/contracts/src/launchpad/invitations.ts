/**
 * M16 — Invitation bundles, redemption, account membership read models, and
 * invitee discovery. Extracted from the accepted M11 v0 prototype.
 *
 * Canonical authority: this file. The v0 prototype's `m11-*` modules and the
 * runtime implementation must import/adapt these shapes, never redefine them.
 *
 * Policy note (authoritative, see behaviour.md for the full rules):
 * - Invitee DISCOVERY (who a sender may search) is independent of grant
 *   AUTHORIZATION (what a sender may grant). Both are enforced separately.
 * - Each grant inside a bundle is authorized independently at creation time
 *   and redeemed independently.
 */

import type { AccountId, EmailAddress, EmptyRequest, ISODateTime, UnixSeconds, UserId } from '../_shared/api';
import type {
  AccountRole,
  EntitledAppSlug,
  UserStatus,
} from '../_shared/auth';
import type { InvitationStatus } from './types';

// ---------------------------------------------------------------------------
// Invitation grants & bundles
// ---------------------------------------------------------------------------

export type InvitationGrantKind = 'account-invite' | 'app-grant';

/** Add the invitee to an EXISTING app-scoped account at a chosen role. */
export interface AccountInviteGrant {
  grantId: string;
  kind: 'account-invite';
  appSlug: EntitledAppSlug;
  accountId: AccountId;
  role: AccountRole;
}

/**
 * Grant APP-ACCESS ONLY, with NO account — the contracted way to produce the
 * canonical "app-access, no accounts" state (see `auth-model.md` →
 * "App-access with no accounts (permitted state)"). Redemption adds the
 * `{app}-app-access` Cognito group and creates ZERO accounts; the invitee
 * lands in the app's create-first-account setup state and becomes the `owner`
 * of whatever account they create on arrival.
 *
 * ROLELESS by design: the grant carries neither a role nor an account. There
 * is nothing to be a member of yet, so there is no role to assign — ownership
 * is conferred later, at self-service account creation, not by this grant.
 *
 * Person + app only. No `accountId` (no account to target) and no account name
 * (the admin does not name the invitee's account; the invitee names their own).
 * Issuable by a site-admin, or an app-admin for the app.
 *
 * This is the ONLY invitation path to the "app-access, no accounts" state. The
 * former `app-provision` invitation — where an inviter pre-created and NAMED
 * the account for the invitee — is RETIRED (auth-model.md): invitees always
 * create and name their own first account.
 */
export interface AppGrant {
  grantId: string;
  kind: 'app-grant';
  appSlug: EntitledAppSlug;
}

export type InvitationGrant = AccountInviteGrant | AppGrant;

/**
 * A single invitation email/link carries a BUNDLE of independently-authorized
 * grants. The recipient redeems the whole bundle in one step; each grant
 * resolves to its own outcome. Cancelling a single grant removes it from the
 * bundle; a bundle with no remaining grants is revoked.
 */
export interface InvitationBundle {
  bundleId: string;
  email: EmailAddress;
  invitedBy: UserId;
  createdAt: ISODateTime;
  expiresAt: UnixSeconds;
  status: InvitationStatus;
  grants: InvitationGrant[];
}

// ---------------------------------------------------------------------------
// Redemption
// ---------------------------------------------------------------------------

/** Outcome of redeeming a single grant within a bundle. */
export type GrantOutcome = 'accepted' | 'rejected' | 'expired' | 'unauthorized' | 'duplicate';

/** Per-grant redemption result. */
export interface GrantRedemptionResult {
  grantId: string;
  kind: InvitationGrantKind;
  appSlug: EntitledAppSlug;
  /**
   * Human-facing target label: an account name (account-invite) or the app
   * label (app-grant — access only, no account to name).
   */
  target: string;
  outcome: GrantOutcome;
  /**
   * Account the invitee ends up with access to (existing or newly created).
   * Absent for an `app-grant`, which grants access with ZERO accounts — the
   * invitee creates their first account themselves after redemption.
   */
  resultingAccountId?: AccountId;
  reason: string;
}

/**
 * Whole-bundle redemption response. Redemption is idempotent: re-redeeming an
 * already-accepted bundle yields `duplicate` outcomes, never double-applies
 * memberships or provisions a second account.
 */
export interface RedeemBundleResponse {
  bundleId: string;
  /** The (possibly newly created) invitee user. */
  userId: UserId;
  /** True when redemption created a brand-new user record. */
  userCreated: boolean;
  results: GrantRedemptionResult[];
}

/**
 * Redeem request body. The bundle is identified solely by the `{bundleId}`
 * path parameter, so the body carries no `bundleId` (no duplication, no
 * path/body mismatch to reconcile). Modelled as the shared empty-request body
 * for consistency with other bodyless routes; future redemption options would
 * extend this type rather than re-introduce a path-duplicating id.
 */
export type RedeemBundleRequest = EmptyRequest;

// ---------------------------------------------------------------------------
// Bundle creation
// ---------------------------------------------------------------------------

/** Grant draft as submitted by the sender (server assigns grantId). */
export type CreateInvitationGrantInput =
  | Omit<AccountInviteGrant, 'grantId'>
  | Omit<AppGrant, 'grantId'>;

export interface CreateInvitationBundleRequest {
  email: EmailAddress;
  grants: CreateInvitationGrantInput[];
}

/**
 * Per-grant authorization decision surfaced at creation time. Unauthorized
 * grants are rejected individually; authorized grants in the same request
 * still go through (partial acceptance).
 */
export interface GrantAuthorizationDecision {
  index: number;
  allowed: boolean;
  reason: string;
}

export interface CreateInvitationBundleResponse {
  /** Created bundle (only the authorized grants). Absent if none authorized. */
  bundle?: InvitationBundle;
  decisions: GrantAuthorizationDecision[];
}

// ---------------------------------------------------------------------------
// User self-service: my own pending invitations (invitee/self read)
// ---------------------------------------------------------------------------

/**
 * The AUTHENTICATED caller's OWN pending invitation bundles — addressed to
 * their token identity (email/sub), `status: 'pending'`, not yet redeemed.
 *
 * This is the INVITEE/self read. It is deliberately distinct from:
 *   - the per-account admin read
 *     (`ListAccountMembersResponse.pendingInvitations`, scoped to one account), and
 *   - the sender read (`GET /api/invitations/bundles`, scoped to bundles the
 *     caller CREATED).
 * Here the scope is "bundles where the caller is the INVITEE", resolved from
 * their own identity — never the sender/admin scope.
 *
 * Returns FULL `InvitationBundle`s (not a Profile-only projection) so a SINGLE
 * read serves BOTH consumers:
 *   1. the Profile "your pending invitations" sub-list (display + accept), and
 *   2. the future on-sign-in reconciliation surface (#482).
 * Accepting one reuses the canonical redeem route
 * (`POST /api/invitations/bundles/{bundleId}/redeem`) — the SAME redemption the
 * `/redeem` link runs — so there is no parallel accept path.
 */
export interface ListMyInvitationsResponse {
  bundles: InvitationBundle[];
}

// ---------------------------------------------------------------------------
// Account member read models
// ---------------------------------------------------------------------------

/** One row in an account's member list. */
export interface AccountMemberRow {
  userId: UserId;
  email: EmailAddress;
  displayName?: string;
  status: UserStatus;
  role: AccountRole;
  joinedAt: ISODateTime;
  /** True when this user is the only owner (last-owner guard applies). */
  isLastOwner: boolean;
}

export interface ListAccountMembersResponse {
  accountId: AccountId;
  members: AccountMemberRow[];
  /** Pending invitation bundles that contain a grant targeting this account. */
  pendingInvitations: InvitationBundle[];
}

export interface UpdateMemberRoleRequest {
  role: AccountRole;
}

// ---------------------------------------------------------------------------
// User access read models (directory)
// ---------------------------------------------------------------------------

/** One account a user can access within an app. */
export interface UserAccountAccess {
  accountId: AccountId;
  accountName: string;
  role: AccountRole;
}

/** A user's access within a single app. */
export interface UserAppAccess {
  appSlug: EntitledAppSlug;
  appAdmin: boolean;
  accounts: UserAccountAccess[];
}

/**
 * One pending invitation grant addressed to a user, as shown in the admin
 * directory's per-user detail. ONE ROW PER GRANT — a bundle carrying N grants
 * yields N rows — mirroring the per-grant display already prototyped in v0.
 *
 * Every field is projected from, and mirrors the shape of, the canonical
 * `InvitationBundle` / `InvitationGrant` it derives from:
 *  - `bundleId` / `grantId` — bundle + grant identity
 *    (`InvitationBundle.bundleId`, `InvitationGrant.grantId`).
 *  - `kind` — the grant kind (`InvitationGrantKind`).
 *  - `appSlug` — every grant targets an app (`InvitationGrant.appSlug`).
 *  - `target` — human-facing label: account name (`account-invite`) or app
 *    label (`app-grant`); SAME projection as `GrantRedemptionResult.target`.
 *  - `role` — present ONLY for `account-invite`. An `app-grant` is ROLELESS by
 *    design (app-access with no account), so this is optional and absent there.
 *  - `status` — bundle status (`InvitationBundle.status` / `InvitationStatus`).
 *  - `createdAt` — when the invitation was SENT (`InvitationBundle.createdAt`).
 *  - `expiresAt` — when it EXPIRES (`InvitationBundle.expiresAt`).
 *
 * Derived read model: never stored in this shape.
 */
export interface UserPendingInvitation {
  bundleId: string;
  grantId: string;
  kind: InvitationGrantKind;
  appSlug: EntitledAppSlug;
  target: string;
  role?: AccountRole;
  status: InvitationStatus;
  createdAt: ISODateTime;
  expiresAt: UnixSeconds;
}

/**
 * Full cross-app access map for one user, as shown in the admin directory.
 * This is a derived read model over profile + membership + app-admin state —
 * it is never stored in this shape.
 */
export interface UserAccessSummary {
  userId: UserId;
  email: EmailAddress;
  displayName?: string;
  status: UserStatus;
  siteAdmin: boolean;
  appAccess: UserAppAccess[];
  /** Count of pending-invitation grants. Equals `pendingInvitations.length`. */
  pendingInvites: number;
  /**
   * The pending-invitation grants behind `pendingInvites` (one row per grant).
   * Carried so the directory's per-user detail can render the LIST — target,
   * role/grant, sent/expires — with live data, not just the count. The
   * invariant `pendingInvites === pendingInvitations.length` always holds;
   * `pendingInvites` is retained as the cheap badge/count read. Empty `[]` when
   * the user has no pending invitations.
   */
  pendingInvitations: UserPendingInvitation[];
}

export interface ListUserAccessResponse {
  users: UserAccessSummary[];
}

// ---------------------------------------------------------------------------
// Invitee discovery
// ---------------------------------------------------------------------------

/**
 * Discovery scope for a sender. Discovery permission is SEPARATE from grant
 * authorization: being able to see a user never implies being able to grant
 * them anything, and vice versa (manual email entry remains available to any
 * sender who can create at least one grant).
 */
export type InviteeSearchScopeKind = 'site-admin' | 'app-admin' | 'account-manager' | 'none';

export interface InviteeSearchScope {
  kind: InviteeSearchScopeKind;
  /** Apps the scope covers (app-admin scope) — empty otherwise. */
  appSlugs: EntitledAppSlug[];
  /** Accounts the scope covers (account-manager scope) — empty otherwise. */
  accountIds: AccountId[];
}

/** One discoverable user within the sender's scope. */
export interface DiscoveredInvitee {
  userId: UserId;
  email: EmailAddress;
  displayName?: string;
  status: UserStatus;
  /** Why this user is visible to the sender (display-safe strings). */
  reasons: string[];
}

export interface InviteeSearchRequest {
  /** Free-text name/email query. Empty returns the full scoped set. */
  query: string;
}

export interface InviteeSearchResponse {
  scope: InviteeSearchScope;
  results: DiscoveredInvitee[];
}

// ---------------------------------------------------------------------------
// Active account (per user, per app)
// ---------------------------------------------------------------------------

export interface ActiveAccountSelection {
  appSlug: EntitledAppSlug;
  accountId: AccountId;
}

export interface GetActiveAccountsResponse {
  /** The caller's active account per app (apps without a selection omitted). */
  selections: ActiveAccountSelection[];
}

export interface SetActiveAccountRequest {
  accountId: AccountId;
}

// ---------------------------------------------------------------------------
// Route policy metadata
// ---------------------------------------------------------------------------

/**
 * Fine-grained policy requirements documented per route. Route-level `auth`
 * stays coarse (`AuthRequirement`); these labels describe the additional
 * policy check the backend MUST enforce for the route. They are documentation
 * metadata, not a claims format.
 */
export type PolicyRequirement =
  | 'site-admin'
  | 'app-admin-for-app'
  | 'account-owner-or-manager'
  | 'account-member'
  | 'invitee-only'
  | 'supervisory-site-admin'
  | 'canSearchInvitees'
  | 'canCreateInvitationGrant';
