"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  DEFAULT_CACHE_FRESHNESS_POLICY,
  deriveCacheStatus,
  type CacheFreshness,
  type StockAnalyserCacheFreshnessPolicy,
  type StockAnalyserCacheSurface,
} from "@transformotion/contracts/stock-analyser/cache-freshness"
import { stockAnalyserSettingsService } from "@/lib/services/settings/settings-service"
import {
  getCacheSnapshot,
  ttlForSurface,
  type CacheMetadata,
} from "@/lib/services/cache/dynamo-ttl-cache"

export const CACHE_FRESHNESS_POLICY_EVENT = "stock-analyser-cache-freshness-policy-updated"

export interface CacheStatusView {
  freshness: CacheFreshness
  lastUpdated: string
  cacheAge: string
}

export function notifyCacheFreshnessPolicyUpdated() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(CACHE_FRESHNESS_POLICY_EVENT))
  }
}

export function useCacheFreshnessPolicy() {
  const [policy, setPolicy] = useState<StockAnalyserCacheFreshnessPolicy>(DEFAULT_CACHE_FRESHNESS_POLICY)
  const [loading, setLoading] = useState(true)

  const loadPolicy = useCallback(async () => {
    setLoading(true)
    try {
      const config = await stockAnalyserSettingsService.getCacheFreshnessConfig()
      setPolicy(config.activePolicy)
    } catch (err) {
      console.warn("[cache-freshness] policy load failed", err)
      setPolicy(DEFAULT_CACHE_FRESHNESS_POLICY)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadPolicy()
    const listener = () => void loadPolicy()
    window.addEventListener(CACHE_FRESHNESS_POLICY_EVENT, listener)
    return () => window.removeEventListener(CACHE_FRESHNESS_POLICY_EVENT, listener)
  }, [loadPolicy])

  return { policy, loading, reload: loadPolicy }
}

export function useCacheStatus(surface: StockAnalyserCacheSurface, cacheKey: string | null) {
  const { policy } = useCacheFreshnessPolicy()
  const [metadata, setMetadata] = useState<CacheMetadata | null>(null)

  const refresh = useCallback(async () => {
    if (!cacheKey) {
      setMetadata(null)
      return
    }
    const snapshot = await getCacheSnapshot<unknown>(cacheKey)
    setMetadata(snapshot ? { cachedAt: snapshot.cachedAt, expiresAt: snapshot.expiresAt } : null)
  }, [cacheKey])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const markWritten = useCallback((next: CacheMetadata) => {
    setMetadata(next)
  }, [])

  const status = useMemo<CacheStatusView>(() => {
    const now = Math.floor(Date.now() / 1000)
    return deriveCacheStatus(metadata, now, policy)
  }, [metadata, policy])

  const ttlSeconds = ttlForSurface(surface)

  return { ...status, metadata, ttlSeconds, refresh, markWritten }
}

export function useDerivedCacheStatus(
  surface: StockAnalyserCacheSurface,
  metadata: CacheMetadata | null,
) {
  const { policy } = useCacheFreshnessPolicy()
  const status = useMemo<CacheStatusView>(() => {
    const now = Math.floor(Date.now() / 1000)
    return deriveCacheStatus(metadata, now, policy)
  }, [metadata, policy])
  return { ...status, ttlSeconds: ttlForSurface(surface) }
}

export async function loadCacheStatusForKeys(
  surface: StockAnalyserCacheSurface,
  keys: readonly string[],
  policy: StockAnalyserCacheFreshnessPolicy = DEFAULT_CACHE_FRESHNESS_POLICY,
): Promise<CacheStatusView> {
  const snapshots = await Promise.all(keys.map((key) => getCacheSnapshot<unknown>(key)))
  const present = snapshots.filter((entry): entry is NonNullable<typeof entry> => entry !== null)
  if (present.length === 0) {
    return deriveCacheStatus(null, Math.floor(Date.now() / 1000), policy)
  }
  const now = Math.floor(Date.now() / 1000)
  const ttl = ttlForSurface(surface)
  const oldest = present.reduce((old, entry) => entry.cachedAt < old.cachedAt ? entry : old)
  return deriveCacheStatus({ cachedAt: oldest.cachedAt, expiresAt: oldest.cachedAt + ttl }, now, policy)
}
