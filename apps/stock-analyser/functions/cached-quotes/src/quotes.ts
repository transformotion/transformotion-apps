import type { CachedQuote } from '@transformotion/contracts/stock-analyser/types';

/**
 * Reduce raw SHARED `MARKET-DATA#{ticker}#{range}#{interval}` cache rows to one
 * latest quote per ticker. The same ticker appears under several sort keys (one
 * per range/interval), so we pick — per ticker — the DAILY-interval row if any
 * (so `dayChangePct` is a true day-over-day move), otherwise the most recently
 * cached row. price = latest close; dayChangePct = (latest − prev)/prev as a
 * FRACTION (the frontend renders ×100); asOf = the latest bar's date.
 */

export interface RawCacheRow {
  cacheKey: string;
  data: unknown;
  cachedAt?: number;
}

interface OhlcvPayload {
  dates?: unknown;
  closes?: unknown;
}

function parsePayload(data: unknown): OhlcvPayload | null {
  const obj = typeof data === 'string' ? safeJson(data) : data;
  return obj && typeof obj === 'object' ? (obj as OhlcvPayload) : null;
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function toIso(date: string): string {
  // Bars are dated 'YYYY-MM-DD'; normalise to an ISO datetime for `asOf`.
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? `${date}T00:00:00.000Z` : date;
}

export function computeCachedQuotes(rows: RawCacheRow[]): CachedQuote[] {
  // Choose the best row per ticker: prefer a daily interval, then higher cachedAt.
  const best = new Map<string, { row: RawCacheRow; isDaily: boolean; cachedAt: number }>();
  for (const row of rows) {
    const parts = row.cacheKey.split('#'); // ['MARKET-DATA', ticker, range, interval]
    if (parts[0] !== 'MARKET-DATA' || !parts[1]) continue;
    const ticker = parts[1];
    const isDaily = parts[3] === '1d';
    const cachedAt = row.cachedAt ?? 0;
    const cur = best.get(ticker);
    const better =
      !cur ||
      (isDaily && !cur.isDaily) ||
      (isDaily === cur.isDaily && cachedAt > cur.cachedAt);
    if (better) best.set(ticker, { row, isDaily, cachedAt });
  }

  const quotes: CachedQuote[] = [];
  for (const [ticker, { row }] of best) {
    const payload = parsePayload(row.data);
    const closes = Array.isArray(payload?.closes) ? (payload!.closes as unknown[]) : null;
    const dates = Array.isArray(payload?.dates) ? (payload!.dates as unknown[]) : null;
    if (!closes || closes.length < 2 || !dates || dates.length === 0) continue;
    const price = Number(closes[closes.length - 1]);
    const prev = Number(closes[closes.length - 2]);
    if (!Number.isFinite(price) || !Number.isFinite(prev) || prev === 0) continue;
    quotes.push({
      ticker,
      price,
      dayChangePct: (price - prev) / prev,
      asOf: toIso(String(dates[dates.length - 1])),
    });
  }

  // Best performers first (the featured tile picks the top mover anyway).
  return quotes.sort((a, b) => b.dayChangePct - a.dayChangePct);
}
