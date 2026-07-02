import { describe, expect, it, vi } from 'vitest';
import {
  accountIsDue,
  assertNoCrossAccount,
  eligibleRecipients,
  evaluateTransition,
  runNotificationEngine,
  stateSk,
  type MemberRow,
  type NotificationEngineDeps,
  type NotificationStateRecord,
  type SendLogAccount,
  type SendLogRun,
} from './engine';
import type { StockAnalysisResult } from '../../../lib/services/portfolio/types';
import type {
  NotificationAccountConfig,
  NotificationType,
} from '@transformotion/contracts/stock-analyser/notification-preferences';

function analysis(ticker: string, verdict: StockAnalysisResult['verdict']): StockAnalysisResult {
  return {
    ticker,
    company: `${ticker} Limited`,
    sector: 'Technology',
    price: null,
    change: null,
    verdict,
    cyclePosition: 50,
    cycleStage: 'mid',
    summary: `${ticker} summary`,
    signals: [],
    risks: [],
  };
}

const activeMember: MemberRow = {
  accountId: 'acct-a',
  userId: 'user-1',
  email: 'user1@example.com',
  appSlug: 'stock-analyser',
  role: 'member',
};

function notificationConfig(accountId: string, activeTypes: NotificationType[] = ['portfolio', 'watchlist']): NotificationAccountConfig {
  return {
    accountId,
    intervalDays: 1,
    activeTypes,
    updatedAt: '2026-06-26T00:00:00.000Z',
  };
}

function deps(overrides: Partial<NotificationEngineDeps> = {}): NotificationEngineDeps {
  const base: NotificationEngineDeps = {
    today: () => '2026-06-26',
    nowEpochSeconds: () => 1_798_214_400,
    listStockAnalyserMembers: vi.fn(async () => [activeMember]),
    readNotificationConfig: vi.fn(async (accountId) => notificationConfig(accountId)),
    readMemberConsent: vi.fn(async (accountId, userId) => ({
      accountId,
      userId,
      receiveConsent: true,
      updatedAt: '2026-06-26T00:00:00.000Z',
    })),
    readLiveMember: vi.fn(async (accountId, userId) => ({
      accountId,
      userId,
      email: `${userId}@example.com`,
      appSlug: 'stock-analyser',
      role: 'member',
      status: 'active',
    })),
    readNotificationStates: vi.fn(async () => []),
    putNotificationState: vi.fn(async () => undefined),
    readPortfolio: vi.fn(async () => [{ ticker: 'CBA.AX', shares: 1, avgCost: 100, isGifted: false, addedAt: 1 }]),
    readWatchlist: vi.fn(async () => [{ ticker: 'NVDA', name: 'NVIDIA', addedAt: 1 }]),
    readSharedAnalysisCache: vi.fn(async () => null),
    generateAnalysis: vi.fn(async (ticker) => analysis(ticker, 'BUY')),
    writeSharedAnalysisCache: vi.fn(async () => undefined),
    sendEmail: vi.fn(async () => undefined),
    newRunId: () => 'run-test',
    readAccountName: vi.fn(async (accountId) => `Acct ${accountId}`),
    recordSendLog: vi.fn(async () => undefined),
    readEngineEnabled: vi.fn(async () => true),
    warmMarketCache: vi.fn(async () => undefined),
  };
  return { ...base, ...overrides };
}

