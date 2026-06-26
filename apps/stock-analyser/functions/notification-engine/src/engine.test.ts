import { describe, expect, it, vi } from 'vitest';
import {
  accountIsDue,
  eligibleRecipients,
  evaluateTransition,
  runNotificationEngine,
  stateSk,
  type MemberRow,
  type NotificationEngineDeps,
  type NotificationStateRecord,
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
    expect(generateAnalysis).toHaveBeenCalledWith('CBA.AX');
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

  it('re-checks consent at delivery time and skips email if consent is withdrawn mid-run', async () => {
    const sendEmail = vi.fn(async () => undefined);
    const readMemberConsent = vi
      .fn()
      .mockResolvedValueOnce({
        accountId: 'acct-a',
        userId: 'user-1',
        receiveConsent: true,
        updatedAt: '2026-06-26T00:00:00.000Z',
      })
      .mockResolvedValueOnce({
        accountId: 'acct-a',
        userId: 'user-1',
        receiveConsent: false,
        updatedAt: '2026-06-26T00:00:01.000Z',
      });
    const engineDeps = deps({
      readMemberConsent,
      readWatchlist: vi.fn(async () => []),
      sendEmail,
    });

    const result = await runNotificationEngine(engineDeps);

    expect(result.transitionsFired).toBe(1);
    expect(result.emailsSent).toBe(0);
    expect(sendEmail).not.toHaveBeenCalled();
    expect(readMemberConsent).toHaveBeenCalledTimes(2);
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
