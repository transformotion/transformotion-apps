/**
 * useClaude Hook
 *
 * Async Claude API integration with polling pattern.
 *
 * Flow:
 * 1. POST /api/claude { prompt, asyncMode: true } -> { jobId }
 * 2. Poll GET /analysis-cache/job-{jobId} every 2.5s
 * 3. When complete, return parsed JSON content
 *
 * Provider selected via config.ai.provider: 'mock' (local) or 'claude' (deployed).
 */

import { useState, useCallback, useRef } from 'react'
import { getConfig } from '../config'
import { getStockAnalyserClient, stockAnalyserClient } from '../api'
import { mockMarketAnalysisResult } from '@transformotion/contracts/stock-analyser/mocks'
import {
  getCacheSnapshot,
  setCacheSnapshot,
  type CacheMetadata,
} from '../services/cache/dynamo-ttl-cache'
import { authService } from '../services/auth'

export interface ClaudeRequest {
  prompt: string
  webSearch?: boolean
  systemPrompt?: string
  maxTokens?: number
  /**
   * Structured-output surface ('analyser' | 'market'). Forwarded to the proxy,
   * which resolves it server-side to the canonical schema and constrains the
   * model's output. Surfaces without a schema (etfs/metals/recs) omit it.
   */
  surface?: string
  /**
   * DynamoDB cache key (e.g. 'MARKET#ASX', 'ANALYSIS#CBA.AX').
   * When provided: checks DynamoDB before calling Claude, saves result after.
   * Cache is always checked regardless of AI provider.
   */
  cacheKey?: string
  /**
   * When true, skip the cache read and call Claude directly.
   * The fresh result is still written back to cache afterwards.
   */
  forceRefresh?: boolean
  onCacheMetadata?: (metadata: CacheMetadata) => void
}

export interface ClaudeResponse<T = unknown> {
  content: T
  usage?: {
    inputTokens: number
    outputTokens: number
  }
}

function parseCachedJson<T>(data: unknown): T {
  return typeof data === 'string' ? JSON.parse(data) as T : data as T
}

export interface ClaudeJobStatus<T = unknown> {
  status: 'pending' | 'processing' | 'complete' | 'error'
  content?: T
  error?: string
  createdAt?: string
  completedAt?: string
}

export interface UseClaudeOptions {
  /** Cache key for storing result (optional) */
  cacheKey?: string
}

export interface UseClaudeReturn<T = unknown> {
  /** Call Claude with a prompt */
  callClaude: (request: ClaudeRequest) => Promise<T>
  /** Current loading state */
  isLoading: boolean
  /** Current error if any */
  error: Error | null
  /** Current job ID if polling */
  jobId: string | null
  /** Abort the current request */
  abort: () => void
}

/**
 * Hook for calling Claude API with async polling pattern
 * 
 * @example
 * const { callClaude, isLoading, error } = useClaude<AnalysisResult>()
 * 
 * const result = await callClaude({
 *   prompt: "Analyze this transaction...",
 *   webSearch: false
 * })
 */
