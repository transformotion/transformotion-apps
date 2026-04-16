/**
 * @transformotion/cycle-engine
 *
 * Pure TypeScript RSI, MACD, volume analysis and cycle position scoring.
 * Extracted verbatim from stock-signal-analyser.html (S3.2).
 *
 * No DOM, no fetch, no side effects — safe for use in Node.js, browser,
 * Lambda, or unit tests.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type SignalType = 'ok' | 'warn' | 'danger';

export interface CycleSignal {
  type: SignalType;
  text: string;
}

export type CycleStage = 'early' | 'mid' | 'late' | 'peak';

export type RsiDivergence  = 'none'      | 'bullish'       | 'bearish';
export type MacdMomentum   = 'strengthening' | 'weakening' | 'flat';
export type VolumeTrend    = 'confirming' | 'diverging'    | 'neutral';

export interface CyclePosition {
  /** 0–100 composite score: 0 = early cycle, 100 = peak */
  score:          number;
  stage:          CycleStage;
  rsiDivergence:  RsiDivergence;
  macdMomentum:   MacdMomentum;
  volumeTrend:    VolumeTrend;
  /** Current close as % of 52-week high, 0–100 */
  weekHigh52Pct:  number;
  signals:        CycleSignal[];
  summary:        string;
}

// ── Indicators ────────────────────────────────────────────────────────────────

/**
 * Simple (non-smoothed) RSI over `period` bars.
 * Returns one value per bar starting at index `period`.
 */
export function calcRSI(data: number[], period: number): number[] {
  const rsis: number[] = [];
  for (let i = period; i < data.length; i++) {
    let gains = 0, losses = 0;
    for (let j = i - period + 1; j <= i; j++) {
      const diff = data[j] - data[j - 1];
      if (diff > 0) gains += diff; else losses -= diff;
    }
    const rs = losses === 0 ? 100 : gains / losses;
    rsis.push(100 - 100 / (1 + rs));
  }
  return rsis;
}

/**
 * Exponential Moving Average with k = 2/(period+1).
 * Seed = first data value; same length as input.
 */
export function ema(data: number[], period: number): number[] {
  const k = 2 / (period + 1);
  let e = data[0];
  return data.map(v => (e = v * k + e * (1 - k)));
}

// ── Scoring ───────────────────────────────────────────────────────────────────

export interface CycleInputs {
  /** Daily closing prices, oldest → newest, minimum 30 values */
  closes:  number[];
  /** Daily high prices, same length as closes */
  highs:   number[];
  /** Daily volumes, same length as closes */
  volumes: number[];
}

/**
 * Compute a CyclePosition from raw OHLCV arrays.
 *
 * Mirrors the `computeLiveCycle` algorithm in stock-signal-analyser.html.
 * Returns null if there is insufficient data (< 30 closes).
 */
