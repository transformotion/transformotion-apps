import { describe, expect, it, vi } from 'vitest';
import type { APIGatewayProxyEvent } from 'aws-lambda';
import { createHandler, filterAccessibleAccountIds, mapAccount, type RunHistoryDeps } from './index';
import type { NotificationRunSummary } from '@transformotion/contracts/stock-analyser/notification-run-history';

// PIECE 1d — the REAL proof: per-viewer PAYLOAD SCOPING (not render). Per-member
// detail an account the caller doesn't own/manage must be ABSENT from the wire.

function makeEvent(groups: string, sub = 'viewer-1'): APIGatewayProxyEvent {
  return {
    httpMethod: 'GET',
    resource: '/notification-history',
    headers: {},
    body: null,
    requestContext: {
      authorizer: {
        claims: {
          sub,
          email: `${sub}@example.com`,
          'cognito:groups': groups,
          apps: JSON.stringify(['stock-analyser']),
          accounts: JSON.stringify({ 'stock-analyser': [] }),
        },
      },
    },
  } as unknown as APIGatewayProxyEvent;
}

// One run touching TWO accounts, each with a real member outcome + a transition.
function sampleRuns(): NotificationRunSummary[] {
  const acct = (id: string, userId: string) => ({
    accountId: id,
    accountName: `Name ${id}`,
    accountStatus: 'processed' as const,
    transitions: [{ ticker: 'CBA.AX', from: 'HOLD' as const, to: 'BUY' as const }],
    emailsSent: 1,
    memberOutcomes: [{ userId, email: `${userId}@example.com`, outcome: 'sent' as const, reason: 'delivered' as const, tickers: ['CBA.AX'] }],
  });
  return [{
    runId: 'run-1',
    ranAt: '2026-06-27T00:00:00.000Z',
    status: 'success',
    accountsEvaluated: 2,
    emailsSent: 2,
    accounts: [acct('acct-A', 'alice'), acct('acct-B', 'bob')],
  }];
}

function deps(over: Partial<RunHistoryDeps> = {}): RunHistoryDeps {
  return {
    loadRecentRuns: vi.fn(async () => sampleRuns()),
    loadAccessibleAccountIds: vi.fn(async () => []),
    log: vi.fn(),
    ...over,
  };
}

async function run(groups: string, d: RunHistoryDeps, sub = 'viewer-1') {
  const res = (await createHandler(d)(makeEvent(groups, sub))) as { statusCode: number; body: string };
  return { statusCode: res.statusCode, view: JSON.parse(res.body) as { runs: Array<{ accounts: Array<{ accountId: string; visibility: string; memberOutcomes: unknown[]; transitions: unknown[] }> }> } };
}

const acctOf = (view: { runs: Array<{ accounts: Array<{ accountId: string }> }> }, id: string) =>
  view.runs[0]?.accounts.find((a) => a.accountId === id);

describe('notification run-history — accessible-account filter (#582)', () => {
  it('includes SA owner/manager, excludes other-app + non-owner/manager, and WARNs on a MISSING-appSlug owner/manager', () => {
    const log = vi.fn();
    const ids = filterAccessibleAccountIds([
      { accountId: 'sa-owner', appSlug: 'stock-analyser', role: 'owner' },     // ✓ included
      { accountId: 'sa-mgr', appSlug: 'stock-analyser', role: 'manager' },     // ✓ included
      { accountId: 'bt-owner', appSlug: 'budget-tracker', role: 'owner' },     // ✗ other app (no warn)
      { accountId: 'sa-member', appSlug: 'stock-analyser', role: 'member' },   // ✗ not owner/manager (no warn)
      { accountId: 'noslug-owner', role: 'owner' },                            // ✗ MISSING appSlug (WARN — the #582 defect)
      { accountId: 'noslug-member', role: 'member' },                          // ✗ missing appSlug but not owner/mgr (no warn)
    ], log);

    expect(ids.sort()).toEqual(['sa-mgr', 'sa-owner']);
    // strict filter retained — the missing-appSlug row is NOT granted access…
    expect(ids).not.toContain('noslug-owner');
    // …but the silent exclusion is now observable, only for a would-be-accessible row.
    expect(log).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith('run-history-member-row-missing-appslug', { accountId: 'noslug-owner', role: 'owner' });
  });
});

