import { useCallback } from 'react';
import { useApiClient } from './useApiClient';

/** TTL seconds per cache type */
const TTL_SECONDS: Record<string, number> = {
  analyser:        24 * 60 * 60,   // 24 hours
  cycle:           24 * 60 * 60,   // 24 hours
  recommendations: 24 * 60 * 60,   // 24 hours
  markets:         24 * 60 * 60,   // 24 hours
  etfs:            48 * 60 * 60,   // 48 hours
  metals:          24 * 60 * 60,   // 24 hours (spot prices)
};

/**
 * The shape returned by getCache — always normalised to ISO cachedAt
 * so isCacheFresh() and CacheStatusBadge work without changes.
 */
export interface CachedValue<T> {
  data:     T;
  cachedAt: string;   // ISO 8601 — converted from epoch seconds if needed
  mode:     'fast' | 'live';
  type:     string;
}

/**
 * Hook that wraps GET/PUT /analysis-cache for typed reads and writes.
 *
 * All global analysis data (market, recs, ETFs, metals, analyser, cycle)
 * is written with shared=true (accountId='SHARED') so results are shared
 * across all users — no redundant Claude calls per user.
 *
 * Returns null on cache miss (404) or parse failure.
 */
export function useApiCache() {
  const api = useApiClient();

  const getCache = useCallback(async <T>(key: string): Promise<CachedValue<T> | null> => {
    try {
      const entry = await api.getCache(key);
      const raw   = entry.data;

      let data:     T;
      let cachedAt: string;
      let mode:     'fast' | 'live';
      let type:     string;

      if (typeof raw === 'string') {
        // Current format: data is a JSON string, top-level cachedAt is epoch seconds
        data     = JSON.parse(raw) as T;
        cachedAt = new Date((entry.cachedAt as number) * 1000).toISOString();
        mode     = (entry.mode as 'fast' | 'live') ?? 'live';
        type     = entry.dataType ?? 'analyser';
      } else if (raw && typeof raw === 'object' && 'data' in (raw as object)) {
        // Legacy CachedValue wrapper written by the old Lambda
        const cv = raw as { data: T; cachedAt: string; mode?: string; type?: string };
        data     = cv.data;
        cachedAt = cv.cachedAt;
        mode     = (cv.mode as 'fast' | 'live') ?? 'live';
        type     = cv.type ?? 'analyser';
      } else {
        // Fallback: treat raw value as T directly
        data     = raw as T;
        const ca = entry.cachedAt;
        cachedAt = typeof ca === 'number'
          ? new Date(ca * 1000).toISOString()
          : (ca as unknown as string) ?? new Date().toISOString();
        mode     = 'live';
        type     = 'analyser';
      }

      console.log('[cache] Hit:', key);
      return { data, cachedAt, mode, type };
    } catch (err: unknown) {
      const status = (err as { status?: number })?.status;
      if (status === 404) {
        console.log('[cache] Miss:', key);
      } else {
        console.error('[cache] Read FAILED:', key, err);
      }
      return null;
    }
  }, [api]);

  /**
   * Write a value to the analysis cache.
   *
   * @param key      Cache key (use CK.* helpers from cacheConfig.ts)
   * @param data     Value to cache
   * @param mode     'fast' | 'live'
   * @param type     Cache type ('analyser', 'markets', 'recommendations', 'etfs', 'metals', 'cycle')
   * @param shared   When true (default) write under SHARED partition so all users benefit.
   *                 Pass false only for truly private data (but portfolio/watchlist use their
   *                 own tables, so shared=false is rarely needed here).
   */
  const putCache = useCallback(async <T>(
    key:    string,
    data:   T,
    mode:   'fast' | 'live',
    type:   string,
    shared = true,
  ): Promise<void> => {
    const ttlSeconds = TTL_SECONDS[type] ?? TTL_SECONDS.analyser;
    try {
      await api.putCache(key, { data, ttlSeconds, mode, type, shared });
      console.log(`[cache] Written: ${key} (TTL ${ttlSeconds / 3600}h, shared=${shared})`);
    } catch (err) {
      console.error('[cache] Write FAILED:', key, err);
    }
  }, [api]);

  return { getCache, putCache };
}
