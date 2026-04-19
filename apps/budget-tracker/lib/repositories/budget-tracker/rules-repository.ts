/**
 * Rules Repository
 * 
 * Data access layer for categorization rules.
 * Current: localStorage
 * Future: DynamoDB via Lambda
 */

import { Repository } from '../base-repository'

export interface CustomRule {
  id: string
  name: string
  pattern: string
  matchType: "contains" | "startsWith" | "regex"
  category: string
  subcategory: string
  isBusiness: boolean
  isIgnore?: boolean
  overridesBuiltinId?: string
  projectId?: string
  enabled: boolean
  priority: number
  createdAt: string
}

export interface BuiltinRule {
  id: string
  name: string
  pattern: string
  matchType: "contains" | "startsWith" | "regex"
  category: string
  subcategory: string
  isBusiness: boolean
  isIgnore?: boolean
  overrideCategory?: string
  overrideSubcategory?: string
  disabled?: boolean
  priority: number
}

const CUSTOM_RULES_KEY = 'budget-tracker-custom-rules'
const BUILTIN_RULES_KEY = 'budget-tracker-builtin-rules'

export interface RulesRepository {
  // Custom rules
  findAllCustomRules(): Promise<CustomRule[]>
  findCustomRuleById(id: string): Promise<CustomRule | null>
  saveCustomRule(rule: CustomRule): Promise<CustomRule>
  deleteCustomRule(id: string): Promise<void>

  // Built-in rules
  findAllBuiltinRules(): Promise<BuiltinRule[]>
  findBuiltinRuleById(id: string): Promise<BuiltinRule | null>
  updateBuiltinRule(id: string, updates: Partial<BuiltinRule>): Promise<BuiltinRule>
  resetBuiltinRules(defaults: BuiltinRule[]): Promise<BuiltinRule[]>
}

class LocalRulesRepository implements RulesRepository {
  // Custom rules

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

  async findAllCustomRules(): Promise<CustomRule[]> {
    return this.getCustomRules()
  }

  async findCustomRuleById(id: string): Promise<CustomRule | null> {
    const rules = this.getCustomRules()
    return rules.find(r => r.id === id) || null
  }

  async saveCustomRule(rule: CustomRule): Promise<CustomRule> {
    const rules = this.getCustomRules()
    const index = rules.findIndex(r => r.id === rule.id)
    
    if (index >= 0) {
      rules[index] = rule
    } else {
      rules.push(rule)
    }
    
    this.saveCustomRules(rules)
    return rule
  }

  async deleteCustomRule(id: string): Promise<void> {
    const rules = this.getCustomRules()
    const filtered = rules.filter(r => r.id !== id)
    this.saveCustomRules(filtered)
  }

  // Built-in rules

  private getBuiltinRules(): BuiltinRule[] | null {
    if (typeof window === 'undefined') return null
    try {
      const stored = localStorage.getItem(BUILTIN_RULES_KEY)
      return stored ? JSON.parse(stored) : null
    } catch {
      return null
    }
  }

  private saveBuiltinRules(rules: BuiltinRule[]): void {
    if (typeof window === 'undefined') return
    try {
      localStorage.setItem(BUILTIN_RULES_KEY, JSON.stringify(rules))
    } catch {
      console.error('Failed to save builtin rules')
    }
  }

  async findAllBuiltinRules(): Promise<BuiltinRule[]> {
    return this.getBuiltinRules() || []
  }

  async findBuiltinRuleById(id: string): Promise<BuiltinRule | null> {
    const rules = this.getBuiltinRules() || []
    return rules.find(r => r.id === id) || null
  }

  async updateBuiltinRule(id: string, updates: Partial<BuiltinRule>): Promise<BuiltinRule> {
    const rules = this.getBuiltinRules() || []
    const index = rules.findIndex(r => r.id === id)
    
    if (index < 0) {
      throw new Error(`Built-in rule not found: ${id}`)
    }
    
    rules[index] = { ...rules[index], ...updates }
    this.saveBuiltinRules(rules)
    return rules[index]
  }

  async resetBuiltinRules(defaults: BuiltinRule[]): Promise<BuiltinRule[]> {
    this.saveBuiltinRules(defaults)
    return defaults
  }
}

// Factory function
export function createRulesRepository(): RulesRepository {
  return new LocalRulesRepository()
}

// Singleton instance
let _repository: RulesRepository | null = null

export function getRulesRepository(): RulesRepository {
  if (!_repository) {
    _repository = createRulesRepository()
  }
  return _repository
}