describe('notification run-history — account name fallback (#581)', () => {
  const GUID = 'a03f9cd4-951f-463a-8b34-73c0f046e672';

  it('a missing accountName never renders as a raw GUID — falls back to a readable label', () => {
    const a = mapAccount({ accountId: GUID, status: 'failed', error: 'claude credit' });
    expect(a.accountName).toBe('Unknown account');
    expect(a.accountName).not.toContain(GUID);
  });

  it('a blank/whitespace accountName also falls back (never the GUID)', () => {
    const a = mapAccount({ accountId: GUID, accountName: '   ', status: 'processed' });
    expect(a.accountName).toBe('Unknown account');
  });

  it('a real accountName passes through unchanged', () => {
    const a = mapAccount({ accountId: GUID, accountName: "Steve's Portfolio", status: 'failed' });
    expect(a.accountName).toBe("Steve's Portfolio");
  });
});

describe('notification run-history — payload scoping (#573)', () => {
  it('ADMIN-not-owner: SUMMARY-only for every account — member detail + transitions ABSENT from the payload', async () => {
    const { statusCode, view } = await run('site-admin', deps({ loadAccessibleAccountIds: vi.fn(async () => []) }));
    expect(statusCode).toBe(200);
    for (const id of ['acct-A', 'acct-B']) {
      const a = acctOf(view, id)!;
      expect(a.visibility).toBe('summary');
      expect(a.memberOutcomes).toEqual([]);   // NOT rendered-then-hidden — not on the wire
      expect(a.transitions).toEqual([]);
    }
  });

  it('OWNER/manager (not admin): DETAIL for owned account only; other account HIDDEN (absent)', async () => {
    const { view } = await run('stock-app-access', deps({ loadAccessibleAccountIds: vi.fn(async () => ['acct-A']) }));
    const a = acctOf(view, 'acct-A')!;
    expect(a.visibility).toBe('detail');
    expect(a.memberOutcomes.length).toBe(1);
    expect(acctOf(view, 'acct-B')).toBeUndefined(); // not owned + not admin → never on the wire
  });

  it('MEMBER/viewer (no ownership, no admin): NOTHING — empty payload', async () => {
    const { view } = await run('stock-app-access', deps({ loadAccessibleAccountIds: vi.fn(async () => []) }));
    expect(view.runs).toEqual([]); // projectRunHistoryForViewer → null → { runs: [] }
  });

  it('ADMIN + owner-of-some: DETAIL on owned, SUMMARY on the rest — in ONE response', async () => {
    const { view } = await run('site-admin', deps({ loadAccessibleAccountIds: vi.fn(async () => ['acct-A']) }));
    expect(acctOf(view, 'acct-A')!.visibility).toBe('detail');
    expect(acctOf(view, 'acct-A')!.memberOutcomes.length).toBe(1);
    expect(acctOf(view, 'acct-B')!.visibility).toBe('summary');
    expect(acctOf(view, 'acct-B')!.memberOutcomes).toEqual([]);
  });

  it('FAIL CLOSED on membership-lookup failure: no DETAIL leaked', async () => {
    // Non-admin whose ownership read throws → nothing (no detail).
    const member = await run('stock-app-access', deps({ loadAccessibleAccountIds: vi.fn(async () => { throw new Error('ddb down'); }) }));
    expect(member.view.runs).toEqual([]);
    // Admin whose ownership read throws → summaries only, never member detail.
    const admin = await run('site-admin', deps({ loadAccessibleAccountIds: vi.fn(async () => { throw new Error('ddb down'); }) }));
    for (const id of ['acct-A', 'acct-B']) {
      expect(acctOf(admin.view, id)!.visibility).toBe('summary');
      expect(acctOf(admin.view, id)!.memberOutcomes).toEqual([]);
    }
  });
});
