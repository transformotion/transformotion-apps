import { describe, it, expect } from "vitest";
import { toMonthlyAmount, getSubcategoryMonthlyBudget, buildBudgetVsActual, FREQ_FACTORS } from "../budget-tracking.js";
import { buildEffectiveCategories } from "../category-tree.js";
import type { Transaction, BudgetSettings } from "../contracts.js";
import { readFileSync } from "fs";
import { join } from "path";

describe("toMonthlyAmount", () => {
  it("returns weekly amount * 52/12", () => {
    expect(toMonthlyAmount(100, "weekly")).toBeCloseTo(100 * FREQ_FACTORS.weekly);
  });

  it("returns monthly amount unchanged", () => {
    expect(toMonthlyAmount(500, "monthly")).toBe(500);
  });

  it("returns annual amount / 12", () => {
    expect(toMonthlyAmount(1200, "annually")).toBeCloseTo(100);
  });
});

describe("getSubcategoryMonthlyBudget", () => {
  const settings = { budgetOverrides: {}, budgetFreqs: {} };

  it("returns default monthly budget for known subcategory", () => {
    expect(getSubcategoryMonthlyBudget("Supermarket", settings)).toBe(800);
  });

  it("returns 0 for unknown subcategory with no override", () => {
    expect(getSubcategoryMonthlyBudget("Unknown Sub", settings)).toBe(0);
  });

  it("uses override amount when set", () => {
    expect(getSubcategoryMonthlyBudget("Supermarket", { budgetOverrides: { "Supermarket": 600 }, budgetFreqs: {} })).toBe(600);
  });

  it("returns 0 for tombstoned subcategory (override = -1)", () => {
    expect(getSubcategoryMonthlyBudget("Supermarket", { budgetOverrides: { "Supermarket": -1 }, budgetFreqs: {} })).toBe(0);
  });

  it("applies frequency factor to override", () => {
    const result = getSubcategoryMonthlyBudget("Supermarket", {
      budgetOverrides: { "Supermarket": 200 },
      budgetFreqs: { "Supermarket": "weekly" },
    });
    expect(result).toBeCloseTo(200 * FREQ_FACTORS.weekly);
  });
});

describe("buildBudgetVsActual — real export data", () => {
  const exportData = JSON.parse(
    readFileSync(
      join(__dirname, "../../../../migration-artifacts/budget-tracker/budget-tracker-export-2026-04-18.json"),
      "utf8"
    )
  );

  const transactions: Transaction[] = exportData.transactions
    .filter((t: Transaction) => t.category !== "_ignore")
    .map((t: Transaction) => ({
      ...t,
      accountId: "acc-test",
      _business: t._business ?? false,
    }));

  const settings: BudgetSettings = {
    accountId: "acc-test",
    budgetOverrides: exportData.budgetOverrides ?? {},
    budgetFreqs: exportData.budgetFreqs ?? {},
    customCategories: exportData.customCategories ?? {},
    deletedSubs: exportData.deletedSubs ?? [],
    projectBudgets: exportData.projectBudgets ?? {},
    projectTasks: exportData.projectTasks ?? {},
    customTopCategories: exportData.customTopCategories ?? [],
    customProjectCategories: exportData.customProjectCategories ?? [],
    deletedCategories: exportData.deletedCategories ?? [],
    deletedProjectCategories: exportData.deletedProjectCategories ?? [],
    disabledProjectCategories: exportData.disabledProjectCategories ?? [],
    csvFormatMappings: exportData.csvFormatMappings,
  };

  const effectiveCategories = buildEffectiveCategories(settings);

  it("processes all 726 non-ignored transactions without throwing", () => {
    const result = buildBudgetVsActual(transactions, settings, effectiveCategories);
    expect(result).toBeDefined();
    expect(transactions.length).toBe(726);
  });

  it("returns positive totalIncome", () => {
    const result = buildBudgetVsActual(transactions, settings, effectiveCategories);
    expect(result.totalIncome).toBeGreaterThan(0);
  });

  it("returns positive totalExpenses", () => {
    const result = buildBudgetVsActual(transactions, settings, effectiveCategories);
    expect(result.totalExpenses).toBeGreaterThan(0);
  });

  it("spans 3 months", () => {
    const result = buildBudgetVsActual(transactions, settings, effectiveCategories);
    expect(result.numMonths).toBe(3);
  });

  it("Groceries category has non-zero actual", () => {
    const result = buildBudgetVsActual(transactions, settings, effectiveCategories);
    const groceries = result.categories.find((c) => c.category === "Groceries");
    expect(groceries).toBeDefined();
    expect(groceries!.actual).toBeGreaterThan(0);
  });
});
