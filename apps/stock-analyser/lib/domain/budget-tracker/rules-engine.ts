/**
 * Rules Engine - Business Logic
 * 
 * Pure functions for transaction categorization.
 * No I/O, no React - can run in browser or Lambda.
 */

export interface MatchRule {
  id: string
  name: string
  pattern: string
  matchType: 'contains' | 'startsWith' | 'regex'
  category: string
  subcategory: string
  enabled: boolean
  isIgnore?: boolean
  isBusiness?: boolean
  priority: number
  overridesBuiltinId?: string
}

export interface RuleMatchResult {
  category: string
  subcategory: string
  ruleId: string
  ruleName: string
  isIgnore?: boolean
  isBusiness?: boolean
}

/**
 * Test if a pattern matches a description.
 */
export function testPattern(
  description: string,
  pattern: string,
  matchType: 'contains' | 'startsWith' | 'regex'
): boolean {
  try {
    let regex: RegExp
    switch (matchType) {
      case 'startsWith':
        regex = new RegExp(`^${escapeRegex(pattern)}`, 'i')
        break
      case 'regex':
        regex = new RegExp(pattern, 'i')
        break
      case 'contains':
      default:
        regex = new RegExp(escapeRegex(pattern), 'i')
        break
    }
    return regex.test(description)
  } catch {
    return false
  }
}

/**
 * Escape special regex characters for literal matching.
 */
export function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Apply rules to a transaction description.
 * Returns the first matching rule result, or null if no match.
 * 
 * Priority:
 * 1. Custom rules (user-created, checked first)
 * 2. Built-in rules with overrides
 * 3. Built-in rules (default behavior)
 */
export function applyRules(
  description: string,
  builtinRules: MatchRule[],
  customRules: MatchRule[] = []
): RuleMatchResult | null {
  // Build set of disabled built-in rule IDs
  const disabledBuiltinIds = new Set<string>()
  const overrideMap = new Map<string, { rule: MatchRule }>()

  for (const rule of customRules) {
    if (rule.overridesBuiltinId) {
      if (!rule.enabled) {
        disabledBuiltinIds.add(rule.overridesBuiltinId)
      } else {
        overrideMap.set(rule.overridesBuiltinId, { rule })
      }
    }
  }

  // Check custom rules first (excluding overrides)
  const sortedCustomRules = [...customRules]
    .filter(r => r.enabled && !r.overridesBuiltinId)
    .sort((a, b) => a.priority - b.priority)

  for (const rule of sortedCustomRules) {
    if (testPattern(description, rule.pattern, rule.matchType)) {
      return {
        category: rule.isIgnore ? 'Ignore' : rule.category,
        subcategory: rule.isIgnore ? 'Ignored' : rule.subcategory,
        ruleId: rule.id,
        ruleName: rule.name,
        isIgnore: rule.isIgnore,
        isBusiness: rule.isBusiness,
      }
    }
  }

  // Check built-in rules
  const sortedBuiltinRules = [...builtinRules]
    .filter(r => r.enabled && !disabledBuiltinIds.has(r.id))
    .sort((a, b) => a.priority - b.priority)

  for (const rule of sortedBuiltinRules) {
    if (testPattern(description, rule.pattern, rule.matchType)) {
      // Check for override
      const override = overrideMap.get(rule.id)
      if (override) {
        const overrideRule = override.rule
        return {
          category: overrideRule.isIgnore ? 'Ignore' : overrideRule.category,
          subcategory: overrideRule.isIgnore ? 'Ignored' : overrideRule.subcategory,
          ruleId: rule.id,
          ruleName: rule.name,
          isIgnore: overrideRule.isIgnore,
          isBusiness: overrideRule.isBusiness,
        }
      }

      return {
        category: rule.category,
        subcategory: rule.subcategory,
        ruleId: rule.id,
        ruleName: rule.name,
        isIgnore: rule.isIgnore,
        isBusiness: rule.isBusiness,
      }
    }
  }

  return null
}

/**
 * Categorize multiple transactions in batch.
 */
export function categorizeTransactions<T extends { description: string }>(
  transactions: T[],
  builtinRules: MatchRule[],
  customRules: MatchRule[] = []
): Array<T & { matchResult: RuleMatchResult | null }> {
  return transactions.map(tx => ({
    ...tx,
    matchResult: applyRules(tx.description, builtinRules, customRules),
  }))
}

/**
 * Find all rules that match a description (for debugging).
 */
export function findAllMatchingRules(
  description: string,
  rules: MatchRule[]
): MatchRule[] {
  return rules.filter(rule => 
    rule.enabled && testPattern(description, rule.pattern, rule.matchType)
  )
}

/**
 * Validate a regex pattern.
 */
export function validatePattern(
  pattern: string,
  matchType: 'contains' | 'startsWith' | 'regex'
): { valid: boolean; error?: string } {
  try {
    if (matchType === 'regex') {
      new RegExp(pattern)
    }
    return { valid: true }
  } catch (e) {
    return {
      valid: false,
      error: e instanceof Error ? e.message : 'Invalid pattern',
    }
  }
}
