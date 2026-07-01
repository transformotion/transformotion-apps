import { isCacheExpired } from "@transformotion/contracts/stock-analyser/cache-freshness"

/**
 * #stale-view: decide whether the server cache holds a result FRESHER than the one
 * we started a fetch from. Used to reconcile the view when the async WSS completion
 * fails (e.g. a socket close racing `job_complete`) even though a concurrent/just-
 * finished run wrote a newer entry — we serve that instead of stranding stale data.
 *
 * Kept in its own module (no app-shell / React imports) so it is unit-testable in
 * isolation.
 */
export function isFresherCacheEntry(
  before: { cachedAt: number } | null,
  after: { cachedAt: number; expiresAt: number } | null,
): after is { cachedAt: number; expiresAt: number } {
  return after != null && after.cachedAt > (before?.cachedAt ?? 0) && !isCacheExpired(after)
}
