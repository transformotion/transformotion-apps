import type { OhlcvDataResponse } from '@transformotion/api-client'

/**
 * Current price + daily change %, derived from a REAL OHLCV series (latest and
 * previous close). Price comes from market data — never from the AI, which has
 * no real-time prices and returns null/unreliable values in `live`. Returns
 * nulls when the series is unavailable so callers degrade gracefully.
 */
export function latestPriceFromOhlcv(
  ohlcv: OhlcvDataResponse | null | undefined,
): { price: number | null; change: number | null } {
  const closes = ohlcv?.closes
  if (!closes || closes.length === 0) return { price: null, change: null }
  const price = closes[closes.length - 1] ?? null
  const prev = closes.length >= 2 ? (closes[closes.length - 2] ?? null) : null
  const change =
    price !== null && prev !== null && prev !== 0 ? ((price - prev) / prev) * 100 : null
  return { price, change }
}
