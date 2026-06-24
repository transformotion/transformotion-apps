import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  DEFAULT_CACHE_FRESHNESS_POLICY,
  DEFAULT_CACHE_FRESHNESS_PRESETS,
  STOCK_ANALYSER_CACHE_TTL_SECONDS,
  deriveCacheFreshness,
  deriveCacheStatus,
  formatRelativeAge,
} from "@transformotion/contracts/stock-analyser/cache-freshness"

const repoRoot = process.cwd()
const source = (path: string) => readFileSync(join(repoRoot, path), "utf8")

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

  it("reclassifies existing cache metadata when the policy changes", () => {
    const cachedAt = 10_000
    const expiresAt = cachedAt + STOCK_ANALYSER_CACHE_TTL_SECONDS.market
    const now = cachedAt + Math.floor(STOCK_ANALYSER_CACHE_TTL_SECONDS.market * 0.6)

    expect(deriveCacheStatus({ cachedAt, expiresAt }, now, {
      freshUntilElapsedRatio: 0.25,
      staleFromElapsedRatio: 0.75,
      showOutdatedState: true,
    }).freshness).toBe("recent")

    expect(deriveCacheStatus({ cachedAt, expiresAt }, now, {
      freshUntilElapsedRatio: 0.1,
      staleFromElapsedRatio: 0.5,
      showOutdatedState: true,
    }).freshness).toBe("stale")
  })

  it("only shows outdated when expired data is intentionally classified that way", () => {
    const cachedAt = 1_000
    const expiresAt = cachedAt + STOCK_ANALYSER_CACHE_TTL_SECONDS.metals
    const now = expiresAt + 60

    expect(deriveCacheFreshness(
      { cachedAt, expiresAt, now },
      { ...DEFAULT_CACHE_FRESHNESS_POLICY, showOutdatedState: true },
    ).freshness).toBe("outdated")

    expect(deriveCacheFreshness(
      { cachedAt, expiresAt, now },
      { ...DEFAULT_CACHE_FRESHNESS_POLICY, showOutdatedState: false },
    ).freshness).toBe("stale")
  })
})

describe("Stock Analyser cache freshness source wiring", () => {
  it("renders computed cache status on all seven data surfaces", () => {
    const surfaces = [
      {
        path: "components/stock-analyser/tabs/market-analysis-tab.tsx",
        hook: 'useCacheStatus("market", cacheKey)',
        ageProp: "cacheStatus.lastUpdated",
      },
      {
        path: "components/stock-analyser/tabs/recommendations-tab.tsx",
        hook: 'useCacheStatus("recs", activeCacheKey)',
        ageProp: "cacheStatus.lastUpdated",
      },
      {
        path: "components/stock-analyser/tabs/analyser-tab.tsx",
        hook: 'useCacheStatus("analyser", activeTicker ? `ANALYSIS#${activeTicker}` : null)',
        ageProp: "cacheStatus.lastUpdated",
      },
      {
        path: "components/stock-analyser/tabs/etfs-tab.tsx",
        hook: 'useCacheStatus("etfs", cacheKey)',
        ageProp: "cacheStatus.cacheAge",
      },
      {
        path: "components/stock-analyser/tabs/metals-tab.tsx",
        hook: 'useCacheStatus("metals", "METALS")',
        ageProp: "cacheStatus.cacheAge",
      },
      {
        path: "components/stock-analyser/tabs/portfolio-tab.tsx",
        hook: 'useDerivedCacheStatus("portfolio", aggregateMetadata)',
        ageProp: "cacheStatus.lastUpdated",
      },
      {
        path: "components/stock-analyser/tabs/watchlist-tab.tsx",
        hook: 'useDerivedCacheStatus("watchlist", aggregateMetadata)',
        ageProp: "cacheStatus.lastUpdated",
      },
    ]

    for (const { path, hook, ageProp } of surfaces) {
      const text = source(path)
      expect(text).toContain(hook)
      expect(text).toContain("cacheStatus.freshness")
      expect(text).toContain(ageProp)
    }
  })

  it("keeps demo freshness strings and literal freshness props out of tab runtime code", () => {
    const tabFiles = [
      "components/stock-analyser/tabs/market-analysis-tab.tsx",
      "components/stock-analyser/tabs/recommendations-tab.tsx",
      "components/stock-analyser/tabs/analyser-tab.tsx",
      "components/stock-analyser/tabs/etfs-tab.tsx",
      "components/stock-analyser/tabs/metals-tab.tsx",
      "components/stock-analyser/tabs/portfolio-tab.tsx",
      "components/stock-analyser/tabs/watchlist-tab.tsx",
    ]

    for (const path of tabFiles) {
      const text = source(path)
      expect(text).not.toContain("Updated 8 minutes ago")
      expect(text).not.toContain("45 minutes ago")
      expect(text).not.toContain('cacheAge="')
      expect(text).not.toMatch(/freshness="(?:fresh|recent|stale|outdated)"/)
    }
  })

  it("updates badges only after cache hit or successful cache write metadata", () => {
    const useClaude = source("lib/hooks/use-claude.ts")
    expect(useClaude).toContain("onCacheMetadata?.({ cachedAt: cached.cachedAt, expiresAt: cached.expiresAt })")
    expect(useClaude).toContain("setCacheSnapshot(cacheKey, result).then(entry =>")
    expect(useClaude).toContain("onCacheMetadata?.({ cachedAt: entry.cachedAt, expiresAt: entry.expiresAt })")
    expect(useClaude).toContain("console.warn('[useClaude] cache write failed:', cacheKey, err)")

    const portfolio = source("lib/services/portfolio/portfolio-service.ts")
    expect(portfolio).toContain("onCacheMetadata?.(ticker, { cachedAt: cached.cachedAt, expiresAt: cached.expiresAt })")
    expect(portfolio).toContain("const entry = await setCacheSnapshot(`ANALYSIS#${ticker}`, normalisedResult)")
    expect(portfolio).toContain("onCacheMetadata?.(ticker, { cachedAt: entry.cachedAt, expiresAt: entry.expiresAt })")
    expect(portfolio).toContain("console.warn('[portfolio] cache write failed for', ticker, err)")
  })

  it("keeps Settings cache freshness admin controls aligned with the synced contract shape", () => {
    const settings = source("components/stock-analyser/tabs/settings-tab.tsx")

    expect(settings).toContain("userCanEditStockAnalyserAdmin(user)")
    expect(settings).toContain("siteAdmin === true")
    expect(settings).toContain('includes("stock-analyser")')
    expect(settings).toContain("Cache freshness thresholds are managed by site and Stock Analyser administrators.")
    expect(settings).toContain("isValidCacheFreshnessPolicy(draft)")
    expect(settings).toContain("Fresh must be below stale")
    expect(settings).toContain("stockAnalyserSettingsService.updateCacheFreshnessConfig({")
    expect(settings).toContain("activePolicy: policy")
    expect(settings).toContain("presets: presetsOverride")
    expect(settings).toContain("stockAnalyserSettingsService.resetCacheFreshnessConfig()")
    expect(settings).toContain("onClick={() => setDraft(active)}")
    expect(settings).toContain("presets.map((preset: CacheFreshnessPreset)")
    expect(settings).toContain("onClick={() => { setDraft(preset.policy); setSaved(false) }}")
    expect(settings).toContain("disabled={!isDirty || invalid || loading || saving}")
  })
})
