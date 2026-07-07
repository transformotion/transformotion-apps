"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { PageHeader, Card, EmptyState } from "@transformotion/ui-primitives"
import { LayoutDashboard, TrendingUp, TrendingDown } from "lucide-react"
import { PriceChart } from "@/components/price-chart/price-chart"
import { useNavigation } from "@/components/stock-analyser/app-shell"
import { portfolioService } from "@/lib/services/portfolio/portfolio-service"
import { watchlistService } from "@/lib/services/watchlist/watchlist-service"
import { cachedQuotesService } from "@/lib/services/cached-quotes"
import { homeDashboardService, type MarketRoundup, type MarketSignals } from "@/lib/services/dashboard"
import { useOhlcvData } from "@/lib/hooks/use-ohlcv-data"
import { notifyError } from "@/lib/util/notify-error"
import { valuePortfolio, watchlistPnl, pickFeatured } from "@/lib/domain/portfolio-valuation"
import { stockSignalBadgeClassName } from "../status-badge"
import {
  deriveCacheStatus,
  formatLastUpdated,
  type CacheFreshness,
} from "@transformotion/contracts/stock-analyser/cache-freshness"
import type { StockAnalysisResult } from "@/lib/services/portfolio/types"
import type { CacheMetadata } from "@/lib/services/cache/dynamo-ttl-cache"
import type { OhlcvRange, OhlcvInterval } from "@transformotion/api-client"

const RANGES: { label: string; range: OhlcvRange; interval: OhlcvInterval }[] = [
  // The shipped OHLCV service exposes no intraday range, so 1D/1W approximate to
  // the nearest daily series (see PR disposition list).
  { label: "1D", range: "1mo", interval: "1d" },
  { label: "1W", range: "1mo", interval: "1d" },
  { label: "1M", range: "3mo", interval: "1d" },
  { label: "1Y", range: "1y", interval: "1wk" },
]

function fmtUsd(n: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}
function fmtPct(n: number): string {
  return `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`
}
function toneClass(n: number): string {
  return n >= 0 ? "text-signal-green" : "text-signal-red"
}

const FRESHNESS_LABEL: Record<CacheFreshness, string> = {
  fresh: "Fresh",
  recent: "Recent",
  stale: "Stale",
  outdated: "Outdated",
}
const FRESHNESS_TONE: Record<CacheFreshness, string> = {
  fresh: "bg-signal-green/10 text-signal-green",
  recent: "bg-signal-green/10 text-signal-green",
  stale: "bg-signal-amber/10 text-signal-amber",
  outdated: "bg-signal-red/10 text-signal-red",
}

/** Per-tile cache-state: fresh/recent → "updated X ago"; stale/outdated → badge; null → nothing (caller renders empty state). */
function CacheState({ metadata }: { metadata: CacheMetadata | null }) {
  if (!metadata) return null
  const status = deriveCacheStatus(metadata)
  const stale = status.freshness === "stale" || status.freshness === "outdated"
  return (
    <span className="flex items-center gap-2 text-[11px] text-muted-foreground">
      {stale && (
        <span className={`px-1.5 py-0.5 rounded-full font-medium ${FRESHNESS_TONE[status.freshness]}`}>
          {FRESHNESS_LABEL[status.freshness]}
        </span>
      )}
      <span>{formatLastUpdated(metadata.cachedAt)}</span>
    </span>
  )
}

/** Reduce a set of per-ticker cache metadata to the oldest (mirrors portfolio/watchlist tabs). */
function oldest(metas: CacheMetadata[]): CacheMetadata | null {
  return metas.reduce<CacheMetadata | null>((o, m) => (!o || m.cachedAt < o.cachedAt ? m : o), null)
}

