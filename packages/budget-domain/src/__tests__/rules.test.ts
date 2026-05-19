import { describe, it, expect } from "vitest";
import { applyRules, previewRuleMatches, ruleComparator } from "../rules.js";
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

describe("ruleComparator sort (store load order)", () => {
  it("sorts rules by priority ascending", () => {
    const rules = [
      makeRule({ match: "c", categoryId: "c", subcategoryId: "s", priority: 3000 }),
      makeRule({ match: "a", categoryId: "c", subcategoryId: "s", priority: 1000 }),
      makeRule({ match: "b", categoryId: "c", subcategoryId: "s", priority: 2000 }),
    ];
    const sorted = [...rules].sort(ruleComparator);
    expect(sorted.map(r => r.priority)).toEqual([1000, 2000, 3000]);
  });

  it("ties broken by createdAt descending (newer wins)", () => {
    const older = makeRule({ match: "old", categoryId: "c", subcategoryId: "s", priority: 100, createdAt: "2026-01-01T00:00:00.000Z" });
    const newer = makeRule({ match: "new", categoryId: "c", subcategoryId: "s", priority: 100, createdAt: "2026-06-01T00:00:00.000Z" });
    const sorted = [older, newer].sort(ruleComparator);
    expect(sorted[0].match).toBe("new");
  });

  it("API order (random UUIDs) is normalised to priority order after sort", () => {
    // Simulate rules returned in arbitrary API order
    const rules = [
      makeRule({ match: "z-rule", categoryId: "c", subcategoryId: "s", priority: 9000 }),
      makeRule({ match: "a-rule", categoryId: "c", subcategoryId: "s", priority: 1000 }),
      makeRule({ match: "m-rule", categoryId: "c", subcategoryId: "s", priority: 5000 }),
    ];
    const sorted = [...rules].sort(ruleComparator);
    expect(sorted[0].match).toBe("a-rule");
    expect(sorted[1].match).toBe("m-rule");
    expect(sorted[2].match).toBe("z-rule");
  });
});

// Pure-function equivalents of the classification and assignment logic in
// scripts/migrations/budget-tracker/normalise-rule-priorities.ts — tested here
// because budget-domain is the only package with a vitest runner.
const PRIORITY_BATCH_DEFAULT   = 100;
const PRIORITY_DATE_NOW_FLOOR  = 1_000_000_000;
const PRIORITY_STEP            = 1000;

function needsMigration(priority: number): boolean {
  return priority === PRIORITY_BATCH_DEFAULT || priority > PRIORITY_DATE_NOW_FLOOR;
}

function computeMigratedPriorities(rules: MatchingRule[]): Array<{ ruleId: string; match: string; newPriority: number }> {
  const sorted = [...rules].sort((a, b) =>
    a.match.toLowerCase().localeCompare(b.match.toLowerCase())
  );
  return sorted.map((r, idx) => ({
    ruleId: r.ruleId,
    match: r.match,
    newPriority: (idx + 1) * PRIORITY_STEP,
  }));
}

