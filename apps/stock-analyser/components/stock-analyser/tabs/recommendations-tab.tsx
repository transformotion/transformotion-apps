"use client"

import { useState, useEffect, useRef } from "react"
import { useNavigation } from "../app-shell"
import {
  PageHeader,
  SegmentedControl,
  PillSelector,
  Card,
  StockIcon,
  VerdictBadge,
  CycleGauge,
  BackLink,
  PrimaryButton,
  CacheStatusBar,
  ModeToggle,
  TextToggle,
  type Verdict,
  type CycleStage,
} from "@transformotion/ui-primitives"
import { ChevronRight, ChevronDown, Sparkles, Search, Loader2, Stars, AlertCircle } from "lucide-react"
import { useClaude } from "@/lib/hooks"
import { cn } from "@/lib/utils"

type Market = "ASX" | "NASDAQ" | "Dow" | "FTSE"
type Mode = "Top Picks" | "Bottom of Cycle"

interface Stock {
  ticker: string
  company: string
  sector: string
  subcategory: string
  price: number
  change: number
  verdict: Verdict
  cyclePosition: number
  cycleStage: CycleStage
  conviction: boolean
  analysis: string
  bestExchange: string
}

const TOP_PICKS: Stock[] = [
  { 
    ticker: "WDS.AX", company: "Woodside Energy Group Limited", sector: "Energy", subcategory: "Oil & Gas",
    price: 33.85, change: 2.2, verdict: "BUY", cyclePosition: 35, cycleStage: "early", conviction: true, bestExchange: "ASX",
    analysis: "Scarborough project is 94% complete targeting first LNG in Q4 2026 with strong cash flows expected. Louisiana LNG project targeting first production in 2029 positions the company for significant growth in global LNG demand."
  },
  { 
    ticker: "STO.AX", company: "Santos Limited", sector: "Energy", subcategory: "Oil & Gas",
    price: 7.45, change: 10.0, verdict: "BUY", cyclePosition: 28, cycleStage: "early", conviction: true, bestExchange: "ASX",
    analysis: "Pikka Phase 1 project targeting first oil in 2026 will significantly increase production capacity. Current market capitalization of 25.5 billion with strong dividend yield of 4.43% supported by elevated energy prices."
  },
  { 
    ticker: "ALD.AX", company: "Ampol Limited", sector: "Energy", subcategory: "Refining",
    price: 34.20, change: 21.3, verdict: "BUY", cyclePosition: 42, cycleStage: "mid", conviction: false, bestExchange: "ASX",
    analysis: "Strong financial results with Group RCOP EBITDA of 1.4 billion and manageable leverage ratio of 2.3 times. Diesel and jet fuel demand remains strong as key profit drivers for the business."
  },
  { 
    ticker: "AGL.AX", company: "AGL Energy Limited", sector: "Energy", subcategory: "Utilities",
    price: 9.84, change: 2.0, verdict: "HOLD", cyclePosition: 52, cycleStage: "mid", conviction: false, bestExchange: "ASX",
    analysis: "Development pipeline expanded to 11.3 GW with better-than-anticipated battery performance providing transition value. Asset transitions and evolving policy settings create execution risks despite improved earnings stability."
  },
  { 
    ticker: "ORG.AX", company: "Origin Energy Limited", sector: "Energy", subcategory: "Utilities",
    price: 8.75, change: 16.0, verdict: "BUY", cyclePosition: 38, cycleStage: "early", conviction: true, bestExchange: "ASX",
    analysis: "Leading Australia's renewable transition with significant battery storage projects coming online through 2025. Positioned as key beneficiary of clean energy buildout while maintaining income from existing assets."
  },
  { 
    ticker: "PDN.AX", company: "Paladin Energy Limited", sector: "Energy", subcategory: "Uranium",
    price: 0.82, change: 7.0, verdict: "BUY", cyclePosition: 32, cycleStage: "early", conviction: false, bestExchange: "ASX",
    analysis: "Langer Heinrich Mine in Namibia operational with renewed global interest in nuclear power as low-emission energy source. Rising uranium demand and long-term price support provide strong fundamentals for growth."
  },
]

