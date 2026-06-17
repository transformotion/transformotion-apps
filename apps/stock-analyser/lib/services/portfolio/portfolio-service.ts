/**
 * Portfolio Service
 *
 * Wraps GET/PUT /portfolio Lambda calls and coordinates Claude enrichment
 * (checking ANALYSIS#ticker cache before calling the proxy).
 */

import { getStockAnalyserClient } from '@/lib/api'
import { getConfig } from '@/lib/config'
import { dynamoCache } from '@/lib/services/cache/dynamo-ttl-cache'
import { callClaudeAPI } from '@/lib/hooks/use-claude'
import { getMockOhlcvData } from '@/lib/services/ai/fixtures/ohlcv-data'
import { latestPriceFromOhlcv } from '@/lib/market-data'
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
  try {
    const ohlcv = getConfig().ai.provider === 'mock'
      ? getMockOhlcvData(ticker, '1mo', '1d')
      : await getStockAnalyserClient().getOhlcvData(ticker, '1mo', '1d')
    const { price, change } = latestPriceFromOhlcv(ohlcv)
    return { ...analysis, price, change }
  } catch {
    return { ...analysis, price: null, change: null }
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

const ANALYSIS_SYSTEM = 'You are a technical stock analyst. Provide realistic analysis with specific metrics, values, and interpretations. Respond with raw JSON only. Do not use markdown code fences.'

const analysisPrompt = (ticker: string) => `Analyse the stock ${ticker} and provide comprehensive technical analysis.

Return a JSON object with:
- ticker: the ticker symbol
- company: company name
- sector: sector classification
- price: current price (number)
- change: daily change percentage (number)
- verdict: one of "BUY", "SELL", "HOLD", "NEUTRAL"
- cyclePosition: 0-100 representing position in market cycle
- cycleStage: one of "early", "mid", "late", "peak"
- signals: array of metrics with { name, value, signal: "Bull"|"Bear"|"Neutral", label }
- summary: 1-2 sentence company overview
- risks: array of 3 key risks as bullet points
- rsiDivergence: "none", "bullish", or "bearish"
- macdMomentum: "strengthening", "weakening", or "flat"
- volumeTrend: "confirming", "diverging", or "neutral"
- cycleSummary: brief cycle position explanation

Return ONLY valid JSON.`

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
    signal?: AbortSignal
  ): Promise<void> {
    // 1. Check cache for all tickers simultaneously
    const cacheChecks = await Promise.all(
      tickers.map(async (ticker) => ({
        ticker,
        cached: await dynamoCache.get<StockAnalysisResult>(`ANALYSIS#${ticker}`),
      }))
    )

    // 2. Deliver cache hits — overlaying the real (market-data) price/change.
    for (const { ticker, cached } of cacheChecks) {
      if (cached) onResult(ticker, await overlayLivePrice(ticker, cached))
    }

    // 3. Call Claude sequentially for cache misses
    const misses = cacheChecks.filter(r => !r.cached).map(r => r.ticker)

    for (const ticker of misses) {
      if (signal?.aborted) break
      try {
        const result = await callClaudeAPI<StockAnalysisResult>(
          { prompt: analysisPrompt(ticker), systemPrompt: ANALYSIS_SYSTEM },
          { signal }
        )
        dynamoCache.set(`ANALYSIS#${ticker}`, result).catch(err =>
          console.warn('[portfolio] cache write failed for', ticker, err)
        )
        onResult(ticker, await overlayLivePrice(ticker, result))
      } catch (err) {
        if (signal?.aborted) break
        console.warn('[portfolio] enrichment failed for', ticker, err)
      }
    }
  },
}
