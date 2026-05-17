import type { HttpClient } from '@transformotion/api-client'
import type { BudgetSettings, SettingsRepository } from '@transformotion/budget-domain'

const BASE = '/api/budget/v1/settings'

export class DynamoSettingsRepository implements SettingsRepository {
  constructor(private readonly http: HttpClient) {}

  async get(_accountId: string): Promise<BudgetSettings> {
    const res = await this.http.get<{ settings: BudgetSettings }>(BASE)
    return res.settings
  }

  async patch(_accountId: string, updates: Partial<BudgetSettings>): Promise<BudgetSettings> {
    const res = await this.http.patch<{ settings: BudgetSettings }>(BASE, updates)
    return res.settings
  }
}
