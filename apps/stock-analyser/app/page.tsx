"use client"

import { getConfig } from "@/lib/config"
import { NavigationProvider, AppShell, useNavigation } from "@/components/stock-analyser/app-shell"
import { MarketAnalysisTab } from "@/components/stock-analyser/tabs/market-analysis-tab"
import { RecommendationsTab } from "@/components/stock-analyser/tabs/recommendations-tab"
import { ETFsTab } from "@/components/stock-analyser/tabs/etfs-tab"
import { MetalsTab } from "@/components/stock-analyser/tabs/metals-tab"
import { AnalyserTab } from "@/components/stock-analyser/tabs/analyser-tab"
import { PortfolioTab } from "@/components/stock-analyser/tabs/portfolio-tab"
import { WatchlistTab } from "@/components/stock-analyser/tabs/watchlist-tab"
import { AuthGuard } from "@/components/providers/auth-guard"
import { useAuthStore } from "@/stores/auth/use-auth-store"
import { TabErrorBoundary } from "@transformotion/ui-error-boundaries"

function TabRouter() {
  const { activeTab, analyserTicker, analyserSource } = useNavigation()

  switch (activeTab) {
    case "market":
      return <MarketAnalysisTab />
    case "recs":
      return <RecommendationsTab />
    case "etfs":
      return <ETFsTab />
    case "metals":
      return <MetalsTab />
    case "analyser":
      return <AnalyserTab initialTicker={analyserTicker} source={analyserSource} />
    case "portfolio":
      return <PortfolioTab />
    case "watchlist":
      return <WatchlistTab />
    default:
      return <MarketAnalysisTab />
  }
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
        <TabErrorBoundary label="Stock Analyser">
          <TabRouter />
        </TabErrorBoundary>
      </AppShell>
    </NavigationProvider>
  )
}

export default function StockAnalyserPage() {
  return (
    <AuthGuard>
      <StockAnalyserContent />
    </AuthGuard>
  )
}
