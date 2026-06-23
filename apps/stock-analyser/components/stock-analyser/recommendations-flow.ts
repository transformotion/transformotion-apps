import type {
  AnalysisRegion,
  RecommendationsNavigationPayload,
  RecommendationUniverse,
  StockAnalyserSearchMode,
} from "@transformotion/contracts/stock-analyser/types"
import { isRecommendationUniverse, resolveSectorUniverse } from "./markets"
import type { TabId } from "./app-shell"

export type RecommendationsNavigationContext = Omit<RecommendationsNavigationPayload, "recommendationUniverse"> & {
  recommendationUniverse: RecommendationsNavigationPayload["recommendationUniverse"] | null
}

type MarketSectorNavigationInput = {
  sector: string
  bestExchange: string
  recommendationUniverse?: RecommendationUniverse
  sourceRegion?: AnalysisRegion
}

export function createMarketSectorNavigationPayload(
  sector: MarketSectorNavigationInput,
  currentRegion: AnalysisRegion,
): RecommendationsNavigationContext {
  const sourceRegion = sector.sourceRegion ?? currentRegion
  const recommendationUniverse = sector.recommendationUniverse
    ?? resolveSectorUniverse(sector.bestExchange, sourceRegion)

  return {
    sector: sector.sector,
    recommendationUniverse,
    sourceRegion,
  }
}

export function createRecommendationsNavigationState(
  activeTab: TabId,
  payload: RecommendationsNavigationContext,
) {
  return {
    activeTab: "recs" as const,
    sectorFilter: payload.sector,
    recsUniverse: payload.recommendationUniverse,
    recsSourceRegion: payload.sourceRegion,
    recsSource: activeTab,
  }
}

export function getIncomingRecommendationUniverse(
  value: RecommendationUniverse | null,
): RecommendationUniverse | null {
  return isRecommendationUniverse(value) ? value : null
}

export function getInitialRecommendationUniverse(
  value: RecommendationUniverse | null,
): RecommendationUniverse {
  return getIncomingRecommendationUniverse(value) ?? "ASX"
}

export function isMarketOriginatedUniverseUnavailable(
  sectorFilter: string | null,
  incomingUniverse: RecommendationUniverse | null,
): boolean {
  return !!sectorFilter && !incomingUniverse
}

export function shouldDisableRecommendationsRun(
  universeUnavailable: boolean,
  universeTouched: boolean,
): boolean {
  return universeUnavailable && !universeTouched
}

export function isLiveSearchMode(mode: StockAnalyserSearchMode): boolean {
  return mode === "live"
}
