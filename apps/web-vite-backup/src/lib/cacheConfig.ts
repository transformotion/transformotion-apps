/**
 * Standardised cache key constructors, freshness thresholds, and helpers.
 * All tabs share these definitions so cache keys and staleness rules are
 * consistent across the app.
 */

// ── Cache key constructors ────────────────────────────────────────────────────

export const CK = {
  market:   (geo: string)                                        => `MARKET#${geo}`,
  recs:     (market: string, mode: string, sector?: string | null) =>
    `RECS#${market}#${mode}${sector ? `#${sector}` : ''}`,
  etfs:     (market: string)  => `ETFS#${market}`,
  metals:   ()                => 'METALS#spot',
  analysis: (ticker: string)  => `ANALYSIS#${ticker.toUpperCase()}`,
  cycle:    (ticker: string)  => `CYCLE#${ticker.toUpperCase()}`,
};

// ── Fresh threshold (minutes) per cache type ──────────────────────────────────

export const CACHE_FRESH_MINUTES: Record<string, number> = {
  markets:          24 * 60,   // 24 h  — macro conditions change slowly
  recommendations:  24 * 60,   // 24 h
  etfs:             48 * 60,   // 48 h  — ETF fundamentals change slowly
  metals:            2 * 60,   //  2 h  — spot prices move frequently
  analyser:         24 * 60,   // 24 h
  cycle:            24 * 60,   // 24 h
};

// ── Freshness status ──────────────────────────────────────────────────────────

export type FreshnessLabel = 'fresh' | 'recent' | 'stale' | 'outdated';

/**
 * Returns a freshness label based on the age of a cached entry relative to
 * the type's threshold.
 *   fresh    < 1× threshold  (green)
 *   recent   < 2× threshold  (amber)
 *   stale    < 4× threshold  (orange)
 *   outdated ≥ 4× threshold  (red)
 */
export function getCacheFreshness(
  cachedAt: string | null | undefined,
  type: string,
): FreshnessLabel | null {
  if (!cachedAt) return null;
  const freshMin = CACHE_FRESH_MINUTES[type] ?? 480;
  const ageMin   = (Date.now() - new Date(cachedAt).getTime()) / 60_000;
  if (ageMin < freshMin)       return 'fresh';
  if (ageMin < freshMin * 2)   return 'recent';
  if (ageMin < freshMin * 4)   return 'stale';
  return 'outdated';
}

/** True when cached data is young enough to serve without re-fetching. */
export function isCacheFresh(
  cachedAt: string | null | undefined,
  type: string,
): boolean {
  if (!cachedAt) return false;
  const freshMin = CACHE_FRESH_MINUTES[type] ?? 480;
  const ageMin   = (Date.now() - new Date(cachedAt).getTime()) / 60_000;
  return ageMin < freshMin;
}

/** Human-readable age string (e.g. "3h ago", "just now"). */
export function formatCacheAge(cachedAt: string): string {
  const ageMs  = Date.now() - new Date(cachedAt).getTime();
  const ageMin = ageMs / 60_000;
  if (ageMin < 1)     return 'just now';
  if (ageMin < 60)    return `${Math.floor(ageMin)}m ago`;
  const h = ageMin / 60;
  if (h < 24)         return `${Math.floor(h)}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
