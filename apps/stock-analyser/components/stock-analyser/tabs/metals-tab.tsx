"use client"

import { useState } from "react"
import { ChevronDown, AlertCircle, RefreshCw, TrendingUp, Coins } from "lucide-react"
import {
  PageHeader,
  Card,
  TrendBadge,
  PrimaryButton,
  CacheStatusBar,
  TextToggle,
  Spinner,
  EmptyState,
} from "@transformotion/ui-primitives"
import type { Metal, RunMetalsResponse } from "@transformotion/contracts/stock-analyser/metals"
import { useNavigation } from "../app-shell"
import { cn } from "@/lib/utils"
import { useScopedAnalysis } from "@/lib/hooks/use-scoped-analysis"

export function MetalsTab() {
  const { navigateToAnalyser, getTabTextVisibility, setTabTextOverride, showExplanatoryText } = useNavigation()
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set())

  const analysis = useScopedAnalysis<Metal[]>({
    surface: "metals",
    scopeKey: "default",
    buildRequest: (webSearch) => ({
      prompt: "",
      webSearch,
      jobStart: {
        path: "metals/run",
        body: { searchMode: webSearch ? "live" : "fast" },
      },
    }),
    parse: (raw) => (raw as RunMetalsResponse | null)?.metals ?? null,
  })

  const textVisible = getTabTextVisibility("metals")
  const isTextOverride = showExplanatoryText !== textVisible
  const toggleTextVisibility = () => setTabTextOverride("metals", !textVisible)
  const toggleCardExpand = (symbol: string) => {
    setExpandedCards((prev) => {
      const next = new Set(prev)
      if (next.has(symbol)) next.delete(symbol)
      else next.add(symbol)
      return next
    })
  }

  const metalsToDisplay = analysis.result ?? []

  return (
    <div className="p-4 space-y-4">
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

      <CacheStatusBar
        freshness={analysis.status.freshness}
        lastUpdated={analysis.status.lastUpdated}
        isLive={analysis.isLive}
        onToggleMode={analysis.toggleMode}
        onRefresh={analysis.refresh}
      />

      <PrimaryButton
        onClick={analysis.run}
        disabled={analysis.isRunning}
        icon={analysis.isRunning ? undefined : analysis.isIdle ? TrendingUp : RefreshCw}
        className="w-full"
      >
        {analysis.isRunning ? (
          <>
            <Spinner className="size-4" />
            Analysing metals...
          </>
        ) : (
          analysis.buttonLabel
        )}
      </PrimaryButton>

      <p className="text-xs text-muted-foreground">
        Spot prices - {new Date().toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" })}
      </p>

      {analysis.error && (
        <div className="p-3 rounded-lg bg-signal-red/10 border border-signal-red/20 flex items-start gap-2">
          <AlertCircle className="size-4 text-signal-red mt-0.5 shrink-0" />
          <div className="text-sm text-signal-red">{analysis.error.message}</div>
        </div>
      )}

      {analysis.isIdle ? (
        <EmptyState
          icon={Coins}
          title="No analysis yet"
          description={`Tap ${analysis.buttonLabel} to see precious metals spot prices and signals.`}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {metalsToDisplay.map((metal, i) => {
            return (
              <Card
                key={metal.symbol}
                animationDelay={i * 80}
                interactive
                onClick={() => navigateToAnalyser(metal.perthMintTicker, "metals")}
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-display text-lg font-semibold tracking-wide text-foreground">{metal.name}</h3>
                      <p className="text-xs text-muted-foreground">{metal.symbol}</p>
                    </div>
                    <TrendBadge trend={metal.signal} />
                  </div>

                <div>
                  <p className="text-2xl font-bold text-foreground">
                    US${metal.spotPrice.toLocaleString("en-US")}
                  </p>
                  <p className={cn("text-sm font-semibold", metal.ytdChange >= 0 ? "text-signal-red" : "text-signal-green")}>
                    {metal.ytdChange >= 0 ? "+" : ""}{metal.ytdChange.toFixed(1)}% YTD
                  </p>
                </div>

                <div className="grid grid-cols-4 gap-2 text-[11px] text-muted-foreground">
                  <div>
                    <p className="text-[10px] uppercase tracking-wider mb-0.5">AUD Spot</p>
                    <p className="font-semibold text-foreground">A${metal.audSpotPrice.toLocaleString("en-AU")}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wider mb-0.5">30d Change</p>
                    {metal.change30d === null ? (
                      <p className="font-semibold text-muted-foreground">&mdash;</p>
                    ) : (
                      <p className={cn("font-semibold", metal.change30d >= 0 ? "text-signal-red" : "text-signal-green")}>
                        {metal.change30d >= 0 ? "+" : ""}{metal.change30d.toFixed(1)}%
                      </p>
                    )}
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
                          "text-signal-amber",
                    )}>
                      {metal.signal.toLowerCase()}
                    </p>
                  </div>
                </div>

                {(textVisible || expandedCards.has(metal.symbol)) && (
                  <p className="text-xs text-muted-foreground leading-relaxed border-t border-border pt-3">
                    {metal.outlook}
                  </p>
                )}

                {!textVisible && !expandedCards.has(metal.symbol) && (
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleCardExpand(metal.symbol) }}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors py-1 border-t border-border pt-3"
                  >
                    <ChevronDown className="size-3" />
                    <span>Show analysis</span>
                  </button>
                )}

                {!textVisible && expandedCards.has(metal.symbol) && (
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleCardExpand(metal.symbol) }}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors py-1"
                  >
                    <ChevronDown className="size-3 rotate-180" />
                    <span>Hide analysis</span>
                  </button>
                )}

                  <div className="flex items-center gap-1 text-primary text-xs font-medium pt-1 group">
                    <span>Analyse {metal.perthMintName} ({metal.perthMintTicker})</span>
                    <ChevronDown className="size-3 group-hover:translate-y-0.5 transition-transform rotate-[-90deg]" />
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
