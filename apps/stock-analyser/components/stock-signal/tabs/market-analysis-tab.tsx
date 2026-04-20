"use client"

import React, { useState } from "react"
import { useNavigation } from "../app-shell"
import {
  PageHeader,
  SegmentedControl,
  Card,
  EmptyState,
  PrimaryButton,
  CacheStatusBar,
  ModeToggle,
  TextToggle,
  type Signal,
} from "@/components/ui/design-system"
import { Spinner } from "@/components/ui/spinner"
import { 
  TrendingUp, 
  BarChart3, 
  ChevronRight,
  ChevronDown,
  RefreshCw,
  AlertCircle,
} from "lucide-react"
import { useClaude } from "@/lib/hooks"
import { cn } from "@/lib/utils"

type Geography = "Global" | "ASX" | "US" | "UK"
type Impact = "Supportive" | "Neutral" | "Headwind"
type Valuation = "Cheap" | "Fair" | "Expensive" | "Extended"
type Opportunity = "Attractive" | "Neutral" | "Unattractive"

interface MacroIndicator {
  label: string
  title: string
  description: string
  impact: Impact
}

interface SectorSignal {
  sector: string
  signal: Signal
  cyclePosition: number
  valuation: Valuation
  opportunity: Opportunity
  change: number
  reason: string
  bestExchange: string
}

interface ActionItem {
  sector: string
  reason: string
}

interface MarketAnalysisResult {
  macro: {
    cycleStage: MacroIndicator
    rateDirection: MacroIndicator
    keyRisk: MacroIndicator
    currency: MacroIndicator
  }
  briefing: string
  sectors: SectorSignal[]
  actionSummary: {
    enter: ActionItem[]
    exit: ActionItem[]
  }
}

const IMPACT_STYLES: Record<Impact, { bg: string; text: string }> = {
  Supportive: { bg: "bg-signal-green/15", text: "text-signal-green" },
  Neutral:    { bg: "bg-muted/50",        text: "text-muted-foreground" },
  Headwind:   { bg: "bg-signal-red/15",   text: "text-signal-red" },
}

const PILL: Record<string, React.CSSProperties> = {
  green: { background: '#E1F5EE', color: '#085041' },
  amber: { background: '#FAEEDA', color: '#633806' },
  coral: { background: '#FAECE7', color: '#712B13' },
  gray:  { background: '#F1EFE8', color: '#444441' },
}

const VALUATION_PILL: Record<Valuation, keyof typeof PILL> = {
  Cheap:     'green',
  Fair:      'amber',
  Expensive: 'coral',
  Extended:  'coral',
}

const OPPORTUNITY_PILL: Record<Opportunity, keyof typeof PILL> = {
  Attractive:   'green',
  Neutral:      'gray',
  Unattractive: 'coral',
}

function SectorPill({ label, color }: { label: string; color: keyof typeof PILL }) {
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium leading-none"
      style={PILL[color]}
    >
      {label}
    </span>
  )
}

// Gradient bar showing cycle position (0 = early/green, 100 = late/pink)
function CycleBar({ position }: { position: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="relative flex items-center" style={{ width: 90, height: 10 }}>
        {/* Track */}
        <div
          className="absolute inset-x-0"
          style={{
            height: 4,
            borderRadius: 999,
            background: 'linear-gradient(90deg, #1D9E75 0%, #EF9F27 50%, #D4537E 100%)',
          }}
        />
        {/* Marker */}
        <div
          className="absolute border-primary"
          style={{
            width: 10,
            height: 10,
            borderRadius: '50%',
            background: 'white',
            borderWidth: '1.5px',
            borderStyle: 'solid',
            left: `${position}%`,
            top: '50%',
            transform: 'translate(-50%, -50%)',
          }}
        />
      </div>
      <span className="text-[10px] text-muted-foreground whitespace-nowrap">Cycle {position}</span>
    </div>
  )
}

