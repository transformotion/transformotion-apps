"use client"

import { useEffect } from "react"
import { BudgetAppShell } from "./app-shell"
import { TransactionsTab } from "./tabs/transactions-tab"
import { SummaryTab } from "./tabs/summary-tab"
import { BudgetTab } from "./tabs/budget-tab"
import { CashflowTab } from "./tabs/cashflow-tab"
import { RulesTab } from "./tabs/rules-tab"
import { ReviewTab } from "./tabs/review-tab"
import { useBudgetStore } from "@/stores/budget-tracker/use-budget-store"
import { useAuthStore } from "@/stores/auth/use-auth-store"
import { authService } from "@/lib/services/auth"

// ============================================================================
// TAB RENDERER
// ============================================================================

function BudgetTabContent() {
  const activeTab = useBudgetStore((s) => s.activeTab)

  switch (activeTab) {
    case "transactions":
      return <TransactionsTab />
    case "summary":
      return <SummaryTab />
    case "budget":
      return <BudgetTab />
    case "cashflow":
      return <CashflowTab />
    case "rules":
      return <RulesTab />
    case "review":
      return <ReviewTab />
    default:
      return <TransactionsTab />
  }
}

// ============================================================================
// BUDGET TRACKER APP
// ============================================================================

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

  const initialize = useBudgetStore((s) => s.initialize)
  const isInitialized = useBudgetStore((s) => s.isInitialized)
  const error = useBudgetStore((s) => s.error)

  useEffect(() => { initAuth() }, [initAuth])

  useEffect(() => {
    if (authIsInitialized && !isAuthenticated) {
      authService.signInWithRedirect().catch(() => {})
    }
  }, [isAuthenticated, authIsInitialized])

  useEffect(() => {
    if (isAuthenticated) initialize()
  }, [isAuthenticated, initialize])

  if (!authIsInitialized || !isAuthenticated) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex items-center gap-3 text-muted-foreground">
          <div className="size-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <span className="text-sm">Loading...</span>
        </div>
      </div>
    )
  }

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

  if (!isInitialized) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex items-center gap-3 text-muted-foreground">
          <div className="size-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <span className="text-sm">Loading...</span>
        </div>
      </div>
    )
  }

  return (
    <BudgetAppShell onGoToLaunchpad={onGoToLaunchpad} onSignOut={onSignOut}>
      <BudgetTabContent />
    </BudgetAppShell>
  )
}
