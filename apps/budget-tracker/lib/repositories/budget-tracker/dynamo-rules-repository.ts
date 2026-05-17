import type { HttpClient } from '@transformotion/api-client'
import type { MatchingRule, MatchingRulesRepository } from '@transformotion/budget-domain'

const BASE = '/api/budget/v1/rules'

export class DynamoMatchingRulesRepository implements MatchingRulesRepository {
  constructor(private readonly http: HttpClient) {}

  async findAll(_accountId: string): Promise<MatchingRule[]> {
    const res = await this.http.get<{ rules: MatchingRule[] }>(BASE)
    return res.rules
  }

  async findById(_accountId: string, id: string): Promise<MatchingRule | null> {
    try {
      const res = await this.http.get<{ rule: MatchingRule }>(`${BASE}/${id}`)
      return res.rule
    } catch {
      return null
    }
  }

  async save(rule: MatchingRule): Promise<MatchingRule> {
    if (rule.ruleId && rule.createdAt) {
      const res = await this.http.patch<{ rule: MatchingRule }>(`${BASE}/${rule.ruleId}`, rule)
      return res.rule
    }
    const res = await this.http.post<{ rule: MatchingRule }>(BASE, rule)
    return res.rule
  }

  async delete(id: string, _accountId: string): Promise<void> {
    await this.http.delete(`${BASE}/${id}`)
  }
}
