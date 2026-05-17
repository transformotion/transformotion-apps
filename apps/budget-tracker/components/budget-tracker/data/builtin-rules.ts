import type { MatchingRule } from '@transformotion/budget-domain'

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function applyRules(
  description: string,
  rules: MatchingRule[],
): { categoryId: string; subcategoryId: string; ruleId: string; isIgnore?: boolean; isBusiness: boolean } | null {
  const sorted = [...rules].sort((a, b) => a.priority - b.priority)
  for (const rule of sorted) {
    if (!rule.enabled) continue
    try {
      let regex: RegExp
      if (rule.matchType === 'regex') {
        regex = new RegExp(rule.match, 'i')
      } else if (rule.matchType === 'startsWith') {
        regex = new RegExp(`^${escapeRegex(rule.match)}`, 'i')
      } else {
        regex = new RegExp(escapeRegex(rule.match), 'i')
      }
      if (regex.test(description)) {
        return {
          categoryId: rule.categoryId,
          subcategoryId: rule.subcategoryId,
          ruleId: rule.ruleId,
          isIgnore: rule.isIgnore,
          isBusiness: rule.isBusiness,
        }
      }
    } catch {
      // Invalid regex pattern — skip
    }
  }
  return null
}
