import {
  exampleCachedQuote,
  exampleOhlcvPoint,
  exampleCycleSignal,
  examplePortfolioHolding,
  exampleStockAnalyserSettings,
  exampleStockAnalyserState,
  exampleWatchlistItem,
  type AnalysisCacheEntry,
  type CachedQuote,
  type CycleDataResponse,
  type PortfolioHolding,
  type PriceOhlcvResponse,
  type StockAnalyserAiResponse,
  type StockAnalyserFrontendState,
  type StockAnalyserSettings,
  type WatchlistItem,
} from './types';
import {
  STOCK_ANALYSER_CACHE_TTL_SECONDS,
  analysisCacheKey,
  defaultCacheFreshnessConfigRecord,
  isValidCacheFreshnessPolicy,
  isValidCacheFreshnessPreset,
  makeAnalysisCacheEntry,
  type CacheFreshnessConfigRecord,
  type CacheFreshnessPreset,
  type StockAnalyserCacheFreshnessPolicy,
  type StockAnalyserCacheSurface,
} from './cache-freshness';
import {
  exampleStockAnalyserWsConnectedMessage,
  type StockAnalyserWsServerMessage,
} from './wss';
import type { MarketAnalysisResult } from './market-analysis';
import type {
  Recommendation,
  RunRecommendationsResponse,
} from './recommendations';
import type { Etf, RunEtfsResponse } from './etfs';
import type { Metal, RunMetalsResponse } from './metals';
import {
  defaultNotificationAccountConfig,
  defaultNotificationEngineConfig,
  defaultNotificationMemberConsent,
  isNotificationType,
  normalizeIntervalDays,
  NOTIFICATION_TYPES,
  type NotificationAccountConfig,
  type NotificationEngineConfig,
  type NotificationMemberConsent,
  type NotificationType,
} from './notification-preferences';
import { DEFAULT_RUN_HISTORY_LIMIT } from './notification-run-history';
import type {
  NotificationRunHistoryPage,
  NotificationRunSummary,
} from './notification-run-history';
import type { AccountId, UserId } from '../_shared/api';
import {
  exampleAppAiRuntimeConfigResponse,
  resolveEffectiveAiRuntimeConfig,
  type AiRuntimeConfigUpdate,
  type AppAiRuntimeConfigResponse,
} from '../_shared/ai-runtime';
import {
  getAppOverride,
  getPlatformDefault,
  resetAppOverride as resetSharedAppOverride,
  setAppOverride,
} from '../_shared/ai-runtime-store';

/**
 * Fixed demo clock (unix seconds) for cache-freshness mocks. Using a fixed
 * "now" makes the derived freshness/age deterministic and avoids client/server
 * hydration drift that `Date.now()` would introduce. Runtime supplies the real
 * `cachedAt`/`expiresAt`/`now`; v0 only mocks the metadata against this clock.
 */
export const MOCK_CACHE_NOW_SECONDS = 1798761600 as const; // 2026-06-07T00:00:00Z

export type MockCacheSnapshot = Pick<AnalysisCacheEntry, 'cachedAt' | 'expiresAt'>;

/**
 * Build a cache snapshot for a surface that is `ageSeconds` old relative to the
 * fixed demo clock. `expiresAt = cachedAt + TTL(surface)`, so the real
 * `deriveCacheFreshness` helper produces the freshness band from this metadata.
 */
export function mockCacheSnapshot(
  surface: StockAnalyserCacheSurface,
  ageSeconds: number,
  now: number = MOCK_CACHE_NOW_SECONDS,
): MockCacheSnapshot {
  const cachedAt = now - ageSeconds;
  return { cachedAt, expiresAt: cachedAt + STOCK_ANALYSER_CACHE_TTL_SECONDS[surface] };
}

/**
 * Per-surface example cache snapshots used by the tabs. Ages are chosen to
 * exercise a spread of bands across surfaces (fresh/recent/stale); none is
 * past expiry, so `outdated` is intentionally not shown in normal examples.
 */
export const mockCacheSnapshots = {
  market: mockCacheSnapshot('market', 2 * 60 * 60), // 2h of 24h  -> fresh
  recs: mockCacheSnapshot('recs', 20 * 60 * 60), // 20h of 24h -> stale
  analyser: mockCacheSnapshot('analyser', 8 * 60), // 8m of 24h  -> fresh
  metals: mockCacheSnapshot('metals', 45 * 60), // 45m of 2h  -> recent
  etfs: mockCacheSnapshot('etfs', 18 * 60 * 60), // 18h of 48h -> recent
  portfolio: mockCacheSnapshot('portfolio', 7 * 60 * 60), // 7h of 24h  -> recent
  watchlist: mockCacheSnapshot('watchlist', 21 * 60 * 60), // 21h of 24h -> stale
} as const satisfies Record<StockAnalyserCacheSurface, MockCacheSnapshot>;

export const mockPortfolio = [examplePortfolioHolding] satisfies PortfolioHolding[];
export const mockWatchlist = [exampleWatchlistItem] satisfies WatchlistItem[];
export const mockCachedQuotes = [
  exampleCachedQuote,
  { ticker: 'CBA.AX', price: 121.04, dayChangePct: -0.0061, asOf: '2026-07-06T00:00:00.000Z' },
] satisfies CachedQuote[];
export const mockStockAnalyserState = exampleStockAnalyserState satisfies StockAnalyserFrontendState;
export const mockStockAnalyserSettings = exampleStockAnalyserSettings satisfies StockAnalyserSettings;

/**
 * Canonical Market Analysis result mock (#535).
 *
 * Sourced from the contract so the UI and the `useClaude` mock share one shape.
 * Every macro card and every sector carries per-card `source` attribution; the
 * `bestExchange` values intentionally include unsupported strings (TSX/NYSE) to
 * exercise universe resolution in the UI. `briefing` and `actionSummary` carry
 * NO source — they are synthesis/conclusions, not individually-sourced figures.
 */
