import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { MetalFeedData, MetalModelOutput, MetalSymbol } from '@transformotion/contracts/stock-analyser/metals';
import { STOCK_ANALYSER_CACHE_TTL_SECONDS } from '@transformotion/contracts/stock-analyser/cache-freshness';
import { buildFeedData, mergeMetalsResult } from './index';

vi.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: vi.fn(),
}));

vi.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: { from: vi.fn(() => ({})) },
  GetCommand: class { constructor(public readonly input: unknown) {} },
  PutCommand: class { constructor(public readonly input: unknown) {} },
  QueryCommand: class { constructor(public readonly input: unknown) {} },
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
  it('derives USD spot, AUD spot, today, YTD, and 30-day metrics from latest plus stored closes', () => {
    const latest = {
      'XAU/USD': 120,
      'XAG/USD': 60,
      'XPT/USD': 900,
      'XPD/USD': 700,
    } satisfies Record<MetalSymbol, number>;
    const priorClose = {
      date: '2026-07-01',
      closes: { 'XAU/USD': 115, 'XAG/USD': 55, 'XPT/USD': 875, 'XPD/USD': 750 },
    };
    const close30d = {
      date: '2026-06-02',
      closes: { 'XAU/USD': 100, 'XAG/USD': 50, 'XPT/USD': 800, 'XPD/USD': 900 },
    };
    const baseline = {
      date: '2025-12-31',
      closes: { 'XAU/USD': 110, 'XAG/USD': 40, 'XPT/USD': 850, 'XPD/USD': 800 },
    };

    const feed = buildFeedData(latest, 0.5, priorClose, close30d, baseline);

    expect(feed['XAU/USD']).toEqual({
      spotPrice: 120,
      audSpotPrice: 240,
      todayChange: 4.35,
      ytdChange: 9.09,
      change30d: 20,
    } satisfies MetalFeedData);
  });

  it('keeps 30-day change nullable until enough close history exists', () => {
    const latest = {
      'XAU/USD': 120,
      'XAG/USD': 60,
      'XPT/USD': 900,
      'XPD/USD': 700,
    } satisfies Record<MetalSymbol, number>;
    const baseline = {
      date: '2025-12-31',
      closes: { 'XAU/USD': 110, 'XAG/USD': 40, 'XPT/USD': 850, 'XPD/USD': 800 },
    };

    const feed = buildFeedData(latest, 0.5, null, null, baseline);

    expect(feed['XAU/USD'].todayChange).toBe(0);
    expect(feed['XAU/USD'].change30d).toBeNull();
  });

  it('overlays feed-owned numbers and model-owned signal/outlook only', () => {
    const feed = {
      'XAU/USD': { spotPrice: 120, audSpotPrice: 240, todayChange: 4.35, ytdChange: 9.09, change30d: 20 },
      'XAG/USD': { spotPrice: 60, audSpotPrice: 120, todayChange: 9.09, ytdChange: 50, change30d: 20 },
      'XPT/USD': { spotPrice: 900, audSpotPrice: 1800, todayChange: 2.86, ytdChange: 5.88, change30d: 12.5 },
      'XPD/USD': { spotPrice: 700, audSpotPrice: 1400, todayChange: -6.67, ytdChange: -12.5, change30d: -22.22 },
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
      audSpotPrice: 240,
      change30d: 20,
      signal: 'BULL',
      outlook: 'Gold outlook.',
    });
    expect(result.metals[0]).not.toHaveProperty('week52Low');
    expect(result.metals[0]).not.toHaveProperty('week52High');
    expect(STOCK_ANALYSER_CACHE_TTL_SECONDS.metals).toBe(86_400);
  });
});

// #637 feed-history write-path guard (source-level — writeCacheJson isn't exported). The
// METALS_CLOSES#/METALS_BASELINE# rows are direct-write BY DESIGN (see
// docs/adr-service-principal-background-jobs.md — "feed-history direct-write"); only the
// tab-facing METALS key uses the service-principal chokepoint. Goes RED if someone reroutes the
// feed-history through the chokepoint or reintroduces an ISO-string cachedAt.
describe('#637 feed-history direct-write + canonical timestamp', () => {
  const src = readFileSync(join(process.cwd(), 'functions/metals/src/index.ts'), 'utf8');
  const writeCacheJsonBody = src.slice(
    src.indexOf('async function writeCacheJson'),
    src.indexOf('async function hasStoredCloses'),
  );

  it('writeCacheJson uses a DIRECT PutCommand with epoch-seconds cachedAt (not the SP invoke, not ISO)', () => {
    expect(writeCacheJsonBody).toContain('new PutCommand');            // direct write
    expect(writeCacheJsonBody).toContain('cachedAt: toEpochSeconds(now)'); // #637 canonical epoch shape
    expect(writeCacheJsonBody).not.toContain('toISOString');           // no ISO regression
    expect(writeCacheJsonBody).not.toContain('InvokeCommand');         // not rerouted through the chokepoint
  });

  it('the service-principal chokepoint is used ONLY for the tab-facing METALS key', () => {
    const spBody = src.slice(
      src.indexOf('async function writeSharedMetalsCache'),
      src.indexOf('async function executeMetalsJob'),
    );
    expect(spBody).toContain('cacheKey: METALS_CACHE_KEY');
    expect(spBody).not.toContain('METALS_CLOSES_PREFIX');
    expect(spBody).not.toContain('METALS_BASELINE_PREFIX');
  });
});
