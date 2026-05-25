import type { OhlcvDataResponse, OhlcvRange, OhlcvInterval } from '@transformotion/api-client';

const BASE_PRICES: Record<string, number> = {
  'CBA.AX': 115.42,
  'BHP.AX':  42.80,
  'FMG.AX':  18.90,
  'CSL.AX': 298.50,
  'AAPL':   182.00,
  'NVDA':   875.00,
  'MSFT':   415.00,
};

const RANGE_DAYS: Record<OhlcvRange, number> = {
  '1mo':  22,
  '3mo':  66,
  '6mo': 132,
  '1y':  252,
  '5y':  252 * 5,
  'max': 252 * 10,
};

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

function buildDateSeries(count: number, interval: OhlcvInterval): string[] {
  const dates: string[] = [];
  const now = new Date('2026-05-23');
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(now);
    if (interval === '1d')  d.setDate(d.getDate() - i);
    if (interval === '1wk') d.setDate(d.getDate() - i * 7);
    if (interval === '1mo') d.setMonth(d.getMonth() - i);
    // skip weekends for daily
    if (interval === '1d' && (d.getDay() === 0 || d.getDay() === 6)) continue;
    dates.push(d.toISOString().split('T')[0]);
  }
  return dates;
}

export function getMockOhlcvData(ticker: string, range: OhlcvRange, interval: OhlcvInterval): OhlcvDataResponse {
  const basePrice = BASE_PRICES[ticker.toUpperCase()] ?? 50;
  const barCount  = Math.min(RANGE_DAYS[range], 500);
  const dates     = buildDateSeries(barCount, interval);
  const rng       = seededRandom(ticker.split('').reduce((a, c) => a + c.charCodeAt(0), 0));

  const opens: number[]   = [];
  const highs: number[]   = [];
  const lows: number[]    = [];
  const closes: number[]  = [];
  const volumes: number[] = [];

  let price = basePrice * (0.7 + rng() * 0.6);

  for (let i = 0; i < dates.length; i++) {
    const drift    = (rng() - 0.495) * 0.025;
    const open     = price;
    const close    = parseFloat((open * (1 + drift)).toFixed(3));
    const highMult = 1 + rng() * 0.015;
    const lowMult  = 1 - rng() * 0.015;
    const high     = parseFloat((Math.max(open, close) * highMult).toFixed(3));
    const low      = parseFloat((Math.min(open, close) * lowMult).toFixed(3));
    const volume   = Math.floor(500000 + rng() * 4500000);

    opens.push(open);
    highs.push(high);
    lows.push(low);
    closes.push(close);
    volumes.push(volume);

    price = close;
  }

  return {
    ticker,
    range,
    interval,
    dates,
    opens,
    highs,
    lows,
    closes,
    volumes,
    fetchedAt: new Date().toISOString(),
    source:    'cache',
  };
}