export const mockMarketAnalysisResult = {
  macro: {
    cycleStage: {
      label: 'CYCLE STAGE',
      title: 'Late Cycle Expansion',
      description:
        'Economy at capacity constraints with strong growth momentum but rising inflation pressures',
      impact: 'Neutral',
      source: { name: 'ABS' },
    },
    rateDirection: {
      label: 'RATE DIRECTION',
      title: 'Tightening',
      description: 'RBA hiked to 4.35% in March 2026 amid stagflation risks, further hikes likely',
      impact: 'Headwind',
      source: { name: 'RBA' },
    },
    keyRisk: {
      label: 'KEY RISK',
      title: 'Middle East Conflict Stagflation',
      description:
        'Oil prices at $93-105 range, inflation expectations rising, RBA warns of nightmare stagflation scenario',
      impact: 'Headwind',
      source: { name: 'EIA' },
    },
    currency: {
      label: 'USD / CURRENCY',
      title: 'Strong',
      description:
        'USD index gained 1.4% since Middle East conflict began, safe haven flows amid geopolitical tensions',
      impact: 'Supportive',
      source: { name: 'ICE' },
    },
  },
  briefing:
    'The ASX faces a challenging macro backdrop as the RBA shifts to aggressive tightening amid stagflation risks. The Middle East conflict has driven oil prices to $93-105 range, forcing the RBA to hike rates to 4.35% with more increases likely. Strong USD and elevated energy costs threaten commodity-dependent sectors, while elevated inflation expectations cloud the outlook despite record market highs in 2024.',
  sectors: [
    { sector: 'Financials', signal: 'HOLD', cyclePosition: 72, valuation: 'Extended', change: 28, reason: 'Banks benefit from rising rates but face margin pressure and credit risks in tightening cycle', bestExchange: 'ASX', source: { name: 'ASX' } },
    { sector: 'Materials', signal: 'enter', cyclePosition: 45, valuation: 'Attractive', change: -17, reason: 'Oversold on China growth fears, energy crisis supports commodity prices medium-term', bestExchange: 'TSX', source: { name: 'LME' } },
    { sector: 'Energy', signal: 'enter', cyclePosition: 85, valuation: 'Cheap', change: -19, reason: 'Direct beneficiary of oil crisis, strong free cash flows at elevated prices', bestExchange: 'NYSE', source: { name: 'EIA' } },
    { sector: 'Healthcare', signal: 'HOLD', cyclePosition: 58, valuation: 'Fair', change: 27, reason: 'Defensive qualities valuable but already well-positioned for stagflation environment', bestExchange: 'NASDAQ', source: { name: 'ASX' } },
    { sector: 'Technology', signal: 'EXIT', cyclePosition: 35, valuation: 'Overvalued', change: 48, reason: 'Extreme valuations vulnerable to rising rates and economic slowdown', bestExchange: 'NASDAQ', source: { name: 'Nasdaq' } },
    { sector: 'Industrials', signal: 'HOLD', cyclePosition: 55, valuation: 'Fair', change: 12, reason: 'Mixed outlook with infrastructure spending offset by higher input costs', bestExchange: 'NYSE', source: { name: 'ASX' } },
    { sector: 'Consumer Discretionary', signal: 'EXIT', cyclePosition: 25, valuation: 'Expensive', change: 15, reason: 'Facing headwinds from rising rates, fuel costs and squeezed consumer spending', bestExchange: 'NYSE', source: { name: 'ASX' } },
    { sector: 'Real Estate & REITs', signal: 'EXIT', cyclePosition: 20, valuation: 'Overvalued', change: 41, reason: 'Rising rates and tightening cycle pose significant headwinds to property valuations', bestExchange: 'ASX', source: { name: 'ASX' } },
  ],
  actionSummary: {
    enter: [
      { sector: 'Energy', reason: 'Direct beneficiary of oil crisis with strong pricing power and cash generation' },
      { sector: 'Materials', reason: 'Oversold on China fears, supply constraints support commodity prices' },
      { sector: 'Healthcare', reason: 'Defensive characteristics valuable in stagflationary environment' },
    ],
    exit: [
      { sector: 'Technology', reason: 'Extreme valuations vulnerable to rising rates and economic deceleration' },
      { sector: 'Real Estate & REITs', reason: 'Rising rate environment poses existential threat to property valuations' },
      { sector: 'Consumer Discretionary', reason: 'Rising fuel costs and rates squeeze discretionary spending power' },
    ],
  },
} satisfies MarketAnalysisResult;

/**
 * Scope-keyed analysis cache seed for the unified Run / Re-run flow.
 *
 * Keyed by {@link analysisCacheKey} (`"{surface}:{scopeKey}"`), each value is a
 * full {@link AnalysisCacheEntry}. The seed exercises both cache-read branches
 * so the behaviour is observable in v0:
 *  - `market:australia` — FRESH (cached just now vs the demo clock): pressing
 *    `Run Analysis` serves it instantly, no fetch.
 *  - `market:us` — EXPIRED (cached 48h ago, 24h TTL): an entry EXISTS but is
 *    past TTL, so `Run Analysis` ignores it and performs a fetch.
 *
 * Every other scope (other regions, etfs/metals/recs/analyser scopes) starts
 * absent — a cache MISS — so the first `Run Analysis` fetches and caches, and
 * subsequent `Re-run`/revisits are served from cache. All times use the fixed
 * `MOCK_CACHE_NOW_SECONDS` demo clock for deterministic freshness.
 */
export const mockScopedAnalysisCacheSeed: Record<string, AnalysisCacheEntry> = {
  [analysisCacheKey('market', 'australia')]: makeAnalysisCacheEntry(
    'market',
    mockMarketAnalysisResult,
    { now: MOCK_CACHE_NOW_SECONDS - 2 * 60 * 60, mode: 'live' }, // 2h old -> fresh
  ),
  [analysisCacheKey('market', 'us')]: makeAnalysisCacheEntry(
    'market',
    mockMarketAnalysisResult,
    { now: MOCK_CACHE_NOW_SECONDS - 48 * 60 * 60, mode: 'live' }, // 48h old -> expired (24h TTL)
  ),
};

