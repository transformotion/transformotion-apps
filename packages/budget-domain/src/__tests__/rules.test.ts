import { describe, it, expect } from "vitest";
import { applyRules, previewRuleMatches } from "../rules.js";
import type { MatchingRule } from "../contracts.js";

function makeRule(overrides: Partial<MatchingRule> & { match: string; categoryId: string; subcategoryId: string }): MatchingRule {
  return {
    ruleId: crypto.randomUUID(),
    accountId: "acc1",
    name: overrides.match,
    matchType: "contains",
    enabled: true,
    priority: 100,
    isBusiness: false,
    learned: false,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

const groceryCatId = "cat-groceries";
const supermarketSubId = "sub-supermarket";
const entertainmentCatId = "cat-entertainment";
const moviesSubId = "sub-movies";
const customCatId = "cat-custom";
const customSubId = "sub-custom";

const sampleRules: MatchingRule[] = [
  makeRule({ match: "woolworths", categoryId: groceryCatId, subcategoryId: supermarketSubId }),
  makeRule({ match: "coles", categoryId: groceryCatId, subcategoryId: supermarketSubId }),
  makeRule({ match: "netflix", categoryId: entertainmentCatId, subcategoryId: moviesSubId }),
];

describe("applyRules", () => {
  it("matches woolworths to Groceries/Supermarket IDs", () => {
    const result = applyRules("WOOLWORTHS MAROOCHYDORE", sampleRules);
    expect(result).toMatchObject({ categoryId: groceryCatId, subcategoryId: supermarketSubId });
  });

  it("matches COLES to Groceries/Supermarket IDs", () => {
    const result = applyRules("COLES ONLINE", sampleRules);
    expect(result).toMatchObject({ categoryId: groceryCatId, subcategoryId: supermarketSubId });
  });

  it("matches Netflix to entertainment IDs", () => {
    const result = applyRules("NETFLIX.COM", sampleRules);
    expect(result).toMatchObject({ categoryId: entertainmentCatId, subcategoryId: moviesSubId });
  });

  it("returns null for unknown description", () => {
    const result = applyRules("ZXQWERTY UNKNOWN MERCHANT", sampleRules);
    expect(result).toBeNull();
  });

  it("higher priority rule wins (lower priority number = higher priority)", () => {
    const overrideRule = makeRule({
      match: "woolworths",
      categoryId: customCatId,
      subcategoryId: customSubId,
      priority: 50,
    });
    const result = applyRules("WOOLWORTHS KAWANA", [overrideRule, ...sampleRules]);
    expect(result).toMatchObject({ categoryId: customCatId, subcategoryId: customSubId });
  });

  it("falls back to next rule when first does not match", () => {
    const nonMatchRule = makeRule({
      match: "specialstore",
      categoryId: customCatId,
      subcategoryId: customSubId,
      priority: 50,
    });
    const result = applyRules("WOOLWORTHS MOOLOOLABA", [nonMatchRule, ...sampleRules]);
    expect(result).toMatchObject({ categoryId: groceryCatId, subcategoryId: supermarketSubId });
  });

  it("skips disabled rules", () => {
    const disabledRule = makeRule({
      match: "woolworths",
      categoryId: customCatId,
      subcategoryId: customSubId,
      enabled: false,
      priority: 50,
    });
    const result = applyRules("WOOLWORTHS KAWANA", [disabledRule, ...sampleRules]);
    expect(result).toMatchObject({ categoryId: groceryCatId, subcategoryId: supermarketSubId });
  });
});

describe("buildRegex whitespace normalisation", () => {
  const catId = "cat-food";
  const subId = "sub-dining";

  it("multi-space pattern matches single-space input", () => {
    const rule = makeRule({ match: "SQ *MYSTICA BURGERS       Noosa", categoryId: catId, subcategoryId: subId });
    expect(applyRules("SQ *MYSTICA BURGERS Noosa", [rule])).toMatchObject({ categoryId: catId });
  });

  it("single-space pattern matches multi-space input (bank raw description)", () => {
    const rule = makeRule({ match: "SQ *MYSTICA BURGERS Noosa", categoryId: catId, subcategoryId: subId });
    expect(applyRules("SQ *MYSTICA BURGERS       Noosa", [rule])).toMatchObject({ categoryId: catId });
  });

  it("tab-separated pattern matches space-separated input", () => {
    const rule = makeRule({ match: "foo\tbar", categoryId: catId, subcategoryId: subId });
    expect(applyRules("foo bar baz", [rule])).toMatchObject({ categoryId: catId });
  });

  it("pattern with no internal whitespace continues to match normally", () => {
    const rule = makeRule({ match: "woolworths", categoryId: catId, subcategoryId: subId });
    expect(applyRules("WOOLWORTHS MAROOCHYDORE", [rule])).toMatchObject({ categoryId: catId });
  });

  it("regex matchType is unaffected — exact pattern is used as-is", () => {
    const rule = makeRule({ match: "WOOLWORTHS\\s{2,}MAROOCHYDORE", matchType: "regex", categoryId: catId, subcategoryId: subId });
    // Multi-space matches the explicit \s{2,}
    expect(applyRules("WOOLWORTHS  MAROOCHYDORE", [rule])).toMatchObject({ categoryId: catId });
    // Single space does NOT match \s{2,}
    expect(applyRules("WOOLWORTHS MAROOCHYDORE", [rule])).toBeNull();
  });

  it("escapeRegex still neutralises regex special characters in patterns", () => {
    // The * in "SQ *MYSTICA" must be treated as a literal asterisk, not a quantifier
    const rule = makeRule({ match: "SQ *MYSTICA", categoryId: catId, subcategoryId: subId });
    expect(applyRules("SQ *MYSTICA BURGERS", [rule])).toMatchObject({ categoryId: catId });
    // A raw asterisk-as-quantifier would throw or behave incorrectly — this confirms it's escaped
    expect(() => applyRules("SQ MYSTICA BURGERS", [rule])).not.toThrow();
  });

  it("startsWith matchType also normalises whitespace", () => {
    const rule = makeRule({ match: "SQ *MYSTICA  BURGERS", matchType: "startsWith", categoryId: catId, subcategoryId: subId });
    expect(applyRules("SQ *MYSTICA BURGERS NOOSA", [rule])).toMatchObject({ categoryId: catId });
  });

  it("previewRuleMatches uses the same normalised matching", () => {
    const rule = makeRule({ match: "BLI BLI  HOTEL", categoryId: catId, subcategoryId: subId });
    const matches = previewRuleMatches("BLI BLI HOTEL RESTAURANT", [rule]);
    expect(matches).toHaveLength(1);
    expect(matches[0].isWinner).toBe(true);
  });
});

// The priority formula used in all three rule-creation paths (rules-tab, transactions-tab, review-tab):
//   matchingRules.length > 0 ? Math.min(...matchingRules.map(r => r.priority)) - 1000 : 1000
function computeNewTopPriority(rules: MatchingRule[]): number {
  return rules.length > 0 ? Math.min(...rules.map(r => r.priority)) - 1000 : 1000;
}

describe("computeNewTopPriority (rule-creation priority formula)", () => {
  it("returns 1000 when no rules exist (empty list)", () => {
    expect(computeNewTopPriority([])).toBe(1000);
  });

  it("returns min(existing) - 1000 when rules exist", () => {
    const rules = [
      makeRule({ match: "a", categoryId: "c", subcategoryId: "s", priority: 5000 }),
      makeRule({ match: "b", categoryId: "c", subcategoryId: "s", priority: 3000 }),
      makeRule({ match: "c", categoryId: "c", subcategoryId: "s", priority: 8000 }),
    ];
    expect(computeNewTopPriority(rules)).toBe(2000); // 3000 - 1000
  });

  it("result is less than the current minimum priority", () => {
    const rules = [
      makeRule({ match: "a", categoryId: "c", subcategoryId: "s", priority: 100 }),
      makeRule({ match: "b", categoryId: "c", subcategoryId: "s", priority: 200 }),
    ];
    const result = computeNewTopPriority(rules);
    const currentMin = Math.min(...rules.map(r => r.priority));
    expect(result).toBeLessThan(currentMin);
  });

  it("result is numeric, finite, and positive", () => {
    const rules = [
      makeRule({ match: "a", categoryId: "c", subcategoryId: "s", priority: 2000 }),
    ];
    const result = computeNewTopPriority(rules);
    expect(typeof result).toBe("number");
    expect(isFinite(result)).toBe(true);
    expect(result).toBeGreaterThan(0);
  });

  it("single existing rule: result is that rule's priority minus 1000", () => {
    const rules = [makeRule({ match: "woolworths", categoryId: "c", subcategoryId: "s", priority: 4000 })];
    expect(computeNewTopPriority(rules)).toBe(3000);
  });

  it("Date.now()-scale priorities still produce a positive result", () => {
    const bigPriority = 1_780_000_000_000;
    const rules = [makeRule({ match: "a", categoryId: "c", subcategoryId: "s", priority: bigPriority })];
    const result = computeNewTopPriority(rules);
    expect(result).toBe(bigPriority - 1000);
    expect(result).toBeGreaterThan(0);
  });
});
