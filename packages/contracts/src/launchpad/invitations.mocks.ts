/**
 * M16 — canonical typed mocks for the invitation / membership / discovery
 * contracts, extracted from the accepted M11 v0 prototype seed.
 *
 * Persona coverage (each persona proves at least one contract rule):
 * - Steve  — site-admin; multi-account owner; supervisory visibility WITHOUT
 *            private account invitation authority.
 * - Ava    — SA app-admin who is NOT site-admin; multi-account in one app.
 * - Mara   — BT app-admin AND account manager (merged scopes; cannot grant owner).
 * - Noah   — plain account owner with no admin role (grant-capable, scoped discovery).
 * - Leo    — disabled user (fails closed everywhere).
 * - Liz    — invited newcomer; redeemed into membership with profile setup.
 */

import type {
  AccountMembershipRecord,
  AppAdminGrant,
  UserProfile,
} from '../_shared/auth';
import type { AccountSummary } from './types';
import type {
  CreateInvitationBundleResponse,
  GrantRedemptionResult,
  InvitationBundle,
  InviteeSearchResponse,
  RedeemBundleResponse,
} from './invitations';

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

export const mockM16Users = [
  {
    userId: 'user-steve',
    email: 'steve@example.com',
    displayName: 'Steve Moodie',
    status: 'active',
    preferences: { notificationsEnabled: true },
    profileComplete: true,
  },
  {
    userId: 'user-ava',
    email: 'ava.chen@example.com',
    displayName: 'Ava Chen',
    status: 'active',
    preferences: { notificationsEnabled: true },
    profileComplete: true,
  },
  {
    userId: 'user-mara',
    email: 'mara.silva@example.com',
    displayName: 'Mara Silva',
    status: 'active',
    preferences: { notificationsEnabled: true },
    profileComplete: true,
  },
  {
    userId: 'user-noah',
    email: 'noah.patel@example.com',
    displayName: 'Noah Patel',
    status: 'active',
    preferences: { notificationsEnabled: false },
    profileComplete: true,
  },
  {
    // Disabled user — fails closed on app access, redemption, and discovery.
    userId: 'user-leo',
    email: 'leo.kim@example.com',
    status: 'disabled',
    preferences: { notificationsEnabled: false },
  },
  {
    // Redeemed newcomer — created at redemption, pending profile setup.
    userId: 'user-liz',
    email: 'liz@example.com',
    status: 'active',
    preferences: { notificationsEnabled: true },
    profileComplete: false,
  },
] as const satisfies readonly UserProfile[];

/** Site-admin flags live outside UserProfile (claims/control-plane concern). */
export const mockM16SiteAdmins = ['user-steve'] as const;

// ---------------------------------------------------------------------------
// App-scoped accounts
// ---------------------------------------------------------------------------

export const mockM16Accounts = [
  {
    accountId: 'acct-sa-steve',
    appSlug: 'stock-analyser',
    name: "Steve's Account",
    ownerId: 'user-steve',
  },
  {
    accountId: 'acct-sa-apex',
    appSlug: 'stock-analyser',
    name: 'Apex Capital',
    ownerId: 'user-ava',
  },
  {
    accountId: 'acct-sa-research',
    appSlug: 'stock-analyser',
    name: 'Research Desk',
    ownerId: 'user-noah',
  },
  {
    accountId: 'acct-bt-household',
    appSlug: 'budget-tracker',
    name: 'Steve & Liz Household',
    ownerId: 'user-steve',
  },
  {
    accountId: 'acct-bt-studio',
    appSlug: 'budget-tracker',
    name: 'Studio Collective',
    ownerId: 'user-mara',
  },
] as const satisfies readonly AccountSummary[];

// ---------------------------------------------------------------------------
// Memberships (app access derives from these records)
// ---------------------------------------------------------------------------

export const mockM16Memberships = [
  // Steve — owner of his SA account and the BT household. NOT a member of
  // Apex/Research/Studio: site-admin visibility without private membership.
  {
    userId: 'user-steve',
    accountId: 'acct-sa-steve',
    appSlug: 'stock-analyser',
    role: 'owner',
    joinedAt: '2025-12-01T00:00:00.000Z',
  },
  {
    userId: 'user-steve',
    accountId: 'acct-bt-household',
    appSlug: 'budget-tracker',
    role: 'owner',
    joinedAt: '2025-12-01T00:00:00.000Z',
  },
  // Ava — MULTI-ACCOUNT within Stock Analyser (owner of one, member of another).
  {
    userId: 'user-ava',
    accountId: 'acct-sa-apex',
    appSlug: 'stock-analyser',
    role: 'owner',
    joinedAt: '2026-01-05T00:00:00.000Z',
  },
  {
    userId: 'user-ava',
    accountId: 'acct-sa-research',
    appSlug: 'stock-analyser',
    role: 'member',
    joinedAt: '2026-02-12T00:00:00.000Z',
  },
  // Mara — manager of the BT household (plus BT app-admin below): merged scopes.
  {
    userId: 'user-mara',
    accountId: 'acct-bt-household',
    appSlug: 'budget-tracker',
    role: 'manager',
    joinedAt: '2026-01-20T00:00:00.000Z',
  },
  {
    userId: 'user-mara',
    accountId: 'acct-bt-studio',
    appSlug: 'budget-tracker',
    role: 'owner',
    joinedAt: '2026-01-02T00:00:00.000Z',
  },
  // Noah — plain account owner, no admin role of any kind.
  {
    userId: 'user-noah',
    accountId: 'acct-sa-research',
    appSlug: 'stock-analyser',
    role: 'owner',
    joinedAt: '2026-01-10T00:00:00.000Z',
  },
  // Leo — disabled; membership exists but access fails closed on status.
  {
    userId: 'user-leo',
    accountId: 'acct-bt-studio',
    appSlug: 'budget-tracker',
    role: 'member',
    joinedAt: '2026-02-01T00:00:00.000Z',
  },
  // Liz — redeemed newcomer; membership created by bundle redemption.
  {
    userId: 'user-liz',
    accountId: 'acct-bt-household',
    appSlug: 'budget-tracker',
    role: 'member',
    joinedAt: '2026-06-08T00:00:00.000Z',
  },
] as const satisfies readonly AccountMembershipRecord[];

