"use client"

import React, { useEffect, useState } from "react"
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
} from "@transformotion/ui-primitives"
import { Spinner } from "@transformotion/ui-primitives"
import {
  TrendingUp,
  BarChart3,
  ChevronRight,
  ChevronDown,
  RefreshCw,
  AlertCircle,
  Landmark,
} from "lucide-react"
import { useCacheStatus, useClaude } from "@/lib/hooks"
import { cn } from "@/lib/utils"
import type { AnalysisRegion } from "@transformotion/contracts/stock-analyser/types"
// #535: the Market Analysis result model is now canonical (promoted out of this
// tab into the contract). Per-card `source` attribution lives on MacroIndicator
// and SectorSignal; `opportunity` was reconciled away in the promotion.
import type {
  MarketAnalysisResult,
  MacroIndicatorImpact,
  SectorValuation,
} from "@transformotion/contracts/stock-analyser/market-analysis"
import {
  ANALYSIS_REGIONS,
  REGION_LABELS,
  REGION_TO_RECOMMENDATION_UNIVERSES,
  regionFromLabel,
  resolveSectorUniverse,
} from "../markets"
import { createMarketSectorNavigationPayload } from "../recommendations-flow"
import { stockSignalBadgeClassName } from "../status-badge"
import { buildSectorSuppliedData } from "@/lib/analysis/market-analysis-grounding"
import { dynamoCache } from "@/lib/services/cache/dynamo-ttl-cache"

