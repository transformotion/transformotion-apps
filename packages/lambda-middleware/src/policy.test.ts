import { describe, it, expect, vi } from 'vitest';
import type { AuthClaims } from './types';
import type { AccountMembershipRow, MembershipLoader } from './auth';
import { HttpError } from './errors';
import {
  isKnownRole,
  roleAtLeast,
  decideMember,
  decideMinRole,
  decideOwnerOrManager,
  decideOwner,
  decideRoleChange,
  decideRemoval,
  decideLastOwnerGuard,
  discoveryScope,
  accountRole,
  requireAccountMember,
  requireAccountOwnerOrManager,
  requireAppAdminForApp,
  requireSupervisorySiteAdmin,
  anyOf,
  allOf,
  requireAccountData,
  requireAccountAdmin,
  UNIFORM_DENY,
  type PolicyGuard,
} from './policy';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const row = (role: string, status?: string): AccountMembershipRow =>
  ({ role, status } as AccountMembershipRow);

const loaderOf = (r: AccountMembershipRow | undefined): MembershipLoader =>
  vi.fn(async () => r);

const throwingLoader = (): MembershipLoader =>
  vi.fn(async () => {
    throw new Error('ProvisionedThroughputExceeded');
  });

const claims = (accounts: AuthClaims['accounts'] = {}): AuthClaims => ({
  userId: 'u-1',
  email: 'u@example.com',
  groups: [],
  apps: [],
  accounts,
  siteAdmin: false,
});

async function statusOf(p: Promise<unknown>): Promise<number> {
  try {
    await p;
    return 200;
  } catch (err) {
    return err instanceof HttpError ? err.statusCode : -1;
  }
}

const pass: PolicyGuard = async () => {};
const deny403: PolicyGuard = async () => {
  throw new HttpError(403, 'nope');
};
const infra503: PolicyGuard = async () => {
  throw new HttpError(503, 'infra');
};

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

describe('isKnownRole / roleAtLeast', () => {
  it('accepts the four known roles, rejects anything else', () => {
    for (const r of ['viewer', 'member', 'manager', 'owner']) expect(isKnownRole(r)).toBe(true);
    for (const r of ['admin', '', 'OWNER', undefined]) expect(isKnownRole(r as string)).toBe(false);
  });

  it('ranks ascending viewer<member<manager<owner; unknown is below all', () => {
    expect(roleAtLeast('owner', 'viewer')).toBe(true);
    expect(roleAtLeast('member', 'member')).toBe(true);
    expect(roleAtLeast('viewer', 'member')).toBe(false);
    expect(roleAtLeast('admin', 'viewer')).toBe(false); // unknown → false
    expect(roleAtLeast(undefined, 'viewer')).toBe(false);
  });
});

describe('decideMember (deny-by-default)', () => {
  it('allows an active known-role row', () => {
    expect(decideMember(row('viewer')).allow).toBe(true);
    expect(decideMember(row('member', 'active')).allow).toBe(true);
  });
  it('denies a missing row', () => expect(decideMember(undefined).allow).toBe(false));
  it('denies a disabled row', () => expect(decideMember(row('member', 'disabled')).allow).toBe(false));
  it('denies an unknown role (un-backfilled / legacy)', () =>
    expect(decideMember(row('admin')).allow).toBe(false));
});

describe('decideMinRole / decideOwnerOrManager / decideOwner', () => {
  it('decideMinRole enforces the floor', () => {
    expect(decideMinRole(row('member'), 'member').allow).toBe(true);
    expect(decideMinRole(row('viewer'), 'member').allow).toBe(false);
    expect(decideMinRole(undefined, 'viewer').allow).toBe(false);
  });
  it('decideOwnerOrManager', () => {
    expect(decideOwnerOrManager(row('owner')).allow).toBe(true);
    expect(decideOwnerOrManager(row('manager')).allow).toBe(true);
    expect(decideOwnerOrManager(row('member')).allow).toBe(false);
    expect(decideOwnerOrManager(row('viewer', 'disabled')).allow).toBe(false);
  });
  it('decideOwner', () => {
    expect(decideOwner(row('owner')).allow).toBe(true);
    expect(decideOwner(row('manager')).allow).toBe(false);
  });
});