/**
 * Canonical Recommendations mocks (#592).
 *
 * Typed against the contract `Recommendation` shape: identity + the
 * `recommendationSignal` (pick/watch/avoid) vocabulary + grounded prose +
 * REAL price/change (the OHLCV overlay #468 the engine adds after ranking).
 * The dropped fields (cyclePosition/cycleStage/conviction) are intentionally
 * absent. Prose is deliberately fundamentals/relative-value based and asserts
 * NO specific unverified technicals (no exact MA/RSI claims) — see
 * `recommendations.behaviour.md`.
 */
export const mockTopPicks = [
  { ticker: 'WDS.AX', company: 'Woodside Energy Group Limited', sector: 'Energy', subcategory: 'Oil & Gas', recommendationSignal: 'pick', price: 33.85, change: 2.2, analysis: 'Scarborough project is 94% complete targeting first LNG in Q4 2026 with strong cash flows expected at the supplied price. Louisiana LNG targeting first production in 2029 positions the company for growth in global LNG demand.' },
  { ticker: 'STO.AX', company: 'Santos Limited', sector: 'Energy', subcategory: 'Oil & Gas', recommendationSignal: 'pick', price: 7.45, change: 10.0, analysis: 'Pikka Phase 1 targeting first oil in 2026 will materially increase production capacity. A covered dividend yield and disciplined balance sheet are supported at the supplied price by elevated energy prices.' },
  { ticker: 'ALD.AX', company: 'Ampol Limited', sector: 'Energy', subcategory: 'Refining', recommendationSignal: 'watch', price: 34.2, change: 21.3, analysis: 'Strong refining margins drove Group RCOP EBITDA of 1.4 billion with manageable leverage. Diesel and jet fuel demand remain the key profit drivers; the recent run-up tempers near-term relative value.' },
  { ticker: 'AGL.AX', company: 'AGL Energy Limited', sector: 'Energy', subcategory: 'Utilities', recommendationSignal: 'watch', price: 9.84, change: 2.0, analysis: 'Development pipeline expanded to 11.3 GW with better-than-anticipated battery performance providing transition value. Asset transitions and evolving policy settings create execution risk despite improved earnings stability.' },
  { ticker: 'ORG.AX', company: 'Origin Energy Limited', sector: 'Energy', subcategory: 'Utilities', recommendationSignal: 'pick', price: 8.75, change: 16.0, analysis: 'Leading Australia\'s renewable transition with significant battery storage coming online through 2025. A key beneficiary of the clean-energy buildout while retaining income from existing assets at the supplied price.' },
  { ticker: 'PDN.AX', company: 'Paladin Energy Limited', sector: 'Energy', subcategory: 'Uranium', recommendationSignal: 'pick', price: 0.82, change: 7.0, analysis: 'Langer Heinrich in Namibia is operational amid renewed global interest in nuclear power. Rising uranium demand and long-term contract pricing provide supportive fundamentals at the supplied price.' },
] as const satisfies readonly Recommendation[];

export const mockBottomOfCycle = [
  { ticker: 'STO.AX', company: 'Santos Limited', sector: 'Energy', subcategory: 'Oil & Gas', recommendationSignal: 'pick', price: 6.85, change: -2.15, analysis: 'Direct beneficiary of the oil crisis with strong pricing power and cash generation. Trading at a compressed valuation after the recent selloff presents a compelling entry for long-term investors at the supplied price.' },
  { ticker: 'ORG.AX', company: 'Origin Energy', sector: 'Energy', subcategory: 'Utilities', recommendationSignal: 'pick', price: 8.42, change: -1.85, analysis: 'Oversold on China growth fears while supply constraints support commodity prices. The renewable transition creates meaningful upside as energy transition accelerates globally.' },
  { ticker: 'REA.AX', company: 'REA Group', sector: 'Real Estate', subcategory: 'Digital Platforms', recommendationSignal: 'watch', price: 185.2, change: -0.45, analysis: 'Leading property portal with defensive characteristics valuable in a stagflationary environment. Positioned to benefit from eventual property recovery, though the premium valuation warrants patience.' },
  { ticker: 'APX.AX', company: 'Appen Limited', sector: 'Technology', subcategory: 'AI Data Services', recommendationSignal: 'avoid', price: 2.15, change: -3.5, analysis: 'A critical AI training-data provider, but persistent customer concentration and cash-burn risk dominate the thesis. Recovery depends on enterprise AI spend the company has not yet demonstrably captured.' },
  { ticker: 'Z1P.AX', company: 'Zip Co', sector: 'Technology', subcategory: 'Fintech', recommendationSignal: 'watch', price: 0.85, change: -2.8, analysis: 'A BNPL operator near a cycle trough with recovery potential as consumer sentiment improves. Strategic partnerships and cost management provide a credible, if unproven, path to profitability.' },
  { ticker: 'MYR.AX', company: 'Myer Holdings', sector: 'Consumer Discretionary', subcategory: 'Retail', recommendationSignal: 'avoid', price: 0.78, change: -1.5, analysis: 'Deeply depressed valuation, but structural retail headwinds and thin margins keep the risk skewed to the downside. A consumer-discretionary turn could unlock value the current fundamentals do not yet support.' },
] as const satisfies readonly Recommendation[];

/** Example finished-engine response (Top Picks, ASX) for the canonical shape. */
export const mockRunRecommendationsResponse = {
  recommendations: [...mockTopPicks],
  generatedAt: '2026-06-07T00:00:00.000Z',
} as const satisfies RunRecommendationsResponse;

/**
 * Canonical ETFs mocks (#626).
 *
 * Typed against the contract `Etf` shape: identity + category + expenseRatio +
 * the reused `recommendationSignal` (pick/watch/avoid) vocabulary + grounded
 * prose + REAL price/change (the OHLCV overlay #468 the engine adds after
 * ranking). The old design-system `signal` and model-authored price are gone.
 * Prose reasons on fees/category/asset size/real price and asserts NO specific
 * unverified technicals — see `etfs.behaviour.md`. The Property ETF (VAP) is
 * retained so REIT/property exposure is represented in the shortlist.
 */
