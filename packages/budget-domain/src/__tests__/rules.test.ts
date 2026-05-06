import { describe, it, expect } from "vitest";
import { applyRules, BUILTIN_RULES } from "../rules.js";
import type { CustomRule } from "../contracts.js";

describe("applyRules", () => {
  it("matches woolworths to Groceries/Supermarket", () => {
    const result = applyRules("WOOLWORTHS MAROOCHYDORE", BUILTIN_RULES);
    expect(result).toEqual({ category: "Groceries", subcategory: "Supermarket" });
  });

  it("matches COLES to Groceries/Supermarket", () => {
    const result = applyRules("COLES ONLINE", BUILTIN_RULES);
    expect(result).toEqual({ category: "Groceries", subcategory: "Supermarket" });
  });

  it("matches Netflix to Eating-out/Movies", () => {
    const result = applyRules("NETFLIX.COM", BUILTIN_RULES);
    expect(result).toEqual({ category: "Eating-out & Entertainment", subcategory: "Movies, shows & music" });
  });

  it("returns null for unknown description", () => {
    const result = applyRules("ZXQWERTY UNKNOWN MERCHANT", BUILTIN_RULES);
    expect(result).toBeNull();
  });

  it("custom rule overrides builtin when listed first", () => {
    const customRule: CustomRule = {
      id: "1",
      accountId: "acc1",
      name: "Woolworths override",
      match: "woolworths",
      matchType: "contains",
      category: "Custom",
      subcategory: "Override",
      enabled: true,
      priority: 100,
      isBusiness: false,
      learned: true,
      createdAt: new Date().toISOString(),
    };
    // Custom rules passed first (most-recent order), then builtins
    const result = applyRules("WOOLWORTHS KAWANA", [customRule, ...BUILTIN_RULES]);
    expect(result).toEqual({ category: "Custom", subcategory: "Override" });
  });

  it("falls back to builtin when custom rule does not match", () => {
    const customRule: CustomRule = {
      id: "1",
      accountId: "acc1",
      name: "Special store rule",
      match: "specialstore",
      matchType: "contains",
      category: "Custom",
      subcategory: "Custom sub",
      enabled: true,
      priority: 100,
      isBusiness: false,
      learned: false,
      createdAt: new Date().toISOString(),
    };
    const result = applyRules("WOOLWORTHS MOOLOOLABA", [customRule, ...BUILTIN_RULES]);
    expect(result).toEqual({ category: "Groceries", subcategory: "Supermarket" });
  });

  it("handles Hawkins rule -> Financial/Transfer", () => {
    const result = applyRules("PAYMENT FROM Hawkins E A", BUILTIN_RULES);
    expect(result).toEqual({ category: "Financial & Insurance", subcategory: "Transfer" });
  });
});
