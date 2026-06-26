import { describe, expect, it } from 'vitest';
import { buildAccessSummaries, buildPendingByEmail, pendingTargetAccountIds } from './index';
import type { UserPendingInvitation } from '@transformotion/contracts/launchpad/invitations';

// ---------------------------------------------------------------------------
// Test area 4: Access summary against legacy membership rows missing appSlug
// ---------------------------------------------------------------------------

type M = { accountId: string; userId: string; appSlug?: string; role: string };
type G = { appSlug: 'stock-analyser' | 'budget-tracker'; userId: string };
type U = { userId: string; email: string; displayName?: string; status?: 'active' | 'disabled' };

describe('buildAccessSummaries', () => {
  const noGrants = new Map<string, G[]>();
  const noSiteAdmins = new Set<string>();
  const noPending = new Map<string, UserPendingInvitation[]>();

  it('includes membership when appSlug is denormalized on the row', () => {
    const user: U = { userId: 'u1', email: 'u1@example.com' };
    const members = new Map([['u1', [{ accountId: 'acc-1', userId: 'u1', appSlug: 'stock-analyser', role: 'owner' }] as M[]]]);
    const accountNames = new Map([['acc-1', 'My Portfolio']]);

    const result = buildAccessSummaries([user], members, noGrants, new Map(), accountNames, noSiteAdmins, noPending);

    expect(result).toHaveLength(1);
    expect(result[0]!.appAccess).toHaveLength(1);
    expect(result[0]!.appAccess[0]).toMatchObject({
      appSlug: 'stock-analyser',
      appAdmin: false,
      accounts: [{ accountId: 'acc-1', accountName: 'My Portfolio', role: 'owner' }],
    });
  });

  it('includes membership for legacy row missing appSlug when resolved via appSlugByAccount', () => {
    const user: U = { userId: 'u1', email: 'u1@example.com' };
    const members = new Map([
      ['u1', [{ accountId: 'acc-legacy', userId: 'u1', role: 'member' }] as M[]], // no appSlug
    ]);
    // appSlugByAccount provides the resolution (would have come from BatchGetItem on accounts table)
    const appSlugByAccount = new Map([['acc-legacy', 'budget-tracker']]);
    const accountNames = new Map([['acc-legacy', 'Family Budget']]);

    const result = buildAccessSummaries([user], members, noGrants, appSlugByAccount, accountNames, noSiteAdmins, noPending);

    expect(result[0]!.appAccess).toHaveLength(1);
    expect(result[0]!.appAccess[0]).toMatchObject({
      appSlug: 'budget-tracker',
      accounts: [{ accountId: 'acc-legacy', accountName: 'Family Budget', role: 'member' }],
    });
  });

  it('silently drops membership when appSlug is missing and not resolvable (D9 fail-closed)', () => {
    const user: U = { userId: 'u1', email: 'u1@example.com' };
    const members = new Map([
      ['u1', [{ accountId: 'acc-orphan', userId: 'u1', role: 'owner' }] as M[]], // no appSlug
    ]);
    // appSlugByAccount is empty — BatchGetItem returned nothing for this accountId
    const result = buildAccessSummaries([user], members, noGrants, new Map(), new Map(), noSiteAdmins, noPending);

    expect(result[0]!.appAccess).toHaveLength(0);
  });

  it('drops membership when resolved appSlug is not in the entitled list', () => {
    const user: U = { userId: 'u1', email: 'u1@example.com' };
    const members = new Map([
      ['u1', [{ accountId: 'acc-x', userId: 'u1', appSlug: 'unknown-app' as 'stock-analyser', role: 'owner' }] as M[]],
    ]);

    const result = buildAccessSummaries([user], members, noGrants, new Map(), new Map(), noSiteAdmins, noPending);

    expect(result[0]!.appAccess).toHaveLength(0);
  });

  it('merges denormalized and legacy rows for the same user across apps', () => {
    const user: U = { userId: 'u1', email: 'u1@example.com' };
    const members = new Map([
      ['u1', [
        { accountId: 'acc-sa', userId: 'u1', appSlug: 'stock-analyser', role: 'owner' },     // denormalized
        { accountId: 'acc-bt', userId: 'u1', role: 'member' },                                // legacy
      ] as M[]],
    ]);
    const appSlugByAccount = new Map([['acc-bt', 'budget-tracker']]);

    const result = buildAccessSummaries([user], members, noGrants, appSlugByAccount, new Map(), noSiteAdmins, noPending);

    const appSlugs = result[0]!.appAccess.map(a => a.appSlug).sort();
    expect(appSlugs).toEqual(['budget-tracker', 'stock-analyser']);
  });

  it('marks siteAdmin correctly per-user from siteAdminIds set', () => {
    const users: U[] = [
      { userId: 'admin', email: 'admin@example.com' },
      { userId: 'regular', email: 'regular@example.com' },
    ];
    const siteAdminIds = new Set(['admin']);

    const result = buildAccessSummaries(users, new Map(), noGrants, new Map(), new Map(), siteAdminIds, noPending);

    expect(result.find(u => u.userId === 'admin')!.siteAdmin).toBe(true);
    expect(result.find(u => u.userId === 'regular')!.siteAdmin).toBe(false);
  });

  it('applies display name fallback chain (displayName → local part → email)', () => {
    const users: U[] = [
      { userId: 'u1', email: 'alice@example.com', displayName: 'Alice' },
      { userId: 'u2', email: 'bob@example.com' },
    ];

    const result = buildAccessSummaries(users, new Map(), noGrants, new Map(), new Map(), noSiteAdmins, noPending);

    expect(result.find(u => u.userId === 'u1')!.displayName).toBe('Alice');
    expect(result.find(u => u.userId === 'u2')!.displayName).toBe('bob');
  });

  it('includes app-admin grant even when user has no account memberships for that app', () => {
    const user: U = { userId: 'u1', email: 'u1@example.com' };
    const grants = new Map([['u1', [{ appSlug: 'stock-analyser' as const, userId: 'u1' }] as G[]]]);

    const result = buildAccessSummaries([user], new Map(), grants, new Map(), new Map(), noSiteAdmins, noPending);

    expect(result[0]!.appAccess).toHaveLength(1);
    expect(result[0]!.appAccess[0]).toMatchObject({
      appSlug: 'stock-analyser',
      appAdmin: true,
      accounts: [],
    });
  });

  it('sets pendingInvitations from the per-email list (case-insensitive); count = length; [] when absent (M11)', () => {
    const users: U[] = [
      { userId: 'u1', email: 'Alice@Example.com' }, // mixed case → matched lowercased
      { userId: 'u2', email: 'bob@example.com' },   // no pending invites
    ];
    const invite: UserPendingInvitation = {
      bundleId: 'b1', grantId: 'g1', kind: 'account-invite', appSlug: 'stock-analyser',
      target: 'Alice Portfolio', role: 'member', status: 'pending',
      createdAt: '2026-06-01T00:00:00.000Z', expiresAt: 1798761600,
    };
    const pending = new Map<string, UserPendingInvitation[]>([['alice@example.com', [invite, { ...invite, grantId: 'g2' }]]]);

    const result = buildAccessSummaries(users, new Map(), noGrants, new Map(), new Map(), noSiteAdmins, pending);

    const u1 = result.find(u => u.userId === 'u1')!;
    expect(u1.pendingInvitations).toHaveLength(2);
    expect(u1.pendingInvites).toBe(2); // invariant: count === list length
    const u2 = result.find(u => u.userId === 'u2')!;
    expect(u2.pendingInvitations).toEqual([]);
    expect(u2.pendingInvites).toBe(0);
  });
});