const BOTTOM_OF_CYCLE: Stock[] = [
  { 
    ticker: "STO.AX", company: "Santos Limited", sector: "Energy", subcategory: "Oil & Gas",
    price: 6.85, change: -2.15, verdict: "BUY", cyclePosition: 15, cycleStage: "early", conviction: true, bestExchange: "ASX",
    analysis: "Direct beneficiary of oil crisis with strong pricing power and cash generation. Trading at compressed valuation after recent selloff presents compelling entry point for long-term investors."
  },
  { 
    ticker: "ORG.AX", company: "Origin Energy", sector: "Energy", subcategory: "Utilities",
    price: 8.42, change: -1.85, verdict: "BUY", cyclePosition: 18, cycleStage: "early", conviction: true, bestExchange: "ASX",
    analysis: "Oversold on China growth fears with supply constraints supporting commodity prices. Renewable energy transition creates significant upside as energy transition accelerates globally."
  },
  { 
    ticker: "REA.AX", company: "REA Group", sector: "Real Estate", subcategory: "Digital Platforms",
    price: 185.20, change: -0.45, verdict: "BUY", cyclePosition: 22, cycleStage: "early", conviction: false, bestExchange: "ASX",
    analysis: "Leading property portal with defensive characteristics valuable in stagflationary environment. Positioned to benefit from eventual property market recovery with strong digital moat."
  },
  { 
    ticker: "APX.AX", company: "Appen Limited", sector: "Technology", subcategory: "AI Data Services",
    price: 2.15, change: -3.50, verdict: "BUY", cyclePosition: 8, cycleStage: "early", conviction: true, bestExchange: "ASX",
    analysis: "Critical AI training data provider at inflection point of AI adoption cycle. Extreme selloff creates opportunity as enterprise AI spending accelerates through 2026."
  },
  { 
    ticker: "Z1P.AX", company: "Zip Co", sector: "Technology", subcategory: "Fintech",
    price: 0.85, change: -2.80, verdict: "BUY", cyclePosition: 12, cycleStage: "early", conviction: false, bestExchange: "ASX",
    analysis: "BNPL operator at cycle trough offering recovery potential as consumer sentiment improves. Strategic partnerships and cost management provide path to profitability."
  },
  { 
    ticker: "MYR.AX", company: "Myer Holdings", sector: "Consumer Discretionary", subcategory: "Retail",
    price: 0.78, change: -1.50, verdict: "BUY", cyclePosition: 10, cycleStage: "early", conviction: false, bestExchange: "ASX",
    analysis: "Deeply depressed valuation with management focused on operational efficiency and inventory optimization. Consumer discretionary cycle turn could unlock significant value."
  },
]

