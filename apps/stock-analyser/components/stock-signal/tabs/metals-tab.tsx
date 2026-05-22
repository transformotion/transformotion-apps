"use client"

import { useState } from "react"
import { useNavigation } from "../app-shell"
import {
  PageHeader,
  Card,
  TrendBadge,
  PrimaryButton,
  ModeToggle,
  TextToggle,
  type TrendSignal,
} from "@transformotion/ui-primitives"
import { 
  TrendingUp, 
  TrendingDown, 
  Minus,
  ChevronDown,
  Sparkles,
  AlertCircle,
  RefreshCw,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useClaude } from "@/lib/hooks"
import { Spinner } from "@transformotion/ui-primitives"

interface Metal {
  name: string
  symbol: string
  ticker: string
  price: number
  ytdChange: number
  todayChange: number
  signal: TrendSignal
  weekLow: number
  weekHigh: number
  perthMintTicker: string
  perthMintName: string
  analysis: string
}

const METALS: Metal[] = [
  { 
    name: "Gold", 
    symbol: "XAU/USD", 
    ticker: "PMGOLD.AX",
    price: 4754, 
    ytdChange: 14.2,
    todayChange: -1.19,
    signal: "NEUTRAL", 
    weekLow: 3873, 
    weekHigh: 5200, 
    perthMintTicker: "PMGOLD.AX",
    perthMintName: "Perth Mint Gold",
    analysis: "Elevated geopolitical tensions from US-Iran conflict and Strait of Hormuz blockade continue driving safe-haven demand, though inflation concerns limit central bank rate cuts. Trading range of $4,400–$5,200 expected with bulls targeting $5,000+ amid continued central bank purchases."
  },
  { 
    name: "Silver", 
    symbol: "XAG/USD", 
    ticker: "ETPMAG.AX",
    price: 74.78, 
    ytdChange: 67.5,
    todayChange: -3.81,
    signal: "BULL", 
    weekLow: 41.60, 
    weekHigh: 89.20, 
    perthMintTicker: "ETPMAG.AX",
    perthMintName: "Perth Mint Silver",
    analysis: "Strongest performer among precious metals with energy security driving solar demand acceleration. Industrial headwinds may create volatility but structural energy transition and relative undervaluation versus gold maintain long-term bullish outlook."
  },
  { 
    name: "Platinum", 
    symbol: "XPT/USD", 
    ticker: "ETPMPT.AX",
    price: 2048, 
    ytdChange: 81.4,
    todayChange: -2.29,
    signal: "BULL", 
    weekLow: 1120, 
    weekHigh: 2180, 
    perthMintTicker: "ETPMPT.AX",
    perthMintName: "Perth Mint Platinum",
    analysis: "Trading at historic discount to gold despite supply constraints and deficit conditions. Expected to benefit from elevated lease rates and EV adoption catalysts via hydrogen fuel cells as low-emission energy source with jewelry demand upsides in China."
  },
  { 
    name: "Palladium", 
    symbol: "XPD/USD", 
    ticker: "ETPMPD.AX",
    price: 1250, 
    ytdChange: -15.3,
    todayChange: -2.1,
    signal: "NEUTRAL", 
    weekLow: 950, 
    weekHigh: 1650, 
    perthMintTicker: "ETPMPD.AX",
    perthMintName: "Perth Mint Palladium",
    analysis: "Facing structural headwinds from EV adoption reducing catalytic converter demand and Russian supply normalization. Limited by substitution toward platinum and weakening automotive cycle outlook, though some recovery potential if industrial demand stabilizes."
  },
]

