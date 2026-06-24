"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { useNavigation } from "../app-shell"
import {
  PageHeader,
  Card,
  VerdictBadge,
  CycleGauge,
  EmptyState,
  CacheStatusBar,
  PrimaryButton,
  SecondaryButton,
  TextToggle,
  type Verdict,
  type CycleStage,
} from "@transformotion/ui-primitives"
import {
  Upload,
  Briefcase,
  RefreshCw,
  Trash2,
  ChevronDown,
  AlertCircle,
  CheckCircle2,
  Loader2,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Spinner } from "@transformotion/ui-primitives"
import { useDerivedCacheStatus } from "@/lib/hooks"
import type { CacheMetadata } from "@/lib/services/cache/dynamo-ttl-cache"
import {
  portfolioService,
  parseCMCCsv,
  type PortfolioHolding,
  type StockAnalysisResult,
} from "@/lib/services/portfolio"

export function PortfolioTab() {
  const { navigateToAnalyser, getTabTextVisibility, setTabTextOverride, showExplanatoryText } = useNavigation()

  // ── State ────────────────────────────────────────────────────────────────────
  const [rawHoldings,   setRawHoldings]   = useState<PortfolioHolding[]>([])
  const [analysisMap,   setAnalysisMap]   = useState<Record<string, StockAnalysisResult>>({})
  const [cacheMetadata, setCacheMetadata] = useState<Record<string, CacheMetadata>>({})
  const [isLoading,     setIsLoading]     = useState(true)
  const [loadError,     setLoadError]     = useState<string | null>(null)
  const [isAnalysing,   setIsAnalysing]   = useState(false)
  const [analysingLeft, setAnalysingLeft] = useState(0)
  const [importStatus,  setImportStatus]  = useState<{ type: 'success' | 'error' | 'warn'; message: string } | null>(null)
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set())

  const fileInputRef   = useRef<HTMLInputElement>(null)
  const abortRef       = useRef<AbortController | null>(null)

  // Text visibility
  const textVisible      = getTabTextVisibility("portfolio")
  const isTextOverride   = showExplanatoryText !== textVisible
  const toggleText       = () => setTabTextOverride("portfolio", !textVisible)
  const toggleCardExpand = (ticker: string) => {
    setExpandedCards(prev => {
      const next = new Set(prev)
      if (next.has(ticker)) next.delete(ticker)
      else next.add(ticker)
      return next
    })
  }

  // ── Load holdings from DynamoDB on mount ─────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    portfolioService.getHoldings()
      .then(holdings => { if (!cancelled) setRawHoldings(holdings) })
      .catch(err     => { if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Failed to load portfolio') })
      .finally(()    => { if (!cancelled) setIsLoading(false) })
    return () => { cancelled = true }
  }, [])

  // ── Refresh all ──────────────────────────────────────────────────────────────
  const handleRefreshAll = useCallback(async (force = false) => {
    if (rawHoldings.length === 0 || isAnalysing) return

    abortRef.current?.abort()
    abortRef.current = new AbortController()

    if (force) {
      // Clear analysis map so all tickers are treated as cache misses
      setAnalysisMap({})
      setCacheMetadata({})
    }

    const tickers = rawHoldings.map(h => h.ticker)
    const alreadyEnriched = force ? new Set<string>() : new Set(Object.keys(analysisMap))
    const toAnalyse = tickers.filter(t => !alreadyEnriched.has(t))

    if (toAnalyse.length === 0) return

    setIsAnalysing(true)
    setAnalysingLeft(toAnalyse.length)

    await portfolioService.enrichHoldings(
      toAnalyse,
      (ticker, result) => {
        setAnalysisMap(prev => ({ ...prev, [ticker]: result }))
        setAnalysingLeft(prev => Math.max(0, prev - 1))
      },
      abortRef.current.signal,
      (ticker, metadata) => setCacheMetadata(prev => ({ ...prev, [ticker]: metadata }))
    )

    setIsAnalysing(false)
    setAnalysingLeft(0)
  }, [rawHoldings, analysisMap, isAnalysing])

  // Auto-enrich on load when holdings come in
  useEffect(() => {
    if (!isLoading && rawHoldings.length > 0) {
      handleRefreshAll(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, rawHoldings.length])

  // ── CSV import ───────────────────────────────────────────────────────────────
  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    setImportStatus(null)
    const text = await file.text()

    let parsed
    try {
      parsed = parseCMCCsv(text)
    } catch (err) {
      setImportStatus({ type: 'error', message: err instanceof Error ? err.message : 'CSV parse error' })
      return
    }

    try {
      await portfolioService.saveHoldings(parsed.holdings)
      setRawHoldings(parsed.holdings)
      setAnalysisMap({})

      const warn = parsed.usedCurrentPriceAsAvgCost
        ? ' ⚠ No cost basis found — current price used as placeholder.'
        : parsed.skipped.length > 0
        ? ` ${parsed.skipped.length} row(s) skipped.`
        : ''

      setImportStatus({
        type:    parsed.usedCurrentPriceAsAvgCost ? 'warn' : 'success',
        message: `${parsed.holdings.length} holdings imported.${warn}`,
      })
    } catch (err) {
      setImportStatus({ type: 'error', message: err instanceof Error ? err.message : 'Failed to save holdings' })
    }
  }

  // ── Clear all ────────────────────────────────────────────────────────────────
  const handleClearAll = async () => {
    try {
      await portfolioService.saveHoldings([])
      setRawHoldings([])
      setAnalysisMap({})
      setImportStatus(null)
    } catch (err) {
      setImportStatus({ type: 'error', message: err instanceof Error ? err.message : 'Failed to clear holdings' })
    }
  }

  // ── Remove single holding ────────────────────────────────────────────────────
  const handleRemove = async (ticker: string) => {
    const updated = rawHoldings.filter(h => h.ticker !== ticker)
    try {
      await portfolioService.saveHoldings(updated)
      setRawHoldings(updated)
      setAnalysisMap(prev => { const next = { ...prev }; delete next[ticker]; return next })
    } catch (err) {
      setImportStatus({ type: 'error', message: err instanceof Error ? err.message : 'Failed to remove holding' })
    }
  }

  // ── Derived display data ─────────────────────────────────────────────────────
  const holdings = rawHoldings.map(h => ({
    ...h,
    analysis: analysisMap[h.ticker] ?? null,
  }))

  const enrichedCount  = holdings.filter(h => h.analysis).length
  const aggregateMetadata = rawHoldings
    .map(h => cacheMetadata[h.ticker])
    .filter((entry): entry is CacheMetadata => !!entry)
    .reduce<CacheMetadata | null>((oldest, entry) => {
      if (!oldest || entry.cachedAt < oldest.cachedAt) return entry
      return oldest
    }, null)
  const cacheStatus = useDerivedCacheStatus("portfolio", aggregateMetadata)
  const totalValue     = holdings.reduce((s, h) => s + h.shares * (h.analysis?.price ?? 0), 0)
  const totalCost      = holdings.reduce((s, h) => s + (h.isGifted ? 0 : h.shares * h.avgCost), 0)
  const totalPL        = totalValue - totalCost
  const totalPLPercent = totalCost > 0 ? (totalPL / totalCost) * 100 : 0

  // ── Loading state ────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="p-4 flex items-center justify-center py-20">
        <Spinner className="size-6 text-muted-foreground" />
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="p-4 space-y-4">
        <PageHeader
          title="Portfolio"
          subtitle="Import and track your holdings"
          titleClassName="font-display uppercase tracking-wide"
        />
        <div className="p-3 rounded-lg bg-signal-red/10 border border-signal-red/20 flex items-start gap-2">
          <AlertCircle className="size-4 text-signal-red mt-0.5 shrink-0" />
          <span className="text-sm text-signal-red">{loadError}</span>
        </div>
      </div>
    )
  }

  // ── Empty state ──────────────────────────────────────────────────────────────
  if (holdings.length === 0) {
    return (
      <div className="p-4 space-y-4">
        <PageHeader
          title="Portfolio"
          subtitle="Import and track your holdings"
          titleClassName="font-display uppercase tracking-wide"
        />
        {importStatus && (
          <div className={cn(
            "p-3 rounded-lg flex items-start gap-2 text-sm",
            importStatus.type === 'error' ? "bg-signal-red/10 border border-signal-red/20 text-signal-red" : "bg-signal-amber/10 border border-signal-amber/20 text-signal-amber"
          )}>
            <AlertCircle className="size-4 mt-0.5 shrink-0" />
            {importStatus.message}
          </div>
        )}
        <EmptyState
          icon={Briefcase}
          title="No holdings imported"
          titleClassName="font-display"
          description="Import your CMC Markets Profit & Loss CSV to see AI-powered analysis and signals on your positions."
          action={
            <PrimaryButton icon={Upload} onClick={() => fileInputRef.current?.click()}>
              Import CSV
            </PrimaryButton>
          }
        />
        <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={handleFileSelected} />
      </div>
    )
  }

  // ── Main view ────────────────────────────────────────────────────────────────
  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <PageHeader
        title="Portfolio"
        subtitle={`${holdings.length} holdings${enrichedCount < holdings.length ? ` · ${holdings.length - enrichedCount} not yet analysed` : ''}`}
        titleClassName="font-display uppercase tracking-wide"
        action={<TextToggle visible={textVisible} onToggle={toggleText} isOverride={isTextOverride} />}
      />

      <CacheStatusBar
        freshness={cacheStatus.freshness}
        lastUpdated={cacheStatus.lastUpdated}
        isLive
        onRefresh={() => handleRefreshAll(true)}
        onToggleMode={() => undefined}
      />

      {/* Primary CTA */}
      <PrimaryButton
        icon={isAnalysing ? undefined : RefreshCw}
        onClick={() => handleRefreshAll(true)}
        disabled={isAnalysing}
        className="w-full"
      >
        {isAnalysing ? (
          <><Loader2 className="size-4 animate-spin" /> Refreshing portfolio signals{analysingLeft > 0 ? ` (${analysingLeft} left)` : ''}...</>
        ) : (
          'Refresh portfolio signals'
        )}
      </PrimaryButton>

      {/* Utility actions */}
      <div className="flex items-center gap-2 flex-wrap">
        <SecondaryButton icon={Upload} onClick={() => fileInputRef.current?.click()} className="h-9 px-3 text-sm">
          Import CSV
        </SecondaryButton>
        <SecondaryButton
          icon={isAnalysing ? undefined : RefreshCw}
          onClick={() => handleRefreshAll(true)}
          disabled={isAnalysing}
          className="hidden"
        >
          {isAnalysing ? (
            <><Loader2 className="size-3.5 animate-spin" /> Analysing{analysingLeft > 0 ? ` (${analysingLeft} left)` : ''}…</>
          ) : (
            'Refresh all'
          )}
        </SecondaryButton>
        <SecondaryButton onClick={handleClearAll} className="h-9 px-3 text-sm">
          Clear all
        </SecondaryButton>
      </div>

      {/* Import status */}
      {importStatus && (
        <div className={cn(
          "p-3 rounded-lg flex items-start gap-2 text-sm",
          importStatus.type === 'error'
            ? "bg-signal-red/10 border border-signal-red/20 text-signal-red"
            : importStatus.type === 'warn'
            ? "bg-signal-amber/10 border border-signal-amber/20 text-signal-amber"
            : "bg-signal-green/10 border border-signal-green/20 text-signal-green"
        )}>
          {importStatus.type === 'success'
            ? <CheckCircle2 className="size-4 mt-0.5 shrink-0" />
            : <AlertCircle className="size-4 mt-0.5 shrink-0" />}
          {importStatus.message}
        </div>
      )}

      {/* Summary Card — only meaningful once we have prices */}
      {enrichedCount > 0 && (
        <Card>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <p className="text-xs text-muted-foreground mb-1">{holdings.length} holdings</p>
              {enrichedCount < holdings.length && (
                <p className="text-xs text-signal-amber">{holdings.length - enrichedCount} pending</p>
              )}
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Cost basis</p>
              <p className="text-lg font-bold text-foreground">
                A${totalCost.toLocaleString('en-AU', { minimumFractionDigits: 2 })}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Current value</p>
              <p className="text-lg font-bold text-foreground">
                A${totalValue.toLocaleString('en-AU', { minimumFractionDigits: 2 })}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Total P&L</p>
              <p className={cn("text-lg font-bold", totalPL >= 0 ? "text-signal-green" : "text-signal-red")}>
                {totalPL >= 0 ? "+" : "−"}A${Math.abs(totalPL).toLocaleString('en-AU', { minimumFractionDigits: 2 })}
                {" "}({totalPLPercent >= 0 ? "+" : ""}{totalPLPercent.toFixed(1)}%)
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Holdings */}
      <div className="space-y-3">
        {holdings.map((holding, i) => {
          const a            = holding.analysis
          const currentPrice = a?.price ?? null
          const marketValue  = currentPrice !== null ? holding.shares * currentPrice : null
          const costBasis    = holding.isGifted ? 0 : holding.shares * holding.avgCost
          const pl           = marketValue !== null ? marketValue - costBasis : null
          const plPercent    = pl !== null && costBasis > 0 ? (pl / costBasis) * 100 : holding.isGifted && pl !== null ? 100 : null

          return (
            <Card
              key={holding.ticker}
              interactive
              onClick={() => navigateToAnalyser(holding.ticker, "portfolio")}
              animationDelay={i * 50}
              className="border border-border/50"
            >
              <div className="space-y-3">
                {/* Header: Ticker + Company + Signal */}
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-display text-base font-semibold tracking-wide text-foreground">{holding.ticker}</h3>
                      {a?.company && <span className="text-sm text-muted-foreground">{a.company}</span>}
                      {a?.sector  && <span className="text-xs text-muted-foreground">{a.sector}</span>}
                    </div>
                    {holding.isGifted && (
                      <span className="inline-block text-[11px] font-semibold text-signal-amber mt-1 px-2 py-1 rounded bg-signal-amber/15">
                        Gifted
                      </span>
                    )}
                  </div>
                  <div className="text-right shrink-0 ml-2">
                    {a ? (
                      <>
                        <VerdictBadge verdict={a.verdict as Verdict} size="sm" />
                        <p className="text-xl font-bold text-foreground mt-1">
                          {a.price !== null ? `A$${a.price.toFixed(2)}` : "—"}
                        </p>
                        {pl !== null && (
                          <p className={cn("text-xs font-semibold", pl >= 0 ? "text-signal-green" : "text-signal-red")}>
                            {pl >= 0 ? "+" : "−"}A${Math.abs(pl).toLocaleString('en-AU', { minimumFractionDigits: 2 })}
                            {plPercent !== null ? ` (${plPercent >= 0 ? "+" : ""}${plPercent.toFixed(1)}%)` : ''}
                          </p>
                        )}
                      </>
                    ) : (
                      <span className="text-xs text-muted-foreground px-2 py-1 rounded bg-muted/40">
                        {isAnalysing ? 'Analysing…' : 'Not analysed'}
                      </span>
                    )}
                  </div>
                </div>

                {/* Analysis text */}
                {a?.summary && (textVisible || expandedCards.has(holding.ticker)) && (
                  <p className="text-xs text-muted-foreground leading-relaxed">{a.summary}</p>
                )}
                {a?.summary && !textVisible && !expandedCards.has(holding.ticker) && (
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleCardExpand(holding.ticker) }}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors py-1"
                  >
                    <ChevronDown className="size-3" /><span>Show analysis</span>
                  </button>
                )}
                {a?.summary && !textVisible && expandedCards.has(holding.ticker) && (
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleCardExpand(holding.ticker) }}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors py-1"
                  >
                    <ChevronDown className="size-3 rotate-180" /><span>Hide analysis</span>
                  </button>
                )}

                {/* Cycle gauge */}
                {a && (
                  <>
                    <CycleGauge
                      position={a.cyclePosition}
                      stage={a.cycleStage as CycleStage}
                      showLabels={false}
                      size="sm"
                    />
                    {a.cyclePosition > 70 && (
                      <div className="p-2 rounded bg-signal-amber/10 border border-signal-amber/20 flex items-start gap-2">
                        <span className="text-signal-amber mt-0.5">⚠</span>
                        <span className="text-xs text-signal-amber">
                          Late stage — tighten stops (cycle score {a.cyclePosition})
                        </span>
                      </div>
                    )}
                  </>
                )}

                {/* Holding stats */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 py-3 border-t border-border/30">
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase mb-1">Shares</p>
                    <p className="font-semibold text-foreground">{holding.shares.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase mb-1">Avg cost</p>
                    <p className="font-semibold text-foreground">
                      {holding.isGifted ? '—' : `A$${holding.avgCost.toFixed(2)}`}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase mb-1">Cost basis</p>
                    <p className="font-semibold text-foreground">
                      {holding.isGifted ? '—' : `A$${costBasis.toLocaleString('en-AU', { minimumFractionDigits: 2 })}`}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase mb-1">Market value</p>
                    <p className="font-semibold text-foreground">
                      {marketValue !== null
                        ? `A$${marketValue.toLocaleString('en-AU', { minimumFractionDigits: 2 })}`
                        : '—'}
                    </p>
                  </div>
                </div>

                {/* Card actions — stopPropagation on the wrapper so card click doesn't also fire */}
                <div
                  className="flex items-center gap-2 pt-2 border-t border-border/30"
                  onClick={(e) => e.stopPropagation()}
                >
                  <SecondaryButton
                    className="h-8 px-3 text-xs"
                    onClick={() => navigateToAnalyser(holding.ticker, "portfolio")}
                  >
                    Full analysis
                  </SecondaryButton>
                  <SecondaryButton
                    className="h-8 px-3 text-xs"
                    icon={Trash2}
                    onClick={() => handleRemove(holding.ticker)}
                  >
                    Remove
                  </SecondaryButton>
                </div>
              </div>
            </Card>
          )
        })}
      </div>

      <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={handleFileSelected} />
    </div>
  )
}
