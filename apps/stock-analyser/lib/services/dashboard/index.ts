import { getConfig } from '@/lib/config'
import { getCacheSnapshot } from '@/lib/services/cache/dynamo-ttl-cache'
import { analysisRealCacheKey } from '@/lib/hooks/analysis-cache-key'
import { mockMarketAnalysisResult, mockTopPicks } from '@transformotion/contracts/stock-analyser/mocks'
import {
  RECOMMENDATION_SIGNAL_LABELS,
  type Recommendation,
  type RunRecommendationsResponse,
} from '@transformotion/contracts/stock-analyser/recommendations'
import type { MarketAnalysisResult } from '@transformotion/contracts/stock-analyser/market-analysis'
import { STOCK_ANALYSER_CACHE_TTL_SECONDS } from '@transformotion/contracts/stock-analyser/cache-freshness'

/**
 * M21 — Home dashboard read models for the Market Signals + Market Roundup tiles.
 *
 * Read-only: mock mode returns the canonical contract fixtures; live mode reads
 * the SHARED cache via `getCacheSnapshot` and NEVER triggers generation or a
 * warm. Absent cache → empty (a supported "not warmed yet" state). `metadata`
 * (epoch seconds) drives the per-tile cache-state badge via cache-freshness.ts.
 */

export interface CacheMeta {
  cachedAt: number
  expiresAt: number
}

export interface RoundupTile {
  label: string
  sub: string
  change: number
  signal: string
  note: string
}
export interface MarketRoundup {
  summary: string
  tiles: RoundupTile[]
  metadata: CacheMeta | null
}

export interface SignalTile {
  ticker: string
  signal: string
  label: string
  note: string
}
export interface MarketSignals {
  signals: SignalTile[]
  metadata: CacheMeta | null
}

// Live default scopes: the region the daily job warms + the canonical recs universe.
const DEFAULT_REGION = 'australia'
const DEFAULT_RECS_SCOPE = 'top-picks|standard'

function roundupFrom(result: MarketAnalysisResult, metadata: CacheMeta | null): MarketRoundup {
  return {
    summary: result.briefing,
    tiles: result.sectors.slice(0, 4).map((s) => ({
      label: s.sector,
      sub: s.bestExchange ?? '',
      change: s.change,
      signal: s.signal,
      note: s.reason,
    })),
    metadata,
  }
}

function signalsFrom(recs: readonly Recommendation[], metadata: CacheMeta | null): MarketSignals {
  return {
    signals: recs.slice(0, 3).map((r) => ({
      ticker: r.ticker,
      signal: r.recommendationSignal,
      label: RECOMMENDATION_SIGNAL_LABELS[r.recommendationSignal],
      note: r.analysis,
    })),
    metadata,
  }
}

function mockMeta(ageSeconds: number, surface: 'market' | 'recs'): CacheMeta {
  const now = Math.floor(Date.now() / 1000)
  const cachedAt = now - ageSeconds
  return { cachedAt, expiresAt: cachedAt + STOCK_ANALYSER_CACHE_TTL_SECONDS[surface] }
}

export const homeDashboardService = {
  async getMarketRoundup(): Promise<MarketRoundup> {
    if (getConfig().storage.provider === 'local') {
      return roundupFrom(mockMarketAnalysisResult, mockMeta(45 * 60, 'market')) // 45m of 24h → fresh
    }
    const snap = await getCacheSnapshot<MarketAnalysisResult>(analysisRealCacheKey('market', DEFAULT_REGION))
    if (!snap) return { summary: '', tiles: [], metadata: null }
    return roundupFrom(snap.value, { cachedAt: snap.cachedAt, expiresAt: snap.expiresAt })
  },

  async getMarketSignals(): Promise<MarketSignals> {
    if (getConfig().storage.provider === 'local') {
      return signalsFrom(mockTopPicks, mockMeta(20 * 60 * 60, 'recs')) // 20h of 24h → stale
    }
    const snap = await getCacheSnapshot<RunRecommendationsResponse | Recommendation[]>(
      analysisRealCacheKey('recs', DEFAULT_RECS_SCOPE),
    )
    if (!snap) return { signals: [], metadata: null }
    const recs = Array.isArray(snap.value) ? snap.value : (snap.value.recommendations ?? [])
    return signalsFrom(recs, { cachedAt: snap.cachedAt, expiresAt: snap.expiresAt })
  },
}
