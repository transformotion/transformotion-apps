"use client"

import { useState, useEffect } from "react"
import { useNavigation, type TabId } from "../app-shell"
import {
  PageHeader,
  Card,
  StockIcon,
  VerdictBadge,
  BackLink,
  PrimaryButton,
  SecondaryButton,
  EmptyState,
  CacheStatusBar,
  ModeToggle,
  CycleGauge,
  FullCycleGauge,
  type Verdict,
  type CycleStage,
} from "@transformotion/ui-primitives"
import { Spinner } from "@transformotion/ui-primitives"
import { 
  Search,
  TrendingUp,
  Eye,
  EyeOff,
  AlertCircle,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useClaude } from "@/lib/hooks"
import { useCycleData } from "@/lib/hooks/use-cycle-data"
import { useOhlcvData } from "@/lib/hooks/use-ohlcv-data"
import type { OhlcvRange } from "@transformotion/api-client"
import { PriceChart } from "@/components/price-chart/price-chart"

interface SignalMetric {
  name: string
  value: string
  signal: "Bull" | "Bear" | "Neutral"
  label: string
}

interface AnalysisResult {
  ticker: string
  company: string
  sector: string
  price: number
  change: number
  verdict: Verdict
  cyclePosition: number
  cycleStage: CycleStage
  signals: SignalMetric[]
  summary: string
  risks: string[]
  rsiDivergence: "none" | "bullish" | "bearish"
  macdMomentum: "strengthening" | "weakening" | "flat"
  volumeTrend: "confirming" | "diverging" | "neutral"
  cycleSummary: string
}

const QUICK_PICKS = ["CBA.AX", "BHP.AX", "CSL.AX", "AAPL", "NVDA", "MSFT"]

const SOURCE_LABELS: Record<TabId, string> = {
  market: "Market Analysis",
  recs: "Recommendations",
  etfs: "ETFs",
  metals: "Precious Metals",
  analyser: "Analyser",
  portfolio: "Portfolio",
  watchlist: "Watchlist",
  settings: "Settings",
}

