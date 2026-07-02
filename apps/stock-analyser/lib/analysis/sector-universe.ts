import {
  RECOMMENDATION_UNIVERSES,
  REGION_TO_RECOMMENDATION_UNIVERSES,
  type AnalysisRegion,
  type RecommendationUniverse,
} from "@transformotion/contracts/stock-analyser/types"

/**
 * Sector → recommendation-universe resolution. Pure (contracts only, no React/DOM),
 * so BOTH the UI (`components/stock-analyser/markets.ts` re-exports these) and the
 * server-side warm job (#595 smart-warming) resolve a sector's universe identically —
 * the warmed `RECS#{universe|...}` key MUST match what a live tab reads, or the warm
 * cache-misses.
 */

export function isRecommendationUniverse(value: unknown): value is RecommendationUniverse {
  return typeof value === "string" && (RECOMMENDATION_UNIVERSES as readonly string[]).includes(value)
}

const UNIVERSE_ALIASES: Record<string, RecommendationUniverse> = {
  ASX: "ASX",
  NASDAQ: "NASDAQ",
  DOW: "Dow",
  "DOW JONES": "Dow",
  DJIA: "Dow",
  "S&P 500": "Dow",
  SP500: "Dow",
  NYSE: "Dow",
  FTSE: "FTSE",
  "FTSE 100": "FTSE",
  LSE: "FTSE",
}

export function normaliseUniverse(
  raw: string | null | undefined,
  region: AnalysisRegion,
): RecommendationUniverse | null {
  if (!raw) return null
  const candidates: readonly RecommendationUniverse[] = REGION_TO_RECOMMENDATION_UNIVERSES[region]
  const direct = isRecommendationUniverse(raw) ? raw : null
  const mapped = direct ?? UNIVERSE_ALIASES[raw.trim().toUpperCase()] ?? null
  return mapped && candidates.includes(mapped) ? mapped : null
}

export function defaultUniverseForRegion(region: AnalysisRegion): RecommendationUniverse {
  return REGION_TO_RECOMMENDATION_UNIVERSES[region][0]
}

export function resolveSectorUniverse(
  rawExchange: string | null | undefined,
  region: AnalysisRegion,
): RecommendationUniverse {
  return normaliseUniverse(rawExchange, region) ?? defaultUniverseForRegion(region)
}
