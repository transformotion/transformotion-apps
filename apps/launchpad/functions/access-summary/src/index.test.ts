import { describe, expect, it } from 'vitest';
import { buildAccessSummaries, countPendingInvitesByEmail } from './index';

// ---------------------------------------------------------------------------
// Test area 4: Access summary against legacy membership rows missing appSlug
// ---------------------------------------------------------------------------

type M = { accountId: string; userId: string; appSlug?: string; role: string };
type G = { appSlug: 'stock-analyser' | 'budget-tracker'; userId: string };
type U = { userId: string; email: string; displayName?: string; status?: 'active' | 'disabled' };

describe('buildAccessSummaries', () => {
  const noGrants = new Map<string, G[]>();
  const noSiteAdmins = new Set<string>();
  const noPending = new Map<string, number>();

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

  it('sets pendingInvites from the per-email count map (case-insensitive), 0 when absent (M11)', () => {
    const users: U[] = [
      { userId: 'u1', email: 'Alice@Example.com' }, // mixed case → matched lowercased
      { userId: 'u2', email: 'bob@example.com' },   // no pending invites
    ];
    const pending = new Map<string, number>([['alice@example.com', 2]]);

    const result = buildAccessSummaries(users, new Map(), noGrants, new Map(), new Map(), noSiteAdmins, pending);

    expect(result.find(u => u.userId === 'u1')!.pendingInvites).toBe(2);
    expect(result.find(u => u.userId === 'u2')!.pendingInvites).toBe(0);
  });
});

describe('countPendingInvitesByEmail (M11)', () => {
  it('counts pending bundles per lowercased email; ignores non-pending and missing email', () => {
    const counts = countPendingInvitesByEmail([
      { email: 'Alice@Example.com', status: 'pending' },
      { email: 'alice@example.com', status: 'pending' }, // same user, 2nd pending bundle
      { email: 'bob@example.com', status: 'accepted' },  // not pending → ignored
      { email: 'carol@example.com', status: 'expired' }, // not pending → ignored
      { status: 'pending' },                              // no email → ignored
    ]);

    expect(counts.get('alice@example.com')).toBe(2);
    expect(counts.has('bob@example.com')).toBe(false);
    expect(counts.has('carol@example.com')).toBe(false);
  });

  it('returns an empty map for no bundles', () => {
    expect(countPendingInvitesByEmail([]).size).toBe(0);
  });
});
