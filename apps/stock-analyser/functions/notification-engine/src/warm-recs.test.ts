import { describe, it, expect } from 'vitest';
import { selectEnterSectorsToWarm, recsWarmCacheKey } from './index';
import { resolveSectorUniverse } from '../../../lib/analysis/sector-universe';

const sec = (sector: string, signal: string, cyclePosition: number, bestExchange = 'ASX') =>
  ({ sector, signal, cyclePosition, bestExchange });

describe('#595 selectEnterSectorsToWarm — which Recs scopes to warm', () => {
  it('keeps ONLY enter-flagged sectors (maintain/exit are not warmed)', () => {
    const out = selectEnterSectorsToWarm([sec('A', 'enter', 20), sec('B', 'HOLD', 10), sec('C', 'EXIT', 5)]);
    expect(out.map((s) => s.sector)).toEqual(['A']);
  });

  it('ranks enter sectors by cyclePosition ASCENDING (strongest entry first) — NOT parse order', () => {
    const out = selectEnterSectorsToWarm([sec('late', 'enter', 80), sec('early', 'enter', 10), sec('mid', 'enter', 50)]);
    expect(out.map((s) => s.sector)).toEqual(['early', 'mid', 'late']);
  });

  it('caps at top-3 (bounds daily recs cost)', () => {
    const out = selectEnterSectorsToWarm([
      sec('a', 'enter', 5), sec('b', 'enter', 15), sec('c', 'enter', 25), sec('d', 'enter', 35),
    ]);
    expect(out.map((s) => s.sector)).toEqual(['a', 'b', 'c']);
  });

  it('no enter sectors → warms nothing (correct, not an error)', () => {
    expect(selectEnterSectorsToWarm([sec('a', 'HOLD', 10), sec('b', 'EXIT', 20)])).toEqual([]);
  });
});

describe('#595 warmed RECS# cacheKey is identical-to-live', () => {
  // The live Recs tab scopeKey uses the DISPLAY mode label "Top Picks" (recommendations-tab
  // useState<Mode>("Top Picks")), NOT the canonical 'top-picks'. The warm key MUST match it.
  it('uses the DISPLAY mode label "Top Picks" (not canonical) so it matches a live read', () => {
    expect(recsWarmCacheKey('ASX', 'Energy')).toBe('RECS#ASX|Top Picks|Energy');
  });

  it('universe resolved from bestExchange + region (identical-to-live)', () => {
    expect(recsWarmCacheKey(resolveSectorUniverse('NYSE', 'us'), 'Financials')).toBe('RECS#Dow|Top Picks|Financials');
    expect(recsWarmCacheKey(resolveSectorUniverse('ASX', 'australia'), 'Materials')).toBe('RECS#ASX|Top Picks|Materials');
    // UK: unknown exchange → region default (FTSE).
    expect(recsWarmCacheKey(resolveSectorUniverse('???', 'uk'), 'Real Estate & REITs')).toBe('RECS#FTSE|Top Picks|Real Estate & REITs');
  });
});
