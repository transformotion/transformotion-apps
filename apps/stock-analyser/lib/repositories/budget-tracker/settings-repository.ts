/**
 * Settings Repository
 *
 * Data access layer for user settings.
 * Uses DynamoDB via Budget Tracker Lambda API.
 * Filters remain in localStorage (UI-only state, not server-persisted).
 */


export type BudgetFrequency = "weekly" | "fortnightly" | "monthly" | "quarterly" | "annually"

export interface BudgetSettings {
  budgetOverrides: Record<string, number>
  budgetFreqs: Record<string, BudgetFrequency>
  customCategories: Record<string, string[]>
  deletedCategories: string[]
  customTopCategories: string[]
  projectBudgets: Record<string, number>
  projectTasks: Record<string, string[]>
  customProjectCategories: string[]
  deletedProjectCategories: string[]
  disabledProjectCategories: string[]
  csvFormatMappings?: Record<string, unknown>   // CSV import format remembered per bank
}

export interface TransactionFilters {
  dateRange: { start: Date; end: Date } | null
  category: string | null
  subcategory: string | null
  bankAccount: string | null
  source: string | null
  businessFilter: "all" | "personal" | "business"
  uncategorizedOnly: boolean
}

const SETTINGS_KEY = 'budget-tracker-settings'
const FILTERS_KEY  = 'budget-tracker-transaction-filters'

const DEFAULT_SETTINGS: BudgetSettings = {
  budgetOverrides:          {},
  budgetFreqs:              {},
  customCategories:         {},
  deletedCategories:        [],
  customTopCategories:      [],
  projectBudgets:           {},
  projectTasks:             {},
  customProjectCategories:  [],
  deletedProjectCategories: [],
  disabledProjectCategories:[],
}

const DEFAULT_FILTERS: TransactionFilters = {
  dateRange:        null,
  category:         null,
  subcategory:      null,
  bankAccount:      null,
  source:           null,
  businessFilter:   "all",
  uncategorizedOnly: false,
}

export interface SettingsRepository {
  getSettings(): Promise<BudgetSettings>
  updateSettings(updates: Partial<BudgetSettings>): Promise<BudgetSettings>
  resetSettings(): Promise<BudgetSettings>

  getFilters(): Promise<TransactionFilters>
  updateFilters(filters: TransactionFilters): Promise<TransactionFilters>
  resetFilters(): Promise<TransactionFilters>
}

// ── localStorage fallback ─────────────────────────────────────────────────────

class LocalSettingsRepository implements SettingsRepository {
  async getSettings(): Promise<BudgetSettings> {
    if (typeof window === 'undefined') return DEFAULT_SETTINGS
    try {
      const stored = localStorage.getItem(SETTINGS_KEY)
      return stored ? { ...DEFAULT_SETTINGS, ...JSON.parse(stored) } : DEFAULT_SETTINGS
    } catch {
      return DEFAULT_SETTINGS
    }
  }

  async updateSettings(updates: Partial<BudgetSettings>): Promise<BudgetSettings> {
    const current = await this.getSettings()
    const updated = { ...current, ...updates }
    if (typeof window !== 'undefined') {
      try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(updated)) } catch { /* ignore */ }
    }
    return updated
  }

  async resetSettings(): Promise<BudgetSettings> {
    if (typeof window !== 'undefined') {
      try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(DEFAULT_SETTINGS)) } catch { /* ignore */ }
    }
    return DEFAULT_SETTINGS
  }

  async getFilters(): Promise<TransactionFilters> {
    if (typeof window === 'undefined') return DEFAULT_FILTERS
    try {
      const stored = localStorage.getItem(FILTERS_KEY)
      if (!stored) return DEFAULT_FILTERS
      const parsed = JSON.parse(stored)
      if (parsed.dateRange) {
        parsed.dateRange.start = new Date(parsed.dateRange.start)
        parsed.dateRange.end   = new Date(parsed.dateRange.end)
      }
      return { ...DEFAULT_FILTERS, ...parsed }
    } catch {
      return DEFAULT_FILTERS
    }
  }

  async updateFilters(filters: TransactionFilters): Promise<TransactionFilters> {
    if (typeof window !== 'undefined') {
      try { localStorage.setItem(FILTERS_KEY, JSON.stringify(filters)) } catch { /* ignore */ }
    }
    return filters
  }

  async resetFilters(): Promise<TransactionFilters> {
    if (typeof window !== 'undefined') {
      try { localStorage.setItem(FILTERS_KEY, JSON.stringify(DEFAULT_FILTERS)) } catch { /* ignore */ }
    }
    return DEFAULT_FILTERS
  }
}

// ── Factory ───────────────────────────────────────────────────────────────────

export function createSettingsRepository(): SettingsRepository {
  return new LocalSettingsRepository()
}

let _repository: SettingsRepository | null = null

export function getSettingsRepository(): SettingsRepository {
  if (!_repository) {
    _repository = createSettingsRepository()
  }
  return _repository
}