// ---------------------------------------------------------------------------
// App-admin grants (app-scoped authority, NOT site-admin)
// ---------------------------------------------------------------------------

export const mockM16AppAdminGrants = [
  { userId: 'user-ava', appSlug: 'stock-analyser', grantedAt: '2026-02-01T00:00:00.000Z' },
  { userId: 'user-mara', appSlug: 'budget-tracker', grantedAt: '2026-03-10T00:00:00.000Z' },
] as const satisfies readonly AppAdminGrant[];

// ---------------------------------------------------------------------------
// Invitation bundles
// ---------------------------------------------------------------------------

export const mockM16Bundles = [
  // Liz's accepted bundle — the redeemed-newcomer lifecycle.
  {
    bundleId: 'bundle-liz',
    email: 'liz@example.com',
    invitedBy: 'user-steve',
    createdAt: '2026-06-07T00:00:00.000Z',
    expiresAt: 1798761600,
    status: 'accepted',
    grants: [
      {
        grantId: 'grant-liz-1',
        kind: 'account-invite',
        appSlug: 'budget-tracker',
        accountId: 'acct-bt-household',
        role: 'member',
      },
    ],
  },
  // Pending bundle: EXISTING app user (Ava, already in SA) invited into
  // ANOTHER account of the same app — allowed by contract.
  {
    bundleId: 'bundle-ava-research',
    email: 'ava.chen@example.com',
    invitedBy: 'user-noah',
    createdAt: '2026-06-09T00:00:00.000Z',
    expiresAt: 1798761600,
    status: 'pending',
    grants: [
      {
        grantId: 'grant-ava-1',
        kind: 'account-invite',
        appSlug: 'stock-analyser',
        accountId: 'acct-sa-research',
        role: 'manager',
      },
    ],
  },
  // Pending app-grant for a true newcomer — access only, no account. The
  // invitee self-creates and names their own first account on arrival.
  {
    bundleId: 'bundle-newcomer',
    email: 'newcomer@example.com',
    invitedBy: 'user-ava',
    createdAt: '2026-06-10T00:00:00.000Z',
    expiresAt: 1798761600,
    status: 'pending',
    grants: [
      {
        grantId: 'grant-new-1',
        kind: 'app-grant',
        appSlug: 'stock-analyser',
      },
    ],
  },
] as const satisfies readonly InvitationBundle[];

// ---------------------------------------------------------------------------
// Decision / outcome mocks proving the blocked & boundary cases
// ---------------------------------------------------------------------------

/**
 * APP-PROVISION BLOCKED: Ava already has active SA access, so a provision
 * grant for her is rejected per-grant while the rest of the request proceeds.
 */
export const mockM16ProvisionBlockedResponse = {
  bundle: mockM16Bundles[1],
  decisions: [
    { index: 0, allowed: true, reason: 'Sender is an owner of this account.' },
    {
      index: 1,
      allowed: false,
      reason: 'Recipient already has active access to Stock Analyser.',
    },
  ],
} as const satisfies CreateInvitationBundleResponse;

/**
 * SITE-ADMIN VISIBILITY WITHOUT AUTHORITY: Steve (site-admin) attempting an
 * account-invite into Research Desk — which he neither owns nor manages — is
 * unauthorized even though he can SEE the account in supervisory views.
 */
export const mockM16SiteAdminBlockedDecision = {
  index: 0,
  allowed: false,
  reason:
    'You are a site-admin, but not an owner or manager of this account. Site-admin visibility does not grant invitation authority.',
} as const satisfies CreateInvitationBundleResponse['decisions'][number];

/** DUPLICATE-MEMBER outcome: re-redeeming an accepted grant is idempotent. */
export const mockM16DuplicateOutcome = {
  grantId: 'grant-liz-1',
  kind: 'account-invite',
  appSlug: 'budget-tracker',
  target: 'Steve & Liz Household',
  outcome: 'duplicate',
  resultingAccountId: 'acct-bt-household',
  reason: 'Already an active member of this account.',
} as const satisfies GrantRedemptionResult;

/** Liz's original redemption — newcomer creation + accepted membership. */
export const mockM16LizRedemption = {
  bundleId: 'bundle-liz',
  userId: 'user-liz',
  userCreated: true,
  results: [
    {
      grantId: 'grant-liz-1',
      kind: 'account-invite',
      appSlug: 'budget-tracker',
      target: 'Steve & Liz Household',
      outcome: 'accepted',
      resultingAccountId: 'acct-bt-household',
      reason: 'Joined as member.',
    },
  ],
} as const satisfies RedeemBundleResponse;

/**
 * OWNER/MANAGER DISCOVERY: Noah (plain owner of Research Desk) searching —
 * scope is account-manager limited to his account; he sees Ava because she is
 * a member of an account he manages, nothing broader.
 */
export const mockM16NoahDiscovery = {
  scope: {
    kind: 'account-manager',
    appSlugs: [],
    accountIds: ['acct-sa-research'],
  },
  results: [
    {
      userId: 'user-ava',
      email: 'ava.chen@example.com',
      displayName: 'Ava Chen',
      status: 'active',
      reasons: ['Member of an account you manage'],
    },
  ],
} as const satisfies InviteeSearchResponse;
