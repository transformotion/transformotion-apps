import { create } from 'zustand'
import {
  getTransactionRepository,
  getMatchingRulesRepositoryInstance,
  getBudgetDataRepository,
  getSettingsRepository,
  getDashboardInsightRepository,
  getFilters,
  saveFilters,
  clearFilters,
  type Transaction,
  type MatchingRule,
  type BudgetData,
  type BudgetSettings,
  type TransactionFilters,
} from '@/lib/repositories/budget-tracker'
import { ruleComparator, type DashboardInsightResponse } from '@transformotion/budget-domain'

// 'home' (M21) is the dashboard landing tab.
export type BudgetTabId = 'home' | 'transactions' | 'summary' | 'budget' | 'cashflow' | 'rules' | 'review' | 'settings'

interface BudgetState {
  activeTab: BudgetTabId

  transactions: Transaction[]
  matchingRules: MatchingRule[]
  budgetData: BudgetData
  settings: BudgetSettings
  filters: TransactionFilters
  dashboardInsight: DashboardInsightResponse | null

  uncategorizedCount: number
  isLoading: boolean
  isInitialized: boolean
  error: string | null

  setActiveTab: (tab: BudgetTabId) => void

  loadTransactions: () => Promise<void>
  addTransactions: (transactions: Transaction[]) => Promise<void>
  updateTransaction: (id: string, updates: Partial<Transaction>) => Promise<void>
  deleteTransaction: (id: string) => Promise<void>
  setTransactions: (transactions: Transaction[]) => void

  loadMatchingRules: () => Promise<void>
  addMatchingRule: (rule: MatchingRule) => Promise<void>
  updateMatchingRule: (id: string, updates: Partial<MatchingRule>) => Promise<void>
  deleteMatchingRule: (id: string) => Promise<void>
  setMatchingRules: (rules: MatchingRule[]) => void

  loadBudgetData: () => Promise<void>
  updateBudgetData: (partial: Partial<BudgetData>) => Promise<void>

  loadSettings: () => Promise<void>
  updateSettings: (updates: Partial<BudgetSettings>) => Promise<void>

  loadDashboardInsight: () => Promise<void>

  setFilters: (filtersOrUpdater: TransactionFilters | ((prev: TransactionFilters) => TransactionFilters)) => void
  resetFilters: () => void

  initialize: () => Promise<void>
}

const DEFAULT_BUDGET_DATA: BudgetData = {
  categories: [],
  budgetAmounts: {},
  budgetFrequencies: {},
}

const DEFAULT_SETTINGS: BudgetSettings = {
  csvFormatMappings: {},
}

export const useBudgetStore = create<BudgetState>()((set, get) => ({
  activeTab: 'home',
  transactions: [],
  matchingRules: [],
  budgetData: DEFAULT_BUDGET_DATA,
  settings: DEFAULT_SETTINGS,
  filters: getFilters(),
  dashboardInsight: null,
  uncategorizedCount: 0,
  isLoading: false,
  isInitialized: false,
  error: null,

  setActiveTab: (tab) => set({ activeTab: tab }),

  loadTransactions: async () => {
    const transactions = await getTransactionRepository().findAll('')
    set({ transactions, uncategorizedCount: transactions.filter(t => !t.categoryId && !t.category).length })
  },

  addTransactions: async (newTransactions) => {
    await getTransactionRepository().upsertBulk(newTransactions)
    const transactions = await getTransactionRepository().findAll('')
    set({ transactions, uncategorizedCount: transactions.filter(t => !t.categoryId && !t.category).length })
  },

  updateTransaction: async (id, updates) => {
    await getTransactionRepository().update(id, '', updates)
    const transactions = await getTransactionRepository().findAll('')
    set({ transactions, uncategorizedCount: transactions.filter(t => !t.categoryId && !t.category).length })
  },

  deleteTransaction: async (id) => {
    await getTransactionRepository().delete(id, '')
    const transactions = await getTransactionRepository().findAll('')
    set({ transactions, uncategorizedCount: transactions.filter(t => !t.categoryId && !t.category).length })
  },

  setTransactions: (transactions) => {
    set({ transactions, uncategorizedCount: transactions.filter(t => !t.categoryId && !t.category).length })
    getTransactionRepository().upsertBulk(transactions)
  },

  loadMatchingRules: async () => {
    const raw = await getMatchingRulesRepositoryInstance().findAll('')
    set({ matchingRules: [...raw].sort(ruleComparator) })
  },

  addMatchingRule: async (rule) => {
    await getMatchingRulesRepositoryInstance().save(rule)
    const raw = await getMatchingRulesRepositoryInstance().findAll('')
    set({ matchingRules: [...raw].sort(ruleComparator) })
  },

  updateMatchingRule: async (id, updates) => {
    const existing = get().matchingRules.find(r => r.ruleId === id)
    if (existing) {
      await getMatchingRulesRepositoryInstance().save({ ...existing, ...updates })
      const raw = await getMatchingRulesRepositoryInstance().findAll('')
      set({ matchingRules: [...raw].sort(ruleComparator) })
    }
  },

  deleteMatchingRule: async (id) => {
    await getMatchingRulesRepositoryInstance().delete(id, '')
    const raw = await getMatchingRulesRepositoryInstance().findAll('')
    set({ matchingRules: [...raw].sort(ruleComparator) })
  },

  setMatchingRules: (matchingRules) => {
    set({ matchingRules })
    matchingRules.forEach(rule => getMatchingRulesRepositoryInstance().save(rule))
  },

  loadBudgetData: async () => {
    const budgetData = await getBudgetDataRepository().get('')
    set({ budgetData })
  },

  updateBudgetData: async (partial) => {
    const budgetData = await getBudgetDataRepository().patch('', partial)
    set({ budgetData })
  },

  loadSettings: async () => {
    const settings = await getSettingsRepository().get('')
    set({ settings })
  },

  updateSettings: async (updates) => {
    const settings = await getSettingsRepository().patch('', updates)
    set({ settings })
  },

  loadDashboardInsight: async () => {
    // Non-critical: the dashboard renders without an insight line if this fails.
    try {
      const dashboardInsight = await getDashboardInsightRepository().get('')
      set({ dashboardInsight })
    } catch {
      set({ dashboardInsight: null })
    }
  },

  setFilters: (filtersOrUpdater) => {
    const filters = typeof filtersOrUpdater === 'function' ? filtersOrUpdater(get().filters) : filtersOrUpdater
    set({ filters })
    saveFilters(filters)
  },

  resetFilters: () => set({ filters: clearFilters() }),

  initialize: async () => {
    if (get().isInitialized) return
    set({ isLoading: true, error: null })
    try {
      await Promise.all([
        get().loadTransactions(),
        get().loadMatchingRules(),
        get().loadBudgetData(),
        get().loadSettings(),
        get().loadDashboardInsight(),
      ])
      set({ isInitialized: true, isLoading: false })
    } catch (error) {
      set({
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to initialize',
      })
    }
  },
}))

export const selectTransactions = (state: BudgetState) => state.transactions
export const selectMatchingRules = (state: BudgetState) => state.matchingRules
export const selectBudgetData = (state: BudgetState) => state.budgetData
export const selectSettings = (state: BudgetState) => state.settings
export const selectFilters = (state: BudgetState) => state.filters
export const selectUncategorizedCount = (state: BudgetState) => state.uncategorizedCount
export const selectActiveTab = (state: BudgetState) => state.activeTab