export function AnalyserTab({ 
  initialTicker,
  source,
}: { 
  initialTicker?: string | null
  source?: TabId | null
}) {
  const { navigateTo, clearAnalyserContext, isOnWatchlist, addToWatchlist, removeFromWatchlist } = useNavigation()
  const [isLive, setIsLive] = useState(false)
  const [searchValue, setSearchValue] = useState("")
  const [result, setResult] = useState<AnalysisResult | null>(null)

  const [chartRange, setChartRange] = useState<OhlcvRange>('1y')

  const { callClaude, isLoading: isAnalyzing, error } = useClaude<AnalysisResult>()
  const { data: liveData, isLoading: isLoadingLive, error: liveError, fetch: fetchLive } = useCycleData()
  const { data: ohlcvData, isLoading: isLoadingChart, fetch: fetchOhlcv } = useOhlcvData()

  // Auto-analyse only if navigated from another tab (source is set)
  useEffect(() => {
    if (initialTicker && source) {
      setSearchValue(initialTicker)
      runAnalysis(initialTicker)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTicker, source])

  // Fetch live OHLCV cycle data whenever live mode is active and we have a result
  useEffect(() => {
    if (isLive && result?.ticker) {
      fetchLive(result.ticker)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLive, result?.ticker])

  // Fetch price chart data whenever ticker or selected range changes
  useEffect(() => {
    if (result?.ticker) {
      fetchOhlcv(result.ticker, chartRange)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result?.ticker, chartRange])

  const runAnalysis = async (ticker: string, forceRefresh = false) => {
    if (!ticker || isAnalyzing) return

    const analysisResult = await callClaude({
      cacheKey: `ANALYSIS#${ticker}`,
      forceRefresh,
      prompt: `Analyse the stock ${ticker} and provide comprehensive technical analysis.
      
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
  Examples: { name: "RSI", value: "80", signal: "Bear", label: "Extremely overbought" }
           { name: "Volume", value: "Declining on advances", signal: "Bear", label: "Bearish divergence pattern" }
- summary: 1-2 sentence company overview
- risks: array of 3 key risks as bullet points
- rsiDivergence: "none", "bullish", or "bearish"
- macdMomentum: "strengthening", "weakening", or "flat"
- volumeTrend: "confirming", "diverging", or "neutral"
- cycleSummary: brief cycle position explanation

Return ONLY valid JSON.`,
      systemPrompt: "You are a technical stock analyst. Provide realistic analysis with specific metrics, values, and interpretations. Respond with raw JSON only. Do not use markdown code fences.",
    })

    if (analysisResult) {
      setResult(analysisResult)
    }
  }

  const handleBack = () => {
    if (source) {
      clearAnalyserContext()
      navigateTo(source)
    }
  }

  const onWatchlist = result ? isOnWatchlist(result.ticker) : false

  return (
    <div className="p-4 space-y-4">
      {/* Back link if came from another tab */}
      {source && (
        <BackLink 
          label={`Back to ${SOURCE_LABELS[source]}`}
          onClick={handleBack}
        />
      )}

      {/* Header */}
      <PageHeader
        title="Analyser"
        subtitle="Deep-dive technical analysis"
      />

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <input
          type="text"
          value={searchValue}
          onChange={(e) => setSearchValue(e.target.value.toUpperCase())}
          onKeyDown={(e) => e.key === "Enter" && runAnalysis(searchValue)}
          placeholder="Search ticker or company..."
          className="w-full h-11 pl-10 pr-4 bg-card border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
        />
      </div>

      {/* Quick picks */}
      {!result && (
        <div className="flex flex-wrap gap-2">
          {QUICK_PICKS.map((ticker) => (
            <button
              key={ticker}
              onClick={() => { setSearchValue(ticker); runAnalysis(ticker); }}
              className="px-3 py-1.5 bg-surface2 text-sm text-muted-foreground rounded-lg hover:text-foreground transition-colors"
            >
              {ticker}
            </button>
          ))}
        </div>
      )}

      {/* Error display */}
      {error && (
        <div className="p-3 rounded-lg bg-signal-red/10 border border-signal-red/20 flex items-start gap-2">
          <AlertCircle className="size-4 text-signal-red mt-0.5 shrink-0" />
          <div className="text-sm text-signal-red">{error?.message}</div>
        </div>
      )}

      {/* Cache Status / Mode Toggle - right above the action button */}
      {result ? (
        <CacheStatusBar
          freshness="recent"
          lastUpdated="Updated 8 minutes ago"
          isLive={isLive}
          onRefresh={() => runAnalysis(result.ticker, true)}
          onToggleMode={() => setIsLive(!isLive)}
        />
      ) : (
        <ModeToggle 
          isLive={isLive} 
          onToggle={() => setIsLive(!isLive)} 
          cacheAge="8 minutes ago"
          freshness="fresh"
        />
      )}

      {/* Analyse Button - always show when there's a search value */}
      {searchValue && (
        <PrimaryButton
          onClick={() => runAnalysis(searchValue)}
          disabled={isAnalyzing}
          icon={TrendingUp}
          className="w-full"
        >
          {isAnalyzing ? (
            <>
              <Spinner className="size-4" />
              Analysing {searchValue}...
            </>
          ) : (
            `Analyse ${searchValue}`
          )}
        </PrimaryButton>
      )}

      {/* Watchlist Button - near action buttons */}
      {result && !isAnalyzing && (
        <SecondaryButton
          onClick={() => onWatchlist ? removeFromWatchlist(result.ticker) : addToWatchlist(result.ticker, result.company)}
          icon={onWatchlist ? EyeOff : Eye}
          className="w-full"
        >
          {onWatchlist ? "Remove from Watchlist" : `+ Add ${result.ticker} to Watchlist`}
        </SecondaryButton>
      )}

      {/* Results */}
      {result && !isAnalyzing && (
        <div className="space-y-6">
          {/* Stock Header */}
          <div className="space-y-3">
            <div className="text-xs text-muted-foreground">
              {result.sector} · ASX · Stock
            </div>
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-2xl font-bold text-foreground">{result.company}</h2>
                <div className="flex items-baseline gap-3 mt-2">
                  <span className="text-3xl font-bold text-foreground">A${result.price.toFixed(3)}</span>
                  <span className="text-sm font-semibold text-signal-green">+{result.change.toFixed(2)}%</span>
                </div>
              </div>
              <VerdictBadge verdict={result.verdict} size="md" />
            </div>
          </div>

          {/* Price Chart */}
          <Card>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Price History
                {isLoadingChart && <span className="ml-2 text-[10px] font-normal normal-case">Loading…</span>}
              </h3>
              <div className="flex gap-1">
                {(['1mo', '3mo', '6mo', '1y', '5y'] as OhlcvRange[]).map((r) => (
                  <button
                    key={r}
                    onClick={() => setChartRange(r)}
                    className={cn(
                      'px-2 py-0.5 text-[10px] font-medium rounded transition-colors',
                      chartRange === r
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {r.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
            {ohlcvData ? (
              <PriceChart data={ohlcvData} height={260} />
            ) : (
              !isLoadingChart && (
                <div className="flex items-center justify-center h-[260px] text-xs text-muted-foreground">
                  No price data available
                </div>
              )
            )}
            {isLoadingChart && (
              <div className="flex items-center justify-center h-[260px]">
                <Spinner className="size-5" />
              </div>
            )}
          </Card>

          {/* Cycle Position Gauge */}
          <Card>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">
              Cycle Position{isLive && isLoadingLive && <span className="ml-2 text-[10px] font-normal normal-case text-muted-foreground">Loading live data…</span>}
              {isLive && liveData && <span className="ml-2 text-[10px] font-normal normal-case text-signal-green">Live</span>}
            </h3>
            <FullCycleGauge
              score={isLive && liveData ? liveData.cyclePosition : result.cyclePosition}
              stage={isLive && liveData ? liveData.cycleStage   : result.cycleStage}
              rsiDivergence={isLive && liveData ? liveData.rsiDivergence : result.rsiDivergence}
              macdMomentum={isLive  && liveData ? liveData.macdMomentum  : result.macdMomentum}
              volumeTrend={isLive   && liveData ? liveData.volumeTrend   : result.volumeTrend}
              summary={isLive       && liveData ? liveData.cycleSummary  : result.cycleSummary}
            />
          </Card>

          {/* Technical Signals Grid - 3 columns */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 px-4">
              Signals
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {result.signals.map((signal, i) => (
                <Card key={i}>
                  <div className="space-y-2">
                    <div className="flex items-start justify-between">
                      <h4 className="text-xs font-semibold text-muted-foreground">{signal.name}</h4>
                      <span className={cn(
                        "px-2 py-0.5 rounded text-[10px] font-semibold",
                        signal.signal === "Bull" ? "bg-signal-green/20 text-signal-green" :
                        signal.signal === "Bear" ? "bg-signal-red/20 text-signal-red" :
                        "bg-muted/50 text-muted-foreground"
                      )}>
                        {signal.signal}
                      </span>
                    </div>
                    <p className="text-lg font-bold text-foreground">{signal.value}</p>
                    <p className="text-xs text-muted-foreground">{signal.label}</p>
                  </div>
                </Card>
              ))}
            </div>
          </div>

          {/* Summary */}
          <Card>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              Summary
            </h3>
            <p className="text-sm text-foreground leading-relaxed">{result.summary}</p>
          </Card>

          {/* Key Risks */}
          <Card>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              Key Risks
            </h3>
            <ul className="space-y-2">
              {result.risks.map((risk, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <span className="text-signal-amber mt-0.5">▼</span>
                  {risk}
                </li>
              ))}
            </ul>
          </Card>

          {/* Disclaimer */}
          <div className="text-xs text-muted-foreground space-y-1 pt-3 border-t border-border">
            <p>
              {isLive && liveData
                ? "Live computed analysis · Live mode"
                : isLive && liveError
                  ? "AI-generated analysis · Live mode unavailable"
                  : isLive
                    ? "AI-generated analysis · Live mode"
                    : "AI-generated analysis · Standard mode"}
            </p>
            <p>Not financial advice. Always consult a licensed financial adviser.</p>
            <p>Data as of April 15, 2026, source Yahoo Finance/TradingView</p>
          </div>
        </div>
      )}

      {/* Empty State */}
      {!result && !isAnalyzing && !searchValue && (
        <EmptyState
          icon={Search}
          title="Search for a stock"
          description="Enter a ticker symbol or company name to get AI-powered technical analysis."
        />
      )}
    </div>
  )
}
