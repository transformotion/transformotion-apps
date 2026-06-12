"use client"

import type React from "react"
import { getConfig } from "@/lib/config"
import { NavigationProvider, AppShell, useNavigation } from "@/components/stock-analyser/app-shell"
import { MarketAnalysisTab } from "@/components/stock-analyser/tabs/market-analysis-tab"
import { RecommendationsTab } from "@/components/stock-analyser/tabs/recommendations-tab"
import { ETFsTab } from "@/components/stock-analyser/tabs/etfs-tab"
import { MetalsTab } from "@/components/stock-analyser/tabs/metals-tab"
import { AnalyserTab } from "@/components/stock-analyser/tabs/analyser-tab"
import { PortfolioTab } from "@/components/stock-analyser/tabs/portfolio-tab"
import { WatchlistTab } from "@/components/stock-analyser/tabs/watchlist-tab"
import { SettingsTab } from "@/components/stock-analyser/tabs/settings-tab"
import { AuthGuard } from "@/components/providers/auth-guard"
import { AccountGate } from "@/components/providers/account-gate"
import { useAuthStore } from "@/stores/auth/use-auth-store"
import { TabErrorBoundary } from "@transformotion/ui-error-boundaries"

function TabRouter() {
  const { activeTab, analyserTicker, analyserSource } = useNavigation()

  let tab: React.ReactNode
  switch (activeTab) {
    case "market":
      tab = <MarketAnalysisTab />
      break
    case "recs":
      tab = <RecommendationsTab />
      break
    case "etfs":
      tab = <ETFsTab />
      break
    case "metals":
      tab = <MetalsTab />
      break
    case "analyser":
      tab = <AnalyserTab initialTicker={analyserTicker} source={analyserSource} />
      break
    case "portfolio":
      tab = <PortfolioTab />
      break
    case "watchlist":
      tab = <WatchlistTab />
      break
    case "settings":
      tab = <SettingsTab />
      break
    default:
      tab = <MarketAnalysisTab />
  }

  return (
    <TabErrorBoundary key={activeTab} label="Stock Analyser">
      {tab}
    </TabErrorBoundary>
  )
}

function StockAnalyserContent() {
  const { signOut } = useAuthStore()

  const handleSignOut = async () => {
    await signOut()
    window.location.assign(getConfig().apps.signOutUrl)
  }

  const handleGoToLaunchpad = () => {
    window.location.assign('/')
  }

  return (
    <NavigationProvider
      initialTab="market"
      onSignOut={handleSignOut}
      onGoToLaunchpad={handleGoToLaunchpad}
    >
      <AppShell>
        <TabRouter />
      </AppShell>
    </NavigationProvider>
  )
}

export default function StockAnalyserPage() {
  return (
    <AuthGuard>
      <AccountGate>
        <StockAnalyserContent />
      </AccountGate>
    </AuthGuard>
  )
}
