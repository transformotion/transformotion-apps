import { describe, it, expect } from "vitest";
import { applyRules } from "../rules.js";
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
