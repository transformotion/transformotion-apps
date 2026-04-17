# Data Contracts — apps/web

This document is the canonical reference for interface contracts between the UI layer and the data/API layers.
**v0 must read this file before doing any UI work that touches data.**

---

## Architecture Rule: Mock/Real Separation

The `NEXT_PUBLIC_USE_MOCK_DATA` environment variable controls whether the app uses real AWS backends or in-memory mock data.

**Critical rule for UI components:**
- Components NEVER check `useMockData` directly
- Components call service methods (e.g. `portfolioService.getHoldings()`) or hooks (e.g. `useClaude()`)
- The service/hook handles mock vs real internally
- This means the same component code runs in v0 preview (mock) and production (real AWS)

If a new UI feature needs new data, the pattern is:
1. Add the field to the relevant type
2. Add mock data for it in the service's `mockStore` or `mockClaudeCall`
3. The real implementation is wired separately (by Claude Code)

---

## Service Layer

### portfolioService — `lib/services/portfolio/portfolio-service.ts`

```typescript
portfolioService.getHoldings(): Promise<PortfolioHolding[]>
portfolioService.saveHoldings(holdings: PortfolioHolding[]): Promise<void>
portfolioService.enrichHoldings(
  tickers: string[],
  onResult: (ticker: string, result: StockAnalysisResult) => void,
  signal?: AbortSignal
): Promise<void>
```

`enrichHoldings` fires `onResult` progressively as each ticker completes (cache hits first, then Claude calls sequentially). Use this for any tab that needs per-ticker AI analysis.

### watchlistService — `lib/services/watchlist/watchlist-service.ts`

```typescript
watchlistService.getItems(): Promise<WatchlistItem[]>
watchlistService.saveItems(items: WatchlistItem[]): Promise<void>
```

---

## Types

### PortfolioHolding — `lib/services/portfolio/types.ts`

```typescript
interface PortfolioHolding {
  ticker:   string
  shares:   number
  avgCost:  number   // 0 for gifted holdings
  isGifted: boolean
  addedAt:  number   // unix ms
}
```

### StockAnalysisResult — `lib/services/portfolio/types.ts`

```typescript
interface StockAnalysisResult {
  ticker:        string
  company:       string
  sector:        string
  price:         number
  change:        number          // daily % change
  verdict:       'BUY' | 'SELL' | 'HOLD' | 'NEUTRAL'
  cyclePosition: number          // 0–100
  cycleStage:    'early' | 'mid' | 'late' | 'peak'
  summary?:      string
  cycleSummary?: string
  signals?:      Array<{ name: string; value: string; signal: string; label: string }>
  risks?:        string[]
  rsiDivergence?:  string        // 'none' | 'bullish' | 'bearish'
  macdMomentum?:   string        // 'strengthening' | 'weakening' | 'flat'
  volumeTrend?:    string        // 'confirming' | 'diverging' | 'neutral'
}
```

### WatchlistItem — `lib/services/watchlist/watchlist-service.ts`

```typescript
interface WatchlistItem {
  ticker:      string
  name:        string
  addedAt:     number    // unix ms
  addedPrice?: number    // price at time of adding (optional)
}
```

### EnrichedHolding — `lib/services/portfolio/types.ts`

```typescript
interface EnrichedHolding extends PortfolioHolding {
  analysis: StockAnalysisResult | null
}
```

---

## Claude Hook — `lib/hooks/use-claude.ts`

Used by tabs that call Claude directly (Market Analysis, Recommendations, ETFs, Metals, Analyser).

```typescript
const { callClaude, isLoading, error, abort } = useClaude<T>()

const result = await callClaude({
  prompt: string,
  systemPrompt?: string,
  webSearch?: boolean,
  maxTokens?: number,
  cacheKey?: string,      // e.g. 'MARKET#ASX', 'ANALYSIS#CBA.AX'
  forceRefresh?: boolean, // bypass cache read, still writes result
})
```

**Cache key naming convention:**
| Data type       | Key format              | TTL     |
|----------------|------------------------|---------|
| Market Analysis | `MARKET#${geography}`  | 24h     |
| Recommendations | `RECS#${market}`       | 24h     |
| ETFs            | `ETFS#${category}`     | 48h     |
| Metals          | `METALS#all`           | 2h      |
| Stock Analysis  | `ANALYSIS#${ticker}`   | 8h      |
| Market Cycle    | `CYCLE#${geography}`   | 8h      |

---

## Cache Service — `lib/services/cache/`

Components do NOT call the cache directly. The cache is used internally by:
- `useClaude` hook (for Claude results)
- `portfolioService.enrichHoldings` (per-ticker analysis)

In mock mode: in-memory `MemoryCacheService`
In production: `DynamoTTLCacheService` → `/analysis-cache` Lambda endpoint

---

## App Shell — Navigation and shared state

The `useNavigation()` hook (from `app-shell.tsx`) provides:

```typescript
const {
  watchlist,               // WatchlistItem[]
  addToWatchlist,          // (ticker: string, name?: string) => void
  removeFromWatchlist,     // (ticker: string) => void
  navigateToRecsWithSector, // (sector: string) => void
  getTabTextVisibility,    // (tab: string) => boolean
  setTabTextOverride,      // (tab: string, visible: boolean) => void
  showExplanatoryText,     // boolean — global default
  setTabCache,             // (tab: string, data: unknown) => void
  getTabCache,             // (tab: string) => unknown
} = useNavigation()
```

---

## Adding new data fields — handoff protocol

When v0 adds UI that requires new or changed data shapes, the PR description **must** include a `## Data Contract Changes` section listing:

1. **New/changed types** — which interface, which field, what type
2. **New service methods** — method signature, what it should return
3. **New cache keys** — key format and suggested TTL
4. **New mock data needed** — what `mockClaudeCall` or mock store needs to return

Claude Code will use this section to wire the real backend without having to reverse-engineer the UI intent.

**Example:**
```
## Data Contract Changes
- Added `priceTarget?: number` to `StockAnalysisResult` (optional, analyst 12m price target)
- Added `watchlistService.getEnrichedItems(): Promise<EnrichedWatchlistItem[]>` (not implemented — needs Claude wiring)
- New cache key: `WATCHLIST_ENRICHED#${ticker}` suggested TTL 8h
- Mock data: add `priceTarget: price * 1.15` to all stockData entries in mockClaudeCall
```
