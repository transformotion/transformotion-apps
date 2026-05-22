"use client"

import { getConfig } from "@/lib/config"
import { NavigationProvider, AppShell, useNavigation } from "@/components/stock-signal/app-shell"
import { MarketAnalysisTab } from "@/components/stock-signal/tabs/market-analysis-tab"
import { RecommendationsTab } from "@/components/stock-signal/tabs/recommendations-tab"
import { ETFsTab } from "@/components/stock-signal/tabs/etfs-tab"
import { MetalsTab } from "@/components/stock-signal/tabs/metals-tab"
import { AnalyserTab } from "@/components/stock-signal/tabs/analyser-tab"
import { PortfolioTab } from "@/components/stock-signal/tabs/portfolio-tab"
import { WatchlistTab } from "@/components/stock-signal/tabs/watchlist-tab"
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

function StockSignalContent() {
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

export default function StockSignalPage() {
  return (
    <AuthGuard>
      <StockSignalContent />
    </AuthGuard>
  )
}
