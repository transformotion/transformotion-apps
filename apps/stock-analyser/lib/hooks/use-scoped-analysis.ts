"use client"

import { useCallback, useState } from "react"
import { useNavigation } from "@/components/stock-analyser/app-shell"
import { useCacheStatus, useClaude, type ClaudeRequest } from "@/lib/hooks"
import { getCacheSnapshot } from "@/lib/services/cache/dynamo-ttl-cache"
import {
  isCacheExpired,
  type CacheFreshness,
  type StockAnalyserCacheSurface,
} from "@transformotion/contracts/stock-analyser/cache-freshness"
import { normaliseAnalysisErrorForDisplay } from "./analysis-error"
import { analysisRealCacheKey } from "./analysis-cache-key"
import { isFresherCacheEntry } from "./cache-reconcile"

export { analysisRealCacheKey }
export { isFresherCacheEntry }

/**
 * Runtime port of the v0 unified cache-first analysis pattern
 * (contracts/stock-analyser/analysis-cache.behaviour.md + hooks/use-scoped-analysis.ts).
 * The PRESENTATION/behaviour is reproduced verbatim; only the DATA LAYER is
 * rebuilt — instead of the v0 app-shell mock store it reads/writes the REAL
 * server cache (`/analysis-cache` via dynamoCache / useClaude), using the real
 * wall clock (not the v0 MOCK_CACHE_NOW_SECONDS demo clock).
 *
 * Behaviour (canonical, idle→Run):
 *  - IDLE on load / scope change — renders nothing until run(), even if a fresh
 *    entry exists. Idle is derived from "is there a result for the CURRENT scope?".
 *  - run() (Run / Re-run) — reads the scope's REAL cache first; a present, non-
 *    expired entry is served with NO model call; missing/expired → fetch per the
 *    toggle, write back, render.
 *  - refresh() — the only force-fetch: always fetches per the toggle + writes back.
 *  - Live/Fast — only decides what a FETCH does (webSearch true/false).
 */

export interface ScopedAnalysisCacheStatus {
  freshness: CacheFreshness
  lastUpdated: string
  cacheAge: string
}

export interface UseScopedAnalysisOptions<T> {
  surface: StockAnalyserCacheSurface
  /** The scope this analysis is keyed by; changing it reverts the tab to idle. */
  scopeKey: string
  /** Build the AI request for a fetch. `webSearch` reflects Live(true)/Fast(false). */
  buildRequest: (webSearch: boolean) => ClaudeRequest | Promise<ClaudeRequest>
  /**
   * Parse the raw AI/cache payload into the tab's result shape; null to ignore.
   * May be async — runtime data-layer enrichment that needs a network call (e.g.
   * the Recs real-price overlay) runs here, for BOTH fetched and cache-served data.
   */
  parse: (raw: unknown) => T | null | Promise<T | null>
  /**
   * #603: convert a fetch error into a DISTINGUISHED result instead of surfacing it
   * as an error — e.g. a grounding-unavailable (newly-listed/thin-data) failure maps
   * to an honest insufficient-data result. Return `null` to let the error surface
   * normally.
   */
  recoverFromError?: (err: unknown) => T | null
}

export interface UseScopedAnalysisResult<T> {
  result: T | null
  isIdle: boolean
  isRunning: boolean
  error: Error | null
  buttonLabel: "Run Analysis" | "Re-run Analysis"
  isLive: boolean
  toggleMode: () => void
  /** Cache-first Run / Re-run. */
  run: () => Promise<void>
  /** Force-fetch (Refresh); bypasses the cache read. */
  refresh: () => Promise<void>
  status: ScopedAnalysisCacheStatus
}