export function useClaude<T = unknown>(): UseClaudeReturn<T> {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [jobId, setJobId] = useState<string | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  const abort = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
    setIsLoading(false)
    setJobId(null)
  }, [])

  const callClaude = useCallback(async (request: ClaudeRequest): Promise<T> => {
    const config = getConfig()
    const { cacheKey, onCacheMetadata, ...claudeRequest } = request

    // Abort any existing request
    abort()

    setIsLoading(true)
    setError(null)
    abortControllerRef.current = new AbortController()

    try {
      // ── Cache check (skipped when forceRefresh is true) ──────────────────
      if (cacheKey && !request.forceRefresh) {
        const cached = await getCacheSnapshot<T>(cacheKey)
        if (cached !== null) {
          console.log('[useClaude] cache hit:', cacheKey)
          onCacheMetadata?.({ cachedAt: cached.cachedAt, expiresAt: cached.expiresAt })
          return cached.value
        }
        console.log('[useClaude] cache miss:', cacheKey)
      } else if (cacheKey && request.forceRefresh) {
        console.log('[useClaude] force refresh — bypassing cache:', cacheKey)
      }

      // ── Call Claude (mock or real) ────────────────────────────────────────
      let result: T

      if (config.ai.provider === 'mock') {
        result = await mockClaudeCall<T>(claudeRequest, abortControllerRef.current.signal)
      } else {
        result = await subscribeViaWss<T>(claudeRequest, config.ai.wssUrl, abortControllerRef.current.signal)
      }

      // ── Write to cache (fire-and-forget) ─────────────────────────────────
      if (cacheKey && result) {
        setCacheSnapshot(cacheKey, result).then(entry => {
          onCacheMetadata?.({ cachedAt: entry.cachedAt, expiresAt: entry.expiresAt })
        }).catch(err => {
          console.warn('[useClaude] cache write failed:', cacheKey, err)
        })
      }

      return result
    } catch (err) {
      // Don't set error state for aborted requests - they're intentional cancellations
      if (err instanceof Error && (err.name === 'AbortError' || err.message === 'Request aborted')) {
        return undefined as unknown as T
      }
      const error = err instanceof Error ? err : new Error('Unknown error')
      setError(error)
      throw error
    } finally {
      setIsLoading(false)
      setJobId(null)
      abortControllerRef.current = null
    }
  }, [abort])

  return {
    callClaude,
    isLoading,
    error,
    jobId,
    abort,
  }
}

async function subscribeViaWss<T>(
  request: Omit<ClaudeRequest, 'cacheKey' | 'forceRefresh'>,
  wssUrl: string,
  signal: AbortSignal,
): Promise<T> {
  if (!wssUrl) throw new Error('WSS URL not configured (NEXT_PUBLIC_SA_WSS_URL)')

  const token     = await authService.getIdToken()
  const accountId = (await authService.getAccountIdForApp('stock-analyser')) ?? ''

  if (!token) throw new Error('No authentication token available')

  const ws = new WebSocket(
    `${wssUrl}?token=${encodeURIComponent(token)}&app=stock-analyser&accountId=${encodeURIComponent(accountId)}`
  )

  // Phase 1: open connection and get connectionId via init handshake
  const connectionId = await new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(() => { ws.close(); reject(new Error('WSS connection handshake timeout')) }, 10_000)
    const onAbort = () => { clearTimeout(timeout); ws.close(); reject(new Error('Request aborted')) }
    signal.addEventListener('abort', onAbort, { once: true })
    ws.onerror = () => { clearTimeout(timeout); signal.removeEventListener('abort', onAbort); reject(new Error('WSS connection failed')) }
    ws.onopen  = () => ws.send(JSON.stringify({ action: 'init' }))
    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data as string) as { type: string; connectionId?: string }
        if (msg.type === 'connected' && msg.connectionId) {
          clearTimeout(timeout)
          signal.removeEventListener('abort', onAbort)
          resolve(msg.connectionId)
        }
      } catch { /* ignore malformed messages */ }
    }
  })

  // Phase 2: start the job, then wait for job_complete notification
  const { jobId } = await stockAnalyserClient.claudeAsyncStart(
    { prompt: request.prompt, systemPrompt: request.systemPrompt, webSearch: request.webSearch, maxTokens: request.maxTokens, surface: request.surface },
    connectionId,
    signal,
  )

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => { ws.close(); reject(new Error('WSS job completion timeout')) }, 600_000)
    const onAbort = () => { clearTimeout(timeout); ws.close(); reject(new Error('Request aborted')) }
    signal.addEventListener('abort', onAbort, { once: true })
    ws.onerror = () => { clearTimeout(timeout); signal.removeEventListener('abort', onAbort); reject(new Error('WSS connection failed during job')) }
    ws.onclose = (evt) => {
      if (!evt.wasClean) { clearTimeout(timeout); signal.removeEventListener('abort', onAbort); reject(new Error('WSS connection closed unexpectedly')) }
    }
    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data as string) as { type: string }
        if (msg.type === 'job_complete') {
          clearTimeout(timeout)
          signal.removeEventListener('abort', onAbort)
          ws.close()
          resolve()
        }
      } catch { /* ignore */ }
    }
  })

  // Phase 3: read the completed job result from DynamoDB cache
  const item = await getStockAnalyserClient().getCache(`job-${jobId}`)
  const jobStatus = parseCachedJson<{ status: string; content?: string; message?: string }>(item.data)
  if (jobStatus.status === 'complete' && jobStatus.content) {
    try {
      return JSON.parse(stripCodeFences(jobStatus.content)) as T
    } catch {
      throw Object.assign(
        new Error('Claude returned a non-JSON response. Check the prompt includes explicit JSON instructions.'),
        { __jobError: true }
      )
    }
  }
  if (jobStatus.status === 'error') {
    throw Object.assign(new Error(jobStatus.message || 'Job failed'), { __jobError: true })
  }
  throw new Error('Job result was not complete after WSS notification')
}

