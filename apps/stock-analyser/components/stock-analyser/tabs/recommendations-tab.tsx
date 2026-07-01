"use client"

import { useState, useEffect, useRef } from "react"
import { useNavigation } from "../app-shell"
import {
  PageHeader,
  SegmentedControl,
  PillSelector,
  Card,
  BackLink,
  PrimaryButton,
  CacheStatusBar,
  TextToggle,
} from "@transformotion/ui-primitives"
import { ChevronRight, ChevronDown, Search, Loader2, Stars, AlertCircle } from "lucide-react"
import { useScopedAnalysis } from "@/lib/hooks/use-scoped-analysis"
import { cn } from "@/lib/utils"
import type { RecommendationUniverse } from "@transformotion/contracts/stock-analyser/types"
import {
  RECOMMENDATION_SIGNAL_LABELS,
  type Recommendation,
  type RecommendationMode,
  type RunRecommendationsResponse,
} from "@transformotion/contracts/stock-analyser/recommendations"
import {
  RECOMMENDATION_UNIVERSES,
  REGION_LABELS,
} from "../markets"
import {
  getIncomingRecommendationUniverse,
  getInitialRecommendationUniverse,
  isMarketOriginatedUniverseUnavailable,
  shouldDisableRecommendationsRun,
} from "../recommendations-flow"
import { stockSignalBadgeClassName } from "../status-badge"

type Mode = "Top Picks" | "Bottom of Cycle"

// Display mode → canonical RecommendationMode for the engine request.
const MODE_TO_CANONICAL: Record<Mode, RecommendationMode> = {
  "Top Picks": "top-picks",
  "Bottom of Cycle": "bottom-of-cycle",
}

// #592: recommendations are produced by the runRecommendations ENGINE (two-stage:
// propose → real OHLCV price → rank WITH the price). The engine already overlays the
// real price/change (#468), so the thin-UI renders its output verbatim — no client-side
// price overlay and no hardcoded fixtures.

