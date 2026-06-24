"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { useNavigation } from "../app-shell"
import { portfolioService, type StockAnalysisResult } from "@/lib/services/portfolio"
import {
  PageHeader,
  Card,
  CacheStatusBar,
  VerdictBadge,
  CycleGauge,
  EmptyState,
  PrimaryButton,
  SecondaryButton,
  TextToggle,
  getAlert,
  type CycleStage,
} from "@transformotion/ui-primitives"
import { Eye, RefreshCw, X, TrendingUp, ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { useDerivedCacheStatus } from "@/lib/hooks"
import type { CacheMetadata } from "@/lib/services/cache/dynamo-ttl-cache"

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDateAdded(ms: number): string {
  return new Date(ms).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })
}

function cycleStageLabel(stage: CycleStage): string {
  switch (stage) {
    case "early": return "Early"
    case "mid":   return "Mid"
    case "late":  return "Late stage"
    case "peak":  return "Peak"
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export function WatchlistTab() {
  const {
    navigateToAnalyser,
    watchlistEntries,
    addToWatchlist,
    removeFromWatchlist,
    getTabTextVisibility,
    setTabTextOverride,
    showExplanatoryText,
  } = useNavigation()

  const [analysisMap, setAnalysisMap] = useState<Record<string, StockAnalysisResult>>({})
  const [cacheMetadata, setCacheMetadata] = useState<Record<string, CacheMetadata>>({})
  const [isAnalysing, setIsAnalysing]   = useState(false)
  const [analysingLeft, setAnalysingLeft] = useState(0)
  const [tickerInput, setTickerInput]   = useState("")
  const [nameInput, setNameInput]       = useState("")
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set())
  const abortRef = useRef<AbortController | null>(null)

  // Text visibility
  const textVisible = getTabTextVisibility("watchlist")
  const isTextOverride = showExplanatoryText !== textVisible
  const toggleTextVisibility = () => setTabTextOverride("watchlist", !textVisible)

  const toggleCardExpand = (ticker: string) => {
    setExpandedCards(prev => {
      const next = new Set(prev)
      if (next.has(ticker)) next.delete(ticker); else next.add(ticker)
      return next
    })
  }

  // Enrich tickers with Claude analysis
  const handleEnrich = useCallback(async (tickers: string[], force = false) => {
    if (tickers.length === 0) return
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl

    if (force) {
      setAnalysisMap({})
      setCacheMetadata({})
    }

    setIsAnalysing(true)
    setAnalysingLeft(tickers.length)

    try {
      await portfolioService.enrichHoldings(
        tickers,
        (ticker, result) => {
          setAnalysisMap(prev => ({ ...prev, [ticker]: result }))
          setAnalysingLeft(prev => Math.max(0, prev - 1))
        },
        ctrl.signal,
        (ticker, metadata) => setCacheMetadata(prev => ({ ...prev, [ticker]: metadata })),
      )
    } finally {
      setIsAnalysing(false)
      setAnalysingLeft(0)
    }
  }, [])

  // Auto-enrich on mount / when watchlist changes (cache-first)
  useEffect(() => {
    if (watchlistEntries.length > 0) {
      handleEnrich(watchlistEntries.map(e => e.ticker), false)
    }
    return () => { abortRef.current?.abort() }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchlistEntries.map(e => e.ticker).join(',')])

  // Add ticker manually
  const handleAdd = () => {
    const ticker = tickerInput.trim().toUpperCase()
    if (!ticker) return
    const name = nameInput.trim() || ticker
    addToWatchlist(ticker, name)
    setTickerInput("")
    setNameInput("")
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleAdd()
  }

  // ── Add row (always rendered) ─────────────────────────────────────────────
  const addRow = (
    <div className="flex items-center gap-2 flex-wrap">
      <input
        type="text"
        placeholder="Ticker (e.g. BHP.AX)"
        value={tickerInput}
        onChange={e => setTickerInput(e.target.value)}
        onKeyDown={handleKeyDown}
        className="flex-1 min-w-[140px] h-11 rounded-xl border border-border bg-surface2 px-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
      />
      <input
        type="text"
        placeholder="Name (optional)"
        value={nameInput}
        onChange={e => setNameInput(e.target.value)}
        onKeyDown={handleKeyDown}
        className="flex-[2] min-w-[160px] h-11 rounded-xl border border-border bg-surface2 px-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
      />
      <SecondaryButton onClick={handleAdd} className="shrink-0">+ Add</SecondaryButton>
      <div onClick={e => e.stopPropagation()}>
        <SecondaryButton
          icon={RefreshCw}
          className="hidden"
          onClick={() => handleEnrich(watchlistEntries.map(e => e.ticker), true)}
          disabled={isAnalysing || watchlistEntries.length === 0}
        >
          {isAnalysing ? `Refreshing… (${analysingLeft} left)` : "Refresh all"}
        </SecondaryButton>
      </div>
    </div>
  )
  const aggregateMetadata = watchlistEntries
    .map(entry => cacheMetadata[entry.ticker])
    .filter((entry): entry is CacheMetadata => !!entry)
    .reduce<CacheMetadata | null>((oldest, entry) => {
      if (!oldest || entry.cachedAt < oldest.cachedAt) return entry
      return oldest
    }, null)
  const cacheStatus = useDerivedCacheStatus("watchlist", aggregateMetadata)

  if (watchlistEntries.length === 0) {
    return (
      <div className="p-4 space-y-4">
        <PageHeader
          title="Watchlist"
          subtitle="Stocks you are tracking with cycle alerts"
          titleClassName="font-display uppercase tracking-wide"
          action={
            <TextToggle visible={textVisible} onToggle={toggleTextVisibility} isOverride={isTextOverride} />
          }
        />
        <CacheStatusBar
          freshness={cacheStatus.freshness}
          lastUpdated={cacheStatus.lastUpdated}
          isLive
          onRefresh={() => handleEnrich(watchlistEntries.map(e => e.ticker), true)}
          onToggleMode={() => undefined}
        />
        <PrimaryButton
          icon={isAnalysing ? undefined : RefreshCw}
          className="w-full"
          onClick={() => handleEnrich(watchlistEntries.map(e => e.ticker), true)}
          disabled={isAnalysing || watchlistEntries.length === 0}
        >
          {isAnalysing ? `Refreshing watchlist signals (${analysingLeft} left)` : "Refresh watchlist signals"}
        </PrimaryButton>
        {addRow}
        <EmptyState
          icon={Eye}
          title="Watchlist empty"
          titleClassName="font-display"
          description="Add stocks from the Analyser or Recommendations tabs, or use the form above."
        />
      </div>
    )
  }

  return (
    <div className="p-4 space-y-4">
      <PageHeader
        title="Watchlist"
        subtitle="Stocks you are tracking with cycle alerts"
        titleClassName="font-display uppercase tracking-wide"
        action={
          <TextToggle visible={textVisible} onToggle={toggleTextVisibility} isOverride={isTextOverride} />
        }
      />

      <CacheStatusBar
        freshness={cacheStatus.freshness}
        lastUpdated={cacheStatus.lastUpdated}
        isLive
        onRefresh={() => handleEnrich(watchlistEntries.map(e => e.ticker), true)}
        onToggleMode={() => undefined}
      />

      <PrimaryButton
        icon={isAnalysing ? undefined : RefreshCw}
        className="w-full"
        onClick={() => handleEnrich(watchlistEntries.map(e => e.ticker), true)}
        disabled={isAnalysing}
      >
        {isAnalysing ? `Refreshing watchlist signals (${analysingLeft} left)` : "Refresh watchlist signals"}
      </PrimaryButton>

      {addRow}

      <div className="space-y-3">
        {watchlistEntries.map((entry, i) => {
          const analysis = analysisMap[entry.ticker] ?? null
          const cyclePos   = analysis?.cyclePosition ?? 50
          const cycleStage = (analysis?.cycleStage ?? "mid") as CycleStage
          const verdict    = analysis?.verdict ?? "NEUTRAL"
          const price      = analysis?.price
          const change     = analysis?.change ?? 0
          const summary    = analysis?.summary ?? ""
          const company    = analysis?.company ?? entry.name
          const isNegative = change < 0
          const stageLabel = cycleStageLabel(cycleStage)
          const alert      = getAlert(cyclePos, verdict)
          const isAsx      = entry.ticker.endsWith(".AX")
          const loading    = !analysis && isAnalysing

          return (
            <Card
              key={entry.ticker}
              animationDelay={i * 50}
              className={cn(
                "border",
                cyclePos >= 80 ? "border-signal-red/40" : "border-border/50"
              )}
            >
              <div className="space-y-3">
                {/* Header row */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-display font-bold tracking-wide text-foreground">{entry.ticker}</span>
                    <span className="text-sm text-muted-foreground">{company}</span>
                    {analysis?.sector && (
                      <span className="text-[11px] px-1.5 py-0.5 rounded border border-border text-muted-foreground">{analysis.sector}</span>
                    )}
                    {analysis && <VerdictBadge verdict={verdict} size="sm" />}
                    {loading && (
                      <span className="text-[11px] px-1.5 py-0.5 rounded bg-muted/20 text-muted-foreground animate-pulse">Analysing…</span>
                    )}
                  </div>
                  {price != null && (
                    <div className="text-right shrink-0">
                      <p className="font-bold text-foreground text-base">
                        {isAsx ? "A" : ""}${price.toLocaleString("en-AU", {
                          minimumFractionDigits: price < 10 ? 3 : 2,
                          maximumFractionDigits: price < 10 ? 3 : 2,
                        })}
                      </p>
                      <p className={cn("text-sm font-semibold", isNegative ? "text-signal-red" : "text-signal-green")}>
                        {isNegative ? "" : "+"}{change.toFixed(2)}%
                      </p>
                    </div>
                  )}
                </div>

                {/* Analysis summary */}
                {summary && (textVisible || expandedCards.has(entry.ticker)) && (
                  <p className="text-xs text-muted-foreground leading-relaxed">{summary}</p>
                )}

                {summary && !textVisible && !expandedCards.has(entry.ticker) && (
                  <button
                    onClick={e => { e.stopPropagation(); toggleCardExpand(entry.ticker) }}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors py-1"
                  >
                    <ChevronDown className="size-3" />
                    <span>Show analysis</span>
                  </button>
                )}

                {summary && !textVisible && expandedCards.has(entry.ticker) && (
                  <button
                    onClick={e => { e.stopPropagation(); toggleCardExpand(entry.ticker) }}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors py-1"
                  >
                    <ChevronDown className="size-3 rotate-180" />
                    <span>Hide analysis</span>
                  </button>
                )}

                {/* Date added */}
                <p className="text-xs text-muted-foreground">Added {formatDateAdded(entry.addedAt)}</p>

                {/* Cycle gauge — shown once analysis arrives */}
                {analysis && (
                  <>
                    <CycleGauge position={cyclePos} stage={cycleStage} showLabels={false} size="sm" />
                    <div className="flex items-center gap-1.5 text-xs">
                      <span className={cn(
                        "font-bold",
                        cycleStage === "early" ? "text-signal-green" :
                        cycleStage === "mid"   ? "text-signal-amber" :
                        cycleStage === "late"  ? "text-signal-gold"  :
                        "text-signal-red"
                      )}>
                        {cyclePos}
                      </span>
                      <span className="text-muted-foreground">{stageLabel}</span>
                    </div>

                    {alert && (
                      <div className={cn(
                        "flex items-center gap-1.5 text-xs font-medium",
                        alert === "sell" ? "text-signal-red" : "text-signal-amber"
                      )}>
                        <span>{alert === "sell" ? "▼" : "⚠"}</span>
                        <span>
                          {alert === "sell"
                            ? `Approaching cycle peak — consider selling (score ${cyclePos})`
                            : `Late stage — tighten stops (cycle score ${cyclePos})`}
                        </span>
                      </div>
                    )}
                  </>
                )}

                {/* Footer */}
                <div className="flex items-center justify-between pt-2 border-t border-border/30">
                  <div className="flex items-center gap-2">
                    <div onClick={e => e.stopPropagation()}>
                      <SecondaryButton
                        icon={TrendingUp}
                        onClick={() => navigateToAnalyser(entry.ticker, "watchlist")}
                        className="h-9 px-3 text-xs"
                      >
                        Analyse
                      </SecondaryButton>
                    </div>
                    <div onClick={e => e.stopPropagation()}>
                      <SecondaryButton
                        icon={X}
                        onClick={() => removeFromWatchlist(entry.ticker)}
                        className="h-9 px-3 text-xs"
                      >
                        Remove
                      </SecondaryButton>
                    </div>
                  </div>
                  {entry.addedPrice != null && (
                    <span className="text-[11px] text-muted-foreground">
                      Added @ ${entry.addedPrice.toFixed(2)}
                    </span>
                  )}
                </div>
              </div>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