describe('decideRoleChange (matrix)', () => {
  it('owner may set any role, including owner', () => {
    for (const nr of ['viewer', 'member', 'manager', 'owner'])
      expect(decideRoleChange('owner', 'member', nr).allow).toBe(true);
  });
  it('manager may set member/viewer/manager but NEVER owner', () => {
    expect(decideRoleChange('manager', 'member', 'manager').allow).toBe(true);
    expect(decideRoleChange('manager', 'viewer', 'member').allow).toBe(true);
    expect(decideRoleChange('manager', 'member', 'owner').allow).toBe(false);
  });
  it('manager may not change a target who is currently an owner', () => {
    expect(decideRoleChange('manager', 'owner', 'manager').allow).toBe(false);
  });
  it('members and viewers may not change roles', () => {
    expect(decideRoleChange('member', 'viewer', 'member').allow).toBe(false);
    expect(decideRoleChange('viewer', 'viewer', 'member').allow).toBe(false);
  });
  it('unknown role on any side denies', () => {
    expect(decideRoleChange('admin', 'member', 'member').allow).toBe(false);
    expect(decideRoleChange('owner', 'admin', 'member').allow).toBe(false);
    expect(decideRoleChange('owner', 'member', 'admin').allow).toBe(false);
  });
});

describe('decideLastOwnerGuard', () => {
  const members = [
    { userId: 'o1', role: 'owner' },
    { userId: 'o2', role: 'owner' },
    { userId: 'm1', role: 'member' },
  ];
  it('blocks removing/demoting the SOLE owner', () => {
    expect(decideLastOwnerGuard([{ userId: 'o1', role: 'owner' }], 'o1').allow).toBe(false);
  });
  it('allows when another owner remains', () => {
    expect(decideLastOwnerGuard(members, 'o1').allow).toBe(true);
  });
  it('does not apply to a non-owner target', () => {
    expect(decideLastOwnerGuard([{ userId: 'o1', role: 'owner' }], 'm1').allow).toBe(true);
  });
});

describe('decideRemoval (role model §7a)', () => {
  it('owner may remove anyone', () => {
    for (const t of ['owner', 'manager', 'member', 'viewer']) {
      expect(decideRemoval('owner', t, false).allow).toBe(true);
    }
  });
  it('manager may remove member/viewer ONLY', () => {
    expect(decideRemoval('manager', 'member', false).allow).toBe(true);
    expect(decideRemoval('manager', 'viewer', false).allow).toBe(true);
    expect(decideRemoval('manager', 'manager', false).allow).toBe(false); // no peer removal
    expect(decideRemoval('manager', 'owner', false).allow).toBe(false);
  });
  it('member/viewer may not remove anyone', () => {
    expect(decideRemoval('member', 'viewer', false).allow).toBe(false);
    expect(decideRemoval('viewer', 'member', false).allow).toBe(false);
  });
  it('self-removal is allowed regardless of role (last-owner floor enforced separately)', () => {
    expect(decideRemoval('manager', 'manager', true).allow).toBe(true); // manager removes self
    expect(decideRemoval('owner', 'owner', true).allow).toBe(true);     // owner self — last-owner guard blocks sole owner
    expect(decideRemoval('member', 'member', true).allow).toBe(true);
  });
  it('unknown role on either side → deny', () => {
    expect(decideRemoval('admin', 'member', false).allow).toBe(false);
    expect(decideRemoval('owner', 'admin', false).allow).toBe(false);
    expect(decideRemoval(undefined, 'member', false).allow).toBe(false);
  });
});

