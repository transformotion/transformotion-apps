import { describe, it, expect } from 'vitest';
import { selectEnterSectorsToWarm } from './index';
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
  it('RECS#{universe|top-picks|sector}, universe resolved from bestExchange + region', () => {
    // US region: NYSE → Dow (alias); matches what the live tab would read.
    expect(`RECS#${resolveSectorUniverse('NYSE', 'us')}|top-picks|Financials`).toBe('RECS#Dow|top-picks|Financials');
    // AU region: ASX → ASX.
    expect(`RECS#${resolveSectorUniverse('ASX', 'australia')}|top-picks|Materials`).toBe('RECS#ASX|top-picks|Materials');
    // UK region: unknown exchange falls back to the region default (FTSE).
    expect(`RECS#${resolveSectorUniverse('???', 'uk')}|top-picks|Energy`).toBe('RECS#FTSE|top-picks|Energy');
  });
});
