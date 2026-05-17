import type { BudgetData, BudgetDataRepository } from '@transformotion/budget-domain'

const BUDGET_DATA_KEY = 'budget-tracker-budget-data'

const DEFAULT_BUDGET_DATA: BudgetData = {
  categories: [],
  budgetAmounts: {},
  budgetFrequencies: {},
}

export class LocalBudgetDataRepository implements BudgetDataRepository {
  private getData(): BudgetData {
    if (typeof window === 'undefined') return DEFAULT_BUDGET_DATA
    try {
      const stored = localStorage.getItem(BUDGET_DATA_KEY)
      return stored ? { ...DEFAULT_BUDGET_DATA, ...JSON.parse(stored) } : DEFAULT_BUDGET_DATA
    } catch {
      return DEFAULT_BUDGET_DATA
    }
  }

  private saveData(data: BudgetData): void {
    if (typeof window === 'undefined') return
    try {
      localStorage.setItem(BUDGET_DATA_KEY, JSON.stringify(data))
    } catch {
      console.error('Failed to save budget data')
    }
  }

  async get(_accountId: string): Promise<BudgetData> {
    return this.getData()
  }

  async patch(_accountId: string, partial: Partial<BudgetData>): Promise<BudgetData> {
    const current = this.getData()
    const updated: BudgetData = { ...current, ...partial }
    this.saveData(updated)
    return updated
  }
}