export function MarketAnalysisTab() {
  const { navigateToRecsWithSector, getTabTextVisibility, setTabTextOverride, showExplanatoryText, setTabCache, getTabCache } = useNavigation()
  const [isLive, setIsLive] = useState(false)
  const [geography, setGeography] = useState<Geography>("ASX")
  const cachedResult = getTabCache("market") as MarketAnalysisResult | null
  const [hasResults, setHasResults] = useState(!!cachedResult)
  const [result, setResult] = useState<MarketAnalysisResult | null>(cachedResult)
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set())
  
  // Text visibility
  const textVisible = getTabTextVisibility("market")
  const isTextOverride = showExplanatoryText !== textVisible
  const toggleTextVisibility = () => setTabTextOverride("market", !textVisible)
  const toggleCardExpand = (key: string) => {
    setExpandedCards(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const { callClaude, isLoading: isAnalyzing, error } = useClaude<MarketAnalysisResult>()

  const runAnalysis = async (forceRefresh = false) => {
    const data = await callClaude({
      cacheKey: `MARKET#${geography}`,
      forceRefresh,
      webSearch: isLive,
      prompt: `Provide comprehensive market analysis for the ${geography} market.

Return a JSON object with the following fields:

"macro" — 4 market condition cards, each with label, title, description, and impact ("Supportive" / "Neutral" / "Headwind"):
  - cycleStage — where the market is in the economic cycle
  - rateDirection — current interest rate trend
  - keyRisk — primary macro risk to watch
  - currency — USD/currency effect on the market

"briefing" — a 2-3 sentence narrative paragraph summarising the macro outlook

"sectors" — array of 8 sectors, each with:

  - sector: sector name — one of: Financials, Materials, Energy, Healthcare, Technology, Industrials, Consumer Discretionary, Real Estate & REITs

  - signal: "BUY" / "HOLD" / "EXIT"
    The overall recommendation, synthesising cycle position, valuation, and momentum.

  - cyclePosition: integer 0–100
    Where the sector sits in its economic cycle.
    0 = early cycle (just beginning to recover/accelerate)
    50 = mid cycle (established trend, neither early nor late)
    100 = late cycle (extended, peak territory, vulnerable to rotation out)
    This is a POSITIONAL metric only — it does not imply good or bad.

  - valuation: one of "Cheap" / "Fair" / "Expensive" / "Extended"
    How the sector is priced relative to its own fundamentals and history.
    INDEPENDENT of cyclePosition. A sector can be late-cycle but cheap (if beaten down), or early-cycle but expensive (if priced on expectations).

  - opportunity: one of "Attractive" / "Neutral" / "Unattractive"
    The combined judgment that drives the signal. Reflects the blend of cycle position, valuation, momentum, and macro backdrop. This is what tells the reader whether the sector is worth engaging with right now.

  - change: weekly % change (number, e.g. 2.1 or -0.8)

  - reason: 1-2 sentence explanation tying the three dimensions together.
    Example: "Late-cycle but still cheap on forward earnings; defensive qualities attractive as growth slows."

  - bestExchange: which exchange is strongest for that sector right now

"actionSummary" — top-3 trades:
  - enter: array of top 3 { sector, reason } to buy/overweight
  - exit: array of top 3 { sector, reason } to sell/reduce

IMPORTANT: Your entire response must be a single valid JSON object. Begin your response with { and end with }. Do not include any text, preamble, explanation, or markdown outside the JSON.`,
      systemPrompt: "You are a senior market strategist. Provide institutional-quality sector rotation analysis. Respond with raw JSON only. Do not use markdown code fences.",
    })

    if (data) {
      setResult(data)
      setTabCache("market", data)
      setHasResults(true)
    }
  }

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <PageHeader
        title="Market Analysis"
        subtitle="AI-powered sector rotation signals"
        action={
          <TextToggle
            visible={textVisible}
            onToggle={toggleTextVisibility}
            isOverride={isTextOverride}
          />
        }
      />

      {/* Geography Selector */}
      <SegmentedControl
        options={["Global", "ASX", "US", "UK"] as Geography[]}
        value={geography}
        onChange={setGeography}
      />

      {/* Cache Status / Mode Toggle - right above the action button */}
      {hasResults ? (
        <CacheStatusBar
          freshness="fresh"
          lastUpdated="Updated 2 minutes ago"
          isLive={isLive}
          onRefresh={() => runAnalysis(true)}
          onToggleMode={() => setIsLive(!isLive)}
        />
      ) : (
        <ModeToggle 
          isLive={isLive} 
          onToggle={() => setIsLive(!isLive)} 
          cacheAge="2 hours ago"
          freshness="stale"
        />
      )}

      {/* Run Analysis Button */}
      <PrimaryButton
        onClick={() => runAnalysis(hasResults)}
        disabled={isAnalyzing}
        icon={hasResults ? RefreshCw : TrendingUp}
        className="w-full"
      >
        {isAnalyzing ? (
          <>
            <Spinner className="size-4" />
            Analysing markets...
          </>
        ) : hasResults ? (
          "Re-analyse"
        ) : (
          "Run Analysis"
        )}
      </PrimaryButton>

      {/* Error display */}
      {error && (
        <div className="p-3 rounded-lg bg-signal-red/10 border border-signal-red/20 flex items-start gap-2">
          <AlertCircle className="size-4 text-signal-red mt-0.5 shrink-0" />
          <div className="text-sm text-signal-red">{error?.message}</div>
        </div>
      )}

      {/* Results */}
      {hasResults && result ? (
        <div className="space-y-6">
          {/* Date indicator */}
          <p className="text-xs text-muted-foreground">{geography} · {new Date().toLocaleDateString('en-AU', { month: 'long', year: 'numeric' })}</p>

          {/* Macro Indicator Cards */}
          <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 md:mx-0 md:px-0 md:grid md:grid-cols-2 lg:grid-cols-4 md:overflow-visible scrollbar-hide">
            {[result.macro?.cycleStage, result.macro?.rateDirection, result.macro?.keyRisk, result.macro?.currency].filter(Boolean).map((indicator) => {
              const style = IMPACT_STYLES[indicator!.impact] ?? IMPACT_STYLES.Neutral
              const cardKey = `macro-${indicator.label}`
              return (
                <div key={indicator.label} className="flex-shrink-0 w-[200px] md:w-auto p-4 bg-card border border-border rounded-xl space-y-2">
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{indicator.label}</span>
                  <h4 className="text-sm font-semibold text-foreground">{indicator.title}</h4>
                  
                  {/* Description - conditionally visible or expandable */}
                  {(textVisible || expandedCards.has(cardKey)) && (
                    <p className="text-xs text-muted-foreground leading-relaxed">{indicator.description}</p>
                  )}
                  
                  {/* Expand button when text is hidden */}
                  {!textVisible && !expandedCards.has(cardKey) && (
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleCardExpand(cardKey) }}
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors py-1"
                    >
                      <ChevronDown className="size-3" />
                      <span>Show details</span>
                    </button>
                  )}
                  
                  {/* Collapse button when expanded manually */}
                  {!textVisible && expandedCards.has(cardKey) && (
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleCardExpand(cardKey) }}
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors py-1"
                    >
                      <ChevronDown className="size-3 rotate-180" />
                      <span>Hide details</span>
                    </button>
                  )}
                  
                  <span className={cn("inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-medium", style.bg, style.text)}>
                    <span className={cn("size-1.5 rounded-full", style.text === "text-signal-green" ? "bg-signal-green" : style.text === "text-signal-red" ? "bg-signal-red" : "bg-muted-foreground")} />
                    {indicator.impact}
                  </span>
                </div>
              )
            })}
          </div>

          {/* Macro Briefing */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="h-px flex-1 bg-border" />
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Macro Briefing</span>
              <div className="h-px flex-1 bg-border" />
            </div>
            <Card>
              {(textVisible || expandedCards.has("briefing")) ? (
                <p className="text-sm text-foreground leading-relaxed">{result.briefing}</p>
              ) : (
                <button
                  onClick={(e) => { e.stopPropagation(); toggleCardExpand("briefing") }}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors py-1"
                >
                  <ChevronDown className="size-3" />
                  <span>Show briefing</span>
                </button>
              )}
              {!textVisible && expandedCards.has("briefing") && (
                <button
                  onClick={(e) => { e.stopPropagation(); toggleCardExpand("briefing") }}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors py-1 mt-2"
                >
                  <ChevronDown className="size-3 rotate-180" />
                  <span>Hide briefing</span>
                </button>
              )}
            </Card>
          </div>

          {/* Sector Signals Grid */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="h-px flex-1 bg-border" />
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Sector Signals</span>
              <div className="h-px flex-1 bg-border" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {(result.sectors ?? []).map((sector, i) => {
                return (
                  <Card
                    key={sector.sector}
                    interactive
                    onClick={() => navigateToRecsWithSector(sector.sector)}
                    animationDelay={i * 30}
                  >
                    <div className="space-y-3">
                      {/* Header: Sector name + Signal badge */}
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-semibold text-foreground">{sector.sector}</h4>
                        <span className={cn(
                          "px-2 py-0.5 rounded text-[10px] font-semibold uppercase",
                          sector.signal === "ENTER" ? "bg-signal-green text-white" :
                          sector.signal === "EXIT" ? "bg-signal-red text-white" :
                          "bg-signal-amber/80 text-background"
                        )}>
                          {sector.signal}
                        </span>
                      </div>

                      {/* Cycle · Valuation · Opportunity · Change */}
                      <div className="flex items-center gap-4 flex-wrap">
                        <CycleBar position={sector.cyclePosition} />
                        <SectorPill label={sector.valuation} color={VALUATION_PILL[sector.valuation] ?? 'gray'} />
                        {sector.opportunity && (
                          <SectorPill label={sector.opportunity} color={OPPORTUNITY_PILL[sector.opportunity] ?? 'gray'} />
                        )}
                        <span
                          className="ml-auto text-xs font-semibold"
                          style={{ color: sector.change >= 0 ? '#1D9E75' : '#D4537E' }}
                        >
                          {sector.change >= 0 ? "+" : ""}{sector.change}%
                        </span>
                      </div>

                      {/* Reason - conditionally visible or expandable */}
                      {(textVisible || expandedCards.has(`sector-${sector.sector}`)) && (
                        <p className="text-xs text-muted-foreground leading-relaxed">{sector.reason}</p>
                      )}
                      
                      {/* Expand button when text is hidden */}
                      {!textVisible && !expandedCards.has(`sector-${sector.sector}`) && (
                        <button
                          onClick={(e) => { e.stopPropagation(); toggleCardExpand(`sector-${sector.sector}`) }}
                          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors py-1"
                        >
                          <ChevronDown className="size-3" />
                          <span>Show reason</span>
                        </button>
                      )}
                      
                      {/* Collapse button when expanded manually */}
                      {!textVisible && expandedCards.has(`sector-${sector.sector}`) && (
                        <button
                          onClick={(e) => { e.stopPropagation(); toggleCardExpand(`sector-${sector.sector}`) }}
                          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors py-1"
                        >
                          <ChevronDown className="size-3 rotate-180" />
                          <span>Hide reason</span>
                        </button>
                      )}

                      {/* Best exchange + View picks */}
                      <div className="flex items-center justify-between pt-2 border-t border-border">
                        <span className="text-xs text-muted-foreground">Best: <span className="text-foreground font-medium">{sector.bestExchange}</span></span>
                        <span className="text-xs text-primary flex items-center gap-1">
                          View picks <ChevronRight className="size-3" />
                        </span>
                      </div>
                    </div>
                  </Card>
                )
              })}
            </div>
          </div>

          {/* Action Summary */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="h-px flex-1 bg-border" />
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Action Summary</span>
              <div className="h-px flex-1 bg-border" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Enter / Overweight */}
              <Card className="border-l-2 border-l-signal-green">
                <h4 className="text-sm font-semibold text-signal-green mb-3">Enter / Overweight</h4>
                <div className="space-y-3">
                  {result.actionSummary.enter.map((item, i) => (
                    <div key={item.sector} className="flex gap-3">
                      <span className="size-5 rounded-full bg-signal-green/20 text-signal-green text-[10px] font-bold flex items-center justify-center shrink-0">
                        {i + 1}
                      </span>
                      <div>
                        <p className="text-sm font-medium text-foreground">{item.sector}</p>
                        <p className="text-xs text-muted-foreground">{item.reason}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>

              {/* Exit / Reduce */}
              <Card className="border-l-2 border-l-signal-red">
                <h4 className="text-sm font-semibold text-signal-red mb-3">Exit / Reduce</h4>
                <div className="space-y-3">
                  {result.actionSummary.exit.map((item, i) => (
                    <div key={item.sector} className="flex gap-3">
                      <span className="size-5 rounded-full bg-signal-red/20 text-signal-red text-[10px] font-bold flex items-center justify-center shrink-0">
                        {i + 1}
                      </span>
                      <div>
                        <p className="text-sm font-medium text-foreground">{item.sector}</p>
                        <p className="text-xs text-muted-foreground">{item.reason}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          </div>

          {/* Disclaimer */}
          <div className="pt-4 border-t border-border">
            <p className="text-xs text-muted-foreground">
              AI-generated analysis · <span className={isLive ? "text-signal-green" : "text-muted-foreground"}>{isLive ? "Live mode" : "Cached mode"}</span>
            </p>
            <p className="text-xs text-muted-foreground">Not financial advice. Always consult a licensed financial adviser.</p>
          </div>
        </div>
      ) : (
        <EmptyState
          icon={BarChart3}
          title="No analysis yet"
          description="Select a geography and tap Run Analysis to see AI-powered sector rotation signals."
        />
      )}
    </div>
  )
}
