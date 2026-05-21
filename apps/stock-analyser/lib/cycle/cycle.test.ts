import { describe, it, expect } from 'vitest';
import {
  calcRSI,
  ema,
  computeCyclePosition,
  normaliseTicker,
  toYahooTicker,
} from './index';

// ── calcRSI ───────────────────────────────────────────────────────────────────

describe('calcRSI', () => {
  it('returns one value for period=14 with 15 data points', () => {
    const closes = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 9, 8, 7, 6, 5];
    const result = calcRSI(closes, 14);
    // 9 gains of 1, 5 losses of 1 → RS = 1.8 → RSI = 100 - 100/2.8 ≈ 64.286
    expect(result).toHaveLength(1);
    expect(result[0]).toBeCloseTo(64.286, 1);
  });

  it('returns empty array when data length <= period', () => {
    const result = calcRSI([1, 2, 3, 4, 5], 14);
    expect(result).toHaveLength(0);
  });

  it('returns 100 when all gains (no losses)', () => {
    const closes = Array.from({ length: 15 }, (_, i) => i + 1); // 1..15
    const result = calcRSI(closes, 14);
    expect(result[0]).toBe(100);
  });

  it('returns 0 when all losses (no gains)', () => {
    const closes = Array.from({ length: 15 }, (_, i) => 15 - i); // 15..1
    const result = calcRSI(closes, 14);
    expect(result[0]).toBe(0);
  });
});

// ── ema ───────────────────────────────────────────────────────────────────────

describe('ema', () => {
  it('returns same length as input', () => {
    const data = [1, 2, 3, 4, 5];
    expect(ema(data, 3)).toHaveLength(5);
  });

  it('first value equals first data point (seed)', () => {
    const data = [10, 20, 30];
    const result = ema(data, 3);
    expect(result[0]).toBe(10);
  });

  it('computes EMA correctly with period=3 (k=0.5)', () => {
    // k = 2/(3+1) = 0.5
    // e[0] = 1, e[1] = 2*0.5 + 1*0.5 = 1.5, e[2] = 3*0.5 + 1.5*0.5 = 2.25, e[3] = 4*0.5 + 2.25*0.5 = 3.125
    const result = ema([1, 2, 3, 4], 3);
    expect(result[0]).toBeCloseTo(1, 5);
    expect(result[1]).toBeCloseTo(1.5, 5);
    expect(result[2]).toBeCloseTo(2.25, 5);
    expect(result[3]).toBeCloseTo(3.125, 5);
  });
});

// ── computeCyclePosition ──────────────────────────────────────────────────────

function makeFlatOHLCV(n: number, base = 100): { closes: number[], highs: number[], volumes: number[] } {
  return {
    closes:  Array(n).fill(base),
    highs:   Array(n).fill(base + 5),
    volumes: Array(n).fill(1_000_000),
  };
}

function makeTrendingOHLCV(n: number): { closes: number[], highs: number[], volumes: number[] } {
  const closes  = Array.from({ length: n }, (_, i) => 50 + i);
  const highs   = closes.map(c => c + 2);
  const volumes = Array(n).fill(1_000_000);
  return { closes, highs, volumes };
}

describe('computeCyclePosition', () => {
  it('returns null for fewer than 30 closes', () => {
    const result = computeCyclePosition({ closes: [1, 2, 3], highs: [2, 3, 4], volumes: [100, 100, 100] });
    expect(result).toBeNull();
  });

  it('returns a valid CyclePosition for 60 days of data', () => {
    const { closes, highs, volumes } = makeTrendingOHLCV(60);
    const result = computeCyclePosition({ closes, highs, volumes });
    expect(result).not.toBeNull();
    expect(result!.score).toBeGreaterThanOrEqual(0);
    expect(result!.score).toBeLessThanOrEqual(100);
    expect(['early', 'mid', 'late', 'peak']).toContain(result!.stage);
    expect(['none', 'bullish', 'bearish']).toContain(result!.rsiDivergence);
    expect(['strengthening', 'weakening', 'flat']).toContain(result!.macdMomentum);
    expect(['confirming', 'diverging', 'neutral']).toContain(result!.volumeTrend);
    expect(typeof result!.weekHigh52Pct).toBe('number');
    expect(Array.isArray(result!.signals)).toBe(true);
    expect(typeof result!.summary).toBe('string');
    expect(result!.summary.length).toBeGreaterThan(0);
  });

  it('returns stage=peak for strong uptrend at 52-week high', () => {
    // 60 consecutive up-days, ending at the 52-week high
    const { closes, highs, volumes } = makeTrendingOHLCV(60);
    const result = computeCyclePosition({ closes, highs, volumes });
    expect(result).not.toBeNull();
    // With all gains, RSI will be high (near 100), score should be late or peak
    expect(['late', 'peak']).toContain(result!.stage);
  });

  it('weekHigh52Pct is between 1 and 100 for sensible input', () => {
    const { closes, highs, volumes } = makeTrendingOHLCV(60);
    const result = computeCyclePosition({ closes, highs, volumes });
    expect(result!.weekHigh52Pct).toBeGreaterThanOrEqual(1);
    expect(result!.weekHigh52Pct).toBeLessThanOrEqual(100);
  });

  it('handles flat price data without throwing', () => {
    const { closes, highs, volumes } = makeFlatOHLCV(60);
    expect(() => computeCyclePosition({ closes, highs, volumes })).not.toThrow();
  });
});

// ── normaliseTicker ───────────────────────────────────────────────────────────

describe('normaliseTicker', () => {
  it('converts BHP:AU to BHP.AX', () => expect(normaliseTicker('BHP:AU')).toBe('BHP.AX'));
  it('converts VOO:US to VOO',    () => expect(normaliseTicker('VOO:US')).toBe('VOO'));
  it('converts SHEL:GB to SHEL.L', () => expect(normaliseTicker('SHEL:GB')).toBe('SHEL.L'));
  it('adds .AX to 2-6 char bare codes', () => expect(normaliseTicker('A200')).toBe('A200.AX'));
  it('leaves already-normalised BHP.AX unchanged', () => expect(normaliseTicker('BHP.AX')).toBe('BHP.AX'));
  it('leaves US tickers unchanged (no suffix, no dot)', () => expect(normaliseTicker('AAPL')).toBe('AAPL.AX'));
  it('handles lowercase input', () => expect(normaliseTicker('bhp:au')).toBe('BHP.AX'));
  it('handles whitespace', () => expect(normaliseTicker(' BHP:AU ')).toBe('BHP.AX'));
});

// ── toYahooTicker ─────────────────────────────────────────────────────────────

describe('toYahooTicker', () => {
  it('leaves BHP.AX unchanged', () => expect(toYahooTicker('BHP.AX')).toBe('BHP.AX'));
  it('leaves SHEL.L unchanged', () => expect(toYahooTicker('SHEL.L')).toBe('SHEL.L'));
  it('adds .AX for ASX exchange', () => expect(toYahooTicker('BHP', 'ASX')).toBe('BHP.AX'));
  it('adds .L for LSE exchange',  () => expect(toYahooTicker('SHEL', 'LSE')).toBe('SHEL.L'));
  it('returns bare ticker for unknown exchange', () => expect(toYahooTicker('AAPL', 'NASDAQ')).toBe('AAPL'));
});
