/**
 * M21 — Stock Analyser portfolio valuation (pure client-side aggregation).
 *
 * Mirrors the budget-domain pattern: components stay thin and delegate the
 * math here. There is NO new endpoint — valuation is computed over the holdings
 * the portfolio service already returns, overlaid with the existing quote/OHLCV
 * enrichment (price + day-change). The same math previously lived inline in
 * portfolio-tab.tsx (total value / cost / P&L); it is extracted here so the Home
 * dashboard and the Portfolio tab share one implementation.
 */

export interface ValuationHolding {
  shares: number;
  avgCost: number;
  /** Gifted holdings contribute 0 cost basis (matches portfolio-tab). */
  isGifted?: boolean;
  /** Current price per share; null/undefined when the holding is unpriced. */
  price?: number | null;
  /** Day change % vs previous close; null when unknown. */
  dayChangePct?: number | null;
}

export interface PortfolioValuation {
  /** Σ shares × price. */
  value: number;
  /** Σ (isGifted ? 0 : shares × avgCost). */
  cost: number;
  /** value − cost. */
  totalReturn: number;
  /** totalReturn / cost × 100 (0 when cost is 0). */
  totalReturnPct: number;
  /** Σ shares × (price − prevClose) over priced holdings with a known day change. */
  dayGain: number;
  /** dayGain / previous-day value × 100 (0 when unknown). */
  dayGainPct: number;
  pricedCount: number;
  holdingsCount: number;
}

export function valuePortfolio(holdings: ValuationHolding[]): PortfolioValuation {
  let value = 0;
  let cost = 0;
  let dayGain = 0;
  let prevValue = 0;
  let pricedCount = 0;

  for (const h of holdings) {
    const price = h.price ?? 0;
    const marketValue = h.shares * price;
    value += marketValue;
    cost += h.isGifted ? 0 : h.shares * h.avgCost;
    if (h.price != null) pricedCount++;
    if (h.price != null && h.dayChangePct != null && 1 + h.dayChangePct / 100 !== 0) {
      const prevClose = price / (1 + h.dayChangePct / 100);
      const prevMarketValue = h.shares * prevClose;
      dayGain += marketValue - prevMarketValue;
      prevValue += prevMarketValue;
    }
  }

  const totalReturn = value - cost;
  return {
    value,
    cost,
    totalReturn,
    totalReturnPct: cost > 0 ? (totalReturn / cost) * 100 : 0,
    dayGain,
    dayGainPct: prevValue > 0 ? (dayGain / prevValue) * 100 : 0,
    pricedCount,
    holdingsCount: holdings.length,
  };
}

export interface QuoteLike {
  dayChangePct?: number | null;
}

/** Aggregate watchlist P/L% = mean day-change across quotes with a known change. */
export function watchlistPnl(quotes: QuoteLike[]): { pct: number; count: number } {
  const valid = quotes.filter((q): q is { dayChangePct: number } => q.dayChangePct != null);
  const pct = valid.length ? valid.reduce((s, q) => s + q.dayChangePct, 0) / valid.length : 0;
  return { pct, count: valid.length };
}

export interface FeaturedCandidate {
  ticker: string;
  dayChangePct: number;
}

/** The featured symbol = the largest day-change mover in the cached quotes. */
export function pickFeatured<T extends FeaturedCandidate>(quotes: T[]): T | null {
  if (!quotes.length) return null;
  return [...quotes].sort((a, b) => b.dayChangePct - a.dayChangePct)[0];
}
