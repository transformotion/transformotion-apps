"use client"

import { useState } from "react"
import { useNavigation } from "../app-shell"
import {
  PageHeader,
  SegmentedControl,
  Card,
  ModeToggle,
  PrimaryButton,
  TextToggle,
  type Signal,
} from "@/components/ui/design-system"
import { ChevronRight, ChevronDown, AlertCircle } from "lucide-react"
import { cn } from "@/lib/utils"
import { useClaude } from "@/lib/hooks"
import { Spinner } from "@/components/ui/spinner"

type Market = "ASX" | "US" | "Global"
type Category = "All" | "Index" | "Sector" | "Bond" | "Thematic" | "Property"

interface ETF {
  ticker: string
  name: string
  category: Category
  price: number
  change: number
  signal: "BUY" | "HOLD" | "SELL"
  expenseRatio: number
  analysis: string
}

const ETFS: ETF[] = [
  { ticker: "VAS.AX", name: "Vanguard Australian Shares Index ETF", category: "Index", price: 107.67, change: 2.22, signal: "BUY", expenseRatio: 0.10, analysis: "Core Australian equity exposure tracking the S&P/ASX 300 with excellent diversification across 300+ companies. Ultra-low 0.10% expense ratio makes it highly cost-effective for long-term investing." },
  { ticker: "VGS.AX", name: "Vanguard MSCI Index International Shares ETF", category: "Index", price: 147.20, change: 108, signal: "BUY", expenseRatio: 0.18, analysis: "Provides diversified global exposure across 22 developed markets with 1,284+ holdings despite 73.6% US weighting. Low 0.18% expense ratio offers cost-effective international diversification for Australian investors." },
  { ticker: "NDQ.AX", name: "BetaShares NASDAQ 100 ETF", category: "Sector", price: 52.89, change: 1.40, signal: "BUY", expenseRatio: 0.48, analysis: "Pure-play technology exposure to the NASDAQ 100's largest non-financial companies with strong 12.26% annual returns. The 0.48% expense ratio is reasonable for concentrated tech growth exposure." },
  { ticker: "VAP.AX", name: "Vanguard Australian Property Securities Index ETF", category: "Property", price: 88.02, change: 0.41, signal: "HOLD", expenseRatio: 0.23, analysis: "Solid property exposure tracking S&P/ASX 300 A-REIT Index across retail, office and industrial sectors with good liquidity. However, -3.51% annual return reflects ongoing interest rate pressures, though 0.23% MER remains competitive." },
  { ticker: "IAF.AX", name: "iShares Core Composite Bond ETF", category: "Bond", price: 101.06, change: -0.14, signal: "BUY", expenseRatio: 0.15, analysis: "Premier defensive allocation with $3.58B assets tracking Bloomberg AusBond Composite Index covering government and corporate bonds. Market-leading 0.15% expense ratio and tight 0.03% spreads provide excellent cost efficiency." },
  { ticker: "IVV.AX", name: "iShares S&P 500 AUD ETF", category: "Index", price: 64.85, change: 1.29, signal: "BUY", expenseRatio: 0.04, analysis: "Pure S&P 500 exposure capturing America's largest companies with strong market performance and excellent liquidity. At 0.04% expense ratio, it's among the cheapest ways to access US large-cap equity growth." },
]

export function ETFsTab() {
  const { navigateToAnalyser, getTabTextVisibility, setTabTextOverride, showExplanatoryText, setTabCache, getTabCache } = useNavigation()
  const [isLive, setIsLive] = useState(false)
  const [market, setMarket] = useState<Market>("ASX")
  const cachedEtfs = getTabCache("etfs")?.etfs as ETF[] | null
  const [etfResults, setEtfResults] = useState<ETF[]>(cachedEtfs ?? [])
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set())
  
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

  const { callClaude, isLoading: isAnalyzing, error } = useClaude<{ etfs: ETF[] }>()

  const runAnalysis = async (forceRefresh = false) => {
    const result = await callClaude({
      cacheKey: `ETF#${market}`,
      forceRefresh,
      prompt: `Provide ETF recommendations for the ${market} market.

Return a JSON object with "etfs" array, each containing:
- ticker: ticker symbol (e.g., "VAS.AX")
- name: full ETF name
- category: one of "Index", "Sector", "Bond", "Thematic", "Property"
- price: current price (number)
- change: daily change percentage (number)
- signal: one of "BUY", "HOLD", "SELL", "NEUTRAL"
- expenseRatio: expense ratio as decimal (e.g., 0.10 for 0.10%)
- analysis: 2-3 sentence investment thesis including expense ratio, asset size/holdings, and why to consider

Provide 6 ETFs. Return ONLY valid JSON.`,
      systemPrompt: "You are an ETF analyst providing recommendations. Provide realistic ETF picks with compelling investment theses and appropriate signals. Respond with raw JSON only. Do not use markdown code fences.",
    })

    if (result?.etfs) {
      setEtfResults(result.etfs)
      setTabCache("etfs", { etfs: result.etfs })
    }
  }

  const etfsToDisplay = etfResults.length > 0 ? etfResults : ETFS

  // Always show the grid — fall back to static data if API hasn't run yet

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <PageHeader
        title="ETFs"
        subtitle="Exchange-traded funds with signals"
        action={
          <TextToggle
            visible={textVisible}
            onToggle={toggleTextVisibility}
            isOverride={isTextOverride}
          />
        }
      />

      {/* Market selector + controls */}
      <div className="flex items-center gap-2 flex-wrap">
        <SegmentedControl
          options={["ASX", "US", "Global"] as Market[]}
          value={market}
          onChange={setMarket}
        />
        <PrimaryButton
          onClick={() => runAnalysis(etfResults.length > 0)}
          disabled={isAnalyzing}
          size="sm"
        >
          {isAnalyzing ? (
            <>
              <Spinner className="size-4" />
              Loading...
            </>
          ) : (
            "Refresh"
          )}
        </PrimaryButton>
        <ModeToggle 
          isLive={isLive} 
          onToggle={() => setIsLive(!isLive)} 
          cacheAge="3m ago"
          freshness="recent"
        />
      </div>

      {/* Date indicator */}
      <p className="text-xs text-muted-foreground">{market} ETFs · {new Date().toLocaleDateString('en-AU', { month: 'long', year: 'numeric' })}</p>

      {/* Error display */}
      {error && (
        <div className="p-3 rounded-lg bg-signal-red/10 border border-signal-red/20 flex items-start gap-2">
          <AlertCircle className="size-4 text-signal-red mt-0.5 shrink-0" />
          <div className="text-sm text-signal-red">{error?.message}</div>
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
                    <h4 className="text-sm font-semibold text-foreground">{etf.ticker}</h4>
                    <p className="text-xs text-muted-foreground leading-tight mt-0.5">{etf.name}</p>
                    <p className="text-[11px] text-muted-foreground mt-1">{etf.category}</p>
                  </div>
                  <span className={cn(
                    "px-2 py-0.5 rounded text-[10px] font-semibold uppercase shrink-0 ml-2",
                    etf.signal === "BUY" ? "bg-signal-green text-white" :
                    etf.signal === "HOLD" ? "bg-signal-amber/80 text-background" :
                    etf.signal === "SELL" ? "bg-signal-red text-white" :
                    "bg-muted/50 text-muted-foreground"
                  )}>
                    {etf.signal}
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
