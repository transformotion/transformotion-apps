/**
 * DynamoDB TTL Cache Service
 *
 * Implements CacheService using the analysis-cache Lambda via API Gateway.
 * Replaces MemoryCacheService when storage.provider is 'dynamo' (NEXT_PUBLIC_RUNTIME_PROFILE=live).
 *
 * Key format:  DATATYPE#identifier  e.g. MARKET#ASX, ANALYSIS#CBA.AX
 * AccountId:   SHARED for market/public data, user accountId for private data
 */

import { getStockAnalyserClient, stockAnalyserClient } from '@/lib/api'
import { getConfig } from '@/lib/config'
import { MemoryCacheService } from '@transformotion/cache'
import type { CacheService } from '@transformotion/cache'
import {
  STOCK_ANALYSER_CACHE_TTL_SECONDS,
  type StockAnalyserCacheSurface,
} from '@transformotion/contracts/stock-analyser/cache-freshness'
import type { AnalysisCacheEntry } from '@transformotion/contracts/stock-analyser/types'

// ── TTL table (seconds) ────────────────────────────────────────────────────────

const TTL_SECONDS: Record<string, number> = {
  MARKET:   STOCK_ANALYSER_CACHE_TTL_SECONDS.market,
  RECS:     STOCK_ANALYSER_CACHE_TTL_SECONDS.recs,
  ETF:      STOCK_ANALYSER_CACHE_TTL_SECONDS.etfs,
  METALS:   STOCK_ANALYSER_CACHE_TTL_SECONDS.metals,
  ANALYSIS: STOCK_ANALYSER_CACHE_TTL_SECONDS.analyser,
  CYCLE:    8 * 3600,
}
const DEFAULT_TTL = STOCK_ANALYSER_CACHE_TTL_SECONDS.analyser

// Cache types whose data is shared across all accounts.
// #594: the ETF cache key is `ETF#{market}` (prefix `ETF`), not `ETFS` — the stale
// `ETFS` entry never matched, so live ETF writes went out with shared:false (the
// analysis-cache SHARED_PREFIXES override forced SHARED server-side, masking it).
const SHARED_TYPES = new Set(['MARKET', 'ETF', 'RECS', 'METALS', 'ANALYSIS', 'CYCLE'])

export type CacheMetadata = Pick<AnalysisCacheEntry, 'cachedAt' | 'expiresAt'>
export interface CacheSnapshot<T> extends CacheMetadata {
  value: T
}

const localMemoryCache = new MemoryCacheService({ defaultTTL: DEFAULT_TTL, prefix: '' })
const localMetadata = new Map<string, CacheMetadata>()

function parseCachedValue<T>(data: unknown): T {
  return typeof data === 'string' ? JSON.parse(data) as T : data as T
}

function getTTL(cacheKey: string): number {
  const type = cacheKey.split('#')[0]
  return TTL_SECONDS[type] ?? DEFAULT_TTL
}

export function ttlForSurface(surface: StockAnalyserCacheSurface): number {
  return STOCK_ANALYSER_CACHE_TTL_SECONDS[surface]
}

export async function getCacheSnapshot<T>(key: string): Promise<CacheSnapshot<T> | null> {
  try {
    if (getConfig().storage.provider === 'local') {
      const cached = await localMemoryCache.get<T>(key)
      const metadata = localMetadata.get(key)
      return cached !== null && metadata ? { value: cached, ...metadata } : null
    }
    const item = await getStockAnalyserClient().getCache(key)
    return {
      value: parseCachedValue<T>(item.data),
      cachedAt: item.cachedAt,
      expiresAt: item.expiresAt,
    }
  } catch {
    return null
  }
}

export async function setCacheSnapshot<T>(key: string, value: T, ttl?: number): Promise<CacheSnapshot<T>> {
  const ttlSeconds = ttl ?? getTTL(key)
  const now = Math.floor(Date.now() / 1000)
  const metadata = { cachedAt: now, expiresAt: now + ttlSeconds }

  if (getConfig().storage.provider === 'local') {
    await localMemoryCache.set(key, value, ttlSeconds)
    localMetadata.set(key, metadata)
    return { value, ...metadata }
  }

  await stockAnalyserClient.putCacheEntry(key, {
    data:       JSON.stringify(value),
    ttlSeconds,
    mode:       'live',
    type:       key.split('#')[0].toLowerCase(),
    shared:     SHARED_TYPES.has(key.split('#')[0]),
  })
  console.log('[dynamo-cache] set:', key, `(ttl ${ttlSeconds}s)`)
  return { value, ...metadata }
}

// ── Service implementation ─────────────────────────────────────────────────────

export class DynamoTTLCacheService implements CacheService {
  async get<T>(key: string): Promise<T | null> {
    return (await getCacheSnapshot<T>(key))?.value ?? null
  }

  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    await setCacheSnapshot(key, value, ttl)
  }

  async delete(key: string): Promise<void> {
    localMetadata.delete(key)
    await stockAnalyserClient.deleteCacheEntry(key)
  }

  async deleteByPrefix(_prefix: string): Promise<void> {
    // Not supported — DynamoDB scan by prefix is not exposed via Lambda
    console.warn('[dynamo-cache] deleteByPrefix not supported:', _prefix)
  }

  async has(key: string): Promise<boolean> {
    return (await this.get(key)) !== null
  }

  async ttlRemaining(key: string): Promise<number> {
    try {
      const item = await getStockAnalyserClient().getCache(key)
      const remaining = item.expiresAt - Math.floor(Date.now() / 1000)
      return Math.max(0, remaining)
    } catch {
      return -1
    }
  }

  async clear(): Promise<void> {
    console.warn('[dynamo-cache] clear() not supported — use delete() per key')
  }

  async getOrSet<T>(key: string, fn: () => Promise<T>, ttl?: number): Promise<T> {
    const cached = await this.get<T>(key)
    if (cached !== null) return cached
    const value = await fn()
    await this.set(key, value, ttl)
    return value
  }
}

// ── Singleton — DynamoDB in production, in-memory in mock mode ────────────────

export const dynamoCache: CacheService = getConfig().storage.provider === 'local'
  ? localMemoryCache
  : new DynamoTTLCacheService()