describe('discoveryScope (§8)', () => {
  it('returns the scope, never a boolean', () => {
    expect(discoveryScope({ siteAdmin: true, appAdminForApp: false, ownerOrManagerSomewhere: false })).toBe('all');
    expect(discoveryScope({ siteAdmin: false, appAdminForApp: true, ownerOrManagerSomewhere: false })).toBe('app');
    expect(discoveryScope({ siteAdmin: false, appAdminForApp: false, ownerOrManagerSomewhere: true })).toBe('managed-accounts');
    expect(discoveryScope({ siteAdmin: false, appAdminForApp: false, ownerOrManagerSomewhere: false })).toBe('none');
  });
});

// ---------------------------------------------------------------------------
// Loader-resolved guards — fail-closed on loader error, unknown role, absent target
// ---------------------------------------------------------------------------

describe('accountRole', () => {
  it('resolves the active role', async () =>
    expect(await accountRole(loaderOf(row('manager')), 'a', 'u')).toBe('manager'));
  it('returns null for an absent row', async () =>
    expect(await accountRole(loaderOf(undefined), 'a', 'u')).toBeNull());
  it('returns null for an unknown role (deny-by-default)', async () =>
    expect(await accountRole(loaderOf(row('admin')), 'a', 'u')).toBeNull());
  it('returns null for a disabled row', async () =>
    expect(await accountRole(loaderOf(row('owner', 'disabled')), 'a', 'u')).toBeNull());
  it('FAILS CLOSED with 503 when the loader throws', async () =>
    expect(await statusOf(accountRole(throwingLoader(), 'a', 'u'))).toBe(503));
});

describe('requireAccountMember / requireAccountOwnerOrManager', () => {
  it('member passes; absent → uniform 403; loader throw → 503', async () => {
    expect(await statusOf(requireAccountMember(loaderOf(row('viewer')), 'a', 'u'))).toBe(200);
    expect(await statusOf(requireAccountMember(loaderOf(undefined), 'a', 'u'))).toBe(403);
    expect(await statusOf(requireAccountMember(throwingLoader(), 'a', 'u'))).toBe(503);
  });
  it('owner-or-manager: member rejected, manager allowed, unknown role rejected', async () => {
    expect(await statusOf(requireAccountOwnerOrManager(loaderOf(row('member')), 'a', 'u'))).toBe(403);
    expect(await statusOf(requireAccountOwnerOrManager(loaderOf(row('manager')), 'a', 'u'))).toBe(200);
    expect(await statusOf(requireAccountOwnerOrManager(loaderOf(row('admin')), 'a', 'u'))).toBe(403);
  });
  it('the denial body is uniform (no existence oracle)', async () => {
    try {
      await requireAccountMember(loaderOf(undefined), 'a', 'u');
    } catch (err) {
      expect((err as HttpError).message).toBe(UNIFORM_DENY);
    }
  });
});

describe('requireAppAdminForApp (token group) / requireSupervisorySiteAdmin (live)', () => {
  it('app-admin: reads the {app}-app-admin group from the token; per-app; absent → uniform 403', () => {
    const btAdmin = { ...claims(), groups: ['budget-app-admin'] };
    const accessOnly = { ...claims(), groups: ['budget-app-access'] };
    // In the group → passes for that app.
    expect(() => requireAppAdminForApp(btAdmin, 'budget-tracker')).not.toThrow();
    // Per-app scoping: a budget admin is NOT a stock admin.
    expect(() => requireAppAdminForApp(btAdmin, 'stock-analyser')).toThrow(HttpError);
    // App-access (or site-admin) alone does NOT confer app-admin (groups-authoritative).
    expect(() => requireAppAdminForApp(accessOnly, 'budget-tracker')).toThrow(HttpError);
    expect(() => requireAppAdminForApp({ ...claims(), groups: ['site-admin'] }, 'budget-tracker')).toThrow(HttpError);
    // Uniform deny (no probing oracle).
    try {
      requireAppAdminForApp(accessOnly, 'budget-tracker');
    } catch (err) {
      expect((err as HttpError).statusCode).toBe(403);
      expect((err as HttpError).message).toBe(UNIFORM_DENY);
    }
  });
  it('supervisory site-admin verified LIVE (loader), not the token claim', async () => {
    expect(await statusOf(requireSupervisorySiteAdmin(vi.fn(async () => true), 'u'))).toBe(200);
    expect(await statusOf(requireSupervisorySiteAdmin(vi.fn(async () => false), 'u'))).toBe(403);
    expect(await statusOf(requireSupervisorySiteAdmin(vi.fn(async () => { throw new Error('x'); }), 'u'))).toBe(503);
  });
});