export const mockEtfs = [
  { ticker: 'VAS.AX', name: 'Vanguard Australian Shares Index ETF', category: 'Index', expenseRatio: 0.1, recommendationSignal: 'pick', price: 107.67, change: 2.22, analysis: 'Core Australian equity exposure tracking the S&P/ASX 300 across 300+ holdings. An ultra-low 0.10% MER makes it highly cost-effective for long-term core allocation at the supplied price.' },
  { ticker: 'VGS.AX', name: 'Vanguard MSCI Index International Shares ETF', category: 'Index', expenseRatio: 0.18, recommendationSignal: 'pick', price: 147.2, change: 1.08, analysis: 'Diversified global exposure across 22 developed markets and 1,284+ holdings despite a heavy US weighting. A low 0.18% MER offers cost-effective international diversification for Australian investors.' },
  { ticker: 'NDQ.AX', name: 'BetaShares NASDAQ 100 ETF', category: 'Sector', expenseRatio: 0.48, recommendationSignal: 'watch', price: 52.89, change: 1.4, analysis: 'Concentrated exposure to the NASDAQ 100 largest non-financial companies. The 0.48% MER is reasonable for the theme, though the elevated valuation at the supplied price tempers near-term relative value.' },
  { ticker: 'VAP.AX', name: 'Vanguard Australian Property Securities Index ETF', category: 'Property', expenseRatio: 0.23, recommendationSignal: 'watch', price: 88.02, change: 0.41, analysis: 'Property/REIT exposure tracking the S&P/ASX 300 A-REIT Index across retail, office and industrial with good liquidity. A competitive 0.23% MER, but rate sensitivity keeps it on the radar rather than a clear entry at the supplied price.' },
  { ticker: 'IAF.AX', name: 'iShares Core Composite Bond ETF', category: 'Bond', expenseRatio: 0.15, recommendationSignal: 'pick', price: 101.06, change: -0.14, analysis: 'Premier defensive allocation tracking the Bloomberg AusBond Composite Index across government and corporate bonds. A market-leading 0.15% MER and tight spreads provide excellent cost efficiency for the defensive sleeve.' },
  { ticker: 'IVV.AX', name: 'iShares S&P 500 AUD ETF', category: 'Index', expenseRatio: 0.04, recommendationSignal: 'pick', price: 64.85, change: 1.29, analysis: 'Broad S&P 500 exposure capturing large-cap US equity with deep liquidity. At a 0.04% MER it is among the cheapest ways to access US large-cap growth at the supplied price.' },
] as const satisfies readonly Etf[];

/** Example finished-engine response (ASX ETFs) for the canonical shape. */
export const mockRunEtfsResponse = {
  etfs: [...mockEtfs],
  generatedAt: '2026-06-07T00:00:00.000Z',
} as const satisfies RunEtfsResponse;

/**
 * Canonical Metals mocks (#627).
 *
 * Typed against the contract `Metal` shape: static identity (name/symbol +
 * preserved per-metal Perth Mint targets) + REAL feed data (USD + AUD spot,
 * today/YTD/30-day change — the metals.dev + stored-close overlay the engine
 * supplies) + model-authored `signal` (BULL/NEUTRAL/BEAR) and `outlook`. The old
 * model-authored prices are gone — the numbers here stand in for feed data.
 * `change30d` is nullable (null until 30 days of stored closes exist); Palladium
 * shows the null case, which the tab renders as "—". Outlook prose is grounded on
 * the supplied spot/change and asserts no ungrounded figures — see
 * `metals.behaviour.md`. Fixed four-metal universe, no scope dimension.
 */
export const mockMetals = [
  { name: 'Gold', symbol: 'XAU/USD', perthMintTicker: 'PMGOLD.AX', perthMintName: 'Perth Mint Gold', spotPrice: 4754, audSpotPrice: 7314, todayChange: -1.19, ytdChange: 14.2, change30d: 3.1, signal: 'NEUTRAL', outlook: 'Gold consolidates at the supplied spot as safe-haven demand from geopolitical tension is offset by firm real yields limiting further rate cuts. The muted daily and 30-day move against a solid YTD gain supports a balanced stance rather than a directional call.' },
  { name: 'Silver', symbol: 'XAG/USD', perthMintTicker: 'ETPMAG.AX', perthMintName: 'Perth Mint Silver', spotPrice: 74.78, audSpotPrice: 115.04, todayChange: -3.81, ytdChange: 67.5, change30d: 8.4, signal: 'BULL', outlook: 'The strongest YTD performer among precious metals, with a firm 30-day gain on solar-driven industrial demand. Near-term volatility is likely given the sharp daily pullback, but the structural energy-transition bid and relative undervaluation versus gold keep the stance constructive.' },
  { name: 'Platinum', symbol: 'XPT/USD', perthMintTicker: 'ETPMPT.AX', perthMintName: 'Perth Mint Platinum', spotPrice: 2048, audSpotPrice: 3150, todayChange: -2.29, ytdChange: 81.4, change30d: 12.2, signal: 'BULL', outlook: 'An outsized YTD and 30-day advance reflects supply-deficit conditions and a historic discount to gold. The sharp daily pullback argues for some caution on chase risk, but deficit dynamics and hydrogen/auto catalysts underpin the bullish read.' },
  { name: 'Palladium', symbol: 'XPD/USD', perthMintTicker: 'ETPMPD.AX', perthMintName: 'Perth Mint Palladium', spotPrice: 1250, audSpotPrice: 1923, todayChange: -2.1, ytdChange: -15.3, change30d: null, signal: 'NEUTRAL', outlook: 'The only metal down YTD, palladium remains under structural pressure from EV adoption eroding catalytic-converter demand and normalising Russian supply. At the supplied spot the risk is two-sided, warranting a neutral stance pending signs of industrial-demand stabilisation.' },
] as const satisfies readonly Metal[];

/** Example finished-engine response (the four metals) for the canonical shape. */
export const mockRunMetalsResponse = {
  metals: [...mockMetals],
  generatedAt: '2026-06-07T00:00:00.000Z',
} as const satisfies RunMetalsResponse;

export const mockCycleData = {
  cyclePosition: 64,
  cycleStage: 'mid',
  rsiDivergence: 'none',
  macdMomentum: 'strengthening',
  volumeTrend: 'confirming',
  weekHigh52Pct: 0.82,
  signals: [exampleCycleSignal],
  cycleSummary: 'Mid-cycle momentum remains constructive.',
  computedAt: '2026-06-07T00:00:00.000Z',
  source: 'cache',
} as const satisfies CycleDataResponse;