export function RecommendationsTab() {
  const { navigateToAnalyser, sectorFilter, recsSource, clearSectorFilter, navigateTo, getTabTextVisibility, setTabTextOverride, showExplanatoryText, setTabCache, getTabCache } = useNavigation()
  const [isLive, setIsLive] = useState(false)
  const [market, setMarket] = useState<Market>("ASX")
  const [mode, setMode] = useState<Mode>("Top Picks")
  const [hasRun, setHasRun] = useState(false)
  const cachedStocks = getTabCache("recs")?.stocks as Stock[] | null
  const [stockResults, setStockResults] = useState<Stock[]>(cachedStocks ?? [])
  const autoRunTriggeredRef = useRef<string | null>(null)
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set())
  
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

  const { callClaude, isLoading, error } = useClaude<{ stocks: Stock[] }>()

  const runRecommendations = async (sectorOverride?: string, forceRefresh = false) => {
    const sector = sectorOverride || sectorFilter
    const cacheKey = `RECS#${market}#${mode}${sector ? `#${sector}` : ''}`
    const result = await callClaude({
      cacheKey,
      forceRefresh,
      prompt: `Provide stock recommendations for ${market} market${sector ? ` in the ${sector} sector` : ''}.
Mode: ${mode}

Return a JSON object with "stocks" array, each containing:
- ticker: ticker symbol (e.g., "WDS.AX" for ASX)
- company: full company name
- sector: sector classification
- subcategory: subcategory within sector (e.g., "Oil & Gas", "Refining")
- price: current price (number)
- change: daily change percentage (number)
- verdict: one of "BUY", "SELL", "HOLD", "NEUTRAL"
- cyclePosition: 0-100 representing position in market cycle
- cycleStage: one of "early", "mid", "late", "peak"
- conviction: boolean indicating high conviction pick
- analysis: 2-3 sentence detailed analysis of the stock thesis
- bestExchange: which exchange is best for this stock (ASX, NASDAQ, NYSE, FTSE, etc)

${mode === "Top Picks" ? "Focus on stocks with strong momentum and bullish signals." : "Focus on stocks at the bottom of their cycle with recovery potential."}

Return 6 stocks. Return ONLY valid JSON.`,
      systemPrompt: "You are a stock analyst providing recommendations. Provide realistic stock picks with compelling analysis and appropriate cycle positions. Respond with raw JSON only. Do not use markdown code fences.",
    })

    if (result?.stocks) {
      setStockResults(result.stocks)
      setTabCache("recs", { stocks: result.stocks })
      setHasRun(true)
    }
  }

  // Auto-run search when navigating from Market Analysis with a sector filter
  useEffect(() => {
    if (sectorFilter) {
      setMode("Top Picks")
      // Auto-trigger the search when coming from Market Analysis (only once per sector)
      if (autoRunTriggeredRef.current !== sectorFilter) {
        autoRunTriggeredRef.current = sectorFilter
        runRecommendations(sectorFilter)
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectorFilter])

  // Use AI results if available, otherwise fall back to static mock data
  const stocks = stockResults.length > 0 ? stockResults : (mode === "Top Picks" ? TOP_PICKS : BOTTOM_OF_CYCLE)
  const filteredStocks = sectorFilter 
    ? stocks.filter(s => s.sector.toLowerCase() === sectorFilter.toLowerCase())
    : stocks

  const handleRunAnalysis = (forceRefresh = false) => {
    runRecommendations(undefined, forceRefresh)
  }

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
            <p className="text-sm font-semibold text-foreground">{sectorFilter} <span className="text-muted-foreground">· Recommended: {market === "ASX" ? "ASX" : market}</span></p>
          </div>
          <button onClick={() => { clearSectorFilter(); setHasRun(false); }} className="text-xs font-medium text-primary hover:text-primary/80">
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

      {/* Market Selector */}
      <SegmentedControl
        options={["ASX", "NASDAQ", "Dow", "FTSE"] as Market[]}
        value={market}
        onChange={setMarket}
      />

      {/* Mode Selector */}
      {!sectorFilter && (
        <PillSelector
          options={["Top Picks", "Bottom of Cycle"] as Mode[]}
          value={mode}
          onChange={setMode}
        />
      )}

      {/* Cache Status / Mode Toggle - right above the action button */}
      {hasRun ? (
        <CacheStatusBar
          freshness="stale"
          lastUpdated="Updated 45 minutes ago"
          isLive={isLive}
          onRefresh={() => handleRunAnalysis(true)}
          onToggleMode={() => setIsLive(!isLive)}
        />
      ) : (
        <ModeToggle 
          isLive={isLive} 
          onToggle={() => setIsLive(!isLive)} 
          cacheAge="45 minutes ago"
          freshness="recent"
        />
      )}

      {/* Run Analysis Button */}
      <PrimaryButton
        onClick={() => handleRunAnalysis(hasRun)}
        disabled={isLoading}
        className="w-full"
      >
        {isLoading ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            Finding recommendations...
          </>
        ) : hasRun ? (
          <>
            <Search className="size-4" />
            Re-analyse {sectorFilter ? sectorFilter : market}
          </>
        ) : (
          <>
            <Stars className="size-4" />
            Find Recommendations
          </>
        )}
      </PrimaryButton>

      {/* Error display */}
      {error && (
        <div className="p-3 rounded-lg bg-signal-red/10 border border-signal-red/20 flex items-start gap-2">
          <AlertCircle className="size-4 text-signal-red mt-0.5 shrink-0" />
          <div className="text-sm text-signal-red">{error?.message}</div>
        </div>
      )}

      {/* Stock List - Grid layout */}
      <div className="space-y-3">
        <p className="text-xs text-muted-foreground">
          {sectorFilter ? sectorFilter : market} — {mode} · {new Date().toLocaleDateString('en-AU', { month: 'long', year: 'numeric' })}
          {!hasRun && <span className="ml-1 opacity-60">(cached)</span>}
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {stocks.map((stock, i) => (
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
                    <span className={cn(
                      "px-2 py-0.5 rounded text-[10px] font-semibold uppercase shrink-0 ml-2",
                      stock.verdict === "BUY" ? "bg-signal-green text-white" :
                      stock.verdict === "SELL" ? "bg-signal-red text-white" :
                      stock.verdict === "HOLD" ? "bg-signal-amber/80 text-background" :
                      "bg-muted/50 text-muted-foreground"
                    )}>
                      {stock.verdict}
                    </span>
                  </div>

                  {/* Price section */}
                  <div className="flex items-baseline gap-2">
                    <span className="text-lg font-semibold text-foreground">${stock.price.toFixed(2)}</span>
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
