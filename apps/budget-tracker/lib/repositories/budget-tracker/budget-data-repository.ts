import type { BudgetData, BudgetDataRepository } from '@transformotion/budget-domain'
import { normaliseBudgetData } from '@transformotion/budget-domain'
import { MOCK_SEED_BUDGET_DATA } from './mock-seed'

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
      // First run only (key absent) → seed the mock category tree so the AI
      // Review has somewhere to categorise. User edits persist thereafter.
      if (stored === null) {
        localStorage.setItem(BUDGET_DATA_KEY, JSON.stringify(MOCK_SEED_BUDGET_DATA))
        return MOCK_SEED_BUDGET_DATA
      }
      return { ...DEFAULT_BUDGET_DATA, ...JSON.parse(stored) }
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
    // Read-time migration shim (m16.12.0): normalise any legacy savingsGoal shape.
    return normaliseBudgetData(this.getData())
  }

  async patch(_accountId: string, partial: Partial<BudgetData>): Promise<BudgetData> {
    const current = this.getData()
    const updated: BudgetData = { ...current, ...partial }
    this.saveData(updated)
    return updated
  }
}