const IMPACT_STYLES: Record<MacroIndicatorImpact, { bg: string; text: string }> = {
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

const VALUATION_PILL: Record<SectorValuation, keyof typeof PILL> = {
  Cheap:      'green',
  Attractive: 'green',
  Fair:       'amber',
  Expensive:  'coral',
  Overvalued: 'coral',
  Extended:   'coral',
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

// #535 per-card source attribution. Visually + semantically distinct from the
// cache-freshness badge: source = "where this read came from" (an authoritative
// institution), freshness = "how recently it was refreshed". Deliberately quiet
// (muted, institution icon) so it reads as provenance metadata, not a signal.
function SourceTag({ name }: { name: string }) {
  return (
    <span
      className="inline-flex items-center gap-1 text-[10px] text-muted-foreground"
      title={`Source: ${name}`}
    >
      <Landmark className="size-3 shrink-0" aria-hidden="true" />
      <span className="font-medium">
        <span className="text-muted-foreground/70">Source</span> {name}
      </span>
    </span>
  )
}

export function MarketAnalysisTab() {
  const { navigateToRecsWithSector, getTabTextVisibility, setTabTextOverride, showExplanatoryText, defaultSearchMode, setTabCache, getTabCache } = useNavigation()
  const [isLive, setIsLive] = useState(defaultSearchMode === "live")
  const [region, setRegion] = useState<AnalysisRegion>("australia")
  const cachedResult = getTabCache("market") as MarketAnalysisResult | null
  const [hasResults, setHasResults] = useState(!!cachedResult)
  const [result, setResult] = useState<MarketAnalysisResult | null>(cachedResult)
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set())
  const cacheKey = `MARKET#${region}`
  const cacheStatus = useCacheStatus("market", cacheKey)
  
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

  useEffect(() => {
    setIsLive(defaultSearchMode === "live")
  }, [defaultSearchMode])

  const runAnalysis = async (forceRefresh = false) => {
    const supportedUniverses = REGION_TO_RECOMMENDATION_UNIVERSES[region]
    // #535 Bucket-1 grounding: only when we will actually call the model (cache
    // miss or forced refresh) fetch real sector OHLCV and feed it in as supplied
    // data, so sector levels/returns are grounded in prices rather than searched.
    // Skipped on a cache hit (the prompt is unused then).
    const willCallModel = forceRefresh || (await dynamoCache.get<MarketAnalysisResult>(cacheKey)) === null
    const suppliedSectorData = willCallModel ? await buildSectorSuppliedData(region) : ""
    const data = await callClaude({
      cacheKey,
      forceRefresh,
      onCacheMetadata: cacheStatus.markWritten,
      webSearch: isLive,
      prompt: `Provide comprehensive market analysis for the ${REGION_LABELS[region]} region.

SOURCE ATTRIBUTION (required, per card): For EACH macro indicator and EACH sector, name the authoritative source you based that card's read on and return it as "source": { "name": string } (e.g. "RBA", "ASX", "EIA"). Prefer authoritative / primary sources — exchanges, central banks, regulators, and established financial press. DO NOT base figures on social media, forums, or unattributed aggregators. Source attribution applies ONLY to the macro indicators and sector cards — NOT to "briefing" or "actionSummary".${suppliedSectorData}

Return a JSON object with the following fields:

"macro" — 4 market condition cards, each with label, title, description, impact ("Supportive" / "Neutral" / "Headwind"), and source ({ name: string }):
  - cycleStage — where the market is in the economic cycle
  - rateDirection — current interest rate trend
  - keyRisk — primary macro risk to watch
  - currency — USD/currency effect on the market

"briefing" — a 2-3 sentence narrative paragraph summarising the macro outlook (synthesis — no source field)

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

  - valuation: one of "Cheap" / "Attractive" / "Fair" / "Expensive" / "Overvalued" / "Extended"
    How the sector is priced relative to its own fundamentals and history.
    INDEPENDENT of cyclePosition. A sector can be late-cycle but cheap (if beaten down), or early-cycle but expensive (if priced on expectations).

  - change: weekly % change (number, e.g. 2.1 or -0.8)
    Where SUPPLIED SECTOR DATA is given for a sector, base its level/return read on those figures, not on searched or recalled numbers.

  - reason: 1-2 sentence explanation tying the dimensions together.
    Example: "Late-cycle but still cheap on forward earnings; defensive qualities attractive as growth slows."

  - bestExchange: the best listing universe for this sector. MUST be one of: ${supportedUniverses.join(", ")}

  - source: { name: string } — the authoritative source this sector's read is based on (use the supplied proxy where given for that sector)

"actionSummary" — top-3 trades (conclusions — no source field):
  - enter: array of top 3 { sector, reason } to buy/overweight
  - exit: array of top 3 { sector, reason } to sell/reduce

IMPORTANT: Your entire response must be a single valid JSON object. Begin your response with { and end with }. Do not include any text, preamble, explanation, or markdown outside the JSON.`,
      systemPrompt: "You are a senior market strategist. Provide institutional-quality sector rotation analysis grounded in authoritative, attributable sources. For every macro indicator and sector card, name the authoritative source you relied on (exchanges, central banks, regulators, established financial press) and never base figures on social media, forums, or unattributed aggregators. Respond with raw JSON only. Do not use markdown code fences.",
    })

    if (data) {
      const enriched: MarketAnalysisResult = {
        ...data,
        sectors: (data.sectors ?? []).map((sector) => ({
          ...sector,
          recommendationUniverse: resolveSectorUniverse(sector.bestExchange, region),
          sourceRegion: region,
        })),
      }
      setResult(enriched)
      setTabCache("market", enriched)
      setHasResults(true)
    }
  }

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <PageHeader
        title="Market Analysis"
        subtitle="AI-powered sector rotation signals"
        titleClassName="font-display uppercase tracking-wide"
        action={
          <TextToggle
            visible={textVisible}
            onToggle={toggleTextVisibility}
            isOverride={isTextOverride}
          />
        }
      />

      {/* Region Selector */}
      <SegmentedControl
        options={ANALYSIS_REGIONS.map((option) => REGION_LABELS[option])}
        value={REGION_LABELS[region]}
        onChange={(label) => setRegion(regionFromLabel(label))}
      />

      {/* Cache Status / Mode Toggle - right above the action button */}
      {hasResults ? (
        <CacheStatusBar
          freshness={cacheStatus.freshness}
          lastUpdated={cacheStatus.lastUpdated}
          isLive={isLive}
          onRefresh={() => runAnalysis(true)}
          onToggleMode={() => setIsLive(!isLive)}
        />
      ) : (
        <ModeToggle 
          isLive={isLive} 
          onToggle={() => setIsLive(!isLive)} 
          cacheAge={cacheStatus.cacheAge}
          freshness={cacheStatus.freshness}
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
          <p className="text-xs text-muted-foreground">{REGION_LABELS[region]} · {new Date().toLocaleDateString('en-AU', { month: 'long', year: 'numeric' })}</p>

          {/* Macro Indicator Cards */}
          <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 md:mx-0 md:px-0 md:grid md:grid-cols-2 lg:grid-cols-4 md:overflow-visible scrollbar-hide">
            {[result.macro?.cycleStage, result.macro?.rateDirection, result.macro?.keyRisk, result.macro?.currency].filter(Boolean).map((indicator) => {
              const style = IMPACT_STYLES[indicator!.impact] ?? IMPACT_STYLES.Neutral
              const cardKey = `macro-${indicator.label}`
              return (
                <div key={indicator.label} className="flex-shrink-0 w-[200px] md:w-auto p-4 bg-card border border-border rounded-xl space-y-2">
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{indicator.label}</span>
                  <h4 className="font-display text-sm font-semibold tracking-wide text-foreground">{indicator.title}</h4>
                  
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
                  
                  <div className="flex items-center justify-between gap-2 pt-1">
                    <span className={cn("inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-medium", style.bg, style.text)}>
                      <span className={cn("size-1.5 rounded-full", style.text === "text-signal-green" ? "bg-signal-green" : style.text === "text-signal-red" ? "bg-signal-red" : "bg-muted-foreground")} />
                      {indicator.impact}
                    </span>
                    {indicator!.source?.name ? <SourceTag name={indicator!.source.name} /> : null}
                  </div>
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
                    onClick={() => {
                      navigateToRecsWithSector(createMarketSectorNavigationPayload(sector, region))
                    }}
                    animationDelay={i * 30}
                  >
                    <div className="space-y-3">
                      {/* Header: Sector name + Signal badge */}
                      <div className="flex items-center justify-between">
                        <h4 className="font-display text-sm font-semibold tracking-wide text-foreground">{sector.sector}</h4>
                        <span className={stockSignalBadgeClassName(sector.signal)}>
                          {sector.signal}
                        </span>
                      </div>

                      {/* Cycle · Valuation · Change */}
                      <div className="flex items-center gap-4 flex-wrap">
                        <CycleBar position={sector.cyclePosition} />
                        <SectorPill label={sector.valuation} color={VALUATION_PILL[sector.valuation] ?? 'gray'} />
                        <span
                          className="ml-auto text-xs font-semibold"
                          style={{ color: sector.change >= 0 ? '#1D9E75' : '#D4537E' }}
                        >
                          {sector.change >= 0 ? "+" : ""}{sector.change}%
                        </span>
                      </div>

                      {/* #535 per-card source attribution */}
                      {sector.source?.name ? <SourceTag name={sector.source.name} /> : null}

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

                      {/* Recommendation universe + View picks */}
                      <div className="flex items-center justify-between pt-2 border-t border-border">
                        <span className="text-xs text-muted-foreground">
                          Universe:{" "}
                          <span className="text-foreground font-medium">
                            {sector.recommendationUniverse ?? resolveSectorUniverse(sector.bestExchange, sector.sourceRegion ?? region)}
                          </span>
                        </span>
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
                <h4 className="mb-3 font-display text-sm font-semibold tracking-wide text-signal-green">Enter / Overweight</h4>
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
                <h4 className="mb-3 font-display text-sm font-semibold tracking-wide text-signal-red">Exit / Reduce</h4>
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
          titleClassName="font-display"
          description="Select a region and tap Run Analysis to see AI-powered sector rotation signals."
        />
      )}
    </div>
  )
}
