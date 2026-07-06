import type { AccountId, ISODateTime, JsonValue } from '../_shared/api';
import type { AiAsyncStartResponse, AiProxyRequest, AiTextResponse } from '../_shared/ai-runtime';

export type StockAnalyserContractVersion = 'm15.2.0';
export type StockAnalyserTab = 'market' | 'recs' | 'etfs' | 'metals' | 'analyser' | 'portfolio' | 'watchlist' | 'settings';
export type MarketDataSource = 'cache' | 'live';
/**
 * App default for the per-search Fast/Live mode toggle.
 * 'live' performs fresh AI analysis (web search on); 'fast' favours cached results.
 */
export type StockAnalyserSearchMode = 'live' | 'fast';

/**
 * Region/universe model (canonical).
 *
 * Two deliberately separate concepts that must NOT be used interchangeably:
 *  - `AnalysisRegion`: the geography the Market Analysis surface analyses.
 *    It is provenance only and is never consumed as a search universe.
 *  - `RecommendationUniverse`: the exchange/listing/index universe the
 *    Recommendations surface searches.
 *
 * A Market Analysis region maps to one or more supported recommendation
 * universes via `REGION_TO_RECOMMENDATION_UNIVERSES`. App-level display labels
 * and model-string normalisation are projections layered on top of these
 * canonical values (see components/stock-analyser/markets.ts).
 */
export type AnalysisRegion = 'global' | 'australia' | 'us' | 'uk';

/**
 * Universes the Recommendations flow supports end-to-end. Do not extend
 * (e.g. NYSE/LSE/TSX/AMEX) unless Recommendations supports them end-to-end.
 */
export type RecommendationUniverse = 'ASX' | 'NASDAQ' | 'Dow' | 'FTSE';

export const ANALYSIS_REGIONS = ['global', 'australia', 'us', 'uk'] as const satisfies readonly AnalysisRegion[];
export const RECOMMENDATION_UNIVERSES = ['ASX', 'NASDAQ', 'Dow', 'FTSE'] as const satisfies readonly RecommendationUniverse[];

/** Region -> recommendation universes that region can surface picks from. */
export const REGION_TO_RECOMMENDATION_UNIVERSES = {
  global: ['ASX', 'NASDAQ', 'Dow', 'FTSE'],
  australia: ['ASX'],
  us: ['NASDAQ', 'Dow'],
  uk: ['FTSE'],
} as const satisfies Record<AnalysisRegion, readonly RecommendationUniverse[]>;

/**
 * A Market Analysis sector result that carries a structured, supported
 * recommendation universe (resolved within `sourceRegion`) so navigation into
 * Recommendations is exchange/universe-typed rather than geography-typed.
 * `bestExchange` is the raw model-provided string and may be unsupported;
 * `recommendationUniverse` is the normalised, valid universe.
 */
export interface MarketAnalysisSectorResult {
  sector: string;
  bestExchange: string;
  recommendationUniverse: RecommendationUniverse;
  sourceRegion: AnalysisRegion;
}

/**
 * Payload carried when navigating Market Analysis -> Recommendations from a
 * sector card. `recommendationUniverse` MUST be a `RecommendationUniverse`,
 * never an `AnalysisRegion`; `sourceRegion` is provenance only.
 */
export interface RecommendationsNavigationPayload {
  sector: string;
  recommendationUniverse: RecommendationUniverse;
  sourceRegion: AnalysisRegion;
}
export type PriceRange = '1mo' | '3mo' | '6mo' | '1y' | '5y' | 'max';
export type PriceInterval = '1d' | '1wk' | '1mo';
export type CycleStage = 'early' | 'mid' | 'late' | 'peak';
export type RsiDivergence = 'none' | 'bullish' | 'bearish';
export type MacdMomentum = 'strengthening' | 'weakening' | 'flat';
export type VolumeTrend = 'confirming' | 'diverging' | 'neutral';

export interface PortfolioHolding {
  ticker: string;
  shares: number;
  avgCost: number;
  isGifted: boolean;
  addedAt: number;
}

export interface WatchlistItem {
  ticker: string;
  name: string;
  addedAt: number;
  addedPrice?: number;
}

export interface AnalysisCacheEntry<T = JsonValue> {
  data: T;
  cachedAt: number;
  expiresAt: number;
  dataType?: string;
  mode?: string;
}

/**
 * M21 — a single ticker's latest cached quote, derived from the SHARED
 * MARKET-DATA cache (the most recent point per ticker). Enumerated read-only:
 * the producing route queries the SHARED partition (`SK begins_with
 * MARKET-DATA#`) and NEVER triggers a fetch or warm. An empty cache yields an
 * empty list (a valid, supported state — not an error).
 * See spec/stock-analyser/behaviour.md § "Cached quotes".
 */
