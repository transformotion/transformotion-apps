import {
  ANALYSIS_REGIONS,
  RECOMMENDATION_UNIVERSES,
  REGION_TO_RECOMMENDATION_UNIVERSES,
  type AnalysisRegion,
  type RecommendationUniverse,
} from "@transformotion/contracts/stock-analyser/types"

export {
  ANALYSIS_REGIONS,
  RECOMMENDATION_UNIVERSES,
  REGION_TO_RECOMMENDATION_UNIVERSES,
  type AnalysisRegion,
  type RecommendationUniverse,
}

export const REGION_LABELS: Record<AnalysisRegion, string> = {
  global: "Global",
  australia: "Australia",
  us: "US",
  uk: "UK",
}

const REGION_LABEL_TO_REGION = Object.fromEntries(
  (Object.entries(REGION_LABELS) as [AnalysisRegion, string][]).map(([region, label]) => [label, region]),
) as Record<string, AnalysisRegion>

export function regionFromLabel(label: string): AnalysisRegion {
  return REGION_LABEL_TO_REGION[label] ?? "global"
}

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