export function computeCyclePosition(inputs: CycleInputs): CyclePosition | null {
  const { closes, highs, volumes } = inputs;
  if (closes.length < 30) return null;

  // RSI (14-period)
  const rsiSeries  = calcRSI(closes, 14);
  const currentRSI = rsiSeries[rsiSeries.length - 1];

  // MACD (12, 26, 9)
  const ema12     = ema(closes, 12);
  const ema26     = ema(closes, 26);
  const macdLine  = ema12.map((v, i) => v - ema26[i]);
  const signal9   = ema(macdLine, 9);
  const histogram = macdLine.map((v, i) => v - signal9[i]);
  const recentHist = histogram.slice(-5);
  const histTrend  = recentHist[recentHist.length - 1] - recentHist[0];
  const macdMomentum: MacdMomentum =
    histTrend > 0 ? 'strengthening' : histTrend < -0.01 ? 'weakening' : 'flat';

  // RSI divergence (bearish: price making new highs, RSI not)
  const lookback     = Math.min(20, closes.length - 1);
  const recentCloses = closes.slice(-lookback);
  const recentRSI    = rsiSeries.slice(-lookback);
  const priceHighIdx = recentCloses.lastIndexOf(Math.max(...recentCloses));
  const rsiHighIdx   = recentRSI.lastIndexOf(Math.max(...recentRSI));
  let rsiDivergence: RsiDivergence = 'none';
  if (priceHighIdx > recentCloses.length * 0.6 && rsiHighIdx < priceHighIdx - 3) {
    rsiDivergence = 'bearish';
  } else if (priceHighIdx < recentCloses.length * 0.4 && rsiHighIdx > priceHighIdx + 3) {
    rsiDivergence = 'bullish';
  }

  // Volume trend
  const recentVol = volumes.slice(-5).reduce((a, b) => a + b, 0) / 5;
  const priorVol  = volumes.slice(-15, -5).reduce((a, b) => a + b, 0) / 10;
  const priceUp   = closes[closes.length - 1] > closes[closes.length - 6];
  let volumeTrend: VolumeTrend = 'neutral';
  if (priceUp && recentVol > priorVol * 1.1)      volumeTrend = 'confirming';
  else if (priceUp && recentVol < priorVol * 0.9) volumeTrend = 'diverging';

  // 52-week proximity
  const high52        = Math.max(...highs);
  const weekHigh52Pct = Math.round(closes[closes.length - 1] / high52 * 100);

  // Composite cycle score (0–100)
  let score = 0;
  score += Math.min(40, (currentRSI / 100) * 40);
  score += macdMomentum === 'weakening' ? 15 : macdMomentum === 'flat' ? 8 : 0;
  score += rsiDivergence === 'bearish'  ? 20 : 0;
  score += volumeTrend   === 'diverging'? 10 : 0;
  score += (weekHigh52Pct / 100) * 15;
  score  = Math.round(Math.min(100, score));

  const stage: CycleStage =
    score < 35 ? 'early' : score < 60 ? 'mid' : score < 80 ? 'late' : 'peak';

  // Signals
  const signals: CycleSignal[] = [];

  if (rsiDivergence === 'bearish') {
    signals.push({ type: 'danger', text: 'RSI making lower highs while price climbs — bearish divergence detected.' });
  } else if (rsiDivergence === 'bullish') {
    signals.push({ type: 'ok',     text: 'RSI confirming price highs — momentum intact.' });
  }

  if (macdMomentum === 'weakening') {
    signals.push({ type: 'warn', text: 'MACD histogram shrinking — upward momentum fading.' });
  } else if (macdMomentum === 'strengthening') {
    signals.push({ type: 'ok',  text: 'MACD expanding — momentum building.' });
  }

  if (volumeTrend === 'diverging') {
    signals.push({ type: 'warn', text: 'Price rising on declining volume — move may lack conviction.' });
  } else if (volumeTrend === 'confirming') {
    signals.push({ type: 'ok',  text: 'Volume confirming price move — healthy buying pressure.' });
  }

  if (weekHigh52Pct > 95) {
    signals.push({ type: 'danger', text: `${weekHigh52Pct}% of 52-week high — limited upside, reversal risk elevated.` });
  } else if (weekHigh52Pct > 80) {
    signals.push({ type: 'warn',   text: `${weekHigh52Pct}% of 52-week high — approaching resistance.` });
  } else {
    signals.push({ type: 'ok',     text: `${weekHigh52Pct}% of 52-week high — meaningful upside headroom remains.` });
  }

  if (currentRSI > 75) {
    signals.push({ type: 'danger', text: `RSI at ${currentRSI.toFixed(1)} — significantly overbought.` });
  } else if (currentRSI > 65) {
    signals.push({ type: 'warn',   text: `RSI at ${currentRSI.toFixed(1)} — entering overbought territory.` });
  } else if (currentRSI < 35) {
    signals.push({ type: 'ok',     text: `RSI at ${currentRSI.toFixed(1)} — oversold, potential reversal opportunity.` });
  }

  const summaryMap: Record<CycleStage, string> = {
    early: 'Early in the move — momentum is building with room to run.',
    mid:   'Mid-trend — solid momentum but watch for signs of fatigue.',
    late:  'Late stage — momentum is fading, tighten stops and monitor closely.',
    peak:  'Multiple peak indicators active — consider reducing position or setting hard stops.',
  };

  return {
    score,
    stage,
    rsiDivergence,
    macdMomentum,
    volumeTrend,
    weekHigh52Pct,
    signals,
    summary: summaryMap[stage],
  };
}

// ── Ticker normalisation (mirrors normaliseTicker in the HTML app) ─────────────

/**
 * Normalise a raw ticker string (as CMC Markets exports it) into a Yahoo
 * Finance / canonical form.
 *
 * Examples:
 *   "VOO:US"  → "VOO"
 *   "BHP:AU"  → "BHP.AX"
 *   "SHEL:GB" → "SHEL.L"
 *   "A200"    → "A200.AX"   (2–6 char, no dot, no colon → assume ASX)
 *   "BHP.AX"  → "BHP.AX"   (already normalised)
 */
export function normaliseTicker(raw: string): string {
  let t = (raw || '').trim().toUpperCase();

  // Strip CMC Markets exchange suffixes
  if (t.endsWith(':US')) return t.slice(0, -3);
  if (t.endsWith(':AU')) return t.slice(0, -3) + '.AX';
  if (t.endsWith(':GB')) return t.slice(0, -3) + '.L';

  // Already has Yahoo suffix
  if (t.includes('.')) return t;

  // 2–6 char bare code without a dot or colon → default ASX
  if (/^[A-Z0-9]{2,6}$/.test(t)) return t + '.AX';

  return t;
}

/**
 * Convert a ticker + exchange string to a Yahoo Finance ticker.
 * Mirrors `toYahooTicker` in the HTML app.
 */
export function toYahooTicker(ticker: string, exchange?: string): string {
  const t  = (ticker  || '').toUpperCase().trim();
  const ex = (exchange || '').toUpperCase();

  if (t.endsWith('.AX')) return t;
  if (t.endsWith('.L'))  return t;
  if (ex.includes('ASX'))                                               return t + '.AX';
  if (ex.includes('LSE') || ex.includes('FTSE') || ex.includes('LONDON')) return t + '.L';
  return t;
}
