import type { StockAnalyserCacheSurface } from "@transformotion/contracts/stock-analyser/cache-freshness"

/**
 * Map a v0 scope (surface + scopeKey) to the REAL server cache key the tabs and
 * the #584 warm job use. Pure + frontend-seam-free so it is unit-testable.
 * Market's scope resolves to the SAME `MARKET#{region}` the daily job warms, so
 * the warm is finally consumed on Run.
 *   market → MARKET#{region} · etfs → ETF#{market} · analyser → ANALYSIS#{ticker}
 *   recs → RECS#{universe|mode|sector?} · metals → METALS (constant)
 */
const REAL_KEY_PREFIX: Partial<Record<StockAnalyserCacheSurface, string>> = {
  market: "MARKET",
  etfs: "ETF",
  analyser: "ANALYSIS",
  recs: "RECS",
}

export function analysisRealCacheKey(surface: StockAnalyserCacheSurface, scopeKey: string): string {
  if (surface === "metals") return "METALS"
  const prefix = REAL_KEY_PREFIX[surface]
  return prefix ? `${prefix}#${scopeKey}` : `${surface}#${scopeKey}`
}
