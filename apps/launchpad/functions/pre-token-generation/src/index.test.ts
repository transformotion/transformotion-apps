import { describe, expect, it } from 'vitest';
import { planReconcile } from './index';

// ---------------------------------------------------------------------------
// Pre-token reconcile is ADD-ONLY (one-directional invariant, #473).
//
// The load-bearing case is the one the prior tests never exercised: a user who
// holds {app}-app-access with ZERO accounts (the "access, no accounts" state,
// e.g. a fresh app-grant invitee) must RETAIN the access group through a token
// refresh. The former remove-on-zero branch stripped it on refresh, locking the
// invitee out of the create-first-account flow.
// ---------------------------------------------------------------------------

const APP_SLUGS = ['stock-analyser', 'budget-tracker'];
const ACCESS_GROUP: Record<string, string> = {
  'stock-analyser': 'stock-app-access',
  'budget-tracker': 'budget-app-access',
};

type Accounts = Record<string, Array<{ accountId: string; role: string }>>;
const plan = (groups: string[], accounts: Accounts) =>
  planReconcile(groups, accounts, APP_SLUGS, ACCESS_GROUP);

describe('planReconcile — add-only app-access invariant (#473)', () => {
  it('RETAINS app-access at zero accounts (access, no accounts survives a refresh)', () => {
    // App-grant invitee: holds the access group, owns no accounts. On the next
    // token issuance the group must NOT be stripped.
    const result = plan(['stock-app-access'], {});
    expect(result.resultingGroups).toContain('stock-app-access');
    expect(result.toAdd).toEqual([]); // nothing added, nothing removed
  });

  it('is stable across repeated refreshes (idempotent — never drifts to stripping)', () => {
    let groups = ['stock-app-access'];
    for (let refresh = 0; refresh < 3; refresh++) {
      const result = plan(groups, {}); // still zero accounts each refresh
      expect(result.resultingGroups).toContain('stock-app-access');
      groups = result.resultingGroups;
    }
    expect(groups).toEqual(['stock-app-access']);
  });

  it('ADDS app-access when the user has >=1 account but lacks the group (membership ⟹ access)', () => {
    const result = plan([], { 'stock-analyser': [{ accountId: 'acct-1', role: 'owner' }] });
    expect(result.toAdd).toEqual(['stock-app-access']);
    expect(result.resultingGroups).toContain('stock-app-access');
  });

  it('does not double-add when the user already holds the group and has accounts', () => {
    const result = plan(['stock-app-access'], {
      'stock-analyser': [{ accountId: 'acct-1', role: 'owner' }],
    });
    expect(result.toAdd).toEqual([]);
    expect(result.resultingGroups).toEqual(['stock-app-access']);
  });

  it('reconciles each app independently and preserves unrelated groups', () => {
    // Holds SA access with no SA accounts (retain), has a BT account but lacks BT
    // access (add), and carries site-admin (preserved untouched).
    const result = plan(['site-admin', 'stock-app-access'], {
      'budget-tracker': [{ accountId: 'acct-bt', role: 'manager' }],
    });
    expect(result.toAdd).toEqual(['budget-app-access']);
    expect(result.resultingGroups).toEqual(
      expect.arrayContaining(['site-admin', 'stock-app-access', 'budget-app-access']),
    );
  });

  it('never emits a remove: a site-admin holding access with zero accounts keeps it', () => {
    // D11 removed the site-admin exemption, but with the remove branch gone there
    // is nothing to be exempt from — no group is ever stripped here.
    const result = plan(['site-admin', 'stock-app-access', 'budget-app-access'], {});
    expect(result.toAdd).toEqual([]);
    expect(result.resultingGroups).toEqual(['site-admin', 'stock-app-access', 'budget-app-access']);
  });
});