export interface CachedQuote {
  ticker: string;
  price: number;
  dayChangePct: number;
  asOf: ISODateTime;
}

export interface CachedQuotesResponse {
  quotes: CachedQuote[];
}

export interface WriteAnalysisCacheRequest<T = JsonValue> {
  data: T;
  ttlSeconds: number;
  mode?: string;
  type?: string;
  shared?: boolean;
}

export interface OhlcvPoint {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface CycleSignal {
  type: 'ok' | 'warn' | 'danger';
  text: string;
}

export interface CycleDataResponse {
  cyclePosition: number;
  cycleStage: CycleStage;
  rsiDivergence: RsiDivergence;
  macdMomentum: MacdMomentum;
  volumeTrend: VolumeTrend;
  weekHigh52Pct: number;
  signals: CycleSignal[];
  cycleSummary: string;
  computedAt: ISODateTime;
  source: MarketDataSource;
}

export interface PriceOhlcvResponse {
  ticker: string;
  range: PriceRange;
  interval: PriceInterval;
  dates: string[];
  opens: number[];
  highs: number[];
  lows: number[];
  closes: number[];
  volumes: number[];
  fetchedAt: ISODateTime;
  source: MarketDataSource;
}

export interface StockAnalyserAiRequest extends AiProxyRequest {
  appName?: 'stock-analyser';
}

export type StockAnalyserAiResponse = AiTextResponse | AiAsyncStartResponse;

/**
 * App-owned Stock Analyser settings record (M15.1).
 *
 * Persisted per account using the canonical key shape
 * `pk: 'SETTINGS'`, `sk: 'APP#stock-analyser'`. Holds display preferences only;
 * the AI provider/model override is stored separately as an
 * `AiRuntimeConfigRecord` (`pk: 'AI_CONFIG'`, `sk: 'APP#stock-analyser'`) and
 * surfaced through the app-owned ai-config endpoints.
 */
export interface StockAnalyserSettings {
  pk: 'SETTINGS';
  sk: 'APP#stock-analyser';
  explanatoryTextEnabled: boolean;
  /** App default for the per-search Fast/Live toggle. Defaults to 'live'. */
  defaultSearchMode: StockAnalyserSearchMode;
  updatedAt: ISODateTime;
}

export interface StockAnalyserFrontendState {
  activeTab: StockAnalyserTab;
  accountId?: AccountId;
  selectedTicker?: string;
  originatingTab?: StockAnalyserTab;
  explanatoryTextEnabled: boolean;
  portfolioTickers: string[];
  watchlistTickers: string[];
}

export const stockAnalyserContractVersion = 'm15.2.0' as const satisfies StockAnalyserContractVersion;

export const examplePortfolioHolding = {
  ticker: 'BHP.AX',
  shares: 10,
  avgCost: 42.5,
  isGifted: false,
  addedAt: 1798761600,
} as const satisfies PortfolioHolding;

export const exampleWatchlistItem = {
  ticker: 'CBA.AX',
  name: 'Commonwealth Bank of Australia',
  addedAt: 1798761600,
  addedPrice: 120.25,
} as const satisfies WatchlistItem;

export const exampleCachedQuote = {
  ticker: 'BHP.AX',
  price: 43.18,
  dayChangePct: 0.0142,
  asOf: '2026-07-06T00:00:00.000Z',
} as const satisfies CachedQuote;

export const exampleOhlcvPoint = {
  timestamp: 1798761600,
  open: 100,
  high: 105,
  low: 98,
  close: 104,
  volume: 1234567,
} as const satisfies OhlcvPoint;

export const exampleCycleSignal = {
  type: 'ok',
  text: 'Momentum is consistent with a mid-cycle setup.',
} as const satisfies CycleSignal;

export const exampleStockAnalyserState = {
  activeTab: 'market',
  accountId: 'acct-sa-123',
  selectedTicker: 'BHP.AX',
  explanatoryTextEnabled: true,
  portfolioTickers: ['BHP.AX'],
  watchlistTickers: ['CBA.AX'],
} as const satisfies StockAnalyserFrontendState;

export const exampleStockAnalyserSettings = {
  pk: 'SETTINGS',
  sk: 'APP#stock-analyser',
  explanatoryTextEnabled: true,
  defaultSearchMode: 'live',
  updatedAt: '2026-06-07T00:00:00.000Z',
} as const satisfies StockAnalyserSettings;

export const exampleMarketAnalysisSectorResult = {
  sector: 'Technology',
  bestExchange: 'NASDAQ',
  recommendationUniverse: 'NASDAQ',
  sourceRegion: 'global',
} as const satisfies MarketAnalysisSectorResult;

export const exampleRecommendationsNavigationPayload = {
  sector: 'Technology',
  recommendationUniverse: 'NASDAQ',
  sourceRegion: 'global',
} as const satisfies RecommendationsNavigationPayload;
