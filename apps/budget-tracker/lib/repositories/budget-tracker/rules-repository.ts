import type { MatchingRule, MatchingRulesRepository } from '@transformotion/budget-domain'

export type { MatchingRule }

const MATCHING_RULES_KEY = 'budget-tracker-matching-rules'

class LocalMatchingRulesRepository implements MatchingRulesRepository {
  private getRules(): MatchingRule[] {
    if (typeof window === 'undefined') return []
    try {
      const stored = localStorage.getItem(MATCHING_RULES_KEY)
        // Migrate from old localStorage key if present
        ?? localStorage.getItem('budget-tracker-custom-rules')
      return stored ? JSON.parse(stored) : []
    } catch {
      return []
    }
  }

  private saveRules(rules: MatchingRule[]): void {
    if (typeof window === 'undefined') return
    try {
      localStorage.setItem(MATCHING_RULES_KEY, JSON.stringify(rules))
    } catch {
      console.error('Failed to save matching rules')
    }
  }

  async findAll(_accountId: string): Promise<MatchingRule[]> {
    return this.getRules()
  }

  async findById(_accountId: string, id: string): Promise<MatchingRule | null> {
    return this.getRules().find(r => r.ruleId === id) ?? null
  }

  async save(rule: MatchingRule): Promise<MatchingRule> {
    const rules = this.getRules()
    const index = rules.findIndex(r => r.ruleId === rule.ruleId)
    if (index >= 0) {
      rules[index] = rule
    } else {
      rules.push(rule)
    }
    this.saveRules(rules)
    return rule
  }

  async delete(id: string, _accountId: string): Promise<void> {
    this.saveRules(this.getRules().filter(r => r.ruleId !== id))
  }
}

export { LocalMatchingRulesRepository }
export type { MatchingRulesRepository }

let _repository: LocalMatchingRulesRepository | null = null

export function getMatchingRulesRepository(): LocalMatchingRulesRepository {
  if (!_repository) {
    _repository = new LocalMatchingRulesRepository()
  }
  return _repository
}
