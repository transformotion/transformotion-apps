import { CustomRule, CustomRulesRepository } from '@transformotion/budget-domain'

export type { CustomRule }

const CUSTOM_RULES_KEY = 'budget-tracker-custom-rules'
const BUILTIN_RULES_KEY = 'budget-tracker-builtin-rules'

// BuiltinRule is frontend-only (compiled into codebase, not stored in DynamoDB).
// It is NOT part of CustomRulesRepository.
export interface BuiltinRule {
  id: string
  name: string
  pattern: string
  matchType: 'contains' | 'startsWith' | 'regex'
  category: string
  subcategory: string
  isBusiness: boolean
  isIgnore?: boolean
  overrideCategory?: string
  overrideSubcategory?: string
  disabled?: boolean
  priority: number
}

class LocalCustomRulesRepository implements CustomRulesRepository {
  private getCustomRules(): CustomRule[] {
    if (typeof window === 'undefined') return []
    try {
      const stored = localStorage.getItem(CUSTOM_RULES_KEY)
      return stored ? JSON.parse(stored) : []
    } catch {
      return []
    }
  }

  private saveCustomRules(rules: CustomRule[]): void {
    if (typeof window === 'undefined') return
    try {
      localStorage.setItem(CUSTOM_RULES_KEY, JSON.stringify(rules))
    } catch {
      console.error('Failed to save custom rules')
    }
  }

  async findAll(_accountId: string): Promise<CustomRule[]> {
    return this.getCustomRules()
  }

  async findById(_accountId: string, id: string): Promise<CustomRule | null> {
    return this.getCustomRules().find(r => r.ruleId === id) ?? null
  }

  async save(rule: CustomRule): Promise<CustomRule> {
    const rules = this.getCustomRules()
    const index = rules.findIndex(r => r.ruleId === rule.ruleId)
    if (index >= 0) {
      rules[index] = rule
    } else {
      rules.push(rule)
    }
    this.saveCustomRules(rules)
    return rule
  }

  async delete(id: string, _accountId: string): Promise<void> {
    this.saveCustomRules(this.getCustomRules().filter(r => r.ruleId !== id))
  }

  // Built-in rule persistence (frontend-only, not part of canonical interface)

  getBuiltinRules(): BuiltinRule[] | null {
    if (typeof window === 'undefined') return null
    try {
      const stored = localStorage.getItem(BUILTIN_RULES_KEY)
      return stored ? JSON.parse(stored) : null
    } catch {
      return null
    }
  }

  saveBuiltinRules(rules: BuiltinRule[]): void {
    if (typeof window === 'undefined') return
    try {
      localStorage.setItem(BUILTIN_RULES_KEY, JSON.stringify(rules))
    } catch {
      console.error('Failed to save builtin rules')
    }
  }

  updateBuiltinRule(id: string, updates: Partial<BuiltinRule>): BuiltinRule {
    const rules = this.getBuiltinRules() || []
    const index = rules.findIndex(r => r.id === id)
    if (index < 0) throw new Error(`Built-in rule not found: ${id}`)
    rules[index] = { ...rules[index], ...updates }
    this.saveBuiltinRules(rules)
    return rules[index]
  }

  resetBuiltinRules(defaults: BuiltinRule[]): BuiltinRule[] {
    this.saveBuiltinRules(defaults)
    return defaults
  }
}

export { LocalCustomRulesRepository }
export type { CustomRulesRepository }

let _repository: LocalCustomRulesRepository | null = null

export function getRulesRepository(): LocalCustomRulesRepository {
  if (!_repository) {
    _repository = new LocalCustomRulesRepository()
  }
  return _repository
}
