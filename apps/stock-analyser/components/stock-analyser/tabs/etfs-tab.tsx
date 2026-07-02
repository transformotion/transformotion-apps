"use client"

import { useState } from "react"
import { useNavigation } from "../app-shell"
import {
  PageHeader,
  SegmentedControl,
  Card,
  CacheStatusBar,
  PrimaryButton,
  TextToggle,
} from "@transformotion/ui-primitives"
import { ChevronRight, ChevronDown, AlertCircle, RefreshCw, TrendingUp } from "lucide-react"
import { cn } from "@/lib/utils"
import { useScopedAnalysis } from "@/lib/hooks/use-scoped-analysis"
import { Spinner } from "@transformotion/ui-primitives"
import { stockSignalBadgeClassName } from "../status-badge"
import { ETF_MARKETS, type Etf, type EtfMarket, type RunEtfsResponse } from "@transformotion/contracts/stock-analyser/etfs"

export function ETFsTab() {
  const { navigateToAnalyser, getTabTextVisibility, setTabTextOverride, showExplanatoryText } = useNavigation()
  const [market, setMarket] = useState<EtfMarket>("ASX")
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set())

  // Thin caller of the #626 runEtfs engine (mirrors Recommendations): a cache-first
  // run (#590) starts the server-owned engine, which does propose → REAL OHLCV price →
  // rank; the tab renders the finished shortlist. It does not generate the signal or
  // author the price.
  const analysis = useScopedAnalysis<Etf[]>({
    surface: "etfs",
    scopeKey: market,
    buildRequest: (webSearch) => ({
      prompt: "",
      webSearch,
      jobStart: {
        path: "etfs/run",
        body: { market, searchMode: webSearch ? "live" : "fast" },
      },
    }),
    parse: (raw) => (raw as RunEtfsResponse | null)?.etfs ?? null,
  })

  // Text visibility
  const textVisible = getTabTextVisibility("etfs")
  const isTextOverride = showExplanatoryText !== textVisible
  const toggleTextVisibility = () => setTabTextOverride("etfs", !textVisible)
  const toggleCardExpand = (ticker: string) => {
    setExpandedCards(prev => {
      const next = new Set(prev)
      if (next.has(ticker)) next.delete(ticker)
      else next.add(ticker)
      return next
    })
  }

  const etfsToDisplay = analysis.result ?? []

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <PageHeader
        title="ETFs"
        subtitle="Exchange-traded funds with signals"
        titleClassName="font-display uppercase tracking-wide"
        action={
          <TextToggle
            visible={textVisible}
            onToggle={toggleTextVisibility}
            isOverride={isTextOverride}
          />
        }
      />

      {/* Market selector (secondary filter) */}
      <SegmentedControl
        options={[...ETF_MARKETS]}
        value={market}
        onChange={setMarket}
      />

      {/* Unified cache control: freshness + Live/Fast toggle + force-live Refresh */}
      <CacheStatusBar
        freshness={analysis.status.freshness}
        lastUpdated={analysis.status.lastUpdated}
        isLive={analysis.isLive}
        onToggleMode={analysis.toggleMode}
        onRefresh={analysis.refresh}
      />

      {/* Primary CTA: Run / Re-run (cache-first) */}
      <PrimaryButton
        onClick={analysis.run}
        disabled={analysis.isRunning}
        icon={analysis.isRunning ? undefined : analysis.isIdle ? TrendingUp : RefreshCw}
        className="w-full"
      >
        {analysis.isRunning ? (
          <>
            <Spinner className="size-4" />
            Analysing {market} ETFs...
          </>
        ) : (
          analysis.buttonLabel
        )}
      </PrimaryButton>

      {/* Date indicator */}
      <p className="text-xs text-muted-foreground">{market} ETFs · {new Date().toLocaleDateString('en-AU', { month: 'long', year: 'numeric' })}</p>

      {/* Error display */}
      {analysis.error && (
        <div className="p-3 rounded-lg bg-signal-red/10 border border-signal-red/20 flex items-start gap-2">
          <AlertCircle className="size-4 text-signal-red mt-0.5 shrink-0" />
          <div className="text-sm text-signal-red">{analysis.error.message}</div>
        </div>
      )}

      {/* ETF Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {etfsToDisplay.map((etf, i) => (
            <Card
              key={etf.ticker}
              interactive
              onClick={() => navigateToAnalyser(etf.ticker, "etfs")}
              animationDelay={i * 50}
            >
              <div className="space-y-3">
                {/* Header: Ticker + Signal */}
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h4 className="font-display text-sm font-semibold tracking-wide text-foreground">{etf.ticker}</h4>
                    <p className="mt-0.5 font-display text-xs font-medium leading-tight tracking-wide text-muted-foreground">{etf.name}</p>
                    <p className="text-[11px] text-muted-foreground mt-1">{etf.category}</p>
                  </div>
                  <span className={cn(stockSignalBadgeClassName(etf.recommendationSignal), "shrink-0 ml-2")}>
                    {etf.recommendationSignal}
                  </span>
                </div>

                {/* Price section */}
                <div className="flex items-baseline gap-2">
                  <span className="text-lg font-semibold text-foreground">${etf.price.toFixed(2)}</span>
                  <span className={cn("text-xs font-semibold", etf.change >= 0 ? "text-signal-green" : "text-signal-red")}>
                    {etf.change >= 0 ? "+" : ""}{etf.change.toFixed(2)}%
                  </span>
                </div>

                {/* Analysis text - conditionally visible or expandable */}
                {(textVisible || expandedCards.has(etf.ticker)) && (
                  <p className="text-xs text-muted-foreground leading-relaxed">{etf.analysis}</p>
                )}

                {/* Expand button when text is hidden */}
                {!textVisible && !expandedCards.has(etf.ticker) && (
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleCardExpand(etf.ticker) }}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors py-1"
                  >
                    <ChevronDown className="size-3" />
                    <span>Show analysis</span>
                  </button>
                )}

                {/* Collapse button when expanded manually */}
                {!textVisible && expandedCards.has(etf.ticker) && (
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleCardExpand(etf.ticker) }}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors py-1"
                  >
                    <ChevronDown className="size-3 rotate-180" />
                    <span>Hide analysis</span>
                  </button>
                )}

                {/* Tap to analyse link */}
                <div className="flex items-center gap-1 text-primary text-xs font-medium pt-1 group">
                  <span>Tap to analyse</span>
                  <ChevronRight className="size-3 group-hover:translate-x-0.5 transition-transform" />
                </div>
              </div>
            </Card>
        ))}
      </div>
    </div>
  )
}