export function HomeTab() {
  const { navigateTo, navigateToAnalyser } = useNavigation()

  // ── Portfolio ────────────────────────────────────────────────────────────
  const [portfolio, setPortfolio] = useState<{ ticker: string; shares: number; avgCost: number; isGifted: boolean }[]>([])
  const [pfAnalysis, setPfAnalysis] = useState<Record<string, StockAnalysisResult>>({})
  const [pfLoaded, setPfLoaded] = useState(false)

  // ── Watchlist ────────────────────────────────────────────────────────────
  const [watchlist, setWatchlist] = useState<{ ticker: string; name: string }[]>([])
  const [wlAnalysis, setWlAnalysis] = useState<Record<string, StockAnalysisResult>>({})
  const [wlMeta, setWlMeta] = useState<Record<string, CacheMetadata>>({})

  // ── Featured / cached quotes ─────────────────────────────────────────────
  const [featured, setFeatured] = useState<{ ticker: string; price: number; dayChangePct: number } | null>(null)
  const [rangeIdx, setRangeIdx] = useState(3) // default 1Y
  const { data: ohlcv, fetch: fetchOhlcv } = useOhlcvData()

  // ── Market signals + roundup ─────────────────────────────────────────────
  const [signals, setSignals] = useState<MarketSignals | null>(null)
  const [roundup, setRoundup] = useState<MarketRoundup | null>(null)

  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    let cancelled = false
    const ctrl = new AbortController()
    abortRef.current = ctrl

    // The dashboard is a collage of best-effort widgets; a failed load used to be
    // indistinguishable from genuinely-empty data. Surface any real failure as ONE
    // calm, deduped toast (notifyError collapses the burst by message) so the user
    // knows the data is stale, not empty — without a per-widget alarm.
    const notifyDashboard = (err: unknown) =>
      notifyError(err, {
        title: "Dashboard",
        description: "Some data couldn't load just now. Refresh or try again shortly.",
      })

    portfolioService.getHoldings().then((holdings) => {
      if (cancelled) return
      setPortfolio(holdings.map((h) => ({ ticker: h.ticker, shares: h.shares, avgCost: h.avgCost, isGifted: h.isGifted })))
      setPfLoaded(true)
      void portfolioService.enrichHoldings(
        holdings.map((h) => h.ticker),
        (ticker, result) => { if (!cancelled) setPfAnalysis((p) => ({ ...p, [ticker]: result })) },
        ctrl.signal,
        undefined,
        undefined,
        (_ticker, err) => { if (!cancelled) notifyDashboard(err) },
      )
    }).catch((err) => { if (!cancelled) { setPfLoaded(true); notifyDashboard(err) } })

    watchlistService.getItems().then((items) => {
      if (cancelled) return
      setWatchlist(items.map((i) => ({ ticker: i.ticker, name: i.name })))
      void portfolioService.enrichHoldings(
        items.map((i) => i.ticker),
        (ticker, result) => { if (!cancelled) setWlAnalysis((w) => ({ ...w, [ticker]: result })) },
        ctrl.signal,
        (ticker, metadata) => { if (!cancelled) setWlMeta((w) => ({ ...w, [ticker]: metadata })) },
        undefined,
        (_ticker, err) => { if (!cancelled) notifyDashboard(err) },
      )
    }).catch((err) => { if (!cancelled) notifyDashboard(err) })

    cachedQuotesService.getQuotes().then((quotes) => {
      if (cancelled) return
      const top = pickFeatured(quotes)
      if (top) setFeatured({ ticker: top.ticker, price: top.price, dayChangePct: top.dayChangePct })
    }).catch((err) => { if (!cancelled) notifyDashboard(err) })

    homeDashboardService.getMarketSignals().then((s) => { if (!cancelled) setSignals(s) }).catch((err) => { if (!cancelled) notifyDashboard(err) })
    homeDashboardService.getMarketRoundup().then((r) => { if (!cancelled) setRoundup(r) }).catch((err) => { if (!cancelled) notifyDashboard(err) })

    return () => { cancelled = true; ctrl.abort() }
  }, [])

  // Featured-symbol chart follows the selected range.
  useEffect(() => {
    if (!featured) return
    void fetchOhlcv(featured.ticker, RANGES[rangeIdx].range, RANGES[rangeIdx].interval)
  }, [featured, rangeIdx, fetchOhlcv])

  // ── Derived ──────────────────────────────────────────────────────────────
  const valuation = useMemo(
    () => valuePortfolio(portfolio.map((h) => ({
      shares: h.shares,
      avgCost: h.avgCost,
      isGifted: h.isGifted,
      price: pfAnalysis[h.ticker]?.price ?? null,
      dayChangePct: pfAnalysis[h.ticker]?.change ?? null,
    }))),
    [portfolio, pfAnalysis],
  )

  const wlRows = useMemo(
    () => watchlist.map((w) => ({ ...w, price: wlAnalysis[w.ticker]?.price ?? null, change: wlAnalysis[w.ticker]?.change ?? null })),
    [watchlist, wlAnalysis],
  )
  const wlPnl = useMemo(() => watchlistPnl(wlRows.map((r) => ({ dayChangePct: r.change }))), [wlRows])
  const wlCacheMeta = useMemo(() => oldest(Object.values(wlMeta)), [wlMeta])

  return (
    <div className="p-4 space-y-4">
      <PageHeader
        title="Stock Analyser"
        subtitle="Market overview and watchlist"
        titleClassName="font-display text-xl uppercase tracking-wide"
      />

      {/* Portfolio stat row → Portfolio */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card interactive onClick={() => navigateTo("portfolio")}>
          <p className="font-display text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Portfolio Value</p>
          <p className="text-2xl font-bold text-foreground">{fmtUsd(valuation.value)}</p>
          <p className={`text-xs mt-1 ${toneClass(valuation.dayGainPct)}`}>{fmtPct(valuation.dayGainPct)}</p>
        </Card>
        <Card interactive onClick={() => navigateTo("portfolio")}>
          <p className="font-display text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Today&apos;s Gain</p>
          <p className={`text-2xl font-bold ${toneClass(valuation.dayGain)}`}>{valuation.dayGain >= 0 ? "+" : ""}{fmtUsd(valuation.dayGain)}</p>
          <p className={`text-xs mt-1 ${toneClass(valuation.dayGainPct)}`}>{fmtPct(valuation.dayGainPct)}</p>
        </Card>
        <Card interactive onClick={() => navigateTo("portfolio")}>
          <p className="font-display text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Total Return</p>
          <p className={`text-2xl font-bold ${toneClass(valuation.totalReturn)}`}>{valuation.totalReturn >= 0 ? "+" : ""}{fmtUsd(valuation.totalReturn)}</p>
          <p className={`text-xs mt-1 ${toneClass(valuation.totalReturnPct)}`}>{fmtPct(valuation.totalReturnPct)}</p>
        </Card>
        <Card interactive onClick={() => navigateTo("watchlist")}>
          <p className="font-display text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Watchlist P/L</p>
          <p className={`text-2xl font-bold ${toneClass(wlPnl.pct)}`}>{fmtPct(wlPnl.pct)}</p>
          <p className="text-xs text-muted-foreground mt-1">{wlPnl.count} symbol{wlPnl.count === 1 ? "" : "s"} · today</p>
        </Card>
      </div>

      {/* Featured symbol + Watchlist */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2" interactive onClick={() => featured && navigateToAnalyser(featured.ticker, "home")}>
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="font-display text-sm font-semibold tracking-wide text-foreground">
                {featured ? featured.ticker : "Featured"}
              </h3>
              {featured && (
                <p className="text-xs text-muted-foreground">
                  {fmtUsd(featured.price)}{" "}
                  <span className={toneClass(featured.dayChangePct)}>{fmtPct(featured.dayChangePct * 100)} today</span>
                </p>
              )}
            </div>
            {/* Range selector must not trigger the card's navigate. */}
            <div className="flex gap-1 p-1 bg-card rounded-lg" onClick={(e) => e.stopPropagation()}>
              {RANGES.map((r, i) => (
                <button
                  key={r.label}
                  onClick={() => setRangeIdx(i)}
                  className={
                    i === rangeIdx
                      ? "px-2.5 py-1 rounded-md text-xs font-medium bg-primary text-primary-foreground"
                      : "px-2.5 py-1 rounded-md text-xs font-medium text-muted-foreground hover:text-foreground"
                  }
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-3">
            {ohlcv ? (
              <PriceChart data={ohlcv} height={256} />
            ) : (
              <div className="h-64 grid place-items-center text-xs text-muted-foreground">No price data</div>
            )}
          </div>
        </Card>

        <Card interactive onClick={() => navigateTo("watchlist")}>
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-display text-sm font-semibold tracking-wide text-foreground">Watchlist</h3>
            <CacheState metadata={wlCacheMeta} />
          </div>
          {wlRows.length === 0 ? (
            <EmptyState icon={LayoutDashboard} title="Watchlist empty" description="Add symbols to track them here" />
          ) : (
            <div className="divide-y divide-border">
              {wlRows.map((r) => (
                <div key={r.ticker} className="flex items-center justify-between py-2.5">
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-foreground">{r.ticker}</span>
                    <span className="block text-xs text-muted-foreground truncate">{r.name}</span>
                  </span>
                  <span className="text-right">
                    <span className="block text-sm font-medium text-foreground">{r.price != null ? fmtUsd(r.price) : "—"}</span>
                    <span className={`block text-xs ${r.change != null ? toneClass(r.change) : "text-muted-foreground"}`}>
                      {r.change != null ? fmtPct(r.change) : "—"}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Market Signals → Recs */}
      <Card interactive onClick={() => navigateTo("recs")}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-display text-sm font-semibold tracking-wide text-foreground">Market Signals</h3>
          <CacheState metadata={signals?.metadata ?? null} />
        </div>
        {!signals || signals.signals.length === 0 ? (
          <EmptyState icon={LayoutDashboard} title="No signals cached" description="Recommendations haven't been warmed yet" />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {signals.signals.map((s) => (
              <div key={s.ticker} className="rounded-lg border border-border p-3">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-sm font-semibold text-foreground">{s.ticker}</span>
                  <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${stockSignalBadgeClassName(s.signal)}`}>{s.label}</span>
                </div>
                <p className="text-xs text-muted-foreground line-clamp-2">{s.note}</p>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Market Roundup → Market */}
      <Card interactive onClick={() => navigateTo("market")}>
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-display text-sm font-semibold tracking-wide text-foreground">Market Roundup</h3>
          <CacheState metadata={roundup?.metadata ?? null} />
        </div>
        {!roundup || roundup.tiles.length === 0 ? (
          <EmptyState icon={LayoutDashboard} title="No market analysis cached" description="The market cache hasn't been warmed yet" />
        ) : (
          <>
            <p className="text-sm text-muted-foreground mb-3 line-clamp-2">{roundup.summary}</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {roundup.tiles.map((t) => (
                <div key={t.label} className="rounded-lg border border-border p-3">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="flex items-center gap-2 min-w-0">
                      <span className="text-sm font-semibold text-foreground">{t.label}</span>
                      {t.sub && <span className="text-xs text-muted-foreground">{t.sub}</span>}
                      <span className={`text-xs ${toneClass(t.change)} flex items-center gap-0.5`}>
                        {t.change >= 0 ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
                        {fmtPct(t.change)}
                      </span>
                    </span>
                    <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium shrink-0 ${stockSignalBadgeClassName(t.signal)}`}>{t.signal}</span>
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-2">{t.note}</p>
                </div>
              ))}
            </div>
          </>
        )}
      </Card>

      {pfLoaded && portfolio.length === 0 && (
        <EmptyState icon={LayoutDashboard} title="No holdings" description="Import a portfolio to see your valuation" />
      )}
    </div>
  )
}
