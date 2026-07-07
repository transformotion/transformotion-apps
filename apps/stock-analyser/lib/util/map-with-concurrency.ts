/**
 * Bounded-concurrency worker pool — the SINGLE mechanism shared by the frontend
 * enrichment path (`portfolioService.enrichHoldings`) and the backend daily warm
 * job (`notification-engine` P&W `ANALYSIS#` warm). Both fan out per-ticker model
 * work; running them unbounded (`Promise.all(tickers.map(...))`) bursts one Lambda
 * invocation per ticker and can saturate the account-level Lambda Concurrent
 * Executions quota, which surfaces to the user as intermittent 500s. This caps the
 * in-flight count to `limit` while still processing every item.
 *
 * The limit is env-driven per runtime (see `resolveConcurrencyLimit`):
 *   - frontend: `NEXT_PUBLIC_ENRICH_CONCURRENCY` (via `getConfig().concurrency.enrich`)
 *   - warm job: `WARM_CONCURRENCY`
 * Both default to 4 (dev) and are raised per stage (e.g. 10 for prod).
 */

/** Lower bound — always run at least one worker. */
const MIN_LIMIT = 1
/** Upper bound — a sanity ceiling so a mis-set env var can't burst the account. */
const MAX_LIMIT = 32

/**
 * Parse an env-supplied concurrency limit into a safe integer.
 * Missing / non-numeric / out-of-range values fall back to `fallback` (itself
 * clamped). Result is always an integer in `[MIN_LIMIT, MAX_LIMIT]`.
 */
export function resolveConcurrencyLimit(raw: string | undefined, fallback: number): number {
  const clamp = (n: number) => Math.max(MIN_LIMIT, Math.min(MAX_LIMIT, Math.floor(n)))
  const safeFallback = Number.isFinite(fallback) && fallback >= MIN_LIMIT ? clamp(fallback) : MIN_LIMIT
  if (raw === undefined || raw.trim() === '') return safeFallback
  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed < MIN_LIMIT) return safeFallback
  return clamp(parsed)
}

/**
 * Run `fn` over `items` with at most `limit` invocations in flight at a time,
 * returning the results in input order. As each worker finishes an item it pulls
 * the next, so the pool stays full until the queue drains (wall-clock ≈ the
 * slowest single-item chain × ceil(n / limit), not the sum of all items).
 *
 * `fn` is responsible for its own error handling if per-item isolation is wanted:
 * a rejection from `fn` rejects the returned promise (fail-fast). Both current
 * callers wrap their body in try/catch so one ticker's failure never aborts the
 * batch.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const n = items.length
  const results = new Array<R>(n)
  if (n === 0) return results

  const workers = Math.max(MIN_LIMIT, Math.min(Math.floor(limit) || MIN_LIMIT, n))
  let cursor = 0

  async function worker(): Promise<void> {
    while (true) {
      const index = cursor++
      if (index >= n) return
      results[index] = await fn(items[index], index)
    }
  }

  await Promise.all(Array.from({ length: workers }, () => worker()))
  return results
}
