import { useState, useCallback } from 'react';
import type { OhlcvDataResponse, OhlcvRange, OhlcvInterval } from '@transformotion/api-client';
import { getStockAnalyserClient } from '../api';
import { getConfig } from '../config';
import { getMockOhlcvData } from '../services/ai/fixtures/ohlcv-data';

export interface UseOhlcvDataResult {
  data:      OhlcvDataResponse | null;
  isLoading: boolean;
  error:     string | null;
  fetch:     (ticker: string, range?: OhlcvRange, interval?: OhlcvInterval) => Promise<OhlcvDataResponse | null>;
}

export function useOhlcvData(): UseOhlcvDataResult {
  const [data,      setData]      = useState<OhlcvDataResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error,     setError]     = useState<string | null>(null);

  const fetch = useCallback(async (
    ticker: string,
    range: OhlcvRange = '1y',
    interval: OhlcvInterval = '1d',
  ): Promise<OhlcvDataResponse | null> => {
    setIsLoading(true);
    setError(null);
    try {
      if (getConfig().ai.provider === 'mock') {
        const result = getMockOhlcvData(ticker, range, interval);
        setData(result);
        return result;
      }
      const result = await getStockAnalyserClient().getOhlcvData(ticker, range, interval);
      setData(result);
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to fetch price data';
      setError(msg);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { data, isLoading, error, fetch };
}