describe('notification transition predicate', () => {
  it('fires for portfolio BUY/SELL entries, is silent for HOLD/NEUTRAL/standing, and re-fires on re-entry', () => {
    expect(evaluateTransition({
      accountId: 'acct-a',
      type: 'Portfolio',
      ticker: 'CBA.AX',
      analysis: analysis('CBA.AX', 'BUY'),
    }).shouldNotify).toBe(true);

    expect(evaluateTransition({
      accountId: 'acct-a',
      type: 'Portfolio',
      ticker: 'CBA.AX',
      previous: { accountId: 'acct-a', sk: stateSk('Portfolio', 'CBA.AX'), type: 'Portfolio', ticker: 'CBA.AX', lastVerdict: 'BUY' },
      analysis: analysis('CBA.AX', 'BUY'),
    }).shouldNotify).toBe(false);

    expect(evaluateTransition({
      accountId: 'acct-a',
      type: 'Portfolio',
      ticker: 'CBA.AX',
      previous: { accountId: 'acct-a', sk: stateSk('Portfolio', 'CBA.AX'), type: 'Portfolio', ticker: 'CBA.AX', lastVerdict: 'BUY' },
      analysis: analysis('CBA.AX', 'HOLD'),
    }).shouldNotify).toBe(false);

    expect(evaluateTransition({
      accountId: 'acct-a',
      type: 'Portfolio',
      ticker: 'CBA.AX',
      previous: { accountId: 'acct-a', sk: stateSk('Portfolio', 'CBA.AX'), type: 'Portfolio', ticker: 'CBA.AX', lastVerdict: 'HOLD' },
      analysis: analysis('CBA.AX', 'SELL'),
    }).shouldNotify).toBe(true);

    expect(evaluateTransition({
      accountId: 'acct-a',
      type: 'Watchlist',
      ticker: 'NVDA',
      analysis: analysis('NVDA', 'SELL'),
    }).shouldNotify).toBe(false);
  });
});

describe('notification engine analysis error reporting', () => {
  it('records a useful account error when ticker analysis returns non-JSON output', async () => {
    const run = await runNotificationEngine(deps({
      readPortfolio: vi.fn(async () => []),
      readWatchlist: vi.fn(async () => [{ ticker: 'FMG.AX', name: 'Fortescue', addedAt: 1 }]),
      generateAnalysis: vi.fn(async () => {
        throw new Error('model output unparseable while analysing FMG.AX');
      }),
    }));

    expect(run.sendLog.status).toBe('partial');
    expect(run.sendLog.accounts[0]).toMatchObject({
      accountId: 'acct-a',
      status: 'failed',
      error: 'model output unparseable while analysing FMG.AX',
    });
  });
});

describe('notification due check', () => {
  it('skips accounts whose interval has not elapsed and processes due accounts', () => {
    expect(accountIsDue([{ accountId: 'acct-a', sk: 'x', type: 'Portfolio', ticker: 'CBA.AX', lastProcessedDate: '2026-06-25' }], 7, '2026-06-26')).toBe(false);
    expect(accountIsDue([{ accountId: 'acct-a', sk: 'x', type: 'Portfolio', ticker: 'CBA.AX', lastProcessedDate: '2026-06-19' }], 7, '2026-06-26')).toBe(true);
  });
});

describe('notification delivery gate', () => {
  it('fails closed for viewer, disabled/missing member, consent off, and lookup errors', async () => {
    const candidates: MemberRow[] = [
      { accountId: 'acct-a', userId: 'writer', email: 'writer@example.com' },
      { accountId: 'acct-a', userId: 'viewer', email: 'viewer@example.com' },
      { accountId: 'acct-a', userId: 'disabled', email: 'disabled@example.com' },
      { accountId: 'acct-a', userId: 'missing', email: 'missing@example.com' },
      { accountId: 'acct-a', userId: 'off', email: 'off@example.com' },
      { accountId: 'acct-a', userId: 'throws', email: 'throws@example.com' },
    ];

    const recipients = await eligibleRecipients({
      readLiveMember: async (_accountId, userId) => {
        if (userId === 'throws') throw new Error('DDB unavailable');
        if (userId === 'missing') return null;
        if (userId === 'viewer') return { accountId: 'acct-a', userId, role: 'viewer', status: 'active' };
        if (userId === 'disabled') return { accountId: 'acct-a', userId, role: 'member', status: 'disabled' };
        return { accountId: 'acct-a', userId, role: 'member', status: 'active' };
      },
      readMemberConsent: async (accountId, userId) => ({ accountId, userId, receiveConsent: userId !== 'off', updatedAt: 'now' }),
    }, 'acct-a', candidates);

    expect(recipients.map((member) => member.userId)).toEqual(['writer']);
  });
});

