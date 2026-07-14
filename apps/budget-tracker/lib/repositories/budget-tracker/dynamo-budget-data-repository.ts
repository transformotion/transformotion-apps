import type { HttpClient } from '@transformotion/api-client'
import type { BudgetData, BudgetDataRepository } from '@transformotion/budget-domain'
import { normaliseBudgetData } from '@transformotion/budget-domain'

const BASE = '/api/budget/v1/budget-data'

export class DynamoBudgetDataRepository implements BudgetDataRepository {
  constructor(private readonly http: HttpClient) {}

  async get(_accountId: string): Promise<BudgetData> {
    const res = await this.http.get<{ budgetData: BudgetData }>(BASE)
    // Read-time migration shim (m16.12.0): normalise any legacy savingsGoal shape.
    return normaliseBudgetData(res.budgetData)
  }

  async patch(_accountId: string, partial: Partial<BudgetData>): Promise<BudgetData> {
    const res = await this.http.patch<{ budgetData: BudgetData }>(BASE, partial)
    return res.budgetData
  }
}
