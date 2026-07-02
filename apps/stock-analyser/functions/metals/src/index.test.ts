import { describe, expect, it, vi } from 'vitest';
import type { MetalFeedData, MetalModelOutput, MetalSymbol } from '@transformotion/contracts/stock-analyser/metals';
import { STOCK_ANALYSER_CACHE_TTL_SECONDS } from '@transformotion/contracts/stock-analyser/cache-freshness';
import { buildFeedData, buildHistoryRanges, mergeMetalsResult } from './index';

vi.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: vi.fn(),
}));

vi.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: { from: vi.fn(() => ({})) },
}));

vi.mock('@aws-sdk/client-lambda', () => ({
  LambdaClient: vi.fn(() => ({ send: vi.fn() })),
  InvokeCommand: class { constructor(public readonly input: unknown) {} },
}));

vi.mock('@transformotion/lambda-middleware', () => ({
  withAuth: vi.fn((handler) => handler),
  ok: vi.fn((body) => ({ statusCode: 200, body: JSON.stringify(body) })),
  badRequest: vi.fn((message) => Object.assign(new Error(message), { statusCode: 400 })),
  requireAccountData: vi.fn(() => ({ read: vi.fn() })),
}));

vi.mock('@transformotion/fn-ai-proxy-core', () => ({
  createAiProvider: vi.fn(),
  getSecretApiKey: vi.fn(),
  pushJobComplete: vi.fn(),
  resolveAiRuntimeConfig: vi.fn(),
  writeJobResult: vi.fn(),
}));

describe('runMetals engine helpers', () => {
  it('chunks metals.dev history calls within the 30-day API limit', () => {
    const ranges = buildHistoryRanges(new Date('2026-07-02T00:00:00.000Z'));

    expect(ranges).toHaveLength(13);
    expect(ranges[0]).toEqual({ startDate: '2025-07-02', endDate: '2025-07-07' });
    expect(ranges.at(-1)).toEqual({ startDate: '2026-06-03', endDate: '2026-07-02' });
    for (const range of ranges) {
      const days = (Date.parse(range.endDate) - Date.parse(range.startDate)) / 86_400_000;
      expect(days).toBeLessThanOrEqual(29);
    }
  });

  it('derives today, YTD, and 52-week metrics from feed data', () => {
    const latest = {
      'XAU/USD': 120,
      'XAG/USD': 60,
      'XPT/USD': 900,
      'XPD/USD': 700,
    } satisfies Record<MetalSymbol, number>;

    const history = [
      { date: '2025-07-02', values: { 'XAU/USD': 100, 'XAG/USD': 40, 'XPT/USD': 800, 'XPD/USD': 900 } },
      { date: '2026-01-02', values: { 'XAU/USD': 110, 'XAG/USD': 50, 'XPT/USD': 850, 'XPD/USD': 800 } },
      { date: '2026-07-01', values: { 'XAU/USD': 115, 'XAG/USD': 55, 'XPT/USD': 875, 'XPD/USD': 750 } },
    ];

    const feed = buildFeedData(latest, history, new Date('2026-07-02T00:00:00.000Z'));

    expect(feed['XAU/USD']).toEqual({
      spotPrice: 120,
      todayChange: 4.35,
      ytdChange: 9.09,
      week52High: 120,
      week52Low: 100,
    } satisfies MetalFeedData);
  });

  it('overlays feed-owned numbers and model-owned signal/outlook only', () => {
    const feed = {
      'XAU/USD': { spotPrice: 120, todayChange: 4.35, ytdChange: 9.09, week52High: 120, week52Low: 100 },
      'XAG/USD': { spotPrice: 60, todayChange: 9.09, ytdChange: 20, week52High: 60, week52Low: 40 },
      'XPT/USD': { spotPrice: 900, todayChange: 2.86, ytdChange: 5.88, week52High: 900, week52Low: 800 },
      'XPD/USD': { spotPrice: 700, todayChange: -6.67, ytdChange: -12.5, week52High: 900, week52Low: 700 },
    } satisfies Record<MetalSymbol, MetalFeedData>;
    const modelOutputs = [
      { symbol: 'XAU/USD', signal: 'BULL', outlook: 'Gold outlook.' },
      { symbol: 'XAG/USD', signal: 'NEUTRAL', outlook: 'Silver outlook.' },
      { symbol: 'XPT/USD', signal: 'BULL', outlook: 'Platinum outlook.' },
      { symbol: 'XPD/USD', signal: 'BEAR', outlook: 'Palladium outlook.' },
    ] satisfies MetalModelOutput[];

    const result = mergeMetalsResult(feed, modelOutputs, '2026-07-02T00:00:00.000Z');

    expect(result.metals).toHaveLength(4);
    expect(result.metals[0]).toMatchObject({
      name: 'Gold',
      perthMintTicker: 'PMGOLD.AX',
      spotPrice: 120,
      week52Low: 100,
      signal: 'BULL',
      outlook: 'Gold outlook.',
    });
    expect(STOCK_ANALYSER_CACHE_TTL_SECONDS.metals).toBe(86_400);
  });
});
