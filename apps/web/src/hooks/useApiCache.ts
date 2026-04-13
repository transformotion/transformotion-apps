import { useCallback } from 'react';
import { useApiClient } from './useApiClient';

/** TTL seconds per cache type — mirrors staleness thresholds in the HTML app */
const TTL_SECONDS: Record<string, number> = {
  analyser:       8  * 60 * 60,   // 8 hours
  recommendations:24 * 60 * 60,   // 24 hours
  etfs:           72 * 60 * 60,   // 3 days
  metals:         24 * 60 * 60,   // 24 hours
  markets:        72 * 60 * 60,   // 3 days
};

export interface CachedValue<T> {
  data:     T;
  cachedAt: string;
  mode:     'fast' | 'live';
  type:     string;
}

/**
 * Hook that wraps GET/PUT /analysis-cache for typed reads and writes.
 * Returns null on cache miss (404) or parse failure.
 */
export function useApiCache() {
  const api = useApiClient();

  const getCache = useCallback(async <T>(key: string): Promise<CachedValue<T> | null> => {
    try {
      const entry = await api.getCache(key);
      return entry.data as CachedValue<T>;
    } catch {
      return null;
    }
  }, [api]);

  const putCache = useCallback(async <T>(
    key: string,
    data: T,
    mode: 'fast' | 'live',
    type: string,
  ): Promise<void> => {
    const ttlSeconds = TTL_SECONDS[type] ?? TTL_SECONDS.analyser;
    const payload: CachedValue<T> = {
      data,
      cachedAt: new Date().toISOString(),
      mode,
      type,
    };
    await api.putCache(key, { data: payload, ttlSeconds });
  }, [api]);

  return { getCache, putCache };
}
