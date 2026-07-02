import type { AccountId, EmailAddress, ISODateTime, UserId } from './api';

/**
 * Ownership boundary (M16):
 * - Cognito is authoritative for IDENTITY: `sub`/`userId`, `email`, token
 *   issuance, and the raw claims surface (`TransformotionTokenClaims`).
 * - The Transformotion profile/control-plane is authoritative for APPLICATION
 *   profile and access state: `displayName`, `profileComplete`, `status`,
 *   preferences, account memberships, app-admin grants, and all membership
 *   read models. Claims are a projection of control-plane state and must be
 *   refreshed after membership changes (see launchpad/behaviour.md).
 */

export type AppSlug = 'launchpad' | 'stock-analyser' | 'budget-tracker';
export type EntitledAppSlug = Exclude<AppSlug, 'launchpad'>;
export type AccountRole = 'owner' | 'manager' | 'member' | 'viewer';

/**
 * Platform user lifecycle status, owned by the Transformotion control-plane
 * (NOT a Cognito state). Disabled users fail closed on all app access and
 * cannot redeem invitations.
 */
export type UserStatus = 'active' | 'disabled';

/**
 * Cognito groups (the standard `cognito:groups` claim) — the SOLE authority for
 * the administrative + app-access dimension: `site-admin`, per-app
 * `{app}-app-access`, and per-app `{app}-app-admin`. There is no `site_admin` /
 * `app_admin` claim; group membership in the token IS the signal. Group names
 * predate the full app slug, so the prefix is `stock-app` / `budget-app`.
 * Canonical spec: docs/architecture/auth.md ("Permission model — two dimensions").
 */
export type CognitoGroup =
  | 'site-admin'
  | 'stock-app-access'
  | 'stock-app-admin'
  | 'budget-app-access'
  | 'budget-app-admin';

/** Cognito group-name prefix per entitled app (groups predate the full slug). */
export const APP_GROUP_PREFIX = {
  'stock-analyser': 'stock-app',
  'budget-tracker': 'budget-app',
} as const satisfies Record<EntitledAppSlug, string>;

const ALL_ENTITLED_APP_SLUGS = [
  'stock-analyser',
  'budget-tracker',
] as const satisfies readonly EntitledAppSlug[];

/** The `{app}-app-access` Cognito group for an entitled app. */
export const appAccessGroup = (slug: EntitledAppSlug): CognitoGroup =>
  `${APP_GROUP_PREFIX[slug]}-access` as CognitoGroup;

/** The `{app}-app-admin` Cognito group for an entitled app. */
export const appAdminGroup = (slug: EntitledAppSlug): CognitoGroup =>
  `${APP_GROUP_PREFIX[slug]}-admin` as CognitoGroup;

/** Platform supervisory authority — derived from the `site-admin` group. */
export const deriveSiteAdmin = (groups: readonly CognitoGroup[]): boolean =>
  groups.includes('site-admin');

/** Apps the user may enter — those whose `{app}-app-access` group is present. */
export const deriveAppAccess = (groups: readonly CognitoGroup[]): EntitledAppSlug[] =>
  ALL_ENTITLED_APP_SLUGS.filter((slug) => groups.includes(appAccessGroup(slug)));

/** Apps the user administers — those whose `{app}-app-admin` group is present. */
export const deriveAppAdmin = (groups: readonly CognitoGroup[]): EntitledAppSlug[] =>
  ALL_ENTITLED_APP_SLUGS.filter((slug) => groups.includes(appAdminGroup(slug)));

/**
 * App-scoped administrative role vocabulary. App-admin is BINARY — the only app
 * role is `app-admin`; there are no sub-roles. Retained for vocabulary only;
 * app-admin AUTHORITY is the `{app}-app-admin` Cognito group, not a stored role.
 */
export type AppRole = 'app-admin';

/**
 * NON-AUTHORITATIVE read-projection of the `{app}-app-admin` Cognito group,
 * maintained FROM group membership purely for directory/discovery enumeration
 * (e.g. "who admins app X", which `ListUsersInGroup` serves poorly). It grants
 * nothing: app-admin AUTHORITY is the `{app}-app-admin` group (see
 * `TransformotionTokenClaims.groups` / `deriveAppAdmin`), never this record.
 * App-admin is binary, so there is no `role` field.
 */