describe('notification engine account processing', () => {
  it('does not cross-read or cross-write private account data', async () => {
    const readPortfolio = vi.fn(async (accountId: string) => (
      accountId === 'acct-a'
        ? [{ ticker: 'CBA.AX', shares: 1, avgCost: 100, isGifted: false, addedAt: 1 }]
        : [{ ticker: 'MSFT', shares: 1, avgCost: 100, isGifted: false, addedAt: 1 }]
    ));
    const putNotificationState = vi.fn(async (_record: NotificationStateRecord) => undefined);
    const engineDeps = deps({
      listStockAnalyserMembers: vi.fn(async () => [
        { ...activeMember, accountId: 'acct-a', userId: 'user-a' },
        { ...activeMember, accountId: 'acct-b', userId: 'user-b' },
      ]),
      readPortfolio,
      readWatchlist: vi.fn(async () => []),
      putNotificationState,
      generateAnalysis: vi.fn(async (ticker) => analysis(ticker, 'BUY')),
    });

    await runNotificationEngine(engineDeps);

    expect(readPortfolio).toHaveBeenCalledWith('acct-a');
    expect(readPortfolio).toHaveBeenCalledWith('acct-b');
    expect(putNotificationState.mock.calls.map(([record]) => record.accountId).sort()).toEqual(['acct-a', 'acct-b']);
    expect(putNotificationState.mock.calls.map(([record]) => record.ticker).sort()).toEqual(['CBA.AX', 'MSFT']);
  });

  it('generates a shared ticker analysis only once per run across accounts', async () => {
    const generateAnalysis = vi.fn(async (ticker) => analysis(ticker, 'BUY'));
    const writeSharedAnalysisCache = vi.fn(async () => undefined);
    const engineDeps = deps({
      listStockAnalyserMembers: vi.fn(async () => [
        { ...activeMember, accountId: 'acct-a', userId: 'user-a' },
        { ...activeMember, accountId: 'acct-b', userId: 'user-b' },
      ]),
      readPortfolio: vi.fn(async () => [
        { ticker: 'CBA.AX', shares: 1, avgCost: 100, isGifted: false, addedAt: 1 },
      ]),
      readWatchlist: vi.fn(async () => []),
      generateAnalysis,
      writeSharedAnalysisCache,
    });

    await runNotificationEngine(engineDeps);

    expect(generateAnalysis).toHaveBeenCalledTimes(1);
    expect(generateAnalysis).toHaveBeenCalledWith('CBA.AX', expect.objectContaining({
      accountId: 'acct-a',
      runId: 'run-test',
      sourceType: 'Portfolio',
    }));
    expect(writeSharedAnalysisCache).toHaveBeenCalledTimes(1);
    expect(writeSharedAnalysisCache).toHaveBeenCalledWith('CBA.AX', expect.objectContaining({ ticker: 'CBA.AX' }));
  });

  it('reuses fresh SHARED cache analysis without regenerating', async () => {
    const generateAnalysis = vi.fn(async (ticker) => analysis(ticker, 'SELL'));
    const writeSharedAnalysisCache = vi.fn(async () => undefined);
    const engineDeps = deps({
      readSharedAnalysisCache: vi.fn(async (ticker) => analysis(ticker, 'BUY')),
      readWatchlist: vi.fn(async () => []),
      generateAnalysis,
      writeSharedAnalysisCache,
    });

    await runNotificationEngine(engineDeps);

    expect(generateAnalysis).not.toHaveBeenCalled();
    expect(writeSharedAnalysisCache).not.toHaveBeenCalled();
  });

  it('updates lastVerdict every run but lastNotifiedAt only after delivery', async () => {
    const putNotificationState = vi.fn(async (_record: NotificationStateRecord) => undefined);
    const sendEmail = vi.fn(async () => undefined);
    const engineDeps = deps({
      generateAnalysis: vi.fn(async (ticker) => analysis(ticker, 'HOLD')),
      readWatchlist: vi.fn(async () => []),
      readNotificationStates: vi.fn(async (): Promise<NotificationStateRecord[]> => [
        { accountId: 'acct-a', sk: stateSk('Portfolio', 'CBA.AX'), type: 'Portfolio', ticker: 'CBA.AX', lastVerdict: 'BUY', lastNotifiedAt: 123 },
      ]),
      putNotificationState,
      sendEmail,
    });

    await runNotificationEngine(engineDeps);

    expect(sendEmail).not.toHaveBeenCalled();
    expect(putNotificationState).toHaveBeenCalledWith(expect.objectContaining({
      lastVerdict: 'HOLD',
      lastNotifiedAt: 123,
      lastProcessedDate: '2026-06-26',
    }));
  });

  it('evaluates each member ONCE per run (no redundant per-ticker consent re-read), and respects consent', async () => {
    // #572 refactor: eligibility (consent/disabled/viewer/live) is computed once
    // per account, not re-read per ticker. A consenting member is delivered to;
    // consent is read exactly once for that member across the whole run.
    const sendEmail = vi.fn(async () => undefined);
    const readMemberConsent = vi.fn(async (accountId, userId) => ({
      accountId, userId, receiveConsent: true, updatedAt: '2026-06-26T00:00:00.000Z',
    }));
    const engineDeps = deps({
      readMemberConsent,
      // two tickers fire for the SAME member — eligibility must not be re-read per ticker.
      readPortfolio: vi.fn(async () => [{ ticker: 'CBA.AX', shares: 1, avgCost: 100, isGifted: false, addedAt: 1 }]),
      readWatchlist: vi.fn(async () => [{ ticker: 'NVDA', name: 'NVIDIA', addedAt: 1 }]),
      sendEmail,
    });

    const result = await runNotificationEngine(engineDeps);

    expect(result.transitionsFired).toBe(2);
    expect(result.emailsSent).toBe(2);            // one per fired ticker for the eligible member
    expect(readMemberConsent).toHaveBeenCalledTimes(1); // ONCE per member, not per ticker
    expect(sendEmail).toHaveBeenCalledTimes(2);
  });

  it('skips not-due accounts and accounts with no consenting recipients', async () => {
    const notDue = deps({
      readNotificationStates: vi.fn(async (): Promise<NotificationStateRecord[]> => [
        { accountId: 'acct-a', sk: stateSk('Portfolio', 'CBA.AX'), type: 'Portfolio', ticker: 'CBA.AX', lastProcessedDate: '2026-06-25' },
      ]),
      readNotificationConfig: vi.fn(async (accountId) => ({ ...notificationConfig(accountId, ['portfolio']), intervalDays: 7 })),
    });
    expect(await runNotificationEngine(notDue)).toMatchObject({ accountsSkippedNotDue: 1, accountsProcessed: 0 });

    const noConsent = deps({
      readMemberConsent: vi.fn(async (accountId, userId) => ({ accountId, userId, receiveConsent: false, updatedAt: 'now' })),
    });
    expect(await runNotificationEngine(noConsent)).toMatchObject({ accountsSkippedNoConsent: 1, accountsProcessed: 0 });
  });
});

