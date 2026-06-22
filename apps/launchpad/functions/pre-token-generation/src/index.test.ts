import { describe, expect, it } from 'vitest';
import { planReconcile, membershipUserId } from './index';

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

// ---------------------------------------------------------------------------
// Membership-table key resolution (#486). The membership table is keyed on the
// Cognito `sub`. The trigger MUST key its membership query on the sub, NOT
// `event.userName` — which is provider-shaped for federated users and diverges
// from the sub, silently returning no rows. The prior tests never caught this
// because they only exercised planReconcile with native-shaped ids (userName==sub).
// ---------------------------------------------------------------------------
describe('membershipUserId — table key is the sub, not the Username (#486)', () => {
  it('returns the SUB for a FEDERATED user (Username Google_… diverges from sub)', () => {
    const event = {
      userName: 'Google_111439223304386966737',
      request: { userAttributes: { sub: '492ed4a8-0061-7018-5fc3-0dc6d59c80f4', email: 'x@y.com' } },
    };
    // The bug was keying on userName here → the BT membership (row keyed on the
    // sub) was never found → accounts claim empty for every federated invitee.
    expect(membershipUserId(event)).toBe('492ed4a8-0061-7018-5fc3-0dc6d59c80f4');
    expect(membershipUserId(event)).not.toBe(event.userName);
  });

  it('returns the sub for a native user (Username == sub — unchanged behaviour)', () => {
    const sub = 'c98e14a8-50f1-70a6-d099-7eb0cab0cacf';
    expect(membershipUserId({ userName: sub, request: { userAttributes: { sub } } })).toBe(sub);
  });

  it('falls back to userName when sub is somehow absent (defensive)', () => {
    expect(membershipUserId({ userName: 'u-1', request: { userAttributes: {} } })).toBe('u-1');
  });

  it('#501: the display_name projection reads launchpad-users by this SAME sub key', () => {
    // The pre-token trigger reads the control-plane displayName via
    // fetchDisplayName(membershipUserId(event)) — the same sub-keyed id as the
    // membership query. So a FEDERATED user's projected name comes from THEIR row
    // (keyed on the sub written at #496), not the provider-shaped Username. Guarding
    // this here keeps the #486 federated-keying guarantee covering #501 too.
    const federated = {
      userName: 'Microsoft_AAAAAAAAAAAAAAAAAAAAACkKgT1UYwsZ9B8QTHWoWIk',
      request: { userAttributes: { sub: '293ed468-4091-7006-b2e3-1f88cdc9df73', email: 'x@y.com' } },
    };
    expect(membershipUserId(federated)).toBe('293ed468-4091-7006-b2e3-1f88cdc9df73');
    expect(membershipUserId(federated)).not.toBe(federated.userName);
  });
});
