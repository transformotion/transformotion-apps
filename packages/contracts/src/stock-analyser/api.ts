import type { ApiRoute, EmptyRequest } from '../_shared/api';
import { emptyRequest } from '../_shared/api';
import type { AiRuntimeConfigUpdate, AppAiRuntimeConfigResponse } from '../_shared/ai-runtime';
import { exampleAppAiRuntimeConfigResponse } from '../_shared/ai-runtime';
import type {
  CacheFreshnessConfigRecord,
  CacheFreshnessPreset,
  StockAnalyserCacheFreshnessPolicy,
} from './cache-freshness';
import { exampleCacheFreshnessConfigRecord } from './cache-freshness';
import {
  exampleCachedQuote,
  exampleOhlcvPoint,
  exampleCycleSignal,
  examplePortfolioHolding,
  exampleStockAnalyserSettings,
  exampleWatchlistItem,
  type CachedQuotesResponse,
  type CycleDataResponse,
  type PortfolioHolding,
  type PriceInterval,
  type PriceOhlcvResponse,
  type PriceRange,
  type StockAnalyserAiRequest,
  type StockAnalyserAiResponse,
  type StockAnalyserSettings,
  type WatchlistItem,
  type WriteAnalysisCacheRequest,
} from './types';

export interface PutPortfolioRequest {
  holdings: PortfolioHolding[];
}

export interface PutWatchlistRequest {
  items: WatchlistItem[];
}

export interface GetAnalysisCacheResponse {
  data: unknown;
  cachedAt: number;
  expiresAt: number;
  dataType?: string;
  mode?: string;
}

export interface CycleQuery {
  ticker: string;
}

export interface PriceQuery {
  ticker: string;
  range?: PriceRange;
  interval?: PriceInterval;
}

export interface SettingsResponse {
  settings: StockAnalyserSettings;
}

export type PatchSettingsRequest = Partial<Pick<StockAnalyserSettings, 'explanatoryTextEnabled' | 'defaultSearchMode'>>;

export interface CacheFreshnessConfigResponse {
  config: CacheFreshnessConfigRecord;
}

/**
 * Update the app-scoped cache-freshness config (active policy and/or preset
 * library). Authorization: site-admin OR stock-app-admin. Runtime MUST validate
 * with `isValidCacheFreshnessPolicy`/`isValidCacheFreshnessPreset` and reject
 * invalid payloads rather than persisting them.
 */
export interface PutCacheFreshnessConfigRequest {
  activePolicy?: StockAnalyserCacheFreshnessPolicy;
  presets?: CacheFreshnessPreset[];
}

/**
 * App-owned AI runtime config (M15.1). Stock Analyser owns its provider/model
 * override and reads the platform default read-only.
 */
const exampleStockAnalyserAiConfigResponse: AppAiRuntimeConfigResponse = {
  ...exampleAppAiRuntimeConfigResponse,
  appSlug: 'stock-analyser',
};

export type StockAnalyserRoute =
  | ApiRoute<EmptyRequest, { holdings: PortfolioHolding[] }>
  | ApiRoute<PutPortfolioRequest, { ok: true }>
  | ApiRoute<EmptyRequest, { items: WatchlistItem[] }>
  | ApiRoute<PutWatchlistRequest, { ok: true }>
  | ApiRoute<EmptyRequest, GetAnalysisCacheResponse>
  | ApiRoute<WriteAnalysisCacheRequest, { ok: true }>
  | ApiRoute<EmptyRequest, { ok: true }>
  | ApiRoute<CycleQuery, CycleDataResponse>
  | ApiRoute<PriceQuery, PriceOhlcvResponse>
  | ApiRoute<EmptyRequest, CachedQuotesResponse>
  | ApiRoute<StockAnalyserAiRequest, StockAnalyserAiResponse>
  | ApiRoute<EmptyRequest, SettingsResponse>
  | ApiRoute<PatchSettingsRequest, SettingsResponse>
  | ApiRoute<EmptyRequest, CacheFreshnessConfigResponse>
  | ApiRoute<PutCacheFreshnessConfigRequest, CacheFreshnessConfigResponse>
  | ApiRoute<EmptyRequest, AppAiRuntimeConfigResponse>
  | ApiRoute<AiRuntimeConfigUpdate, AppAiRuntimeConfigResponse>;