describe("normalise-rule-priorities migration logic", () => {
  it("needsMigration: priority=100 returns true (Population A)", () => {
    expect(needsMigration(100)).toBe(true);
  });

  it("needsMigration: priority > 10⁹ returns true (Population B — Date.now())", () => {
    expect(needsMigration(1_780_000_000_000)).toBe(true);
    expect(needsMigration(1_000_000_001)).toBe(true);
  });

  it("needsMigration: priority in normal range returns false (already migrated)", () => {
    expect(needsMigration(1000)).toBe(false);
    expect(needsMigration(5000)).toBe(false);
    expect(needsMigration(78000)).toBe(false);
    expect(needsMigration(1_000_000_000)).toBe(false); // exactly the floor — not a Date.now() value
  });

  it("empty input → no output", () => {
    expect(computeMigratedPriorities([])).toHaveLength(0);
  });

  it("assigns priorities 1000, 2000, 3000... in alphabetical order", () => {
    const rules = [
      makeRule({ match: "woolworths", categoryId: "c", subcategoryId: "s", priority: 100 }),
      makeRule({ match: "aldi",       categoryId: "c", subcategoryId: "s", priority: 100 }),
      makeRule({ match: "netflix",    categoryId: "c", subcategoryId: "s", priority: 100 }),
    ];
    const result = computeMigratedPriorities(rules);
    expect(result.map(r => r.match)).toEqual(["aldi", "netflix", "woolworths"]);
    expect(result.map(r => r.newPriority)).toEqual([1000, 2000, 3000]);
  });

  it("mixed Population A (100) and Population B (Date.now()) sorted and assigned together", () => {
    const rules = [
      makeRule({ match: "zebra",  categoryId: "c", subcategoryId: "s", priority: 100 }),
      makeRule({ match: "apple",  categoryId: "c", subcategoryId: "s", priority: 1_780_000_000_000 }),
      makeRule({ match: "mango",  categoryId: "c", subcategoryId: "s", priority: 100 }),
    ];
    const result = computeMigratedPriorities(rules);
    expect(result.map(r => r.match)).toEqual(["apple", "mango", "zebra"]);
    expect(result.map(r => r.newPriority)).toEqual([1000, 2000, 3000]);
  });

  it("all resulting priorities are distinct multiples of 1000", () => {
    const rules = Array.from({ length: 10 }, (_, i) =>
      makeRule({ match: `rule-${i}`, categoryId: "c", subcategoryId: "s", priority: 100 })
    );
    const result = computeMigratedPriorities(rules);
    const priorities = result.map(r => r.newPriority);
    expect(new Set(priorities).size).toBe(10);
    expect(priorities.every(p => p % PRIORITY_STEP === 0)).toBe(true);
  });

  it("second run is a no-op: already-migrated rules have needsMigration=false", () => {
    // After migration, priorities are 1000, 2000, ..., N*1000
    [1000, 2000, 10000, 78000].forEach(p => {
      expect(needsMigration(p)).toBe(false);
    });
  });

  it("case-insensitive alphabetical sort for match values", () => {
    const rules = [
      makeRule({ match: "Zebra Store",  categoryId: "c", subcategoryId: "s", priority: 100 }),
      makeRule({ match: "apple pay",    categoryId: "c", subcategoryId: "s", priority: 100 }),
      makeRule({ match: "Amazon Prime", categoryId: "c", subcategoryId: "s", priority: 100 }),
    ];
    const result = computeMigratedPriorities(rules);
    expect(result.map(r => r.match)).toEqual(["Amazon Prime", "apple pay", "Zebra Store"]);
  });
});

// Priority midpoint math used by the drag-and-drop handleDragEnd
function computeDragPriority(
  above: number | undefined,
  below: number | undefined,
): number {
  if (above === undefined && below !== undefined) return below / 2;
  if (below === undefined && above !== undefined) return above + 1000;
  if (above !== undefined && below !== undefined) return (above + below) / 2;
  return 1000; // single-item list (degenerate case)
}

describe("drag-and-drop priority midpoint math", () => {
  it("drop at top: priority = below / 2", () => {
    expect(computeDragPriority(undefined, 2000)).toBe(1000);
    expect(computeDragPriority(undefined, 1000)).toBe(500);
  });

  it("drop at bottom: priority = above + 1000", () => {
    expect(computeDragPriority(5000, undefined)).toBe(6000);
    expect(computeDragPriority(78000, undefined)).toBe(79000);
  });

  it("drop between two rules: priority = midpoint", () => {
    expect(computeDragPriority(1000, 3000)).toBe(2000);
    expect(computeDragPriority(1000, 2000)).toBe(1500);
    expect(computeDragPriority(1000, 1001)).toBeCloseTo(1000.5);
  });

  it("midpoint result is between the neighbours", () => {
    const above = 5000;
    const below = 7000;
    const result = computeDragPriority(above, below);
    expect(result).toBeGreaterThan(above);
    expect(result).toBeLessThan(below);
  });

  it("result is always finite and positive", () => {
    [
      computeDragPriority(undefined, 1000),
      computeDragPriority(78000, undefined),
      computeDragPriority(1000, 2000),
    ].forEach(p => {
      expect(isFinite(p)).toBe(true);
      expect(p).toBeGreaterThan(0);
    });
  });

  it("drop at top of list with minimum post-migration priority: result stays positive", () => {
    // Minimum priority after migration is 1000; halved = 500, still positive ✓
    expect(computeDragPriority(undefined, 1000)).toBe(500);
    expect(computeDragPriority(undefined, 500)).toBe(250);
  });
});
