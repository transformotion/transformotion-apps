import {
  ANALYSIS_REGIONS,
  RECOMMENDATION_UNIVERSES,
  REGION_TO_RECOMMENDATION_UNIVERSES,
  type AnalysisRegion,
  type RecommendationUniverse,
} from "@transformotion/contracts/stock-analyser/types"
// REGION_LABELS is owned by the shared market-analysis-signals module (the single
// source the prompt + the cache-warming job also use); re-exported here for the UI.
// Relative (not `@/`) so the vitest graph — which has no `@/` alias — resolves it.
import { REGION_LABELS } from "../../lib/analysis/market-analysis-signals"

// Universe-resolution moved to the backend-safe lib so the #595 warm job resolves a
// sector's universe IDENTICALLY to the UI (the warmed RECS# key must match a live read).
export {
  isRecommendationUniverse,
  normaliseUniverse,
  defaultUniverseForRegion,
  resolveSectorUniverse,
} from "../../lib/analysis/sector-universe"

export {
  ANALYSIS_REGIONS,
  RECOMMENDATION_UNIVERSES,
  REGION_TO_RECOMMENDATION_UNIVERSES,
  REGION_LABELS,
  type AnalysisRegion,
  type RecommendationUniverse,
}

const REGION_LABEL_TO_REGION = Object.fromEntries(
  (Object.entries(REGION_LABELS) as [AnalysisRegion, string][]).map(([region, label]) => [label, region]),
) as Record<string, AnalysisRegion>

export function regionFromLabel(label: string): AnalysisRegion {
  return REGION_LABEL_TO_REGION[label] ?? "global"
}
