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

// ── TTL table (seconds) ────────────────────────────────────────────────────────

const TTL_SECONDS: Record<string, number> = {
  MARKET:   24 * 3600,
  RECS:     24 * 3600,
  ETFS:     48 * 3600,
  METALS:    2 * 3600,
  ANALYSIS:  8 * 3600,
  CYCLE:     8 * 3600,
}
const DEFAULT_TTL = 8 * 3600

// Cache types whose data is shared across all accounts
const SHARED_TYPES = new Set(['MARKET', 'ETFS', 'RECS', 'METALS', 'ANALYSIS', 'CYCLE'])

function getTTL(cacheKey: string): number {
  const type = cacheKey.split('#')[0]
  return TTL_SECONDS[type] ?? DEFAULT_TTL
}

// ── Service implementation ─────────────────────────────────────────────────────

export class DynamoTTLCacheService implements CacheService {
  async get<T>(key: string): Promise<T | null> {
    try {
      const item = await getStockAnalyserClient().getCache(key)
      return JSON.parse(item.data) as T
    } catch {
      // 404 = cache miss; any other error falls back to null
      return null
    }
  }

  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    const ttlSeconds = ttl ?? getTTL(key)
    await stockAnalyserClient.putCacheEntry(key, {
      data:       JSON.stringify(value),
      ttlSeconds,
      mode:       'live',
      type:       key.split('#')[0].toLowerCase(),
      shared:     SHARED_TYPES.has(key.split('#')[0]),
    })
    console.log('[dynamo-cache] set:', key, `(ttl ${ttlSeconds}s)`)
  }

  async delete(key: string): Promise<void> {
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
  ? new MemoryCacheService({ defaultTTL: 8 * 3600, prefix: '' })
  : new DynamoTTLCacheService()