export function MetalsTab() {
  const { navigateToAnalyser, getTabTextVisibility, setTabTextOverride, showExplanatoryText, setTabCache, getTabCache } = useNavigation()
  const [isLive, setIsLive] = useState(false)
  const [hasRun, setHasRun] = useState(false)
  const cachedMetals = getTabCache("metals")?.metals as Metal[] | null
  const [metalResults, setMetalResults] = useState<Metal[]>(cachedMetals ?? [])
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set())
  
  // Text visibility
  const textVisible = getTabTextVisibility("metals")
  const isTextOverride = showExplanatoryText !== textVisible
  const toggleTextVisibility = () => setTabTextOverride("metals", !textVisible)
  const toggleCardExpand = (symbol: string) => {
    setExpandedCards(prev => {
      const next = new Set(prev)
      if (next.has(symbol)) next.delete(symbol)
      else next.add(symbol)
      return next
    })
  }

  const { callClaude, isLoading: isAnalyzing, error } = useClaude<{ metals: Metal[] }>()

  const runAnalysis = async (forceRefresh = false) => {
    const today = new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })
    const result = await callClaude({
      cacheKey: 'METALS',
      forceRefresh,
      prompt: `Provide precious metals spot price analysis with latest data for ${today}.

Return a JSON object with "metals" array for Gold, Silver, Platinum, and Palladium. Each should contain:
- name: metal name
- symbol: trading symbol with currency (e.g., "XAU/USD")
- ticker: Perth Mint product ticker (e.g., "PMGOLD.AX")
- price: current spot price in USD (number, e.g., 4754 for $4,754/oz)
- ytdChange: year-to-date change percentage (number, e.g., 14.2)
- todayChange: today's change percentage (number, e.g., -1.19)
- signal: one of "BULL", "NEUTRAL", "BEAR"
- weekLow: 52-week low price (number)
- weekHigh: 52-week high price (number)
- perthMintTicker: Perth Mint ETF ticker
- perthMintName: Perth Mint product name
- analysis: 2-3 sentence analyst analysis with market catalysts

Return ONLY valid JSON.`,
      systemPrompt: "You are a precious metals analyst with access to real-time spot prices. Provide current prices and informed market analysis. Respond with raw JSON only. Do not use markdown code fences.",
    })

    if (result?.metals) {
      setMetalResults(result.metals)
      setTabCache("metals", { metals: result.metals })
      setHasRun(true)
    }
  }

  const metalsToDisplay = metalResults.length > 0 ? metalResults : METALS

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <PageHeader
        title="Precious Metals"
        subtitle="Spot prices and signals"
        action={
          <TextToggle
            visible={textVisible}
            onToggle={toggleTextVisibility}
            isOverride={isTextOverride}
          />
        }
      />

      {/* Controls */}
      <div className="flex items-center gap-2 flex-wrap">
        <PrimaryButton
          onClick={() => runAnalysis(metalResults.length > 0)}
          disabled={isAnalyzing}
        >
          {isAnalyzing ? (
            <>
              <Spinner className="size-4" />
              Loading...
            </>
          ) : (
            <>
              <RefreshCw className="size-4" />
              Refresh
            </>
          )}
        </PrimaryButton>
        <ModeToggle 
          isLive={isLive} 
          onToggle={() => setIsLive(!isLive)} 
          cacheAge="just now"
          freshness="recent"
        />
      </div>

      {/* Date indicator */}
      <p className="text-xs text-muted-foreground">Spot prices · {new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}</p>

      {/* Error display */}
      {error && (
        <div className="p-3 rounded-lg bg-signal-red/10 border border-signal-red/20 flex items-start gap-2">
          <AlertCircle className="size-4 text-signal-red mt-0.5 shrink-0" />
          <div className="text-sm text-signal-red">{error?.message}</div>
        </div>
      )}

      {/* Metal Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {metalsToDisplay.map((metal, i) => {
            const pricePosition = ((metal.price - metal.weekLow) / (metal.weekHigh - metal.weekLow)) * 100
            
            return (
              <Card
                key={metal.symbol}
                animationDelay={i * 80}
                interactive
                onClick={() => navigateToAnalyser(metal.perthMintTicker, "metals")}
              >
                <div className="space-y-3">
                  {/* Header: Name + Signal */}
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-base font-semibold text-foreground">{metal.name}</h3>
                      <p className="text-xs text-muted-foreground">{metal.symbol}</p>
                    </div>
                    <TrendBadge trend={metal.signal} />
                  </div>

                  {/* Price section */}
                  <div>
                    <p className="text-2xl font-bold text-foreground">
                      US${metal.price.toLocaleString('en-US')}
                    </p>
                    <p className={cn("text-sm font-semibold", metal.ytdChange >= 0 ? "text-signal-red" : "text-signal-green")}>
                      {metal.ytdChange >= 0 ? "+" : ""}{metal.ytdChange.toFixed(1)}% YTD
                    </p>
                  </div>

                  {/* Price range bar with visual indicator */}
                  <div>
                    <div className="h-1 bg-signal-green/60 rounded-full relative mb-2">
                      <div 
                        className="absolute top-0 bottom-0 w-0.5 rounded-full bg-background"
                        style={{ left: `${Math.min(Math.max(pricePosition, 0), 100)}%` }}
                      />
                    </div>
                    
                    {/* 52-week stats */}
                    <div className="grid grid-cols-4 gap-2 text-[11px] text-muted-foreground">
                      <div>
                        <p className="text-[10px] uppercase tracking-wider mb-0.5">52w High</p>
                        <p className="font-semibold text-foreground">US${metal.weekHigh.toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-wider mb-0.5">52w Low</p>
                        <p className="font-semibold text-foreground">US${metal.weekLow.toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-wider mb-0.5">Today</p>
                        <p className={cn("font-semibold", metal.todayChange >= 0 ? "text-signal-red" : "text-signal-green")}>
                          {metal.todayChange >= 0 ? "+" : ""}{metal.todayChange.toFixed(2)}%
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-wider mb-0.5">Signal</p>
                        <p className={cn(
                          "font-semibold capitalize",
                          metal.signal === "BULL" ? "text-signal-green" :
                          metal.signal === "BEAR" ? "text-signal-red" :
                          "text-signal-amber"
                        )}>
                          {metal.signal.toLowerCase()}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Analysis text - conditionally visible or expandable */}
                  {(textVisible || expandedCards.has(metal.symbol)) && (
                    <p className="text-xs text-muted-foreground leading-relaxed border-t border-border pt-3">
                      {metal.analysis}
                    </p>
                  )}

                  {/* Expand button when text is hidden */}
                  {!textVisible && !expandedCards.has(metal.symbol) && (
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleCardExpand(metal.symbol) }}
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors py-1 border-t border-border pt-3"
                    >
                      <ChevronDown className="size-3" />
                      <span>Show analysis</span>
                    </button>
                  )}

                  {/* Collapse button when expanded manually */}
                  {!textVisible && expandedCards.has(metal.symbol) && (
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleCardExpand(metal.symbol) }}
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors py-1"
                    >
                      <ChevronDown className="size-3 rotate-180" />
                      <span>Hide analysis</span>
                    </button>
                  )}

                  {/* Analyse footer */}
                  <div className="flex items-center justify-between pt-2 border-t border-border">
                    <span className="text-xs text-muted-foreground">{metal.perthMintTicker}</span>
                    <span className="text-xs text-primary flex items-center gap-1">
                      Analyse <ChevronDown className="size-3 rotate-[-90deg]" />
                    </span>
                  </div>
              </div>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