/** Strip markdown code fences that Claude occasionally wraps around JSON responses. */
function stripCodeFences(text: string): string {
  return text
    .replace(/^```(?:json)?\s*\n?/i, '')
    .replace(/\n?```\s*$/i, '')
    .trim()
}


/**
 * Mock Claude call for development
 * Returns realistic mock data based on the prompt content,
 * matching the same data shapes as the real API will return.
 */
async function mockClaudeCall<T>(
  request: ClaudeRequest,
  signal: AbortSignal
): Promise<T> {
  // Simulate network delay
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(resolve, 800 + Math.random() * 700)
    signal.addEventListener('abort', () => {
      clearTimeout(timeout)
      reject(new Error('Request aborted'))
    })
  })

  if (signal.aborted) {
    throw new Error('Request aborted')
  }

  const prompt = request.prompt

  // --- Market Analysis: comprehensive macro + sector rotation ---
  if (prompt.includes('comprehensive market analysis') || prompt.includes('Analyse market sectors')) {
    // #535: sourced from the canonical contract mock so the UI shares one shape
    // (includes per-card `source` attribution).
    return mockMarketAnalysisResult as unknown as T
  }

  // --- Recommendations: stock picks ---
  if (prompt.includes('Provide stock recommendations')) {
    const isBottomOfCycle = prompt.includes('Bottom of cycle')
    const isEnergyFocus = prompt.includes('Energy') || prompt.includes('energy')
    
    return {
      stocks: isEnergyFocus ? [
        { ticker: "WDS.AX", company: "Woodside Energy Group Limited", sector: "Energy", subcategory: "Oil & Gas", price: 33.85, change: 2.2, verdict: "BUY", cyclePosition: 35, cycleStage: "early", conviction: true, bestExchange: "ASX", analysis: "Scarborough project is 94% complete targeting first LNG in Q4 2026 with strong cash flows expected. Louisiana LNG project targeting first production in 2029 positions the company for significant growth in global LNG demand." },
        { ticker: "STO.AX", company: "Santos Limited", sector: "Energy", subcategory: "Oil & Gas", price: 7.45, change: 10.0, verdict: "BUY", cyclePosition: 28, cycleStage: "early", conviction: true, bestExchange: "ASX", analysis: "Pikka Phase 1 project targeting first oil in 2026 will significantly increase production capacity. Current market capitalization of 25.5 billion with strong dividend yield of 4.43% supported by elevated energy prices." },
        { ticker: "ALD.AX", company: "Ampol Limited", sector: "Energy", subcategory: "Refining", price: 34.20, change: 21.3, verdict: "BUY", cyclePosition: 42, cycleStage: "mid", conviction: false, bestExchange: "ASX", analysis: "Strong financial results with Group RCOP EBITDA of 1.4 billion and manageable leverage ratio of 2.3 times. Diesel and jet fuel demand remains strong as key profit drivers for the business." },
        { ticker: "AGL.AX", company: "AGL Energy Limited", sector: "Energy", subcategory: "Utilities", price: 9.84, change: 2.0, verdict: "HOLD", cyclePosition: 52, cycleStage: "mid", conviction: false, bestExchange: "ASX", analysis: "Development pipeline expanded to 11.3 GW with better-than-anticipated battery performance providing transition value. Asset transitions and evolving policy settings create execution risks despite improved earnings stability." },
        { ticker: "ORG.AX", company: "Origin Energy Limited", sector: "Energy", subcategory: "Utilities", price: 8.75, change: 16.0, verdict: "BUY", cyclePosition: 38, cycleStage: "early", conviction: true, bestExchange: "ASX", analysis: "Leading Australia's renewable transition with significant battery storage projects coming online through 2025. Positioned as key beneficiary of clean energy buildout while maintaining income from existing assets." },
        { ticker: "PDN.AX", company: "Paladin Energy Limited", sector: "Energy", subcategory: "Uranium", price: 0.82, change: 7.0, verdict: "BUY", cyclePosition: 32, cycleStage: "early", conviction: false, bestExchange: "ASX", analysis: "Langer Heinrich Mine in Namibia operational with renewed global interest in nuclear power as low-emission energy source. Rising uranium demand and long-term price support provide strong fundamentals for growth." },
      ] : isBottomOfCycle ? [
        { ticker: "STO.AX", company: "Santos Limited", sector: "Energy", subcategory: "Oil & Gas", price: 6.85, change: -2.15, verdict: "BUY", cyclePosition: 15, cycleStage: "early", conviction: true, bestExchange: "ASX", analysis: "Direct beneficiary of oil crisis with strong pricing power and cash generation. Trading at compressed valuation after recent selloff presents compelling entry point for long-term investors." },
        { ticker: "ORG.AX", company: "Origin Energy", sector: "Energy", subcategory: "Utilities", price: 8.42, change: -1.85, verdict: "BUY", cyclePosition: 18, cycleStage: "early", conviction: true, bestExchange: "ASX", analysis: "Oversold on China growth fears with supply constraints supporting commodity prices. Renewable energy transition creates significant upside as energy transition accelerates globally." },
        { ticker: "REA.AX", company: "REA Group", sector: "Real Estate", subcategory: "Digital Platforms", price: 185.20, change: -0.45, verdict: "BUY", cyclePosition: 22, cycleStage: "early", conviction: false, bestExchange: "ASX", analysis: "Leading property portal with defensive characteristics valuable in stagflationary environment. Positioned to benefit from eventual property market recovery with strong digital moat." },
        { ticker: "APX.AX", company: "Appen Limited", sector: "Technology", subcategory: "AI Data Services", price: 2.15, change: -3.50, verdict: "BUY", cyclePosition: 8, cycleStage: "early", conviction: true, bestExchange: "ASX", analysis: "Critical AI training data provider at inflection point of AI adoption cycle. Extreme selloff creates opportunity as enterprise AI spending accelerates through 2026." },
        { ticker: "Z1P.AX", company: "Zip Co", sector: "Technology", subcategory: "Fintech", price: 0.85, change: -2.80, verdict: "BUY", cyclePosition: 12, cycleStage: "early", conviction: false, bestExchange: "ASX", analysis: "BNPL operator at cycle trough offering recovery potential as consumer sentiment improves. Strategic partnerships and cost management provide path to profitability." },
        { ticker: "MYR.AX", company: "Myer Holdings", sector: "Consumer Discretionary", subcategory: "Retail", price: 0.78, change: -1.50, verdict: "BUY", cyclePosition: 10, cycleStage: "early", conviction: false, bestExchange: "ASX", analysis: "Deeply depressed valuation with management focused on operational efficiency and inventory optimization. Consumer discretionary cycle turn could unlock significant value." },
      ] : [
        { ticker: "CBA.AX", company: "Commonwealth Bank", sector: "Financials", subcategory: "Banking", price: 115.42, change: 1.85, verdict: "BUY", cyclePosition: 35, cycleStage: "early", conviction: true, bestExchange: "ASX", analysis: "Australia's largest bank with fortress balance sheet and diversified revenue streams. Rising rates support net interest margin expansion while dividend yield remains attractive at 3.2%." },
        { ticker: "CSL.AX", company: "CSL Limited", sector: "Healthcare", subcategory: "Biopharmaceuticals", price: 298.50, change: 2.12, verdict: "BUY", cyclePosition: 28, cycleStage: "early", conviction: true, bestExchange: "ASX", analysis: "Global leader in immune globulins and recombinant therapies with recurring revenue model. Consistent earnings growth and strong pricing power provide defensive characteristics." },
        { ticker: "XRO.AX", company: "Xero Limited", sector: "Technology", subcategory: "Accounting Software", price: 142.50, change: 2.35, verdict: "BUY", cyclePosition: 32, cycleStage: "early", conviction: true, bestExchange: "ASX", analysis: "Cloud-based accounting platform with 3 million+ subscribers across multiple markets. Expanding into financial and operational planning tools creates new revenue opportunities." },
        { ticker: "WTC.AX", company: "WiseTech Global", sector: "Technology", subcategory: "Logistics Software", price: 98.20, change: 1.45, verdict: "BUY", cyclePosition: 45, cycleStage: "mid", conviction: true, bestExchange: "ASX", analysis: "Leading software-as-a-service platform for logistics operations with global customer base. High recurring revenue, strong unit economics, and international expansion driving growth." },
        { ticker: "NXT.AX", company: "NextDC", sector: "Technology", subcategory: "Data Centers", price: 18.45, change: 3.20, verdict: "BUY", cyclePosition: 38, cycleStage: "early", conviction: true, bestExchange: "ASX", analysis: "AI boom driving unprecedented demand for data center capacity and power infrastructure. Portfolio of hyperscale facilities positioned to capture structural growth in cloud computing." },
        { ticker: "FMG.AX", company: "Fortescue Metals", sector: "Materials", subcategory: "Iron Ore", price: 18.65, change: -0.85, verdict: "SELL", cyclePosition: 82, cycleStage: "peak", conviction: true, bestExchange: "ASX", analysis: "Cyclical iron ore producer at peak cycle facing margin compression from oversupply. China's property slowdown pressures near-term demand and pricing." },
      ],
    } as unknown as T
  }

  // --- Stock Analyser: individual stock deep dive ---
  if (prompt.includes('Analyse the stock')) {
    const tickerMatch = prompt.match(/Analyse the stock (\S+)/)
    const ticker = tickerMatch?.[1]?.toUpperCase() || 'UNKNOWN'
    
    // Mock data for known tickers
    const stockData: Record<string, { company: string; sector: string; price: number; change: number; verdict: string; cyclePosition: number; cycleStage: string; summary: string }> = {
      "EIQ.AX": { company: "Echo IQ Limited", sector: "Healthcare", price: 0.895, change: 11.87, verdict: "HOLD", cyclePosition: 85, cycleStage: "peak", summary: "Echo IQ is an AI-powered cardiac diagnostics company with FDA clearance for its heart disease detection technology. While the long-term potential is significant given the massive addressable market, the stock appears overextended after recent gains and faces cash runway concerns with approximately 12 months of funding remaining." },
      "CBA.AX": { company: "Commonwealth Bank of Australia", sector: "Financials", price: 115.42, change: 1.85, verdict: "BUY", cyclePosition: 35, cycleStage: "early", summary: "Australia's largest bank with fortress balance sheet and diversified revenue streams. Rising rates support net interest margin expansion while dividend yield remains attractive. Strong institutional support with solid technical momentum." },
      "BHP.AX": { company: "BHP Group Limited", sector: "Materials", price: 42.80, change: -0.85, verdict: "HOLD", cyclePosition: 55, cycleStage: "mid", summary: "World's largest mining company with diversified commodity exposure. Iron ore and copper operations remain strong but near-term headwinds from China property slowdown. Mid-cycle positioning suggests range-bound trading." },
      "CSL.AX": { company: "CSL Limited", sector: "Healthcare", price: 298.50, change: 2.12, verdict: "BUY", cyclePosition: 28, cycleStage: "early", summary: "Global leader in plasma-derived therapies with strong pricing power and recurring revenue model. Pipeline developments and margin expansion provide upside. Defensive characteristics attractive in current environment." },
      "A200.AX": { company: "BetaShares Australia 200 ETF", sector: "ETF", price: 144.46, change: -0.54, verdict: "HOLD", cyclePosition: 72, cycleStage: "mid", summary: "Broad market ETF tracking the ASX 200 index. Mixed signals with some analysts suggesting hold while awaiting further development, trading within recent support levels." },
      "ETPMAG.AX": { company: "Global X Physical Silver", sector: "ETF", price: 100.53, change: 1.75, verdict: "HOLD", cyclePosition: 40, cycleStage: "mid", summary: "Silver ETF trading 35.7% below 52-week high but still showing strong upward momentum despite elevated volatility. Industrial demand from solar sector provides structural support." },
    }
    
    const data = stockData[ticker] || {
      company: ticker.replace('.AX', '') + ' Limited',
      sector: "Unknown",
      price: 10.00 + Math.random() * 90,
      change: (Math.random() - 0.5) * 10,
      verdict: ["BUY", "HOLD", "SELL"][Math.floor(Math.random() * 3)],
      cyclePosition: Math.floor(Math.random() * 100),
      cycleStage: ["early", "mid", "late", "peak"][Math.floor(Math.random() * 4)],
      summary: `Analysis for ${ticker}. This stock shows mixed technical signals with momentum indicators suggesting caution. Further research recommended before taking positions.`
    }
    
    return {
      ticker,
      company: data.company,
      sector: data.sector,
      price: data.price,
      change: data.change,
      verdict: data.verdict,
      cyclePosition: data.cyclePosition,
      cycleStage: data.cycleStage,
      signals: [
        { name: "RSI", value: data.cyclePosition > 70 ? "75+" : data.cyclePosition < 30 ? "25" : "50", signal: data.cyclePosition > 70 ? "Bear" : data.cyclePosition < 30 ? "Bull" : "Neutral", label: data.cyclePosition > 70 ? "Overbought territory" : data.cyclePosition < 30 ? "Oversold territory" : "Neutral momentum" },
        { name: "Moving averages", value: data.change > 0 ? "Above 200-day MA" : "Below 200-day MA", signal: data.change > 0 ? "Bull" : "Bear", label: data.change > 0 ? "Long-term uptrend intact" : "Long-term downtrend" },
        { name: "MACD", value: data.verdict === "BUY" ? "Buy signal strengthening" : data.verdict === "SELL" ? "Sell signal active" : "Neutral crossover", signal: data.verdict === "BUY" ? "Bull" : data.verdict === "SELL" ? "Bear" : "Neutral", label: data.verdict === "BUY" ? "Positive momentum building" : data.verdict === "SELL" ? "Negative momentum" : "Consolidating" },
        { name: "Volume", value: data.cycleStage === "early" ? "Accumulation pattern" : data.cycleStage === "peak" ? "Distribution pattern" : "Average volume", signal: data.cycleStage === "early" ? "Bull" : data.cycleStage === "peak" ? "Bear" : "Neutral", label: data.cycleStage === "early" ? "Institutional buying detected" : data.cycleStage === "peak" ? "Smart money exiting" : "Normal trading activity" },
        { name: "P/E ratio", value: data.sector === "Healthcare" ? "N/A" : "18.5", signal: "Neutral", label: data.sector === "Healthcare" ? "Growth company" : "Fair valuation" },
        { name: "Debt / equity", value: "0.45", signal: "Bull", label: "Manageable debt levels" },
      ],
      summary: data.summary,
      risks: [
        "Market volatility and macroeconomic uncertainty",
        "Sector-specific headwinds may impact near-term performance",
        "Technical indicators suggest caution at current levels",
      ],
      rsiDivergence: data.cyclePosition > 70 ? "bearish" : data.cyclePosition < 30 ? "bullish" : "none",
      macdMomentum: data.verdict === "BUY" ? "strengthening" : data.verdict === "SELL" ? "weakening" : "flat",
      volumeTrend: data.cycleStage === "early" ? "confirming" : data.cycleStage === "peak" ? "diverging" : "neutral",
      cycleSummary: `Stock is in ${data.cycleStage} cycle position with ${data.cyclePosition > 70 ? "elevated reversal risk" : data.cyclePosition < 30 ? "recovery potential" : "balanced risk/reward"}.`,
    } as unknown as T
  }

  // --- Precious Metals ---
  if (prompt.includes('precious metals')) {
    return {
      metals: [
        { name: "Gold", symbol: "XAU/USD", ticker: "PMGOLD.AX", price: 4754, ytdChange: 14.2, todayChange: -1.19, signal: "NEUTRAL", weekLow: 3873, weekHigh: 5200, perthMintTicker: "PMGOLD.AX", perthMintName: "Perth Mint Gold", analysis: "Elevated geopolitical tensions from US-Iran conflict and Strait of Hormuz blockade continue driving safe-haven demand, though inflation concerns limit central bank rate cuts. Trading range of $4,400–$5,200 expected with bulls targeting $5,000+ amid continued central bank purchases." },
        { name: "Silver", symbol: "XAG/USD", ticker: "ETPMAG.AX", price: 74.78, ytdChange: 67.5, todayChange: -3.81, signal: "BULL", weekLow: 41.60, weekHigh: 89.20, perthMintTicker: "ETPMAG.AX", perthMintName: "Perth Mint Silver", analysis: "Strongest performer among precious metals with energy security driving solar demand acceleration. Industrial headwinds may create volatility but structural energy transition and relative undervaluation versus gold maintain long-term bullish outlook." },
        { name: "Platinum", symbol: "XPT/USD", ticker: "ETPMPT.AX", price: 2048, ytdChange: 81.4, todayChange: -2.29, signal: "BULL", weekLow: 1120, weekHigh: 2180, perthMintTicker: "ETPMPT.AX", perthMintName: "Perth Mint Platinum", analysis: "Trading at historic discount to gold despite supply constraints and deficit conditions. Expected to benefit from elevated lease rates and EV adoption catalysts via hydrogen fuel cells as low-emission energy source with jewelry demand upsides in China." },
        { name: "Palladium", symbol: "XPD/USD", ticker: "ETPMPD.AX", price: 1250, ytdChange: -15.3, todayChange: -2.1, signal: "NEUTRAL", weekLow: 950, weekHigh: 1650, perthMintTicker: "ETPMPD.AX", perthMintName: "Perth Mint Palladium", analysis: "Facing structural headwinds from EV adoption reducing catalytic converter demand and Russian supply normalization. Limited by substitution toward platinum and weakening automotive cycle outlook, though some recovery potential if industrial demand stabilizes." },
      ],
    } as unknown as T
  }

  // Fallback
  return { message: 'Mock response', timestamp: new Date().toISOString() } as unknown as T
}

/**
 * Standalone function for calling Claude without React hook
 * Useful for server-side or non-component contexts
 */
export async function callClaudeAPI<T = unknown>(
  request: ClaudeRequest,
  options: { signal?: AbortSignal } = {}
): Promise<T> {
  const config = getConfig()
  const signal = options.signal || new AbortController().signal

  if (config.ai.provider === 'mock') {
    return mockClaudeCall<T>(request, signal)
  }

  return subscribeViaWss<T>(request, config.ai.wssUrl, signal)
}
