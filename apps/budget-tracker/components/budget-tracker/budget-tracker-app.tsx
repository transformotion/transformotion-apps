"use client"

import { useEffect } from "react"
import { BudgetAppShell } from "./app-shell"
import { HomeTab } from "./tabs/home-tab"
import { TransactionsTab } from "./tabs/transactions-tab"
import { SummaryTab } from "./tabs/summary-tab"
import { BudgetTab } from "./tabs/budget-tab"
import { SavingsTab } from "./tabs/savings-tab"
import { CashflowTab } from "./tabs/cashflow-tab"
import { RulesTab } from "./tabs/rules-tab"
import { ReviewTab } from "./tabs/review-tab"
import { SettingsTab } from "./tabs/settings-tab"
import { useBudgetStore } from "@/stores/budget-tracker/use-budget-store"
import { idpHintToProvider } from "@transformotion/auth-client"
import { useAuthStore } from "@/stores/auth/use-auth-store"
import { authService } from "@/lib/services/auth"
import { AccountGate } from "@/components/providers/account-gate"
import { TabErrorBoundary } from "@transformotion/ui-error-boundaries"

// ============================================================================
// TAB RENDERER
// ============================================================================

function BudgetTabContent() {
  const activeTab = useBudgetStore((s) => s.activeTab)

  switch (activeTab) {
    case "home":
      return <HomeTab />
    case "transactions":
      return <TransactionsTab />
    case "summary":
      return <SummaryTab />
    case "budget":
      return <BudgetTab />
    case "savings":
      return <SavingsTab />
    case "cashflow":
      return <CashflowTab />
    case "rules":
      return <RulesTab />
    case "review":
      return <ReviewTab />
    case "settings":
      return <SettingsTab />
    default:
      return <TransactionsTab />
  }
}

// ============================================================================
// BUDGET TRACKER APP
// ============================================================================

function Spinner() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="flex items-center gap-3 text-muted-foreground">
        <div className="size-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        <span className="text-sm">Loading...</span>
      </div>
    </div>
  )
}

/**
 * Renders only once AccountGate has confirmed app-account access (D7/D9), so the
 * budget store's data-fetching `initialize()` never runs — and no app-data
 * request fires — before the active account is known.
 */
function BudgetTrackerInner({
  onSignOut,
  onGoToLaunchpad,
}: {
  onSignOut?: () => void
  onGoToLaunchpad?: () => void
}) {
  const initialize = useBudgetStore((s) => s.initialize)
  const isInitialized = useBudgetStore((s) => s.isInitialized)
  const error = useBudgetStore((s) => s.error)

  useEffect(() => { initialize() }, [initialize])

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <p className="text-sm text-signal-red">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
          >
            Reload
          </button>
        </div>
      </div>
    )
  }

  if (!isInitialized) return <Spinner />

  return (
    <BudgetAppShell onGoToLaunchpad={onGoToLaunchpad} onSignOut={onSignOut}>
      <TabErrorBoundary label="Budget Tracker">
        <BudgetTabContent />
      </TabErrorBoundary>
    </BudgetAppShell>
  )
}

export function BudgetTrackerApp({
  onSignOut,
  onGoToLaunchpad,
}: {
  onSignOut?: () => void
  onGoToLaunchpad?: () => void
}) {
  const authIsInitialized = useAuthStore((s) => s.isInitialized)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const initAuth = useAuthStore((s) => s.initialize)

  useEffect(() => { initAuth() }, [initAuth])

  useEffect(() => {
    if (authIsInitialized && !isAuthenticated) {
      // Cross-app SSO hint (#490): the launchpad appends ?idp=<provider> when it
      // launches this app for a FEDERATED user. Passing it as the Hosted-UI
      // `provider` re-federates silently instead of showing the chooser. A native
      // user arrives with no hint → undefined → normal silent local-session SSO.
      // Unknown hint → undefined → chooser (fail-open).
      const hint = typeof window !== 'undefined'
        ? new URLSearchParams(window.location.search).get('idp')
        : null
      const provider = idpHintToProvider(hint)
      authService.signInWithRedirect(provider ? { provider } : undefined)
    }
  }, [isAuthenticated, authIsInitialized])

  if (!authIsInitialized || !isAuthenticated) return <Spinner />

  // Gate private surfaces on app-account membership before any data init.
  return (
    <AccountGate>
      <BudgetTrackerInner onSignOut={onSignOut} onGoToLaunchpad={onGoToLaunchpad} />
    </AccountGate>
  )
}