describe('buildPendingByEmail (M11)', () => {
  const names = new Map<string, string>([['acc-1', "Steve's Portfolio"]]);

  it('builds one row per grant; resolves account-invite target name + role; lowercased email key', () => {
    const map = buildPendingByEmail(
      [
        {
          bundleId: 'b1', email: 'Alice@Example.com', status: 'pending',
          createdAt: '2026-06-01T00:00:00.000Z', expiresAt: 1798761600,
          grants: [{ grantId: 'g1', kind: 'account-invite', appSlug: 'stock-analyser', accountId: 'acc-1', role: 'member' }],
        },
      ],
      names,
    );
    const rows = map.get('alice@example.com')!;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      bundleId: 'b1', grantId: 'g1', kind: 'account-invite', appSlug: 'stock-analyser',
      target: "Steve's Portfolio", role: 'member', status: 'pending',
    });
  });

  it('falls back to accountId when the target account name is unresolved', () => {
    const rows = buildPendingByEmail(
      [{ email: 'x@y.com', status: 'pending', grants: [{ grantId: 'g', kind: 'account-invite', appSlug: 'budget-tracker', accountId: 'acc-unknown', role: 'viewer' }] }],
      new Map(),
    ).get('x@y.com')!;
    expect(rows[0]!.target).toBe('acc-unknown');
  });

  it('app-grant rows use the app label and carry no role', () => {
    const rows = buildPendingByEmail(
      [{ email: 'x@y.com', status: 'pending', grants: [{ grantId: 'g', kind: 'app-grant', appSlug: 'stock-analyser' }] }],
      new Map(),
    ).get('x@y.com')!;
    expect(rows[0]!.target).toBe('Stock Analyser');
    expect(rows[0]!.role).toBeUndefined();
  });

  it('ignores non-pending bundles and missing email', () => {
    const map = buildPendingByEmail([
      { email: 'a@b.com', status: 'accepted', grants: [{ grantId: 'g', kind: 'account-invite', appSlug: 'stock-analyser', accountId: 'acc-1' }] },
      { status: 'pending', grants: [{ grantId: 'g', kind: 'account-invite', appSlug: 'stock-analyser', accountId: 'acc-1' }] },
    ], names);
    expect(map.size).toBe(0);
  });

  it('pendingTargetAccountIds collects account-invite target ids from pending bundles only', () => {
    const ids = pendingTargetAccountIds([
      { status: 'pending', grants: [{ grantId: 'g1', kind: 'account-invite', appSlug: 'stock-analyser', accountId: 'acc-1' }, { grantId: 'g2', kind: 'app-grant', appSlug: 'budget-tracker' }] },
      { status: 'accepted', grants: [{ grantId: 'g3', kind: 'account-invite', appSlug: 'stock-analyser', accountId: 'acc-2' }] },
    ]);
    expect(ids).toEqual(['acc-1']);
  });
});
