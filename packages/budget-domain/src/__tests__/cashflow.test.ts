import { describe, it, expect } from "vitest";
import { buildMonthlyTrend, buildCategoryBarData } from "../cashflow.js";
import { buildEffectiveCategories } from "../category-tree.js";
import type { Transaction, BudgetSettings } from "../contracts.js";
import { readFileSync } from "fs";
import { join } from "path";

const exportData = JSON.parse(
  readFileSync(
    join(__dirname, "../../../../migration-artifacts/budget-tracker/budget-tracker-export-2026-04-18.json"),
    "utf8"
  )
);

const transactions: Transaction[] = exportData.transactions
  .filter((t: Transaction) => t.category !== "_ignore")
  .map((t: Transaction) => ({ ...t, accountId: "acc-test", _business: t._business ?? false }));

const settings: BudgetSettings = {
  accountId: "acc-test",
  budgetOverrides: exportData.budgetOverrides ?? {},
  budgetFreqs: exportData.budgetFreqs ?? {},
  customCategories: exportData.customCategories ?? {},
  projectBudgets: exportData.projectBudgets ?? {},
  deletedSubs: exportData.deletedSubs ?? [],
  csvFormatMappings: exportData.csvFormatMappings ?? {},
};

const effectiveCategories = buildEffectiveCategories(settings);

describe("buildMonthlyTrend", () => {
  it("returns 3 months for 3-month dataset", () => {
    const trend = buildMonthlyTrend(transactions);
    expect(trend).toHaveLength(3);
  });

  it("months are in ascending order", () => {
    const trend = buildMonthlyTrend(transactions);
    const keys = trend.map((t) => t.monthKey);
    expect(keys).toEqual([...keys].sort());
  });

  it("each month has positive income", () => {
    const trend = buildMonthlyTrend(transactions);
    trend.forEach((m) => {
      expect(m.income).toBeGreaterThan(0);
    });
  });

  it("net = income - expenses", () => {
    const trend = buildMonthlyTrend(transactions);
    trend.forEach((m) => {
      expect(m.net).toBe(m.income - m.expenses);
    });
  });

  it("excludes Transfer transactions from expenses", () => {
    const withTransfer: Transaction[] = [
      ...transactions,
      {
        _id: 9999, accountId: "acc-test", date: "15/01/2026",
        amount: "-1000000", description: "BIG TRANSFER",
        category: "Financial & Insurance", subcategory: "Transfer",
        file: "test.csv", _manual: false, _business: false,
      },
    ];
    const withTrend = buildMonthlyTrend(withTransfer);
    const withoutTrend = buildMonthlyTrend(transactions);
    const jan = withTrend.find((m) => m.monthKey === "2026-01");
    const janBase = withoutTrend.find((m) => m.monthKey === "2026-01");
    // The $1M transfer should not inflate expenses
    expect(jan?.expenses).toBe(janBase?.expenses);
  });
});

describe("buildCategoryBarData", () => {
  it("returns at least one category", () => {
    const bars = buildCategoryBarData(transactions, settings, effectiveCategories);
    expect(bars.length).toBeGreaterThan(0);
  });

  it("excludes Income category", () => {
    const bars = buildCategoryBarData(transactions, settings, effectiveCategories);
    expect(bars.find((b) => b.category === "Income")).toBeUndefined();
  });

  it("Groceries has actual > 0", () => {
    const bars = buildCategoryBarData(transactions, settings, effectiveCategories);
    const groceries = bars.find((b) => b.category === "Groceries");
    expect(groceries).toBeDefined();
    expect(groceries!.actual).toBeGreaterThan(0);
  });
});
