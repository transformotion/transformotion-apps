import type { MatchingRule } from "./contracts";

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildRegex(matchType: string, pattern: string): RegExp {
  if (matchType === "regex") return new RegExp(pattern, "i");
  if (matchType === "startsWith") return new RegExp(`^${escapeRegex(pattern)}`, "i");
  return new RegExp(escapeRegex(pattern), "i");
}

// Priority ASC, then createdAt DESC (newer wins equal-priority ties)
function ruleComparator(a: MatchingRule, b: MatchingRule): number {
  if (a.priority !== b.priority) return a.priority - b.priority;
  return b.createdAt.localeCompare(a.createdAt);
}

export function applyRules(
  description: string,
  rules: MatchingRule[]
): { categoryId: string; subcategoryId: string; ruleId: string; isBusiness: boolean } | null {
  const sorted = [...rules].sort(ruleComparator);
  for (const rule of sorted) {
    if (!rule.enabled) continue;
    try {
      if (buildRegex(rule.matchType, rule.match).test(description)) {
        return {
          categoryId: rule.categoryId,
          subcategoryId: rule.subcategoryId,
          ruleId: rule.ruleId,
          isBusiness: rule.isBusiness,
        };
      }
    } catch {
      // Invalid regex — skip
    }
  }
  return null;
}

export function previewRuleMatches(
  description: string,
  rules: MatchingRule[]
): Array<{ rule: MatchingRule; isWinner: boolean }> {
  const sorted = [...rules].sort(ruleComparator);
  const matches: Array<{ rule: MatchingRule; isWinner: boolean }> = [];
  let foundWinner = false;
  for (const rule of sorted) {
    if (!rule.enabled) continue;
    try {
      if (buildRegex(rule.matchType, rule.match).test(description)) {
        matches.push({ rule, isWinner: !foundWinner });
        foundWinner = true;
      }
    } catch {
      // Invalid regex — skip
    }
  }
  return matches;
}