export const mockPriceData = {
  ticker: 'BHP.AX',
  range: '1y',
  interval: '1d',
  dates: ['2026-06-07'],
  opens: [exampleOhlcvPoint.open],
  highs: [exampleOhlcvPoint.high],
  lows: [exampleOhlcvPoint.low],
  closes: [exampleOhlcvPoint.close],
  volumes: [exampleOhlcvPoint.volume],
  fetchedAt: '2026-06-07T00:00:00.000Z',
  source: 'live',
} as const satisfies PriceOhlcvResponse;

export const mockAiAck = {
  jobId: 'job-sa-123',
} as const satisfies StockAnalyserAiResponse;

export const mockStockAnalyserWsMessages = [
  exampleStockAnalyserWsConnectedMessage,
  {
    type: 'result',
    jobId: 'job-sa-123',
    cacheKey: 'ANALYSIS#BHP.AX',
    result: {
      content: '{"ticker":"BHP.AX","signal":"hold"}',
      model: 'claude-sonnet-4-6',
      provider: 'claude',
      usage: { inputTokens: 1200, outputTokens: 340 },
    },
  },
] as const satisfies readonly StockAnalyserWsServerMessage[];

/**
 * App-owned AI config mock handlers (M15.1).
 *
 * In-memory server for Stock Analyser's own provider/model override. Platform
 * default is read-only (owned by Launchpad); effective resolution uses the
 * shared resolver.
 */
export interface StockAnalyserAiConfigMockHandlers {
  getAiConfig(): AppAiRuntimeConfigResponse;
  updateOverride(update: AiRuntimeConfigUpdate): AppAiRuntimeConfigResponse;
  resetOverride(): AppAiRuntimeConfigResponse;
}

const STOCK_APP_SLUG = 'stock-analyser' as const;

const mockStockAnalyserAiConfigBase = {
  ...exampleAppAiRuntimeConfigResponse,
  appSlug: STOCK_APP_SLUG,
} satisfies AppAiRuntimeConfigResponse;

export function createStockAnalyserAiConfigMockHandlers(): StockAnalyserAiConfigMockHandlers {
  // Override state is owned here but persisted in the shared store so Launchpad
  // can read it. The platform default is read (never written) from the store.
  const snapshot = (): AppAiRuntimeConfigResponse => {
    const appOverride = getAppOverride(STOCK_APP_SLUG);
    const platformDefault = getPlatformDefault();
    return {
      ...mockStockAnalyserAiConfigBase,
      platformDefault,
      appOverride,
      effective: resolveEffectiveAiRuntimeConfig({ appOverride, platformDefault }),
    };
  };

  return {
    getAiConfig: () => snapshot(),
    updateOverride: (update) => {
      setAppOverride(STOCK_APP_SLUG, update);
      return snapshot();
    },
    resetOverride: () => {
      resetSharedAppOverride(STOCK_APP_SLUG);
      return snapshot();
    },
  };
}

export const stockAnalyserAiConfigMockHandlers = createStockAnalyserAiConfigMockHandlers();

/**
 * App-scoped cache-freshness config mock handlers (admin-edited).
 *
 * In-memory server for the active cache-freshness policy + the admin's preset
 * library, persisted for the session. Exposes a `subscribe`/`getVersion` pair so
 * UI can `useSyncExternalStore` and re-render badges the moment an admin changes
 * the policy. Mutating handlers validate against the canonical contract
 * validators and throw on invalid input (mirroring "runtime must reject invalid
 * persisted updates").
 */
export interface StockAnalyserCacheFreshnessMockHandlers {
  getConfig(): CacheFreshnessConfigRecord;
  subscribe(listener: () => void): () => void;
  getVersion(): number;
  setActivePolicy(policy: StockAnalyserCacheFreshnessPolicy): CacheFreshnessConfigRecord;
  applyPreset(presetId: string): CacheFreshnessConfigRecord;
  /** Create a preset (no `id`) or update an existing one (matching `id`). */
  savePreset(input: {
    id?: string;
    label: string;
    policy: StockAnalyserCacheFreshnessPolicy;
  }): CacheFreshnessConfigRecord;
  deletePreset(presetId: string): CacheFreshnessConfigRecord;
  reset(): CacheFreshnessConfigRecord;
}

export function createStockAnalyserCacheFreshnessMockHandlers(): StockAnalyserCacheFreshnessMockHandlers {
  let record = defaultCacheFreshnessConfigRecord();
  let version = 0;
  let customSeq = 0;
  const listeners = new Set<() => void>();

  const emit = (): CacheFreshnessConfigRecord => {
    record = { ...record, updatedAt: new Date().toISOString() };
    version++;
    listeners.forEach((cb) => cb());
    return record;
  };

  return {
    getConfig: () => record,
    getVersion: () => version,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setActivePolicy: (policy) => {
      if (!isValidCacheFreshnessPolicy(policy)) {
        throw new Error('Invalid cache-freshness policy');
      }
      record = { ...record, activePolicy: { ...policy } };
      return emit();
    },
    applyPreset: (presetId) => {
      const preset = record.presets.find((p) => p.id === presetId);
      if (!preset) throw new Error(`Unknown preset: ${presetId}`);
      record = { ...record, activePolicy: { ...preset.policy } };
      return emit();
    },
    savePreset: ({ id, label, policy }) => {
      const trimmed = label.trim();
      const candidate: CacheFreshnessPreset = {
        id: id ?? `custom-${++customSeq}`,
        label: trimmed,
        policy: { ...policy },
        builtIn: id ? (record.presets.find((p) => p.id === id)?.builtIn ?? false) : false,
      };
      if (!isValidCacheFreshnessPreset(candidate)) {
        throw new Error('Invalid cache-freshness preset');
      }
      const exists = record.presets.some((p) => p.id === candidate.id);
      const presets = exists
        ? record.presets.map((p) => (p.id === candidate.id ? candidate : p))
        : [...record.presets, candidate];
      record = { ...record, presets };
      return emit();
    },
    deletePreset: (presetId) => {
      const preset = record.presets.find((p) => p.id === presetId);
      if (!preset) throw new Error(`Unknown preset: ${presetId}`);
      if (preset.builtIn) throw new Error('Built-in presets cannot be deleted');
      record = { ...record, presets: record.presets.filter((p) => p.id !== presetId) };
      return emit();
    },
    reset: () => {
      record = defaultCacheFreshnessConfigRecord();
      return emit();
    },
  };
}

