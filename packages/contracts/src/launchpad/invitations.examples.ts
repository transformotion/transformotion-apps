/**
 * M16 — canonical example values for the invitation/membership/discovery
 * contracts. Used by `api.ts` route examples and re-exported by `mocks.ts`.
 */

import type {
  AccountMemberRow,
  CreateInvitationBundleRequest,
  CreateInvitationBundleResponse,
  DiscoveredInvitee,
  InvitationBundle,
  InviteeSearchScope,
  RedeemBundleResponse,
  UserAccessSummary,
} from './invitations';

export const exampleInvitationBundle = {
  bundleId: 'bundle-liz',
  email: 'liz@example.com',
  invitedBy: 'user-steve',
  createdAt: '2026-06-07T00:00:00.000Z',
  expiresAt: 1798761600,
  status: 'pending',
  grants: [
    {
      grantId: 'grant-1',
      kind: 'account-invite',
      appSlug: 'budget-tracker',
      accountId: 'acct-bt-household',
      role: 'member',
    },
    {
      grantId: 'grant-2',
      kind: 'app-grant',
      appSlug: 'stock-analyser',
    },
  ],
} as const satisfies InvitationBundle;

export const exampleCreateBundleRequest = {
  email: 'liz@example.com',
  grants: [
    {
      kind: 'account-invite',
      appSlug: 'budget-tracker',
      accountId: 'acct-bt-household',
      role: 'member',
    },
  ],
} as const satisfies CreateInvitationBundleRequest;

export const exampleCreateBundleResponse = {
  bundle: exampleInvitationBundle,
  decisions: [
    { index: 0, allowed: true, reason: 'Sender is an owner of this account.' },
    {
      index: 1,
      allowed: false,
      reason: 'Recipient already has access to this app; an app-access grant would do nothing.',
    },
  ],
} as const satisfies CreateInvitationBundleResponse;

export const exampleRedeemBundleResponse = {
  bundleId: 'bundle-liz',
  userId: 'user-liz',
  userCreated: true,
  results: [
    {
      grantId: 'grant-1',
      kind: 'account-invite',
      appSlug: 'budget-tracker',
      target: 'Steve & Liz Household',
      outcome: 'accepted',
      resultingAccountId: 'acct-bt-household',
      reason: 'Joined as member.',
    },
  ],
} as const satisfies RedeemBundleResponse;

export const exampleAccountMemberRow = {
  userId: 'user-steve',
  email: 'steve@example.com',
  displayName: 'Steve Moodie',
  status: 'active',
  role: 'owner',
  joinedAt: '2025-12-01T00:00:00.000Z',
  isLastOwner: true,
} as const satisfies AccountMemberRow;

export const exampleUserAccessSummary = {
  userId: 'user-ava',
  email: 'ava.chen@example.com',
  displayName: 'Ava Chen',
  status: 'active',
  siteAdmin: false,
  appAccess: [
    {
      appSlug: 'stock-analyser',
      appAdmin: true,
      accounts: [
        { accountId: 'acct-sa-apex', accountName: 'Apex Capital', role: 'owner' },
        { accountId: 'acct-sa-research', accountName: 'Research Desk', role: 'member' },
      ],
    },
  ],
  pendingInvites: 1,
  pendingInvitations: [
    {
      bundleId: 'bundle-ava',
      grantId: 'grant-ava-1',
      kind: 'account-invite',
      appSlug: 'budget-tracker',
      target: 'Steve & Liz Household',
      role: 'member',
      status: 'pending',
      createdAt: '2026-06-09T00:00:00.000Z',
      expiresAt: 1798761600,
    },
  ],
} as const satisfies UserAccessSummary;

export const exampleInviteeSearchScope = {
  kind: 'account-manager',
  appSlugs: [],
  accountIds: ['acct-bt-household'],
} as const satisfies InviteeSearchScope;

export const exampleDiscoveredInvitee = {
  userId: 'user-ava',
  email: 'ava.chen@example.com',
  displayName: 'Ava Chen',
  status: 'active',
  reasons: ['Member of an account you manage'],
} as const satisfies DiscoveredInvitee;
