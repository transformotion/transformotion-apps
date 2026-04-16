/**
 * Portfolio Service
 *
 * Wraps GET/PUT /portfolio Lambda calls and coordinates Claude enrichment
 * (checking ANALYSIS#ticker cache before calling the proxy).
 */

import { getAPIClient } from '@/lib/api/client'
import { dynamoCache } from '@/lib/services/cache/dynamo-ttl-cache'
import { callClaudeAPI } from '@/lib/hooks/use-claude'
import type { PortfolioHolding, StockAnalysisResult } from './types'

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

export const portfolioService = {

  async getHoldings(): Promise<PortfolioHolding[]> {
    const res = await getAPIClient().get<{ holdings: PortfolioHolding[] }>('/portfolio')
    return res.holdings ?? []
  },

  async saveHoldings(holdings: PortfolioHolding[]): Promise<void> {
    await getAPIClient().put('/portfolio', { holdings })
  },

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

    // 2. Deliver cache hits immediately
    for (const { ticker, cached } of cacheChecks) {
      if (cached) onResult(ticker, cached)
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
        onResult(ticker, result)
      } catch (err) {
        if (signal?.aborted) break
        console.warn('[portfolio] enrichment failed for', ticker, err)
      }
    }
  },
}