export const stockAnalyserCacheFreshnessMockHandlers =
  createStockAnalyserCacheFreshnessMockHandlers();

/**
 * Reactive per-surface cache snapshot store (the in-memory "cache" itself).
 *
 * Seeded from `mockCacheSnapshots` so first render is deterministic (SSR-safe).
 * `refresh(surface)` rewrites that surface's snapshot to age 0 against the fixed
 * demo clock — i.e. "just now" / fresh — modelling a cache write after a live
 * fetch. Exposes `subscribe`/`getVersion` so badges re-render the instant a user
 * refreshes. Runtime replaces this with real cache reads/writes; the contract
 * shape (`cachedAt`/`expiresAt`) is unchanged.
 */
export interface StockAnalyserCacheSnapshotMockHandlers {
  getSnapshot(surface: StockAnalyserCacheSurface): MockCacheSnapshot;
  refresh(surface: StockAnalyserCacheSurface): MockCacheSnapshot;
  subscribe(listener: () => void): () => void;
  getVersion(): number;
  reset(): void;
}

export function createStockAnalyserCacheSnapshotMockHandlers(): StockAnalyserCacheSnapshotMockHandlers {
  const seed = (): Map<StockAnalyserCacheSurface, MockCacheSnapshot> =>
    new Map(
      (Object.entries(mockCacheSnapshots) as [StockAnalyserCacheSurface, MockCacheSnapshot][]).map(
        ([surface, snap]) => [surface, { ...snap }],
      ),
    );

  let state = seed();
  let version = 0;
  const listeners = new Set<() => void>();
  const emit = () => {
    version++;
    listeners.forEach((cb) => cb());
  };

  return {
    getSnapshot: (surface) => state.get(surface) ?? mockCacheSnapshot(surface, 0),
    getVersion: () => version,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    refresh: (surface) => {
      // A refresh = a fresh cache write: age 0 -> "just now" / fresh.
      const snap = mockCacheSnapshot(surface, 0);
      state.set(surface, snap);
      emit();
      return snap;
    },
    reset: () => {
      state = seed();
      emit();
    },
  };
}

export const stockAnalyserCacheSnapshotMockHandlers =
  createStockAnalyserCacheSnapshotMockHandlers();

// ---------------------------------------------------------------------------
// Notification preferences mocks + handlers (M19 #534)
// ---------------------------------------------------------------------------

/** Canonical demo account config (the default Steve account). */
export const mockNotificationAccountConfig = defaultNotificationAccountConfig(
  'acct-sa-steve',
) satisfies NotificationAccountConfig;

/** Canonical demo member consent (opt-in default OFF). */
export const mockNotificationMemberConsent = defaultNotificationMemberConsent(
  'acct-sa-steve',
  'user-steve',
) satisfies NotificationMemberConsent;

/** Canonical demo engine config (kill-switch ON by default, M19 #571). */
export const mockNotificationEngineConfig =
  defaultNotificationEngineConfig() satisfies NotificationEngineConfig;

/**
 * In-memory notification-preferences store (M19 #534).
 *
 * Three grains, mirroring the canonical key shapes:
 *  - account config, keyed by `accountId` (owner/manager-controlled)
 *  - per-member consent, keyed by `${accountId}::${userId}` (own record only)
 *  - app-wide engine config, a SINGLE global record (the #571 kill-switch)
 *
 * Unknown keys lazily resolve to canonical defaults (config: default interval +
 * all types; consent: OFF; engine: ON) so reads never miss. Mutating handlers
 * validate against the contract (interval floored via `normalizeIntervalDays`,
 * types filtered to the allowed set). Exposes `subscribe`/`getVersion` for
 * `useSyncExternalStore` so the card re-renders on persona/state changes.
 *
 * NOTE: this is presentation/state only. The role-conditional rendering in the
 * UI is a UX convenience; runtime enforces authorization server-side (see
 * `notification-preferences.behaviour.md`). These handlers intentionally do NOT
 * re-check role — they model the persisted store, not the access boundary.
 */
export interface StockAnalyserNotificationPrefsMockHandlers {
  getAccountConfig(accountId: AccountId): NotificationAccountConfig;
  setIntervalDays(accountId: AccountId, days: number): NotificationAccountConfig;
  setActiveTypes(accountId: AccountId, types: NotificationType[]): NotificationAccountConfig;
  getMemberConsent(accountId: AccountId, userId: UserId): NotificationMemberConsent;
  setMemberConsent(
    accountId: AccountId,
    userId: UserId,
    receiveConsent: boolean,
  ): NotificationMemberConsent;
  /** App-wide engine kill-switch (M19 #571). */
  getEngineConfig(): NotificationEngineConfig;
  setNotificationsEnabled(enabled: boolean): NotificationEngineConfig;
  subscribe(listener: () => void): () => void;
  getVersion(): number;
  reset(): void;
}

