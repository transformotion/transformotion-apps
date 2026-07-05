/**
 * Portfolio Service
 *
 * Wraps GET/PUT /portfolio Lambda calls and coordinates Claude enrichment
 * (checking ANALYSIS#ticker cache before calling the proxy).
 */

import { getStockAnalyserClient } from '@/lib/api'
import { getConfig } from '@/lib/config'
import {
  getCacheSnapshot,
  setCacheSnapshot,
  type CacheMetadata,
} from '@/lib/services/cache/dynamo-ttl-cache'
import { callClaudeAPI } from '@/lib/hooks/use-claude'
import { getMockOhlcvData } from '@/lib/services/ai/fixtures/ohlcv-data'
import { latestPriceFromOhlcv } from '@/lib/market-data'
import {
  createStockAnalysisPrompt,
  normaliseStockAnalysisSignals,
  STOCK_ANALYSIS_SYSTEM_PROMPT,
} from '@/lib/analysis/stock-analysis-signals'
import type { PortfolioHolding, StockAnalysisResult } from './types'

/**
 * Overlay the REAL current price/change (from market data / OHLCV) onto an
 * analysis. The AI cannot supply live prices, so its `price`/`change` are
 * discarded here and replaced with the latest close. Best-effort: a failed
 * quote leaves them null (the UI degrades gracefully).
 */
async function overlayLivePrice(
  ticker: string,
  analysis: StockAnalysisResult,
): Promise<StockAnalysisResult> {
  // #603: flag no-price so the tab shows "price data unavailable (newly listed?)". Never
  // downgrade a stronger insufficient-data status.
  const noPrice = analysis.dataStatus === 'insufficient-data' ? {} : { dataStatus: 'no-price' as const }
  try {
    const ohlcv = getConfig().ai.provider === 'mock'
      ? getMockOhlcvData(ticker, '1mo', '1d')
      : await getStockAnalyserClient().getOhlcvData(ticker, '1mo', '1d')
    const { price, change } = latestPriceFromOhlcv(ohlcv)
    return { ...analysis, price, change, ...(price === null ? noPrice : {}) }
  } catch {
    return { ...analysis, price: null, change: null, ...noPrice }
  }
}

// ── Mock holdings ─────────────────────────────────────────────────────────────

const MOCK_HOLDINGS: PortfolioHolding[] = [
  { ticker: 'CBA.AX',  shares: 150,  avgCost: 98.50,  isGifted: false, addedAt: Date.now() - 86400000 * 90 },
  { ticker: 'BHP.AX',  shares: 200,  avgCost: 38.20,  isGifted: false, addedAt: Date.now() - 86400000 * 60 },
  { ticker: 'CSL.AX',  shares: 25,   avgCost: 265.00, isGifted: false, addedAt: Date.now() - 86400000 * 45 },
  { ticker: 'WDS.AX',  shares: 500,  avgCost: 31.40,  isGifted: false, addedAt: Date.now() - 86400000 * 30 },
  { ticker: 'NVDA',    shares: 10,   avgCost: 620.00, isGifted: false, addedAt: Date.now() - 86400000 * 20 },
  { ticker: 'A200.AX', shares: 100,  avgCost: 130.00, isGifted: false, addedAt: Date.now() - 86400000 * 10 },
]

let mockHoldingsStore: PortfolioHolding[] = [...MOCK_HOLDINGS]

// ── Analysis prompt (must match analyser-tab.tsx so cache keys are reused) ───

// Portfolio enrichment shares the analyser prompt/cache shape.

// ── Service ───────────────────────────────────────────────────────────────────

const realPortfolioService = {
  async getHoldings(): Promise<PortfolioHolding[]> {
    const res = await getStockAnalyserClient().getPortfolio()
    return res.holdings ?? []
  },
  async saveHoldings(holdings: PortfolioHolding[]): Promise<void> {
    await getStockAnalyserClient().putPortfolio({ holdings })
  },
}

const mockPortfolioService = {
  async getHoldings(): Promise<PortfolioHolding[]> {
    return [...mockHoldingsStore]
  },
  async saveHoldings(holdings: PortfolioHolding[]): Promise<void> {
    mockHoldingsStore = [...holdings]
  },
}

export const portfolioService = {
  ...(getConfig().storage.provider === 'local' ? mockPortfolioService : realPortfolioService),

  /**
   * Enrich each ticker with Claude analysis.
   * Cache hits are returned immediately; misses are processed sequentially.
   * `onResult` fires for each ticker as its result arrives.
   */
  async enrichHoldings(
    tickers: string[],
    onResult: (ticker: string, result: StockAnalysisResult) => void,
    signal?: AbortSignal,
    onCacheMetadata?: (ticker: string, metadata: CacheMetadata) => void,
  ): Promise<void> {
    // 1. Check cache for all tickers simultaneously
    const cacheChecks = await Promise.all(
      tickers.map(async (ticker) => ({
        ticker,
        cached: await getCacheSnapshot<StockAnalysisResult>(`ANALYSIS#${ticker}`),
      }))
    )

    // 2. Deliver cache hits — overlaying the real (market-data) price/change.
    for (const { ticker, cached } of cacheChecks) {
      if (cached) {
        onCacheMetadata?.(ticker, { cachedAt: cached.cachedAt, expiresAt: cached.expiresAt })
        onResult(ticker, await overlayLivePrice(ticker, normaliseStockAnalysisSignals(cached.value)))
      }
    }

    // 3. Call Claude sequentially for cache misses
    const misses = cacheChecks.filter(r => !r.cached).map(r => r.ticker)

    for (const ticker of misses) {
      if (signal?.aborted) break
      try {
        const result = await callClaudeAPI<StockAnalysisResult>(
          // webSearch: always-on grounding — parity with the Analyser tab, which sends
          // the same prompt with webSearch:isLive. Portfolio + Watchlist (both route
          // through this enrichHoldings) have no Live/Fast toggle in v0 and are
          // always-live by design, so this is hardcoded true — no ModeToggle, zero
          // surface change. Only cache MISSES reach here, so cost stays bounded.
          { prompt: createStockAnalysisPrompt(ticker), systemPrompt: STOCK_ANALYSIS_SYSTEM_PROMPT, webSearch: true },
          { signal }
        )
        const normalisedResult = normaliseStockAnalysisSignals(result)
        try {
          const entry = await setCacheSnapshot(`ANALYSIS#${ticker}`, normalisedResult)
          onCacheMetadata?.(ticker, { cachedAt: entry.cachedAt, expiresAt: entry.expiresAt })
        } catch (err) {
          console.warn('[portfolio] cache write failed for', ticker, err)
        }
        onResult(ticker, await overlayLivePrice(ticker, normalisedResult))
      } catch (err) {
        if (signal?.aborted) break
        console.warn('[portfolio] enrichment failed for', ticker, err)
      }
    }
  },
}
