import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  getTransactionRepository,
  getCustomRulesRepository,
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
  updateTransaction: (id: string, updates: Partial<Transaction>) => Promise<void>
  deleteTransaction: (id: string) => Promise<void>
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
        const transactions = await repo.findAll('')
        const uncategorizedCount = transactions.filter(t => !t.category).length
        set({ transactions, uncategorizedCount })
      },

      addTransactions: async (newTransactions) => {
        const repo = getTransactionRepository()
        await repo.upsertBulk(newTransactions)
        const transactions = await repo.findAll('')
        const uncategorizedCount = transactions.filter(t => !t.category).length
        set({ transactions, uncategorizedCount })
      },

      updateTransaction: async (id, updates) => {
        const repo = getTransactionRepository()
        await repo.update(id, '', updates)
        const transactions = await repo.findAll('')
        const uncategorizedCount = transactions.filter(t => !t.category).length
        set({ transactions, uncategorizedCount })
      },

      deleteTransaction: async (id) => {
        const repo = getTransactionRepository()
        await repo.delete(id, '')
        const transactions = await repo.findAll('')
        const uncategorizedCount = transactions.filter(t => !t.category).length
        set({ transactions, uncategorizedCount })
      },

      setTransactions: (transactions) => {
        const uncategorizedCount = transactions.filter(t => !t.category).length
        set({ transactions, uncategorizedCount })
        getTransactionRepository().upsertBulk(transactions)
      },

      // Rules
      loadRules: async () => {
        const customRules = await getCustomRulesRepository().findAll('')
        const builtinRules = getRulesRepository().getBuiltinRules() ?? []
        set({ customRules, builtinRules })
      },

      addCustomRule: async (rule) => {
        await getCustomRulesRepository().save(rule)
        const customRules = await getCustomRulesRepository().findAll('')
        set({ customRules })
      },

      updateCustomRule: async (id, updates) => {
        const repo = getCustomRulesRepository()
        const existing = await repo.findById('', id)
        if (existing) {
          await repo.save({ ...existing, ...updates })
          const customRules = await repo.findAll('')
          set({ customRules })
        }
      },

      deleteCustomRule: async (id) => {
        await getCustomRulesRepository().delete(id, '')
        const customRules = await getCustomRulesRepository().findAll('')
        set({ customRules })
      },

      setCustomRules: (customRules) => {
        set({ customRules })
        customRules.forEach(rule => getCustomRulesRepository().save(rule))
      },

      updateBuiltinRule: async (id, updates) => {
        const localRepo = getRulesRepository()
        localRepo.updateBuiltinRule(id, updates)
        const builtinRules = localRepo.getBuiltinRules() ?? []
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
        getSettingsRepository().updateFilters(filters)
      },

      resetFilters: () => {
        set({ filters: DEFAULT_FILTERS })
        getSettingsRepository().resetFilters()
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
