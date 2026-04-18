/**
 * Budget Tracker Store
 * 
 * Manages all budget tracker state.
 * Zustand store that calls repositories for persistence.
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { 
  getTransactionRepository,
  getRulesRepository,
  getSettingsRepository,
  type Transaction,
  type CustomRule,
  type BuiltinRule,
  type BudgetSettings,
  type TransactionFilters,
} from '@/lib/repositories/budget-tracker'

export type BudgetTabId = 'transactions' | 'summary' | 'budget' | 'cashflow' | 'rules' | 'review'

interface BudgetState {
  // Navigation
  activeTab: BudgetTabId

  // Data
  transactions: Transaction[]
  customRules: CustomRule[]
  builtinRules: BuiltinRule[]
  settings: BudgetSettings
  filters: TransactionFilters

  // Derived
  uncategorizedCount: number

  // Loading states
  isLoading: boolean
  isInitialized: boolean
  error: string | null

  // Navigation actions
  setActiveTab: (tab: BudgetTabId) => void

  // Transaction actions
  loadTransactions: () => Promise<void>
  addTransactions: (transactions: Transaction[]) => Promise<void>
  updateTransaction: (id: number, updates: Partial<Transaction>) => Promise<void>
  deleteTransaction: (id: number) => Promise<void>
  setTransactions: (transactions: Transaction[]) => void

  // Rules actions
  loadRules: () => Promise<void>
  addCustomRule: (rule: CustomRule) => Promise<void>
  updateCustomRule: (id: string, updates: Partial<CustomRule>) => Promise<void>
  deleteCustomRule: (id: string) => Promise<void>
  setCustomRules: (rules: CustomRule[]) => void
  updateBuiltinRule: (id: string, updates: Partial<BuiltinRule>) => Promise<void>
  setBuiltinRules: (rules: BuiltinRule[]) => void

  // Settings actions
  loadSettings: () => Promise<void>
  updateSettings: (updates: Partial<BudgetSettings>) => Promise<void>

  // Filter actions
  setFilters: (filters: TransactionFilters) => void
  resetFilters: () => void

  // Initialization
  initialize: () => Promise<void>
}

const DEFAULT_FILTERS: TransactionFilters = {
  dateRange: null,
  category: null,
  subcategory: null,
  bankAccount: null,
  source: null,
  businessFilter: 'all',
  uncategorizedOnly: false,
}

const DEFAULT_SETTINGS: BudgetSettings = {
  budgetOverrides: {},
  budgetFreqs: {},
  customCategories: {},
  projectBudgets: {},
}

export const useBudgetStore = create<BudgetState>()(
  persist(
    (set, get) => ({
      // Initial state
      activeTab: 'transactions',
      transactions: [],
      customRules: [],
      builtinRules: [],
      settings: DEFAULT_SETTINGS,
      filters: DEFAULT_FILTERS,
      uncategorizedCount: 0,
      isLoading: false,
      isInitialized: false,
      error: null,

      // Navigation
      setActiveTab: (tab) => set({ activeTab: tab }),

      // Transactions
      loadTransactions: async () => {
        const repo = getTransactionRepository()
        const transactions = await repo.findAll()
        const uncategorizedCount = transactions.filter(t => !t.category).length
        set({ transactions, uncategorizedCount })
      },

      addTransactions: async (newTransactions) => {
        const repo = getTransactionRepository()
        await repo.saveMany(newTransactions)
        const transactions = await repo.findAll()
        const uncategorizedCount = transactions.filter(t => !t.category).length
        set({ transactions, uncategorizedCount })
      },

      updateTransaction: async (id, updates) => {
        const repo = getTransactionRepository()
        const existing = await repo.findById(id)
        if (existing) {
          await repo.save({ ...existing, ...updates })
          const transactions = await repo.findAll()
          const uncategorizedCount = transactions.filter(t => !t.category).length
          set({ transactions, uncategorizedCount })
        }
      },

      deleteTransaction: async (id) => {
        const repo = getTransactionRepository()
        await repo.delete(id)
        const transactions = await repo.findAll()
        const uncategorizedCount = transactions.filter(t => !t.category).length
        set({ transactions, uncategorizedCount })
      },

      setTransactions: (transactions) => {
        const uncategorizedCount = transactions.filter(t => !t.category).length
        set({ transactions, uncategorizedCount })
        // Persist
        const repo = getTransactionRepository()
        repo.saveMany(transactions)
      },

      // Rules
      loadRules: async () => {
        const repo = getRulesRepository()
        const [customRules, builtinRules] = await Promise.all([
          repo.findAllCustomRules(),
          repo.findAllBuiltinRules(),
        ])
        set({ customRules, builtinRules })
      },

      addCustomRule: async (rule) => {
        const repo = getRulesRepository()
        await repo.saveCustomRule(rule)
        const customRules = await repo.findAllCustomRules()
        set({ customRules })
      },

      updateCustomRule: async (id, updates) => {
        const repo = getRulesRepository()
        const existing = await repo.findCustomRuleById(id)
        if (existing) {
          await repo.saveCustomRule({ ...existing, ...updates })
          const customRules = await repo.findAllCustomRules()
          set({ customRules })
        }
      },

      deleteCustomRule: async (id) => {
        const repo = getRulesRepository()
        await repo.deleteCustomRule(id)
        const customRules = await repo.findAllCustomRules()
        set({ customRules })
      },

      setCustomRules: (customRules) => {
        set({ customRules })
        // Persist each rule
        const repo = getRulesRepository()
        customRules.forEach(rule => repo.saveCustomRule(rule))
      },

      updateBuiltinRule: async (id, updates) => {
        const repo = getRulesRepository()
        await repo.updateBuiltinRule(id, updates)
        const builtinRules = await repo.findAllBuiltinRules()
        set({ builtinRules })
      },

      setBuiltinRules: (builtinRules) => {
        set({ builtinRules })
      },

      // Settings
      loadSettings: async () => {
        const repo = getSettingsRepository()
        const [settings, filters] = await Promise.all([
          repo.getSettings(),
          repo.getFilters(),
        ])
        set({ settings, filters })
      },

      updateSettings: async (updates) => {
        const repo = getSettingsRepository()
        const settings = await repo.updateSettings(updates)
        set({ settings })
      },

      // Filters
      setFilters: (filters) => {
        set({ filters })
        // Persist filters
        const repo = getSettingsRepository()
        repo.updateFilters(filters)
      },

      resetFilters: () => {
        set({ filters: DEFAULT_FILTERS })
        const repo = getSettingsRepository()
        repo.resetFilters()
      },

      // Initialize
      initialize: async () => {
        if (get().isInitialized) return
        
        set({ isLoading: true, error: null })
        try {
          await Promise.all([
            get().loadTransactions(),
            get().loadRules(),
            get().loadSettings(),
          ])
          set({ isInitialized: true, isLoading: false })
        } catch (error) {
          set({
            isLoading: false,
            error: error instanceof Error ? error.message : 'Failed to initialize',
          })
        }
      },
    }),
    {
      name: 'budget-store',
      partialize: (state) => ({
        // Only persist navigation state and filters
        activeTab: state.activeTab,
        filters: state.filters,
      }),
    }
  )
)

// Selectors
export const selectTransactions = (state: BudgetState) => state.transactions
export const selectCustomRules = (state: BudgetState) => state.customRules
export const selectBuiltinRules = (state: BudgetState) => state.builtinRules
export const selectSettings = (state: BudgetState) => state.settings
export const selectFilters = (state: BudgetState) => state.filters
export const selectUncategorizedCount = (state: BudgetState) => state.uncategorizedCount
export const selectActiveTab = (state: BudgetState) => state.activeTab
