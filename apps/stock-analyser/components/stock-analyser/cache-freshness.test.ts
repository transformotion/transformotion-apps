import { describe, expect, it } from "vitest"
import {
  DEFAULT_CACHE_FRESHNESS_POLICY,
  DEFAULT_CACHE_FRESHNESS_PRESETS,
  STOCK_ANALYSER_CACHE_TTL_SECONDS,
  deriveCacheFreshness,
  formatRelativeAge,
} from "@transformotion/contracts/stock-analyser/cache-freshness"

describe("Stock Analyser cache freshness contracts", () => {
  it("uses the default 25 / 75 policy", () => {
    expect(DEFAULT_CACHE_FRESHNESS_POLICY).toEqual({
      freshUntilElapsedRatio: 0.25,
      staleFromElapsedRatio: 0.75,
      showOutdatedState: true,
    })
  })

  it("exposes conservative, balanced, and aggressive presets", () => {
    expect(DEFAULT_CACHE_FRESHNESS_PRESETS.map(p => p.id)).toEqual([
      "conservative",
      "balanced",
      "aggressive",
    ])
  })

  it("classifies 24h TTL entries across fresh, stale, and outdated bands", () => {
    const cachedAt = 1_000
    const expiresAt = cachedAt + STOCK_ANALYSER_CACHE_TTL_SECONDS.market

    expect(deriveCacheFreshness({ cachedAt, expiresAt, now: cachedAt + 60 }).freshness).toBe("fresh")
    expect(deriveCacheFreshness({ cachedAt, expiresAt, now: cachedAt + 20 * 60 * 60 }).freshness).toBe("stale")
    expect(deriveCacheFreshness({ cachedAt, expiresAt, now: expiresAt + 1 }).freshness).toBe("outdated")
  })

  it("classifies 2h and 48h TTL entries", () => {
    const cachedAt = 2_000
    const metalsExpiry = cachedAt + STOCK_ANALYSER_CACHE_TTL_SECONDS.metals
    const etfsExpiry = cachedAt + STOCK_ANALYSER_CACHE_TTL_SECONDS.etfs

    expect(deriveCacheFreshness({ cachedAt, expiresAt: metalsExpiry, now: cachedAt + 45 * 60 }).freshness).toBe("recent")
    expect(deriveCacheFreshness({ cachedAt, expiresAt: etfsExpiry, now: cachedAt + 40 * 60 * 60 }).freshness).toBe("stale")
  })

  it("uses 24h TTL assumptions for portfolio and watchlist freshness", () => {
    expect(STOCK_ANALYSER_CACHE_TTL_SECONDS.portfolio).toBe(24 * 60 * 60)
    expect(STOCK_ANALYSER_CACHE_TTL_SECONDS.watchlist).toBe(24 * 60 * 60)
  })

  it("formats relative age from cachedAt", () => {
    expect(formatRelativeAge(1_000, 1_030)).toBe("just now")
    expect(formatRelativeAge(1_000, 1_600)).toBe("10 minutes ago")
    expect(formatRelativeAge(1_000, 8_200)).toBe("2 hours ago")
  })
})
