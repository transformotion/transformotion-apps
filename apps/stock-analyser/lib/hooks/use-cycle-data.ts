import { useState, useCallback } from 'react';
import type { CycleDataResponse } from '@transformotion/api-client';
import { getStockAnalyserClient } from '../api';

export interface UseCycleDataResult {
  data:      CycleDataResponse | null;
  isLoading: boolean;
  error:     string | null;
  fetch:     (ticker: string) => Promise<CycleDataResponse | null>;
}

export function useCycleData(): UseCycleDataResult {
  const [data,      setData]      = useState<CycleDataResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error,     setError]     = useState<string | null>(null);

  const fetch = useCallback(async (ticker: string): Promise<CycleDataResponse | null> => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await getStockAnalyserClient().getCycleData(ticker);
      setData(result);
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to fetch cycle data';
      setError(msg);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { data, isLoading, error, fetch };
}
