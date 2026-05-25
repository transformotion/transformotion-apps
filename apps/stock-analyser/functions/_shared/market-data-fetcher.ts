import YahooFinance from 'yahoo-finance2';

const yf = new YahooFinance();

export interface FetchedOhlcv {
  dates:   string[];
  opens:   number[];
  highs:   number[];
  lows:    number[];
  closes:  number[];
  volumes: number[];
}

const RANGE_TO_PERIOD: Record<string, () => Date> = {
  '1mo': () => { const d = new Date(); d.setMonth(d.getMonth() - 1); return d; },
  '3mo': () => { const d = new Date(); d.setMonth(d.getMonth() - 3); return d; },
  '6mo': () => { const d = new Date(); d.setMonth(d.getMonth() - 6); return d; },
  '1y':  () => { const d = new Date(); d.setFullYear(d.getFullYear() - 1); return d; },
  '5y':  () => { const d = new Date(); d.setFullYear(d.getFullYear() - 5); return d; },
  'max': () => new Date('2000-01-01'),
};

export async function fetchOhlcv(ticker: string, range: string, interval: string): Promise<FetchedOhlcv> {
  const period1 = (RANGE_TO_PERIOD[range] ?? RANGE_TO_PERIOD['1y'])();
  const result = await yf.chart(ticker, { period1, interval: interval as '1d' | '1wk' | '1mo' });
  const quotes = result.quotes ?? [];

  const valid = quotes.filter(q =>
    q.date != null &&
    q.open != null && (q.open as number) > 0 &&
    q.high != null && (q.high as number) > 0 &&
    q.low  != null && (q.low  as number) > 0 &&
    q.close != null && (q.close as number) > 0
  );

  return {
    dates:   valid.map(q => (q.date instanceof Date ? q.date.toISOString().split('T')[0] : String(q.date))),
    opens:   valid.map(q => q.open   as number),
    highs:   valid.map(q => q.high   as number),
    lows:    valid.map(q => q.low    as number),
    closes:  valid.map(q => q.close  as number),
    volumes: valid.map(q => (q.volume ?? 0) as number),
  };
}
