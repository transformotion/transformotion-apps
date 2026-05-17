import type { BudgetSettings, SettingsRepository } from '@transformotion/budget-domain'

export type { BudgetSettings, SettingsRepository }

export interface TransactionFilters {
  dateRange: { start: Date; end: Date } | null
  categoryId: string | null
  subcategoryId: string | null
  bankAccount: string | null
  source: string | null
  businessFilter: 'all' | 'personal' | 'business' | 'excluded'
  uncategorizedOnly: boolean
}

const SETTINGS_KEY = 'budget-tracker-settings'
const FILTERS_KEY = 'budget-tracker-transaction-filters'

const DEFAULT_SETTINGS: BudgetSettings = {
  csvFormatMappings: {},
}

export const DEFAULT_FILTERS: TransactionFilters = {
  dateRange: null,
  categoryId: null,
  subcategoryId: null,
  bankAccount: null,
  source: null,
  businessFilter: 'all',
  uncategorizedOnly: false,
}

export class LocalSettingsRepository implements SettingsRepository {
  async get(_accountId: string): Promise<BudgetSettings> {
    if (typeof window === 'undefined') return DEFAULT_SETTINGS
    try {
      const stored = localStorage.getItem(SETTINGS_KEY)
      return stored ? { ...DEFAULT_SETTINGS, ...JSON.parse(stored) } : DEFAULT_SETTINGS
    } catch {
      return DEFAULT_SETTINGS
    }
  }

  async patch(_accountId: string, updates: Partial<BudgetSettings>): Promise<BudgetSettings> {
    const current = await this.get(_accountId)
    const updated = { ...current, ...updates }
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(updated))
      } catch {
        console.error('Failed to save settings')
      }
    }
    return updated
  }
}

// Filters are UI-only state; managed via localStorage directly (not part of SettingsRepository)

export function getFilters(): TransactionFilters {
  if (typeof window === 'undefined') return DEFAULT_FILTERS
  try {
    const stored = localStorage.getItem(FILTERS_KEY)
    if (!stored) return DEFAULT_FILTERS
    const parsed = JSON.parse(stored)
    if (parsed.dateRange) {
      parsed.dateRange.start = new Date(parsed.dateRange.start)
      parsed.dateRange.end = new Date(parsed.dateRange.end)
    }
    return { ...DEFAULT_FILTERS, ...parsed }
  } catch {
    return DEFAULT_FILTERS
  }
}

export function saveFilters(filters: TransactionFilters): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(FILTERS_KEY, JSON.stringify(filters))
  } catch {
    console.error('Failed to save filters')
  }
}

export function clearFilters(): TransactionFilters {
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(FILTERS_KEY, JSON.stringify(DEFAULT_FILTERS))
    } catch {}
  }
  return DEFAULT_FILTERS
}