// ── #572 send-log: every member's outcome+reason recorded at the leaf ─────────
describe('notification send-log (#572)', () => {
  const members = (...m: Array<Partial<MemberRow> & { userId: string }>): MemberRow[] =>
    m.map((x) => ({ accountId: 'acct-a', appSlug: 'stock-analyser', role: 'member', email: `${x.userId}@example.com`, ...x }));

  function outcome(run: Awaited<ReturnType<typeof runNotificationEngine>>, userId: string) {
    return run.sendLog.accounts[0]?.memberOutcomes.find((o) => o.userId === userId);
  }

  it('records a SENT outcome (delivered) with the delivered tickers, and the run summary', async () => {
    const run = await runNotificationEngine(deps());
    expect(run.sendLog.runId).toBe('run-test');
    expect(run.sendLog.status).toBe('success');
    expect(run.sendLog.accounts[0]).toMatchObject({ accountId: 'acct-a', accountName: 'Acct acct-a', status: 'processed' });
    expect(outcome(run, 'user-1')).toMatchObject({ outcome: 'sent', reason: 'delivered' });
    expect(outcome(run, 'user-1')?.tickers).toContain('CBA.AX');
    expect(run.sendLog.emailsSent).toBe(run.emailsSent);
  });

  it('records each SKIP reason at the leaf: disabled / viewer / consent-off / not-a-member / lookup-error', async () => {
    const roster = members(
      { userId: 'ok' },
      { userId: 'disabled' },
      { userId: 'viewer' },
      { userId: 'consent-off' },
      { userId: 'ghost' },     // no live row → not-a-member
      { userId: 'boom' },      // lookup throws
    );
    const run = await runNotificationEngine(deps({
      listStockAnalyserMembers: vi.fn(async () => roster),
      readLiveMember: vi.fn(async (accountId, userId) => {
        if (userId === 'boom') throw new Error('ddb blip');
        if (userId === 'ghost') return null;
        const role = userId === 'viewer' ? 'viewer' : 'member';
        const status = userId === 'disabled' ? 'disabled' : 'active';
        return { accountId, userId, email: `${userId}@example.com`, appSlug: 'stock-analyser', role, status };
      }),
      readMemberConsent: vi.fn(async (accountId, userId) => ({ accountId, userId, receiveConsent: userId !== 'consent-off', updatedAt: 'now' })),
    }));

    expect(outcome(run, 'ok')).toMatchObject({ outcome: 'sent', reason: 'delivered' });
    expect(outcome(run, 'disabled')).toMatchObject({ outcome: 'skipped', reason: 'disabled' });
    expect(outcome(run, 'viewer')).toMatchObject({ outcome: 'skipped', reason: 'viewer' });
    expect(outcome(run, 'consent-off')).toMatchObject({ outcome: 'skipped', reason: 'consent-off' });
    expect(outcome(run, 'ghost')).toMatchObject({ outcome: 'skipped', reason: 'not-a-member' });
    expect(outcome(run, 'boom')).toMatchObject({ outcome: 'skipped', reason: 'lookup-error' });
  });

  it('omits email (never undefined) for members with no email — the clean record that broke the write (#578)', async () => {
    // Mirrors run fd4461f3: seeded persona members with NO email. The leaf must be
    // { userId, outcome, reason } — NOT { email: undefined, ... }, which the
    // DynamoDB marshaller rejects (and previously dropped every later account).
    const run = await runNotificationEngine(deps({
      listStockAnalyserMembers: vi.fn(async () => [
        { accountId: 'acct-a', userId: 'no-mail', appSlug: 'stock-analyser', role: 'member' }, // no email
      ]),
      readLiveMember: vi.fn(async (accountId, userId) => ({ accountId, userId, appSlug: 'stock-analyser', role: 'member', status: 'active' })), // live row also lacks email
      readMemberConsent: vi.fn(async (accountId, userId) => ({ accountId, userId, receiveConsent: false, updatedAt: 'now' })), // consent off → gated path
    }));

    const o = outcome(run, 'no-mail')!;
    expect(o).toMatchObject({ outcome: 'skipped', reason: 'consent-off' });
    expect('email' in o).toBe(false); // key OMITTED, not present-as-undefined
  });

  it('records no-actionable-transition for eligible members when no ticker fires', async () => {
    const run = await runNotificationEngine(deps({
      generateAnalysis: vi.fn(async (ticker) => analysis(ticker, 'HOLD')), // never actionable
    }));
    expect(run.sendLog.accounts[0].status).toBe('processed');
    expect(outcome(run, 'user-1')).toMatchObject({ outcome: 'skipped', reason: 'no-actionable-transition' });
    expect(run.sendLog.emailsSent).toBe(0);
  });

  it('partial failure: one account errors → recorded as failed, run downgraded to partial, summary still written', async () => {
    const recordSendLog = vi.fn(async () => undefined);
    const run = await runNotificationEngine(deps({
      listStockAnalyserMembers: vi.fn(async () => [
        { accountId: 'acct-a', userId: 'user-1', email: 'a@x.com', appSlug: 'stock-analyser', role: 'member' },
        { accountId: 'acct-b', userId: 'user-2', email: 'b@x.com', appSlug: 'stock-analyser', role: 'member' },
      ]),
      readPortfolio: vi.fn(async (accountId) => {
        if (accountId === 'acct-b') throw new Error('portfolio read failed');
        return [{ ticker: 'CBA.AX', shares: 1, avgCost: 100, isGifted: false, addedAt: 1 }];
      }),
      readWatchlist: vi.fn(async () => []),
      recordSendLog,
    }));

    expect(run.sendLog.status).toBe('partial');
    const failed = run.sendLog.accounts.find((a) => a.accountId === 'acct-b');
    expect(failed).toMatchObject({ status: 'failed' });
    expect(failed?.error).toContain('portfolio read failed');
    expect(run.sendLog.accounts.find((a) => a.accountId === 'acct-a')?.status).toBe('processed');
    expect(recordSendLog).toHaveBeenCalledOnce(); // audit written despite the failure
  });

  it('errored account still carries its accountName (#581) — name captured independently of processing', async () => {
    // a03f9cd4-style: the account throws mid-processing (e.g. Claude credit), but
    // its name must still be on the record — not lost, not a raw GUID fallback.
    const run = await runNotificationEngine(deps({
      listStockAnalyserMembers: vi.fn(async () => [
        { accountId: 'acct-x', userId: 'u', email: 'u@x.com', appSlug: 'stock-analyser', role: 'member' },
      ]),
      readAccountName: vi.fn(async (id) => (id === 'acct-x' ? "Steve's Portfolio" : undefined)),
      readPortfolio: vi.fn(async () => { throw new Error('claude API error: credit balance too low'); }),
      readWatchlist: vi.fn(async () => []),
    }));

    const acct = run.sendLog.accounts.find((a) => a.accountId === 'acct-x')!;
    expect(acct.status).toBe('failed');
    expect(acct.error).toContain('credit balance');
    expect(acct.accountName).toBe("Steve's Portfolio"); // NOT lost on error, NOT the GUID
  });

  it('run-level failure: member listing throws → status failed, recorded, then rethrown', async () => {
    const recordSendLog = vi.fn(async (_run: SendLogRun) => undefined);
    await expect(runNotificationEngine(deps({
      listStockAnalyserMembers: vi.fn(async () => { throw new Error('members scan failed'); }),
      recordSendLog,
    }))).rejects.toThrow('members scan failed');
    expect(recordSendLog).toHaveBeenCalledOnce();
    expect(recordSendLog.mock.calls[0][0]).toMatchObject({ status: 'failed' });
  });

  it('kill-switch OFF (#571): no processing, no sends, minimal engine-disabled record still written', async () => {
    const sendEmail = vi.fn(async () => undefined);
    const listStockAnalyserMembers = vi.fn(async () => [activeMember]);
    const recordSendLog = vi.fn(async (_run: SendLogRun) => undefined);
    const run = await runNotificationEngine(deps({
      readEngineEnabled: vi.fn(async () => false),
      sendEmail,
      listStockAnalyserMembers,
      recordSendLog,
    }));

    expect(sendEmail).not.toHaveBeenCalled();
    expect(listStockAnalyserMembers).not.toHaveBeenCalled(); // early-return before any account work
    expect(run.sendLog).toMatchObject({ status: 'success', note: 'engine-disabled', accountsEvaluated: 0, emailsSent: 0 });
    expect(run.sendLog.accounts).toEqual([]);
    expect(recordSendLog).toHaveBeenCalledOnce(); // audit record still written via finally
  });

  it('warms the market cache ONCE per run — not per account, AFTER the kill-switch gate (#584)', async () => {
    const warmMarketCache = vi.fn(async () => undefined);
    await runNotificationEngine(deps({
      listStockAnalyserMembers: vi.fn(async () => [
        { ...activeMember, accountId: 'acct-a', userId: 'user-a' },
        { ...activeMember, accountId: 'acct-b', userId: 'user-b' },
      ]),
      warmMarketCache,
    }));
    expect(warmMarketCache).toHaveBeenCalledTimes(1); // once per run, regardless of 2 accounts
  });

  it('does NOT warm the market cache when the kill-switch is OFF (#584 inside the #571 gate)', async () => {
    const warmMarketCache = vi.fn(async () => undefined);
    const run = await runNotificationEngine(deps({
      readEngineEnabled: vi.fn(async () => false),
      warmMarketCache,
    }));
    expect(warmMarketCache).not.toHaveBeenCalled(); // whole batch no-ops when OFF
    expect(run.sendLog.note).toBe('engine-disabled');
  });

  it('a market-warming failure is best-effort — it does not abort the notification run (#584)', async () => {
    const warmMarketCache = vi.fn(async () => { throw new Error('all regions failed'); });
    const run = await runNotificationEngine(deps({ warmMarketCache }));
    expect(warmMarketCache).toHaveBeenCalledOnce();
    expect(run.sendLog.accounts.length).toBeGreaterThan(0); // accounts still processed
  });

  it('warms the ETF caches ONCE per run — not per account, AFTER the kill-switch gate (#594)', async () => {
    const warmEtfsCache = vi.fn(async () => undefined);
    await runNotificationEngine(deps({
      listStockAnalyserMembers: vi.fn(async () => [
        { ...activeMember, accountId: 'acct-a', userId: 'user-a' },
        { ...activeMember, accountId: 'acct-b', userId: 'user-b' },
      ]),
      warmEtfsCache,
    }));
    expect(warmEtfsCache).toHaveBeenCalledTimes(1); // once per run, regardless of 2 accounts
  });

  it('does NOT warm the ETF caches when the kill-switch is OFF (#594 inside the #571 gate)', async () => {
    const warmEtfsCache = vi.fn(async () => undefined);
    const run = await runNotificationEngine(deps({
      readEngineEnabled: vi.fn(async () => false),
      warmEtfsCache,
    }));
    expect(warmEtfsCache).not.toHaveBeenCalled(); // whole batch no-ops when OFF
    expect(run.sendLog.note).toBe('engine-disabled');
  });

  it('an ETF-warming failure is best-effort — it does not abort the notification run (#594)', async () => {
    const warmEtfsCache = vi.fn(async () => { throw new Error('all markets failed'); });
    const run = await runNotificationEngine(deps({ warmEtfsCache }));
    expect(warmEtfsCache).toHaveBeenCalledOnce();
    expect(run.sendLog.accounts.length).toBeGreaterThan(0); // accounts still processed
  });

  it('cross-account tripwire: flags a member outcome that is not a member of the account', async () => {
    const log = vi.fn();
    const account: SendLogAccount = {
      accountId: 'acct-a',
      status: 'processed',
      transitions: [],
      emailsSent: 0,
      memberOutcomes: [{ userId: 'foreign', outcome: 'sent', reason: 'delivered' }],
    };
    assertNoCrossAccount({ log }, 'acct-a', members({ userId: 'user-1' }), account);
    expect(account.error).toContain('cross-account leak');
    expect(log).toHaveBeenCalledWith('cross-account-leak-detected', expect.objectContaining({ userId: 'foreign' }));

    // No false positive on a clean account.
    const clean: SendLogAccount = { accountId: 'acct-a', status: 'processed', transitions: [], emailsSent: 0, memberOutcomes: [{ userId: 'user-1', outcome: 'sent', reason: 'delivered' }] };
    assertNoCrossAccount({ log: vi.fn() }, 'acct-a', members({ userId: 'user-1' }), clean);
    expect(clean.error).toBeUndefined();
  });
});
