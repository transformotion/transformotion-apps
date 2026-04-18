"use client"

import { BudgetNavigationProvider, BudgetAppShell, useBudgetNavigation } from "./app-shell"
import { TransactionsTab } from "./tabs/transactions-tab"
import { SummaryTab } from "./tabs/summary-tab"
import { BudgetTab } from "./tabs/budget-tab"
import { CashflowTab } from "./tabs/cashflow-tab"
import { RulesTab } from "./tabs/rules-tab"
import { ReviewTab } from "./tabs/review-tab"

// ============================================================================
// TAB RENDERER
// ============================================================================

function BudgetTabContent() {
  const { activeTab } = useBudgetNavigation()
  
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
  return (
    <BudgetNavigationProvider 
      onSignOut={onSignOut}
      onGoToLaunchpad={onGoToLaunchpad}
    >
      <BudgetAppShell>
        <BudgetTabContent />
      </BudgetAppShell>
    </BudgetNavigationProvider>
  )
}