export function createStockAnalyserNotificationPrefsMockHandlers(): StockAnalyserNotificationPrefsMockHandlers {
  const configs = new Map<AccountId, NotificationAccountConfig>();
  const consents = new Map<string, NotificationMemberConsent>();
  // App-wide engine config — a single global record (null until first read/write).
  let engine: NotificationEngineConfig | null = null;
  let version = 0;
  const listeners = new Set<() => void>();

  const consentKey = (accountId: AccountId, userId: UserId) => `${accountId}::${userId}`;
  const emit = () => {
    version++;
    listeners.forEach((cb) => cb());
  };

  const readConfig = (accountId: AccountId): NotificationAccountConfig =>
    configs.get(accountId) ?? defaultNotificationAccountConfig(accountId);

  const readConsent = (accountId: AccountId, userId: UserId): NotificationMemberConsent =>
    consents.get(consentKey(accountId, userId)) ??
    defaultNotificationMemberConsent(accountId, userId);

  return {
    getAccountConfig: (accountId) => readConfig(accountId),
    setIntervalDays: (accountId, days) => {
      const next: NotificationAccountConfig = {
        ...readConfig(accountId),
        intervalDays: normalizeIntervalDays(days),
        updatedAt: new Date().toISOString(),
      };
      configs.set(accountId, next);
      emit();
      return next;
    },
    setActiveTypes: (accountId, types) => {
      // Dedupe + filter to the allowed set, preserving canonical order.
      const allowed = NOTIFICATION_TYPES.filter(
        (t) => types.includes(t) && isNotificationType(t),
      );
      const next: NotificationAccountConfig = {
        ...readConfig(accountId),
        activeTypes: allowed,
        updatedAt: new Date().toISOString(),
      };
      configs.set(accountId, next);
      emit();
      return next;
    },
    getMemberConsent: (accountId, userId) => readConsent(accountId, userId),
    setMemberConsent: (accountId, userId, receiveConsent) => {
      const next: NotificationMemberConsent = {
        ...readConsent(accountId, userId),
        receiveConsent,
        updatedAt: new Date().toISOString(),
      };
      consents.set(consentKey(accountId, userId), next);
      emit();
      return next;
    },
    getEngineConfig: () => engine ?? defaultNotificationEngineConfig(),
    setNotificationsEnabled: (enabled) => {
      const next: NotificationEngineConfig = {
        notificationsEnabled: enabled,
        updatedAt: new Date().toISOString(),
      };
      engine = next;
      emit();
      return next;
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getVersion: () => version,
    reset: () => {
      configs.clear();
      consents.clear();
      engine = null;
      emit();
    },
  };
}

export const stockAnalyserNotificationPrefsMockHandlers =
  createStockAnalyserNotificationPrefsMockHandlers();

// ---------------------------------------------------------------------------
// Notification run-history (send-log) mocks + read handler (M19 #573)
// ---------------------------------------------------------------------------

/**
 * Canonical demo run (the latest notification job run). A multi-account run with
 * mixed outcomes so the surface can demonstrate every leaf reason and the
 * admin (cross-account) vs owner/manager (own-account) scoping. Account IDs
 * match the seed control-plane so owner/manager scoping is exercisable in v0:
 *  - `acct-sa-steve` (Steve's Account) — processed, 1 send.
 *  - `acct-sa-steve-household` (Steve's Household) — processed, 1 send.
 *  - `acct-sa-apex` (Apex Capital) — processed, 1 send + a member SEND-FAILED
 *    error (per-member error on an otherwise-processed account).
 *  - `acct-sa-research` (Research Desk) — account ERROR (processing-failed) +
 *    a lookup-error member.
 * Rollups: 4 accounts evaluated, 1 errored, 3 emails, status `partial`.
 * Exercises every error level: run errored-count, account error reason, and
 * per-member error reasons (send-failed, lookup-error).
 */
export const mockNotificationRunSummary = {
  runId: 'run-2026-06-27',
  ranAt: '2026-06-27T06:00:00.000Z',
  status: 'partial',
  accountsEvaluated: 4,
  accountsErrored: 1,
  emailsSent: 3,
  accounts: [
    {
      accountId: 'acct-sa-steve',
      accountName: "Steve's Account",
      accountStatus: 'processed',
      transitions: [
        { ticker: 'AAPL', from: 'HOLD', to: 'BUY' },
        { ticker: 'BHP', from: 'BUY', to: 'HOLD' },
      ],
      emailsSent: 1,
      memberOutcomes: [
        {
          userId: 'user-steve',
          email: 'steve@example.com',
          outcome: 'sent',
          reason: 'delivered',
          tickers: ['AAPL', 'BHP'],
        },
      ],
    },
    {
      accountId: 'acct-sa-steve-household',
      accountName: "Steve's Household",
      accountStatus: 'processed',
      transitions: [{ ticker: 'CBA', from: 'HOLD', to: 'SELL' }],
      emailsSent: 1,
      memberOutcomes: [
        {
          userId: 'user-steve',
          email: 'steve@example.com',
          outcome: 'sent',
          reason: 'delivered',
          tickers: ['CBA'],
        },
        {
          userId: 'user-liz',
          email: 'liz@example.com',
          outcome: 'skipped',
          reason: 'consent-off',
        },
      ],
    },
    {
      accountId: 'acct-sa-apex',
      accountName: 'Apex Capital',
      accountStatus: 'processed',
      transitions: [{ ticker: 'NVDA', from: 'NEUTRAL', to: 'BUY' }],
      emailsSent: 1,
      memberOutcomes: [
        {
          userId: 'user-ava',
          email: 'ava.chen@example.com',
          outcome: 'sent',
          reason: 'delivered',
          tickers: ['NVDA'],
        },
        {
          // Per-member error on an otherwise-processed account: an owner of Apex
          // can troubleshoot "why didn't Leo get the email?".
          userId: 'user-leo',
          email: 'leo@example.com',
          outcome: 'skipped',
          reason: 'send-failed',
        },
      ],
    },
    {
      accountId: 'acct-sa-research',
      accountName: 'Research Desk',
      accountStatus: 'error',
      error: 'processing-failed',
      transitions: [],
      emailsSent: 0,
      memberOutcomes: [
        {
          userId: 'user-noah',
          email: 'noah@example.com',
          outcome: 'skipped',
          reason: 'lookup-error',
        },
      ],
    },
  ],
} satisfies NotificationRunSummary;

/**
 * Older demo runs, so the surface can show a HISTORY (#573 extend), not just the
 * latest. Newest-first ordering is asserted by the handler. These reuse the same
 * seed accounts so per-run, per-account scoping is exercisable across the list.
 */

/** Jun 26 — a clean run: every processed account delivered (status `success`). */
export const mockNotificationRunJun26 = {
  runId: 'run-2026-06-26',
  ranAt: '2026-06-26T06:00:00.000Z',
  status: 'success',
  accountsEvaluated: 3,
  accountsErrored: 0,
  emailsSent: 3,
  accounts: [
    {
      accountId: 'acct-sa-steve',
      accountName: "Steve's Account",
      accountStatus: 'processed',
      transitions: [{ ticker: 'TSLA', from: 'SELL', to: 'HOLD' }],
      emailsSent: 1,
      memberOutcomes: [
        { userId: 'user-steve', email: 'steve@example.com', outcome: 'sent', reason: 'delivered', tickers: ['TSLA'] },
      ],
    },
    {
      accountId: 'acct-sa-steve-household',
      accountName: "Steve's Household",
      accountStatus: 'processed',
      transitions: [{ ticker: 'CBA', from: 'SELL', to: 'HOLD' }],
      emailsSent: 1,
      memberOutcomes: [
        { userId: 'user-steve', email: 'steve@example.com', outcome: 'sent', reason: 'delivered', tickers: ['CBA'] },
        { userId: 'user-liz', email: 'liz@example.com', outcome: 'skipped', reason: 'consent-off' },
      ],
    },
    {
      accountId: 'acct-sa-apex',
      accountName: 'Apex Capital',
      accountStatus: 'processed',
      transitions: [{ ticker: 'NVDA', from: 'BUY', to: 'NEUTRAL' }],
      emailsSent: 1,
      memberOutcomes: [
        { userId: 'user-ava', email: 'ava.chen@example.com', outcome: 'sent', reason: 'delivered', tickers: ['NVDA'] },
        { userId: 'user-leo', email: 'leo@example.com', outcome: 'skipped', reason: 'consent-off' },
      ],
    },
  ],
} satisfies NotificationRunSummary;

/**
 * Jun 25 — one send; Apex errored on a low email CREDIT BALANCE (account-level
 * `credit-balance` error + a matching per-member `credit-balance` reason).
 * Status `partial`, 1 account errored.
 */
export const mockNotificationRunJun25 = {
  runId: 'run-2026-06-25',
  ranAt: '2026-06-25T06:00:00.000Z',
  status: 'partial',
  accountsEvaluated: 2,
  accountsErrored: 1,
  emailsSent: 1,
  accounts: [
    {
      accountId: 'acct-sa-steve',
      accountName: "Steve's Account",
      accountStatus: 'processed',
      transitions: [{ ticker: 'AAPL', from: 'BUY', to: 'HOLD' }],
      emailsSent: 1,
      memberOutcomes: [
        { userId: 'user-steve', email: 'steve@example.com', outcome: 'sent', reason: 'delivered', tickers: ['AAPL'] },
      ],
    },
    {
      accountId: 'acct-sa-apex',
      accountName: 'Apex Capital',
      accountStatus: 'error',
      error: 'credit-balance',
      transitions: [{ ticker: 'NVDA', from: 'HOLD', to: 'BUY' }],
      emailsSent: 0,
      memberOutcomes: [
        { userId: 'user-ava', email: 'ava.chen@example.com', outcome: 'skipped', reason: 'credit-balance' },
      ],
    },
  ],
} satisfies NotificationRunSummary;

/** Jun 24 — the engine kill-switch (#571) was OFF: nothing sent (status `failed`). */
export const mockNotificationRunJun24 = {
  runId: 'run-2026-06-24',
  ranAt: '2026-06-24T06:00:00.000Z',
  status: 'failed',
  accountsEvaluated: 2,
  accountsErrored: 0,
  emailsSent: 0,
  accounts: [
    {
      accountId: 'acct-sa-steve',
      accountName: "Steve's Account",
      accountStatus: 'skipped',
      transitions: [],
      emailsSent: 0,
      memberOutcomes: [
        { userId: 'user-steve', email: 'steve@example.com', outcome: 'skipped', reason: 'disabled' },
      ],
    },
    {
      accountId: 'acct-sa-research',
      accountName: 'Research Desk',
      accountStatus: 'skipped',
      transitions: [],
      emailsSent: 0,
      memberOutcomes: [
        { userId: 'user-noah', email: 'noah@example.com', outcome: 'skipped', reason: 'disabled' },
      ],
    },
  ],
} satisfies NotificationRunSummary;

/**
 * The full demo run log, MOST-RECENT-FIRST. `mockNotificationRunSummary` is the
 * latest (Jun 27); the rest are older. The handler serves bounded pages from
 * this, mirroring #572's GSI1 (PK=RUNS, SK=ranAt) recency listing.
 */
export const mockNotificationRuns = [
  mockNotificationRunSummary,
  mockNotificationRunJun26,
  mockNotificationRunJun25,
  mockNotificationRunJun24,
] satisfies NotificationRunSummary[];

/**
 * Read-only run-history handler (M19 #573, extended to a LIST). The send-log
 * DATA is built backend side in #572; in v0 this serves the canonical demo run
 * log so the surface and per-run, per-account visibility projection can be
 * exercised. Read-only — no writes in v0.
 */
export interface StockAnalyserNotificationRunHistoryMockHandlers {
  /** The latest notification job run (full, unscoped — the UI/projector scopes it). */
  getLatestRun(): NotificationRunSummary;
  /**
   * A bounded, most-recent-first PAGE of runs (full, unscoped — the UI/projector
   * scopes each run). `limit` defaults to {@link DEFAULT_RUN_HISTORY_LIMIT}.
   */
  getRunHistory(limit?: number): NotificationRunHistoryPage;
}

export function createStockAnalyserNotificationRunHistoryMockHandlers(): StockAnalyserNotificationRunHistoryMockHandlers {
  return {
    getLatestRun: () => mockNotificationRuns[0],
    getRunHistory: (limit = DEFAULT_RUN_HISTORY_LIMIT) => {
      const runs = mockNotificationRuns.slice(0, Math.max(0, limit));
      // No more pages in the demo log: omit nextCursor when we returned everything.
      const nextCursor = runs.length < mockNotificationRuns.length ? 'cursor-demo-next' : undefined;
      return { runs, nextCursor };
    },
  };
}

export const stockAnalyserNotificationRunHistoryMockHandlers =
  createStockAnalyserNotificationRunHistoryMockHandlers();
