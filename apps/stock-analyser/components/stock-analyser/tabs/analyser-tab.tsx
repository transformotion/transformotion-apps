"use client"

import { useState, useEffect, useRef } from "react"
import { useNavigation, type TabId } from "../app-shell"
import {
  PageHeader,
  Card,
  VerdictBadge,
  BackLink,
  PrimaryButton,
  SecondaryButton,
  EmptyState,
  CacheStatusBar,
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
import { useScopedAnalysis } from "@/lib/hooks/use-scoped-analysis"
import { useCycleData } from "@/lib/hooks/use-cycle-data"
import { useOhlcvData } from "@/lib/hooks/use-ohlcv-data"
import { latestPriceFromOhlcv } from "@/lib/market-data"
import type { OhlcvRange } from "@transformotion/api-client"
import { PriceChart } from "@/components/price-chart/price-chart"
import {
  createStockAnalysisPrompt,
  normaliseStockAnalysisSignals,
  STOCK_ANALYSIS_SYSTEM_PROMPT,
  type StockSignalMetric,
} from "@/lib/analysis/stock-analysis-signals"
import { buildTickerSuppliedData } from "@/lib/analysis/stock-analysis-grounding"
import { insufficientDataAnalysis, type StockAnalysisDataStatus } from "@transformotion/contracts/stock-analyser/structured-output"

// #603: the thrown job error carries this providerErrorCode when the Live grounding
// found no verifiable market data (a newly-listed / thin-data ticker). Kept in sync
// with fn-ai-proxy-core's GROUNDING_UNAVAILABLE_ERROR_CODE (a stable protocol string).
const GROUNDING_UNAVAILABLE_CODE = "grounding_unavailable"

interface AnalysisResult {
  ticker: string
  company: string
  sector: string
  // Sourced from real market data (OHLCV), not the AI — nullable when no live
  // quote is available. The AI's own price/change are not trusted.
  price: number | null
  change: number | null
  verdict: Verdict
  cyclePosition: number
  cycleStage: CycleStage
  signals: StockSignalMetric[]
  summary: string
  risks: string[]
  rsiDivergence: "none" | "bullish" | "bearish"
  macdMomentum: "strengthening" | "weakening" | "flat"
  volumeTrend: "confirming" | "diverging" | "neutral"
  cycleSummary: string
  // #603: newly-listed / thin-data degrade (absent ⇒ complete).
  dataStatus?: StockAnalysisDataStatus
}

const QUICK_PICKS = ["CBA.AX", "BHP.AX", "CSL.AX", "AAPL", "NVDA", "MSFT"]

const SOURCE_LABELS: Record<TabId, string> = {
  home: "Home",
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
  const [searchValue, setSearchValue] = useState("")
  // The submitted ticker = the cache SCOPE, kept separate from the search box so
  // typing doesn't flicker the shown result; it only changes on an analyse action.
  const [analysedTicker, setAnalysedTicker] = useState("")
  const pendingRunRef = useRef<string | null>(null)
  const [chartRange, setChartRange] = useState<OhlcvRange>('1y')

  // Computed cycle/technicals (GET /cycle/ohlcv). Declared before the analysis so
  // `fetchLive` is in scope for `buildRequest` (which supplies the technicals in
  // Live mode), and so it can also overlay the gauge below.
  const { data: liveData, isLoading: isLoadingLive, error: liveError, fetch: fetchLive } = useCycleData()

  // Unified cache-first analysis, scoped by the analysed ticker.
  const analysis = useScopedAnalysis<AnalysisResult>({
    surface: "analyser",
    scopeKey: analysedTicker,
    buildRequest: async (webSearch) => {
      // #602: in Live mode, supply the REAL computed technicals (the same cycle
      // data the gauge overlays) into the prompt so the two-pass research pass has
      // authoritative technicals it cannot web-search. Without this, OpenAI
      // hard-fails the integrity guard and Claude fabricates technicals that
      // contradict the gauge. Best-effort: a failed/absent computation (e.g. a
      // dataless ticker) supplies nothing and the analysis degrades honestly.
      const supplied = webSearch
        ? buildTickerSuppliedData(await fetchLive(analysedTicker).catch(() => null))
        : ""
      return {
        webSearch,
        prompt: createStockAnalysisPrompt(analysedTicker) + supplied,
        systemPrompt: STOCK_ANALYSIS_SYSTEM_PROMPT,
        surface: "analyser", // structured output — proxy resolves the canonical schema
      }
    },
    parse: (raw) => (raw ? normaliseStockAnalysisSignals(raw as AnalysisResult) : null),
    // #603: a grounding-unavailable (newly-listed / thin-data) failure degrades to the
    // distinguished insufficient-data result instead of a 502 error banner.
    recoverFromError: (err) =>
      (err as { providerErrorCode?: string })?.providerErrorCode === GROUNDING_UNAVAILABLE_CODE
        ? (insufficientDataAnalysis(analysedTicker) as unknown as AnalysisResult)
        : null,
  })
  const result = analysis.result
  const isAnalyzing = analysis.isRunning
  const isLive = analysis.isLive

  const { data: ohlcvData, isLoading: isLoadingChart, fetch: fetchOhlcv } = useOhlcvData()
  const marketDataTicker = analysedTicker || result?.ticker || ""

  // Submit a ticker for analysis (search box, quick picks, Enter, or nav). Sets
  // the scope to the ticker, then runs cache-first once the scope is committed.
  const analyseTicker = (raw: string | null | undefined) => {
    const t = (raw ?? "").toUpperCase().trim()
    if (!t || analysis.isRunning) return
    setSearchValue(t)
    if (t === analysedTicker) {
      void analysis.run()
    } else {
      pendingRunRef.current = t
      setAnalysedTicker(t)
    }
  }

  // Fire the pending run once `analysedTicker` reflects the requested ticker
  // (so run() reads the correct scope key).
  useEffect(() => {
    if (pendingRunRef.current && pendingRunRef.current === analysedTicker) {
      pendingRunRef.current = null
      void analysis.run()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analysedTicker])

  // Auto-analyse only if navigated from another tab (source is set).
  useEffect(() => {
    if (initialTicker && source) {
      analyseTicker(initialTicker)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTicker, source])

  // Fetch live OHLCV cycle data whenever live mode is active and we have a result.
  useEffect(() => {
    if (analysis.isLive && result?.ticker && marketDataTicker) {
      fetchLive(marketDataTicker)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analysis.isLive, result?.ticker, marketDataTicker])

  // Fetch price chart data whenever ticker or selected range changes.
  useEffect(() => {
    if (result?.ticker && marketDataTicker) {
      fetchOhlcv(marketDataTicker, chartRange)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result?.ticker, marketDataTicker, chartRange])

  const handleBack = () => {
    if (source) {
      clearAnalyserContext()
      navigateTo(source)
    }
  }

  const onWatchlist = result ? isOnWatchlist(result.ticker) : false

  // Real current price/change from market data (the OHLCV chart's latest close),
  // NOT the AI — which has no live prices. Null until OHLCV loads / if it fails.
  const livePrice = latestPriceFromOhlcv(ohlcvData)

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
        titleClassName="font-display uppercase tracking-wide"
      />

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <input
          type="text"
          value={searchValue}
          onChange={(e) => setSearchValue(e.target.value.toUpperCase())}
          onKeyDown={(e) => e.key === "Enter" && analyseTicker(searchValue)}
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
              onClick={() => analyseTicker(ticker)}
              className="px-3 py-1.5 bg-surface2 text-sm text-muted-foreground rounded-lg hover:text-foreground transition-colors"
            >
              {ticker}
            </button>
          ))}
        </div>
      )}

      {/* Error display */}
      {analysis.error && (
        <div className="p-3 rounded-lg bg-signal-red/10 border border-signal-red/20 flex items-start gap-2">
          <AlertCircle className="size-4 text-signal-red mt-0.5 shrink-0" />
          <div className="text-sm text-signal-red">{analysis.error.message}</div>
        </div>
      )}

      {/* Unified cache control: freshness + Live/Fast toggle + force-live Refresh.
          Shown once a ticker has been analysed (the scope the badge/refresh act on). */}
      {result && (
        <CacheStatusBar
          freshness={analysis.status.freshness}
          lastUpdated={analysis.status.lastUpdated}
          isLive={analysis.isLive}
          onRefresh={analysis.refresh}
          onToggleMode={analysis.toggleMode}
        />
      )}

      {/* Analyse Button - always show when there's a search value (cache-first run) */}
      {searchValue && (
        <PrimaryButton
          onClick={() => analyseTicker(searchValue)}
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
          {/* #603: distinguished degraded state — newly-listed / thin-data ticker.
              Honest, not an error; technicals populate once price history exists. */}
          {result.dataStatus === "insufficient-data" && (
            <div className="p-3 rounded-lg bg-signal-gold/10 border border-signal-gold/25 flex items-start gap-2">
              <AlertCircle className="size-4 text-signal-gold mt-0.5 shrink-0" />
              <div className="text-sm text-foreground">
                <p className="font-medium">Insufficient data for analysis</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {result.ticker} appears newly listed or has no verifiable market data yet — grounded research
                  could not confirm price or technical context. Analysis will populate once price history is available.
                </p>
              </div>
            </div>
          )}

          {/* Stock Header */}
          <div className="space-y-3">
            <div className="text-xs text-muted-foreground">
              {result.sector} · ASX · Stock
            </div>
            <div className="flex items-start justify-between">
              <div>
                <h2 className="font-display text-2xl font-bold tracking-wide text-foreground">{result.company}</h2>
                <div className="flex items-baseline gap-3 mt-2">
                  <span className="text-3xl font-bold text-foreground">
                    {result.dataStatus === "insufficient-data" || livePrice.price === null
                      ? "—"
                      : `A$${livePrice.price.toFixed(3)}`}
                  </span>
                  {result.dataStatus !== "insufficient-data" && livePrice.change !== null && (
                    <span
                      className={cn(
                        "text-sm font-semibold",
                        livePrice.change >= 0 ? "text-signal-green" : "text-signal-red",
                      )}
                    >
                      {livePrice.change >= 0 ? "+" : ""}{livePrice.change.toFixed(2)}%
                    </span>
                  )}
                </div>
                {/* #603: explicit no-price note (newly-listed / no live quote) rather than a bare dash. */}
                {livePrice.price === null && (
                  <p className="mt-1 text-[11px] text-muted-foreground">Price data unavailable (newly listed?)</p>
                )}
              </div>
              <VerdictBadge verdict={result.verdict} size="md" />
            </div>
          </div>

          {/* #603: for insufficient-data, hide the price/cycle/signals technicals
              (they'd be placeholder) — only the honest banner + summary are shown. */}
          {result.dataStatus !== "insufficient-data" && (<>
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
          </>)}

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
          titleClassName="font-display"
          description="Enter a ticker symbol or company name to get AI-powered technical analysis."
        />
      )}
    </div>
  )
}