export interface AppAdminGrant {
  userId: UserId;
  appSlug: EntitledAppSlug;
  grantedAt: ISODateTime;
}

/** Claim-shaped membership: the account + role pair carried inside tokens. */
export interface AccountMembership {
  accountId: AccountId;
  role: AccountRole;
}

/**
 * Control-plane / domain membership record, or read-model projection source —
 * NOT a required physical storage schema. This defines the domain SEMANTICS of
 * a membership (who, which account/app, what role, since when); runtime
 * persistence remains free to store this however it sees fit (e.g. DynamoDB
 * tables/indexes, composite keys, denormalized projections). The claim-shaped
 * `AccountMembership` is a projection of this record.
 *
 * App access is a Cognito group, NOT a function of membership. The invariant is
 * ONE-DIRECTIONAL: holding >=1 membership in an app IMPLIES the user holds that
 * app's `{app}-app-access` group (a member always has access). The access group
 * does NOT imply membership — "has access, no accounts" is a valid, designed
 * state (e.g. an app-grant invitation, or a direct site-admin grant). The access group is
 * NOT removed when a user's account count for the app reaches zero.
 */
export interface AccountMembershipRecord {
  userId: UserId;
  accountId: AccountId;
  appSlug: EntitledAppSlug;
  role: AccountRole;
  joinedAt: ISODateTime;
}

export type AccountsClaim = Record<EntitledAppSlug, AccountMembership[]>;

export interface TransformotionTokenClaims {
  sub: UserId;
  email?: EmailAddress;
  /**
   * Cognito groups (`cognito:groups`) — the SOLE authority for site-admin,
   * app-access, and app-admin. There is no `site_admin` / `app_admin` claim.
   */
  groups: CognitoGroup[];
  /** Coarse access projection (app slugs); derived from the app-access groups. */
  apps: EntitledAppSlug[];
  accounts: AccountsClaim;
}

export interface AuthSession {
  userId: UserId;
  email?: EmailAddress;
  idToken: string;
  accessToken: string;
  /** Raw Cognito groups carried by the token — the source of the derived flags below. */
  groups: CognitoGroup[];
  apps: EntitledAppSlug[];
  accounts: AccountsClaim;
  /** Derived from `groups` (site-admin group present). Never a boolean/grant/membership source. */
  siteAdmin: boolean;
  /** Derived from `groups` (apps with an `{app}-app-access` group). */
  appAccess: EntitledAppSlug[];
  /** Derived from `groups` (apps with an `{app}-app-admin` group). */
  appAdmin: EntitledAppSlug[];
  activeAccountId?: AccountId;
}

export interface UserPreferences {
  notificationsEnabled: boolean;
}

/**
 * Application user profile, owned by the Transformotion control-plane.
 * `userId`/`email` mirror Cognito identity; everything else is application
 * state. Formalized in M16 (displayName/profileComplete were introduced
 * un-versioned during the M11 prototype and are now part of the contract).
 */
export interface UserProfile {
  userId: UserId;
  email: EmailAddress;
  /** Human-friendly name shown across apps. Set during profile setup. */
  displayName?: string;
  /** Lifecycle status. Absent means 'active' (backwards compatibility). */
  status?: UserStatus;
  preferences: UserPreferences;
  /** False until the user completes first-time profile setup (e.g. after invitation redemption). */
  profileComplete?: boolean;
  updatedAt?: ISODateTime;
}

export const exampleTokenClaims = {
  sub: 'user-123',
  email: 'owner@example.com',
  // Member of both apps, so holds both access groups; not site-admin, not app-admin.
  groups: ['stock-app-access', 'budget-app-access'],
  apps: ['stock-analyser', 'budget-tracker'],
  accounts: {
    'stock-analyser': [{ accountId: 'acct-sa-123', role: 'owner' }],
    'budget-tracker': [{ accountId: 'acct-bt-123', role: 'manager' }],
  },
} as const satisfies TransformotionTokenClaims;
