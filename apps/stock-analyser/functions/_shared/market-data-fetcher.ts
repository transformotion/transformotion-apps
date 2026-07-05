import YahooFinance from 'yahoo-finance2';

const yf = new YahooFinance();

type ChartInterval = '1d' | '1wk' | '1mo';

interface YahooChartQuote {
  date?: Date | string | null;
  open?: number | null;
  high?: number | null;
  low?: number | null;
  close?: number | null;
  volume?: number | null;
}

interface YahooChartResult {
  meta?: {
    currency?: string | null;
    symbol?: string;
    exchangeName?: string;
  };
  quotes?: YahooChartQuote[];
}

interface ValidYahooChartQuote {
  date: Date | string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number | null;
}

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

function isPositiveNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function isValidQuote(q: YahooChartQuote): q is ValidYahooChartQuote {
  return (
    q.date != null &&
    isPositiveNumber(q.open) &&
    isPositiveNumber(q.high) &&
    isPositiveNumber(q.low) &&
    isPositiveNumber(q.close)
  );
}

function validQuotes(result: YahooChartResult): ValidYahooChartQuote[] {
  return (result.quotes ?? []).filter(isValidQuote);
}

function isAxTicker(ticker: string): boolean {
  return ticker.toUpperCase().endsWith('.AX');
}

function isNullCurrencyValidationError(err: unknown): boolean {
  const candidate = err as {
    name?: unknown;
    errors?: Array<{
      instancePath?: unknown;
      message?: unknown;
      data?: unknown;
    }>;
  };

  return (
    candidate.name === 'FailedYahooValidationError' &&
    Array.isArray(candidate.errors) &&
    candidate.errors.some(error =>
      error.instancePath === '/meta/currency' &&
      error.data === null &&
      typeof error.message === 'string' &&
      error.message.includes('Expected a string')
    )
  );
}

function withAudCurrency(result: YahooChartResult): YahooChartResult {
  return {
    ...result,
    meta: {
      ...result.meta,
      currency: 'AUD',
    },
  };
}

// #603: fail FAST on a hanging / newly-listed ticker (SPCX-class) rather than letting
// the Yahoo client retry-and-block for the whole Lambda timeout. A timeout propagates
// as a normal fetch error → the caller degrades to no-price-data.
const YAHOO_FETCH_TIMEOUT_MS = 12_000;

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => {
      const t = setTimeout(() => reject(new Error(`Yahoo fetch timed out after ${ms}ms for ${label}`)), ms);
      t.unref?.();
    }),
  ]);
}

async function readYahooChart(
  ticker: string,
  options: { period1: Date; interval: ChartInterval },
): Promise<YahooChartResult> {
  try {
    return await withTimeout(yf.chart(ticker, options) as Promise<YahooChartResult>, YAHOO_FETCH_TIMEOUT_MS, ticker);
  } catch (err) {
    if (!isAxTicker(ticker) || !isNullCurrencyValidationError(err)) {
      throw err;
    }

    // PMGOLD.AX currently returns valid OHLCV but `meta.currency: null`, which
    // yahoo-finance2 rejects. Accept only that narrow .AX/null-currency case.
    const unvalidated = await withTimeout(
      yf.chart(ticker, options, { validateResult: false }) as Promise<YahooChartResult>,
      YAHOO_FETCH_TIMEOUT_MS,
      ticker,
    );
    if (unvalidated.meta?.currency !== null || validQuotes(unvalidated).length === 0) {
      throw err;
    }

    return withAudCurrency(unvalidated);
  }
}

export async function fetchOhlcv(ticker: string, range: string, interval: string): Promise<FetchedOhlcv> {
  const period1 = (RANGE_TO_PERIOD[range] ?? RANGE_TO_PERIOD['1y'])();
  const result = await readYahooChart(ticker, { period1, interval: interval as ChartInterval });
  const valid = validQuotes(result);

  return {
    dates:   valid.map(q => (q.date instanceof Date ? q.date.toISOString().split('T')[0] : String(q.date))),
    opens:   valid.map(q => q.open),
    highs:   valid.map(q => q.high),
    lows:    valid.map(q => q.low),
    closes:  valid.map(q => q.close),
    volumes: valid.map(q => (q.volume ?? 0) as number),
  };
}
