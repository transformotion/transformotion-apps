/**
 * Example: Using the new architecture in Budget Tracker components
 * 
 * This file demonstrates the pattern for migrating existing components
 * to use Zustand stores, repositories, and domain logic.
 * 
 * BEFORE (old pattern):
 * - Component manages its own state with useState
 * - Calls localStorage directly
 * - Business logic mixed with UI
 * 
 * AFTER (new pattern):
 * - Component uses Zustand store for state
 * - Store calls repositories for persistence
 * - Domain functions handle business logic
 * - UI is pure presentation
 */

'use client'

import { useEffect } from 'react'
import { useBudgetStore } from '@/stores/budget-tracker/use-budget-store'
import { applyRules, type MatchRule } from '@/lib/domain/budget-tracker/rules-engine'
import { calculatePLSummary } from '@/lib/domain/budget-tracker/pl-calculator'
import { getLogger } from '@/lib/services/logger/console-logger'

// Create logger for this component
const logger = getLogger('budget-tracker')

/**
 * Example: Transactions Tab (simplified)
 * 
 * Shows how to:
 * 1. Use Zustand store for state
 * 2. Call domain functions for business logic
 * 3. Keep UI pure (no direct localStorage access)
 */
export function TransactionsTabExample() {
  // Get state and actions from store
  const {
    transactions,
    customRules,
    builtinRules,
    filters,
    isLoading,
    initialize,
    updateTransaction,
    setFilters,
  } = useBudgetStore()

  // Initialize on mount
  useEffect(() => {
    initialize()
  }, [initialize])

  // Apply filters (derived state)
  const filteredTransactions = transactions.filter(tx => {
    if (filters.category && tx.category !== filters.category) return false
    if (filters.uncategorizedOnly && tx.category) return false
    return true
  })

  // Handle categorization using domain logic
  const handleCategorize = (transactionId: number) => {
    const tx = transactions.find(t => t._id === transactionId)
    if (!tx) return

    // Convert rules to MatchRule format
    const builtinMatchRules: MatchRule[] = builtinRules.map(r => ({
      ...r,
      matchType: r.matchType as 'contains' | 'startsWith' | 'regex',
    }))
    const customMatchRules: MatchRule[] = customRules.map(r => ({
      ...r,
      matchType: r.matchType as 'contains' | 'startsWith' | 'regex',
    }))

    // Use domain function for business logic
    const result = applyRules(tx.description, builtinMatchRules, customMatchRules)
    
    if (result) {
      logger.info('Categorized transaction', {
        transactionId,
        category: result.category,
        subcategory: result.subcategory,
        ruleId: result.ruleId,
      })

      // Update via store (store handles persistence)
      updateTransaction(transactionId, {
        category: result.category,
        subcategory: result.subcategory,
      })
    }
  }

  if (isLoading) {
    return <div>Loading...</div>
  }

  return (
    <div>
      {/* Filter controls */}
      <div>
        <button onClick={() => setFilters({ ...filters, uncategorizedOnly: !filters.uncategorizedOnly })}>
          {filters.uncategorizedOnly ? 'Show All' : 'Show Uncategorized'}
        </button>
      </div>

      {/* Transaction list */}
      <ul>
        {filteredTransactions.map(tx => (
          <li key={tx._id}>
            <span>{tx.date}</span>
            <span>{tx.description}</span>
            <span>{tx.amount}</span>
            <span>{tx.category || 'Uncategorized'}</span>
            {!tx.category && (
              <button onClick={() => handleCategorize(tx._id)}>
                Auto-categorize
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * Example: Summary Tab (simplified)
 * 
 * Shows how to:
 * 1. Use domain functions for calculations
 * 2. Keep expensive computations out of render
 */
export function SummaryTabExample() {
  const { transactions, settings, isLoading, initialize } = useBudgetStore()

  useEffect(() => {
    initialize()
  }, [initialize])

  // Use domain function for P&L calculation
  const summary = calculatePLSummary(transactions, {
    budgetOverrides: settings.budgetOverrides,
    budgetFreqs: settings.budgetFreqs,
    projectBudgets: settings.projectBudgets,
  })

  if (isLoading) {
    return <div>Loading...</div>
  }

  return (
    <div>
      <h2>P&L Summary</h2>
      <dl>
        <dt>Total Income</dt>
        <dd>${summary.totalIncome.toFixed(2)}</dd>
        
        <dt>Total Expenses</dt>
        <dd>${summary.totalExpenses.toFixed(2)}</dd>
        
        <dt>Net Savings</dt>
        <dd>${summary.netSavings.toFixed(2)}</dd>
        
        <dt>Savings Rate</dt>
        <dd>{summary.savingsRate.toFixed(1)}%</dd>
      </dl>

      <h3>By Category</h3>
      <ul>
        {Object.entries(summary.byCategory).map(([category, data]) => (
          <li key={category}>
            {category}: ${data.total.toFixed(2)} / ${data.budget.toFixed(2)} budget
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * Example: App Shell (simplified)
 * 
 * Shows how to:
 * 1. Use store for navigation state
 * 2. Keep shell as pure layout component
 */
export function AppShellExample({ children }: { children: React.ReactNode }) {
  const { activeTab, setActiveTab, uncategorizedCount } = useBudgetStore()

  return (
    <div className="min-h-screen bg-background">
      {/* Sidebar navigation */}
      <nav>
        <button 
          onClick={() => setActiveTab('transactions')}
          className={activeTab === 'transactions' ? 'active' : ''}
        >
          Transactions
          {uncategorizedCount > 0 && (
            <span className="badge">{uncategorizedCount}</span>
          )}
        </button>
        <button 
          onClick={() => setActiveTab('summary')}
          className={activeTab === 'summary' ? 'active' : ''}
        >
          Summary
        </button>
        {/* ... other tabs */}
      </nav>

      {/* Main content */}
      <main>
        {children}
      </main>
    </div>
  )
}

/**
 * Migration Guide
 * 
 * To migrate an existing component:
 * 
 * 1. Replace useState with store hooks:
 *    BEFORE: const [transactions, setTransactions] = useState([])
 *    AFTER:  const { transactions, setTransactions } = useBudgetStore()
 * 
 * 2. Replace direct localStorage calls with store actions:
 *    BEFORE: localStorage.setItem('transactions', JSON.stringify(data))
 *    AFTER:  addTransactions(data)  // store handles persistence
 * 
 * 3. Move business logic to domain functions:
 *    BEFORE: const match = rules.find(r => new RegExp(r.pattern).test(desc))
 *    AFTER:  const match = applyRules(desc, builtinRules, customRules)
 * 
 * 4. Add logging for important operations:
 *    BEFORE: console.log('Imported', count, 'transactions')
 *    AFTER:  logger.info('Imported transactions', { count, filename })
 * 
 * 5. Keep UI components pure - they should only:
 *    - Read from stores
 *    - Call store actions
 *    - Call domain functions for calculations
 *    - Render UI
 */