// ---------------------------------------------------------------------------
// Combinators
// ---------------------------------------------------------------------------

describe('anyOf / allOf (fail-closed precedence)', () => {
  it('anyOf passes when one guard passes', async () =>
    expect(await statusOf(anyOf(deny403, pass))).toBe(200));
  it('anyOf is uniform 403 when all guards 403', async () =>
    expect(await statusOf(anyOf(deny403, deny403))).toBe(403));
  it('anyOf surfaces 503 (infra) over a uniform 403 when none passes', async () =>
    expect(await statusOf(anyOf(deny403, infra503))).toBe(503));
  it('anyOf still passes if a passing guard precedes a 503', async () =>
    expect(await statusOf(anyOf(pass, infra503))).toBe(200));
  it('allOf fails on the first failing guard', async () => {
    expect(await statusOf(allOf(pass, deny403))).toBe(403);
    expect(await statusOf(allOf(pass, pass))).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// D9 middlewares
// ---------------------------------------------------------------------------

describe('requireAccountData (NO site-admin branch)', () => {
  const guard = requireAccountData('budget-tracker');

  it('read passes with a membership claim, denies without — even for a site-admin', () => {
    const member = claims({ 'budget-tracker': [{ accountId: 'acc-1', role: 'viewer' }] });
    expect(() => guard.read(member, 'acc-1')).not.toThrow();
    expect(() => guard.read(member, 'acc-OTHER')).toThrow();

    // site-admin without a membership claim is denied like anyone else (no bypass).
    const admin = { ...claims({}), siteAdmin: true };
    expect(() => guard.read(admin, 'acc-1')).toThrow();
  });

  it('write delegates to requireAccountWrite: viewer rejected, disabled rejected, member allowed', async () => {
    const member = claims({ 'budget-tracker': [{ accountId: 'acc-1', role: 'member' }] });
    expect(await statusOf(guard.write(member, 'acc-1', loaderOf(row('viewer'))))).toBe(403);
    expect(await statusOf(guard.write(member, 'acc-1', loaderOf(row('member', 'disabled'))))).toBe(403);
    expect(await statusOf(guard.write(member, 'acc-1', loaderOf(row('member'))))).toBe(200);
  });

  it('write with no claim is rejected, and a loader throw fails closed (503)', async () => {
    const member = claims({ 'budget-tracker': [{ accountId: 'acc-1', role: 'member' }] });
    expect(await statusOf(guard.write(claims({}), 'acc-1', loaderOf(row('member'))))).toBe(403);
    expect(await statusOf(guard.write(member, 'acc-1', throwingLoader()))).toBe(503);
  });
});

describe('requireAccountAdmin', () => {
  it('denies by default with no guards', async () =>
    expect(await statusOf(requireAccountAdmin())).toBe(403));
  it('passes if any guard passes (owner/manager OR supervisory site-admin shape)', async () =>
    expect(await statusOf(requireAccountAdmin(deny403, pass))).toBe(200));
  it('uniform 403 when all guards deny', async () =>
    expect(await statusOf(requireAccountAdmin(deny403, deny403))).toBe(403));
  it('surfaces 503 when a guard hits infra and none passes', async () =>
    expect(await statusOf(requireAccountAdmin(deny403, infra503))).toBe(503));
});