export function useScopedAnalysis<T>(
  opts: UseScopedAnalysisOptions<T>,
): UseScopedAnalysisResult<T> {
  const { surface, scopeKey, buildRequest, parse, recoverFromError } = opts
  const { defaultSearchMode } = useNavigation()
  const realKey = analysisRealCacheKey(surface, scopeKey)
  const { callClaude, isLoading } = useClaude<unknown>()
  const cacheStatus = useCacheStatus(surface, realKey)
  const { markWritten, ttlSeconds } = cacheStatus

  const [isLive, setIsLive] = useState(defaultSearchMode === "live")
  const [result, setResult] = useState<T | null>(null)
  const [resultScope, setResultScope] = useState<string | null>(null)
  const [localError, setLocalError] = useState<Error | null>(null)

  // Idle whenever there is no result for the CURRENT scope — covers initial load
  // AND scope change, so the wrong scope's data is never shown.
  const isIdle = result === null || resultScope !== scopeKey

  // Force a fetch per the toggle (the prompt/grounding only runs on this path,
  // never on a cache hit), write it back to the REAL cache, then render.
  const fetchAndStore = useCallback(async () => {
    try {
      setLocalError(null)
      const request = await buildRequest(isLive)
      const before = await getCacheSnapshot<unknown>(realKey)
      let raw: unknown
      try {
        raw = await callClaude({ ...request, cacheKey: realKey, forceRefresh: true })
      } catch (err) {
        // #stale-view: the async WSS completion can fail (a socket close racing
        // job_complete) even though the run's result reached the shared cache. Rather
        // than stranding stale data behind an error, reconcile against the server cache:
        // if a NEWER, non-expired entry has appeared, serve it instead of erroring.
        const after = await getCacheSnapshot<unknown>(realKey)
        if (!isFresherCacheEntry(before, after)) throw err
        raw = after.value
      }
      if (raw == null) return
      const parsed = await parse(raw)
      if (parsed != null) {
        setResult(parsed)
        setResultScope(scopeKey)
      }
      // #freshness: reflect the just-written cache so the status bar flips to
      // FRESH/"just now" — useCacheStatus otherwise only re-reads its metadata on
      // mount / scope change, so an in-place re-run left the stale mount-time value.
      const now = Math.floor(Date.now() / 1000)
      markWritten({ cachedAt: now, expiresAt: now + ttlSeconds })
    } catch (err) {
      // #603: a recoverable failure (grounding-unavailable / newly-listed) becomes a
      // distinguished honest result rendered in place of an error banner.
      const recovered = recoverFromError?.(err) ?? null
      if (recovered != null) {
        setResult(recovered)
        setResultScope(scopeKey)
        return
      }
      setLocalError(normaliseAnalysisErrorForDisplay(err))
    }
  }, [buildRequest, isLive, callClaude, realKey, parse, recoverFromError, scopeKey, markWritten, ttlSeconds])

  // Cache-first Run / Re-run: serve a present, non-expired REAL entry without a
  // model call; otherwise fetch.
  const run = useCallback(async () => {
    try {
      setLocalError(null)
      const snapshot = await getCacheSnapshot<unknown>(realKey)
      if (snapshot && !isCacheExpired({ cachedAt: snapshot.cachedAt, expiresAt: snapshot.expiresAt })) {
        const parsed = await parse(snapshot.value)
        if (parsed != null) {
          setResult(parsed)
          setResultScope(scopeKey)
          return
        }
      }
      await fetchAndStore()
    } catch (err) {
      setLocalError(normaliseAnalysisErrorForDisplay(err))
    }
  }, [realKey, parse, scopeKey, fetchAndStore])

  // The only force-live path.
  const refresh = useCallback(async () => {
    await fetchAndStore()
  }, [fetchAndStore])

  const toggleMode = useCallback(() => setIsLive((v) => !v), [])

  return {
    result: isIdle ? null : result,
    isIdle,
    isRunning: isLoading,
    error: localError,
    buttonLabel: isIdle ? "Run Analysis" : "Re-run Analysis",
    isLive,
    toggleMode,
    run,
    refresh,
    status: {
      freshness: cacheStatus.freshness,
      lastUpdated: cacheStatus.lastUpdated,
      cacheAge: cacheStatus.cacheAge,
    },
  }
}
