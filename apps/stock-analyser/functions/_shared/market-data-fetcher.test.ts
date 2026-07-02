import { beforeEach, describe, expect, it, vi } from 'vitest';

const chartMock = vi.hoisted(() => vi.fn());

vi.mock('yahoo-finance2', () => ({
  default: vi.fn(() => ({
    chart: chartMock,
  })),
}));

import { fetchOhlcv } from './market-data-fetcher';

function yahooValidationError(overrides?: {
  instancePath?: string;
  message?: string;
  data?: unknown;
}) {
  const err = new Error('Failed Yahoo Schema validation') as Error & {
    name: string;
    errors: Array<{ instancePath: string; message: string; data: unknown }>;
  };
  err.name = 'FailedYahooValidationError';
  err.errors = [{
    instancePath: overrides?.instancePath ?? '/meta/currency',
    message: overrides?.message ?? 'Expected a string',
    data: overrides?.data ?? null,
  }];
  return err;
}

function chartResult(currency: string | null) {
  return {
    meta: { currency, symbol: currency === null ? 'PMGOLD.AX' : 'ETPMAG.AX' },
    quotes: [
      { date: new Date('2026-07-01T00:00:00.000Z'), open: 55, high: 57, low: 54, close: 56, volume: 100 },
      { date: new Date('2026-07-02T00:00:00.000Z'), open: 56, high: 58, low: 55, close: 57.2, volume: 120 },
    ],
  };
}

describe('fetchOhlcv Yahoo validation recovery', () => {
  beforeEach(() => {
    chartMock.mockReset();
  });

  it('uses the normal validated Yahoo path for unaffected tickers', async () => {
    chartMock.mockResolvedValueOnce(chartResult('AUD'));

    const result = await fetchOhlcv('ETPMAG.AX', '1y', '1d');

    expect(chartMock).toHaveBeenCalledTimes(1);
    expect(chartMock).toHaveBeenCalledWith(
      'ETPMAG.AX',
      expect.objectContaining({ interval: '1d' }),
    );
    expect(result.closes).toEqual([56, 57.2]);
  });

  it('recovers .AX tickers when only Yahoo meta.currency is null but OHLCV bars are valid', async () => {
    chartMock
      .mockRejectedValueOnce(yahooValidationError())
      .mockResolvedValueOnce(chartResult(null));

    const result = await fetchOhlcv('PMGOLD.AX', '1y', '1d');

    expect(chartMock).toHaveBeenCalledTimes(2);
    expect(chartMock).toHaveBeenNthCalledWith(
      2,
      'PMGOLD.AX',
      expect.objectContaining({ interval: '1d' }),
      { validateResult: false },
    );
    expect(result.dates).toEqual(['2026-07-01', '2026-07-02']);
    expect(result.closes).toEqual([56, 57.2]);
  });

  it('does not disable validation for unrelated Yahoo validation failures', async () => {
    const err = yahooValidationError({ instancePath: '/meta/exchangeName', message: 'Expected a string' });
    chartMock.mockRejectedValueOnce(err);

    await expect(fetchOhlcv('PMGOLD.AX', '1y', '1d')).rejects.toBe(err);
    expect(chartMock).toHaveBeenCalledTimes(1);
  });

  it('does not use the .AX null-currency tolerance for non-ASX symbols', async () => {
    const err = yahooValidationError();
    chartMock.mockRejectedValueOnce(err);

    await expect(fetchOhlcv('GC=F', '1y', '1d')).rejects.toBe(err);
    expect(chartMock).toHaveBeenCalledTimes(1);
  });
});
