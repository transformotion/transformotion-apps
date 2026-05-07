import type { HttpClient } from '@transformotion/api-client'
import type { CustomRule, CustomRulesRepository } from '@transformotion/budget-domain'

const BASE = '/api/budget/v1/rules'

export class DynamoRulesRepository implements CustomRulesRepository {
  constructor(private readonly http: HttpClient) {}

  async findAll(_accountId: string): Promise<CustomRule[]> {
    const res = await this.http.get<{ rules: CustomRule[] }>(BASE)
    return res.rules
  }

  async findById(_accountId: string, id: string): Promise<CustomRule | null> {
    try {
      const res = await this.http.get<{ rule: CustomRule }>(`${BASE}/${id}`)
      return res.rule
    } catch {
      return null
    }
  }

  async save(rule: CustomRule): Promise<CustomRule> {
    if (rule.ruleId && rule.createdAt) {
      // Update existing
      const res = await this.http.patch<{ rule: CustomRule }>(`${BASE}/${rule.ruleId}`, rule)
      return res.rule
    }
    // Create new
    const res = await this.http.post<{ rule: CustomRule }>(BASE, rule)
    return res.rule
  }

  async delete(id: string, _accountId: string): Promise<void> {
    await this.http.delete(`${BASE}/${id}`)
  }
}
