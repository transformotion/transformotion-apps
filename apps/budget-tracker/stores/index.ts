/**
 * Zustand Stores
 * 
 * Central state management for all apps.
 * Stores call repositories for persistence.
 */

// Auth store (shared across all apps)
export { useAuthStore, selectUser, selectCurrentAccount, selectIsAuthenticated, selectIsLoading } from './auth/use-auth-store'

// Budget Tracker store
export { 
  useBudgetStore,
  selectTransactions,
  selectCustomRules,
  selectBuiltinRules,
  selectSettings,
  selectFilters,
  selectUncategorizedCount,
  selectActiveTab,
} from './budget-tracker/use-budget-store'

// Stock Signal store (to be created)
// export { useSignalStore } from './stock-signal/use-signal-store'
