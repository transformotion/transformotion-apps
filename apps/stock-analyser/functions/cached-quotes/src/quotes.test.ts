import { describe, it, expect } from 'vitest';
import { computeCachedQuotes } from './quotes';

function row(cacheKey: string, closes: number[], dates: string[], cachedAt = 1000) {
  return { cacheKey, cachedAt, data: JSON.stringify({ closes, dates }) };
}

describe('computeCachedQuotes', () => {
  it('computes one quote per ticker from the latest two closes', () => {
    const quotes = computeCachedQuotes([
      row('MARKET-DATA#AAPL#1y#1d', [180, 183.6], ['2026-07-04', '2026-07-06']),
    ]);
    expect(quotes).toHaveLength(1);
    expect(quotes[0]).toEqual({
      ticker: 'AAPL',
      price: 183.6,
      dayChangePct: (183.6 - 180) / 180, // fraction
      asOf: '2026-07-06T00:00:00.000Z',
    });
  });

  it('prefers the daily-interval row over a weekly one for the same ticker', () => {
    const quotes = computeCachedQuotes([
      row('MARKET-DATA#BHP.AX#1y#1wk', [40, 44], ['2026-06-01', '2026-07-06'], 2000),
      row('MARKET-DATA#BHP.AX#3mo#1d', [42, 43], ['2026-07-04', '2026-07-06'], 1000),
    ]);
    expect(quotes).toHaveLength(1);
    // daily row wins even though it was cached earlier → day-over-day change
    expect(quotes[0].dayChangePct).toBeCloseTo((43 - 42) / 42);
  });

  it('picks the most recently cached row among same-interval duplicates', () => {
    const quotes = computeCachedQuotes([
      row('MARKET-DATA#CBA.AX#1y#1d', [100, 101], ['2026-07-04', '2026-07-05'], 1000),
      row('MARKET-DATA#CBA.AX#3mo#1d', [100, 105], ['2026-07-05', '2026-07-06'], 5000),
    ]);
    expect(quotes[0].price).toBe(105);
  });

  it('sorts best performers first', () => {
    const quotes = computeCachedQuotes([
      row('MARKET-DATA#LOW#1y#1d', [100, 99], ['2026-07-04', '2026-07-06']),
      row('MARKET-DATA#HIGH#1y#1d', [100, 110], ['2026-07-04', '2026-07-06']),
    ]);
    expect(quotes.map((q) => q.ticker)).toEqual(['HIGH', 'LOW']);
  });

  it('skips rows with fewer than two closes and tolerates object payloads', () => {
    const quotes = computeCachedQuotes([
      { cacheKey: 'MARKET-DATA#THIN#1y#1d', cachedAt: 1, data: { closes: [42], dates: ['2026-07-06'] } },
      { cacheKey: 'MARKET-DATA#OK#1y#1d', cachedAt: 1, data: { closes: [10, 12], dates: ['2026-07-05', '2026-07-06'] } },
    ]);
    expect(quotes.map((q) => q.ticker)).toEqual(['OK']);
  });

  it('ignores non MARKET-DATA rows', () => {
    expect(computeCachedQuotes([row('MARKET#australia', [1, 2], ['a', 'b'])])).toHaveLength(0);
  });

  it('returns an empty array for an empty cache', () => {
    expect(computeCachedQuotes([])).toEqual([]);
  });
});
