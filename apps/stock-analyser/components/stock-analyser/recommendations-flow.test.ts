import { describe, expect, it } from "vitest"
import {
  createMarketSectorNavigationPayload,
  createRecommendationsNavigationState,
  getIncomingRecommendationUniverse,
  getInitialRecommendationUniverse,
  isLiveSearchMode,
  isMarketOriginatedUniverseUnavailable,
  shouldDisableRecommendationsRun,
} from "./recommendations-flow"

describe("Stock Analyser Market to Recommendations flow", () => {
  it("passes sector, NASDAQ universe, and Global provenance for Global Technology", () => {
    const sector = {
      sector: "Technology",
      bestExchange: "NASDAQ",
      recommendationUniverse: "NASDAQ" as const,
      sourceRegion: "global" as const,
    }

    const payload = createMarketSectorNavigationPayload(sector, "global")
    const navigationState = createRecommendationsNavigationState("market", payload)

    expect(payload).toEqual({
      sector: "Technology",
      recommendationUniverse: "NASDAQ",
      sourceRegion: "global",
    })
    expect(navigationState).toMatchObject({
      activeTab: "recs",
      sectorFilter: "Technology",
      recsUniverse: "NASDAQ",
      recsSourceRegion: "global",
      recsSource: "market",
    })
  })

  it("normalises a Global Technology NYSE response to Dow instead of treating NYSE as geography", () => {
    const sector = {
      sector: "Technology",
      bestExchange: "NYSE",
    }

    expect(createMarketSectorNavigationPayload(sector, "global")).toMatchObject({
      sector: "Technology",
      recommendationUniverse: "Dow",
      sourceRegion: "global",
    })
  })

  it("initializes Recommendations from incoming NASDAQ for market-originated navigation", () => {
    const incomingUniverse = getIncomingRecommendationUniverse("NASDAQ")

    expect(incomingUniverse).toBe("NASDAQ")
    expect(getInitialRecommendationUniverse(incomingUniverse)).toBe("NASDAQ")
    expect(isMarketOriginatedUniverseUnavailable("Technology", incomingUniverse)).toBe(false)
    expect(shouldDisableRecommendationsRun(false, false)).toBe(false)
  })

  it("does not silently run ASX when market-originated universe is missing", () => {
    const incomingUniverse = getIncomingRecommendationUniverse(null)
    const universeUnavailable = isMarketOriginatedUniverseUnavailable("Technology", incomingUniverse)

    expect(getInitialRecommendationUniverse(incomingUniverse)).toBe("ASX")
    expect(universeUnavailable).toBe(true)
    expect(shouldDisableRecommendationsRun(universeUnavailable, false)).toBe(true)
    expect(shouldDisableRecommendationsRun(universeUnavailable, true)).toBe(false)
  })

  it("keeps direct Recommendations entry on ASX", () => {
    const incomingUniverse = getIncomingRecommendationUniverse(null)

    expect(isMarketOriginatedUniverseUnavailable(null, incomingUniverse)).toBe(false)
    expect(getInitialRecommendationUniverse(incomingUniverse)).toBe("ASX")
    expect(shouldDisableRecommendationsRun(false, false)).toBe(false)
  })

  it("defaults new per-run searches from the app default without mutating it", () => {
    const appDefault = "live"
    let perRunIsLive = isLiveSearchMode(appDefault)

    expect(perRunIsLive).toBe(true)

    perRunIsLive = !perRunIsLive

    expect(perRunIsLive).toBe(false)
    expect(appDefault).toBe("live")
    expect(isLiveSearchMode("fast")).toBe(false)
  })
})