export function RecommendationsTab() {
  const { navigateToAnalyser, sectorFilter, recsUniverse, recsSourceRegion, recsSource, clearSectorFilter, navigateTo, getTabTextVisibility, setTabTextOverride, showExplanatoryText } = useNavigation()
  const incomingUniverse = getIncomingRecommendationUniverse(recsUniverse)
  const universeUnavailable = isMarketOriginatedUniverseUnavailable(sectorFilter, incomingUniverse)
  const [universe, setUniverse] = useState<RecommendationUniverse>(() => getInitialRecommendationUniverse(recsUniverse))
  const [universeTouched, setUniverseTouched] = useState(false)
  const [mode, setMode] = useState<Mode>("Top Picks")
  const autoRunTriggeredRef = useRef<string | null>(null)
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set())

  // Unified cache-first analysis. Scope = universe + mode (+ sector when arriving
  // from a Market Analysis sector card), so each distinct query has its own cache
  // slot and changing ANY dimension reverts the tab to idle.
  const analysis = useScopedAnalysis<Recommendation[]>({
    surface: "recs",
    scopeKey: `${universe}|${mode}${sectorFilter ? `|${sectorFilter}` : ""}`,
    // Thin caller: kick the runRecommendations ENGINE (POST /recommendations/run) via
    // the async WSS start seam; searchMode follows the Live/Fast toggle. The engine
    // returns finished, price-overlaid recommendations — the UI renders them verbatim.
    buildRequest: (webSearch) => ({
      prompt: "",
      webSearch,
      jobStart: {
        path: "recommendations/run",
        body: {
          universe,
          mode: MODE_TO_CANONICAL[mode],
          ...(sectorFilter ? { sector: sectorFilter } : {}),
          searchMode: webSearch ? "live" : "fast",
        },
      },
    }),
    parse: (raw) => (raw as RunRecommendationsResponse | null)?.recommendations ?? [],
  })

  // Text visibility
  const textVisible = getTabTextVisibility("recs")
  const isTextOverride = showExplanatoryText !== textVisible
  const toggleTextVisibility = () => setTabTextOverride("recs", !textVisible)
  const toggleCardExpand = (ticker: string) => {
    setExpandedCards(prev => {
      const next = new Set(prev)
      if (next.has(ticker)) next.delete(ticker)
      else next.add(ticker)
      return next
    })
  }

  // Navigating from a Market Analysis sector card IS an explicit analyse request,
  // so sync the carried universe/mode; a missing/invalid universe renders the
  // recovery state instead — never a silent ASX run.
  useEffect(() => {
    if (!sectorFilter) return
    setMode("Top Picks")
    if (incomingUniverse) {
      setUniverseTouched(false)
      setUniverse(incomingUniverse)
    } else {
      setUniverseTouched(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectorFilter, recsUniverse])

  // …then auto-run ONCE for that scope (cache-first, exactly like a manual Run),
  // after universe/mode reflect the incoming sector-card request.
  useEffect(() => {
    if (
      sectorFilter &&
      incomingUniverse &&
      universe === incomingUniverse &&
      mode === "Top Picks" &&
      autoRunTriggeredRef.current !== sectorFilter
    ) {
      autoRunTriggeredRef.current = sectorFilter
      void analysis.run()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectorFilter, incomingUniverse, universe, mode])

  const stocks = analysis.result ?? []
  const filteredStocks = sectorFilter
    ? stocks.filter(s => s.sector.toLowerCase() === sectorFilter.toLowerCase())
    : stocks

  const SOURCE_LABELS: Partial<Record<string, string>> = {
    market: "Market Analysis",
    etfs: "ETFs",
    metals: "Precious Metals",
  }

  const handleBack = () => {
    clearSectorFilter()
    if (recsSource) navigateTo(recsSource as Parameters<typeof navigateTo>[0])
  }

  return (
    <div className="p-4 space-y-4">
      {/* Back link if navigated from another tab */}
      {recsSource && (
        <BackLink
          label={`Back to ${SOURCE_LABELS[recsSource] ?? recsSource}`}
          onClick={handleBack}
        />
      )}

      {/* Header with sector filter indicator */}
      {sectorFilter && (
        <div className="flex items-center justify-between p-3 bg-card border border-border rounded-lg">
          <div>
            <p className="text-xs text-muted-foreground">Picks for:</p>
            <p className="text-sm font-semibold text-foreground">
              {sectorFilter}
              {!universeUnavailable && (
                <span className="text-muted-foreground"> · Universe: {universe}</span>
              )}
              {recsSourceRegion && (
                <span className="text-muted-foreground"> · from {REGION_LABELS[recsSourceRegion]}</span>
              )}
            </p>
          </div>
          <button onClick={() => { clearSectorFilter(); autoRunTriggeredRef.current = null; }} className="text-xs font-medium text-primary hover:text-primary/80">
            × Clear
          </button>
        </div>
      )}

      <PageHeader
        title={sectorFilter ? `${sectorFilter} Stocks` : "Recommendations"}
        subtitle={sectorFilter ? `Filtered by sector` : "AI-curated stock picks"}
        titleClassName="font-display uppercase tracking-wide"
        action={
          <TextToggle
            visible={textVisible}
            onToggle={toggleTextVisibility}
            isOverride={isTextOverride}
          />
        }
      />

      {universeUnavailable && !universeTouched && (
        <div className="p-3 rounded-lg bg-signal-amber/10 border border-signal-amber/20 flex items-start gap-2">
          <AlertCircle className="size-4 text-signal-amber mt-0.5 shrink-0" />
          <div className="text-sm text-foreground">
            We could not determine a recommendation universe for{" "}
            <span className="font-medium">{sectorFilter}</span>
            {recsSourceRegion ? ` in ${REGION_LABELS[recsSourceRegion]}` : ""}. Choose a universe below to continue.
          </div>
        </div>
      )}

      {/* Universe Selector */}
      <SegmentedControl
        options={[...RECOMMENDATION_UNIVERSES]}
        value={universe}
        onChange={(nextUniverse) => {
          setUniverse(nextUniverse)
          setUniverseTouched(true)
        }}
      />

      {/* Mode Selector */}
      {!sectorFilter && (
        <PillSelector
          options={["Top Picks", "Bottom of Cycle"] as Mode[]}
          value={mode}
          onChange={setMode}
        />
      )}

      {/* Unified cache control: freshness + Live/Fast toggle + force-live Refresh */}
      <CacheStatusBar
        freshness={analysis.status.freshness}
        lastUpdated={analysis.status.lastUpdated}
        isLive={analysis.isLive}
        onRefresh={analysis.refresh}
        onToggleMode={analysis.toggleMode}
      />

      {/* Run / Re-run Analysis Button (cache-first) */}
      <PrimaryButton
        onClick={analysis.run}
        disabled={analysis.isRunning || shouldDisableRecommendationsRun(universeUnavailable, universeTouched)}
        className="w-full"
      >
        {analysis.isRunning ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            Finding recommendations...
          </>
        ) : analysis.isIdle ? (
          <>
            <Stars className="size-4" />
            Find Recommendations
          </>
        ) : (
          <>
            <Search className="size-4" />
            Re-run {sectorFilter ? sectorFilter : universe}
          </>
        )}
      </PrimaryButton>

      {/* Error display */}
      {analysis.error && (
        <div className="p-3 rounded-lg bg-signal-red/10 border border-signal-red/20 flex items-start gap-2">
          <AlertCircle className="size-4 text-signal-red mt-0.5 shrink-0" />
          <div className="text-sm text-signal-red">{analysis.error.message}</div>
        </div>
      )}

      {/* Stock List - Grid layout */}
      <div className="space-y-3">
        <p className="text-xs text-muted-foreground">
          {sectorFilter ? sectorFilter : universe} — {mode} · {new Date().toLocaleDateString('en-AU', { month: 'long', year: 'numeric' })}
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filteredStocks.map((stock, i) => (
              <Card
                key={stock.ticker}
                interactive
                onClick={() => navigateToAnalyser(stock.ticker, "recs")}
                animationDelay={i * 50}
              >
                <div className="space-y-3">
                  {/* Header: Ticker + Signal badge */}
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h4 className="font-display text-sm font-semibold tracking-wide text-foreground">{stock.ticker}</h4>
                      <p className="text-xs text-muted-foreground leading-tight mt-0.5">{stock.company}</p>
                      <p className="text-[11px] text-muted-foreground mt-1">{stock.sector} · {stock.subcategory}</p>
                    </div>
                    <span className={cn(stockSignalBadgeClassName(stock.recommendationSignal), "shrink-0 ml-2")}>
                      {RECOMMENDATION_SIGNAL_LABELS[stock.recommendationSignal]}
                    </span>
                  </div>

                  {/* Price section — REAL price/change overlaid by the engine (#468). */}
                  <div className="flex items-baseline gap-2">
                    <span className="text-lg font-semibold text-foreground">
                      ${stock.price.toFixed(2)}
                    </span>
                    <span className={cn("text-xs font-semibold", stock.change >= 0 ? "text-signal-green" : "text-signal-red")}>
                      {stock.change >= 0 ? "+" : ""}{stock.change.toFixed(1)}%
                    </span>
                  </div>

                  {/* Analysis text - conditionally visible or expandable */}
                  {(textVisible || expandedCards.has(stock.ticker)) && (
                    <p className="text-xs text-muted-foreground leading-relaxed">{stock.analysis}</p>
                  )}

                  {/* Expand button when text is hidden */}
                  {!textVisible && !expandedCards.has(stock.ticker) && (
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleCardExpand(stock.ticker) }}
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors py-1"
                    >
                      <ChevronDown className="size-3" />
                      <span>Show analysis</span>
                    </button>
                  )}

                  {/* Collapse button when expanded manually */}
                  {!textVisible && expandedCards.has(stock.ticker) && (
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleCardExpand(stock.ticker) }}
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
    </div>
  )
}
