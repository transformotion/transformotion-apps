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

  it("classifies 24h and 48h TTL entries", () => {
    // metals TTL is 24h (b8 #80 raised it from 2h); etfs TTL is 48h. Classify each
    // against the default 25/75 policy on its own TTL.
    const cachedAt = 2_000
    const metalsExpiry = cachedAt + STOCK_ANALYSER_CACHE_TTL_SECONDS.metals
    const etfsExpiry = cachedAt + STOCK_ANALYSER_CACHE_TTL_SECONDS.etfs

    // metals @24h: 10h elapsed ≈ 42% → recent (25–75% band).
    expect(deriveCacheFreshness({ cachedAt, expiresAt: metalsExpiry, now: cachedAt + 10 * 60 * 60 }).freshness).toBe("recent")
    // etfs @48h: 40h elapsed ≈ 83% → stale (75–100% band).
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
    // The five AI tabs are unified on the cache-first `useScopedAnalysis` hook
    // (#consume): they render `analysis.status.*` (the hook derives it via
    // useCacheStatus internally). Portfolio/Watchlist keep useDerivedCacheStatus.
    const surfaces = [
      {
        path: "components/stock-analyser/tabs/market-analysis-tab.tsx",
        hook: "useScopedAnalysis<MarketAnalysisResult>",
        freshnessProp: "analysis.status.freshness",
        ageProp: "analysis.status.lastUpdated",
      },
      {
        path: "components/stock-analyser/tabs/recommendations-tab.tsx",
        hook: "useScopedAnalysis<Recommendation[]>",
        freshnessProp: "analysis.status.freshness",
        ageProp: "analysis.status.lastUpdated",
      },
      {
        path: "components/stock-analyser/tabs/analyser-tab.tsx",
        hook: "useScopedAnalysis<AnalysisResult>",
        freshnessProp: "analysis.status.freshness",
        ageProp: "analysis.status.lastUpdated",
      },
      {
        path: "components/stock-analyser/tabs/etfs-tab.tsx",
        hook: "useScopedAnalysis<Etf[]>",
        freshnessProp: "analysis.status.freshness",
        ageProp: "analysis.status.lastUpdated",
      },
      {
        path: "components/stock-analyser/tabs/metals-tab.tsx",
        hook: "useScopedAnalysis<Metal[]>",
        freshnessProp: "analysis.status.freshness",
        ageProp: "analysis.status.lastUpdated",
      },
      {
        path: "components/stock-analyser/tabs/portfolio-tab.tsx",
        hook: 'useDerivedCacheStatus("portfolio", aggregateMetadata)',
        freshnessProp: "cacheStatus.freshness",
        ageProp: "cacheStatus.lastUpdated",
      },
      {
        path: "components/stock-analyser/tabs/watchlist-tab.tsx",
        hook: 'useDerivedCacheStatus("watchlist", aggregateMetadata)',
        freshnessProp: "cacheStatus.freshness",
        ageProp: "cacheStatus.lastUpdated",
      },
    ]

    for (const { path, hook, freshnessProp, ageProp } of surfaces) {
      const text = source(path)
      expect(text).toContain(hook)
      expect(text).toContain(freshnessProp)
      expect(text).toContain(ageProp)
    }

    // The shared hook itself derives status from the real cache via useCacheStatus.
    const hookSrc = source("lib/hooks/use-scoped-analysis.ts")
    expect(hookSrc).toContain("useCacheStatus(surface, realKey)")
    expect(hookSrc).toContain("cacheStatus.freshness")
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
    expect(settings).toContain("isValidCacheFreshnessPolicy(draft)")
    expect(settings).toContain("Fresh must be below stale")
    expect(settings).toContain("stockAnalyserSettingsService.updateCacheFreshnessConfig({")
    expect(settings).toContain("activePolicy: policy")
    expect(settings).toContain("presets: presetsOverride")
    expect(settings).toContain("stockAnalyserSettingsService.resetCacheFreshnessConfig()")
    expect(settings).toContain("presets.map((preset: CacheFreshnessPreset)")
    expect(settings).toContain("Cache freshness thresholds are managed by site and app administrators.")
    expect(settings).toContain("disabled={!isDirty || invalid || loading || saving}")
  })

  it("matches the v0 cache freshness card visual contract", () => {
    const settings = source("components/stock-analyser/tabs/settings-tab.tsx")

    expect(settings).toContain("<Gauge className=\"size-5 text-primary\" />")
    expect(settings).toContain("font-display text-base")
    expect(settings).toContain(
      "Configure when cached results are labelled Fresh, Recent, or Stale across every analysis view. These thresholds affect badge labels only — not cache expiry or refresh.",
    )
    expect(settings).toContain("Past expiry shows as")
    expect(settings).toContain("Outdated")
    expect(settings).toContain("border-primary/40 bg-primary/10 text-primary")
    expect(settings).toContain("Save current as preset")
    expect(settings).toContain("<Slider")
    expect(settings).toContain("value={[freshPct, stalePct]}")
    expect(settings).toContain("aria-label=\"Freshness thresholds\"")
    expect(settings).toContain("Fresh &lt;")
    expect(settings).toContain("Stale ≥")
    expect(settings).toContain("Show “Outdated” state")
    expect(settings).toContain("Past-expiry data gets a distinct Outdated badge")
    expect(settings).toContain("Reset to defaults")
    expect(settings).toContain("Save policy")
    expect(settings).not.toContain('type="number"')
    expect(settings).not.toContain(">Cancel<")
  })
})