export const stockAnalyserRoutes = [
  { method: 'GET', path: '/portfolio', auth: 'account', request: emptyRequest, response: { holdings: [examplePortfolioHolding] } },
  { method: 'PUT', path: '/portfolio', auth: 'account', request: { holdings: [examplePortfolioHolding] }, response: { ok: true } },
  { method: 'GET', path: '/watchlist', auth: 'account', request: emptyRequest, response: { items: [exampleWatchlistItem] } },
  { method: 'PUT', path: '/watchlist', auth: 'account', request: { items: [exampleWatchlistItem] }, response: { ok: true } },
  {
    method: 'GET',
    path: '/analysis-cache/{key}',
    auth: 'account',
    request: emptyRequest,
    response: { data: { signal: 'hold' }, cachedAt: 1798761600, expiresAt: 1798848000, dataType: 'analysis' },
  },
  {
    method: 'PUT',
    path: '/analysis-cache/{key}',
    auth: 'account',
    request: { data: { signal: 'hold' }, ttlSeconds: 86400, type: 'analysis' },
    response: { ok: true },
  },
  { method: 'DELETE', path: '/analysis-cache/{key}', auth: 'account', request: emptyRequest, response: { ok: true } },
  {
    method: 'GET',
    path: '/cycle/ohlcv?ticker={ticker}',
    auth: 'account',
    request: { ticker: 'BHP.AX' },
    response: {
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
    },
  },
  {
    method: 'GET',
    path: '/price/ohlcv?ticker={ticker}&range={range}&interval={interval}',
    auth: 'account',
    request: { ticker: 'BHP.AX', range: '1y', interval: '1d' },
    response: {
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
    },
  },
  // M21 — enumerate the latest SHARED-cached quote per ticker for the SA Home
  // dashboard. Read-only: queries the SHARED partition (SK begins_with
  // MARKET-DATA#) and NEVER triggers a fetch/warm; an empty cache yields an
  // empty array (a valid state). Owner spec wrote
  // /api/stock/v1/market/cached-quotes; normalised here to the SA contract's
  // bare-path convention (siblings: /portfolio, /watchlist, /price/ohlcv).
  { method: 'GET', path: '/market/cached-quotes', auth: 'account', request: emptyRequest, response: { quotes: [exampleCachedQuote] } },
  {
    method: 'POST',
    path: '/api/claude',
    auth: 'account',
    request: { prompt: 'Analyse BHP.AX', asyncMode: true, appName: 'stock-analyser' },
    response: { jobId: 'job-sa-123' },
  },
  { method: 'GET', path: '/settings', auth: 'account', request: emptyRequest, response: { settings: exampleStockAnalyserSettings } },
  {
    method: 'PATCH',
    path: '/settings',
    auth: 'account',
    request: { explanatoryTextEnabled: false },
    response: { settings: exampleStockAnalyserSettings },
  },
  // Cache-freshness config: app-scoped, admin-edited (site-admin OR
  // stock-app-admin). `auth: 'account'` is the coarse contract marker; runtime
  // enforces the admin authorization and validates the payload.
  { method: 'GET', path: '/cache-freshness', auth: 'account', request: emptyRequest, response: { config: exampleCacheFreshnessConfigRecord } },
  {
    method: 'PUT',
    path: '/cache-freshness',
    auth: 'account',
    request: { activePolicy: exampleCacheFreshnessConfigRecord.activePolicy },
    response: { config: exampleCacheFreshnessConfigRecord },
  },
  { method: 'GET', path: '/ai-config', auth: 'account', request: emptyRequest, response: exampleStockAnalyserAiConfigResponse },
  {
    method: 'PUT',
    path: '/ai-config/override',
    auth: 'account',
    request: { provider: 'openai', model: 'gpt-5.4-mini' },
    response: {
      ...exampleStockAnalyserAiConfigResponse,
      appOverride: {
        pk: 'AI_CONFIG',
        sk: 'APP#stock-analyser',
        provider: 'openai',
        model: 'gpt-5.4-mini',
        updatedAt: '2026-06-07T00:00:00.000Z',
      },
      effective: { provider: 'openai', model: 'gpt-5.4-mini', source: 'app_override' },
    },
  },
  { method: 'DELETE', path: '/ai-config/override', auth: 'account', request: emptyRequest, response: exampleStockAnalyserAiConfigResponse },
] as const satisfies readonly StockAnalyserRoute[];
