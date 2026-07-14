import { describe, it, expect } from "vitest";
import type { BudgetData, Transaction } from "../contracts.js";
import {
  collectIncomeHolderIds,
  isRoleTransaction,
} from "../roles.js";
import {
  buildDashboardStats,
  buildSavingsGoalProgress,
  buildSpendingByCategory,
  getRecentTransactions,
  latestMonth,
  monthlyIncome,
} from "../dashboard.js";

const CAT_INCOME = "cat-income";
const CAT_GROCERIES = "cat-groceries";
const SUB_PAY = "sub-pay";
const SUB_SUPERMARKET = "sub-supermarket";
const SUB_SAVINGS = "sub-savings";
const CAT_SAVINGS = "cat-savings";

const BUDGET_DATA: BudgetData = {
  categories: [
    {
      categoryId: CAT_INCOME,
      name: "Income",
      type: "regular",
      displayOrder: 0,
      role: "income",
      subcategories: [{ subcategoryId: SUB_PAY, name: "Pay", displayOrder: 0 }],
    },
    {
      categoryId: CAT_GROCERIES,
      name: "Groceries",
      type: "regular",
      displayOrder: 1,
      subcategories: [{ subcategoryId: SUB_SUPERMARKET, name: "Supermarket", displayOrder: 0 }],
    },
    {
      categoryId: CAT_SAVINGS,
      name: "Savings",
      type: "regular",
      displayOrder: 2,
      role: "savings",
      subcategories: [{ subcategoryId: SUB_SAVINGS, name: "Emergency Fund", displayOrder: 0 }],
    },
  ],
  budgetAmounts: { [SUB_PAY]: 5000, [SUB_SUPERMARKET]: 800 },
  budgetFrequencies: {},
};

function tx(partial: Partial<Transaction>): Transaction {
  return {
    transactionId: Math.random().toString(36).slice(2),
    accountId: "acct-1",
    date: "01/06/2026",
    amount: "0",
    description: "",
    categoryId: null,
    subcategoryId: null,
    file: "test.csv",
    _manual: false,
    _business: false,
    ...partial,
  };
}

const TXNS: Transaction[] = [
  tx({ date: "01/06/2026", amount: "5600", categoryId: CAT_INCOME, subcategoryId: SUB_PAY, description: "Salary" }),
  tx({ date: "10/06/2026", amount: "-300", categoryId: CAT_GROCERIES, subcategoryId: SUB_SUPERMARKET, description: "Tesco" }),
  tx({ date: "20/06/2026", amount: "-200", categoryId: CAT_SAVINGS, subcategoryId: SUB_SAVINGS, description: "To savings" }),
  tx({ date: "01/05/2026", amount: "5600", categoryId: CAT_INCOME, subcategoryId: SUB_PAY, description: "Salary May" }),
];

describe("roles", () => {
  it("collects income holders including inherited subcategories", () => {
    const holders = collectIncomeHolderIds(BUDGET_DATA.categories);
    expect(holders.categoryIds.has(CAT_INCOME)).toBe(true);
    expect(holders.subcategoryIds.has(SUB_PAY)).toBe(true);
    expect(holders.categoryIds.has(CAT_GROCERIES)).toBe(false);
  });

  it("classifies a transaction by role via subcategory then category", () => {
    const holders = collectIncomeHolderIds(BUDGET_DATA.categories);
    expect(isRoleTransaction(TXNS[0], holders)).toBe(true);
    expect(isRoleTransaction(TXNS[1], holders)).toBe(false);
  });
});

describe("monthlyIncome", () => {
  it("sums role-based income for the month", () => {
    expect(monthlyIncome(TXNS, BUDGET_DATA, "2026-06")).toBe(5600);
  });
});

describe("buildDashboardStats", () => {
  it("computes income, spend, budget and remaining for the latest month", () => {
    const stats = buildDashboardStats(TXNS, BUDGET_DATA);
    expect(stats.month).toBe("2026-06");
    expect(stats.monthlyIncome).toBe(5600);
    // Groceries 300 + Savings 200 both count as expenses (savings role does not
    // exempt spending); income is excluded from expenses.
    expect(stats.spentSoFar).toBe(500);
    expect(stats.budgetTotal).toBe(800); // only groceries has a budget
    expect(stats.remaining).toBe(300);
    expect(stats.underBudget).toBe(true);
  });

  it("returns an empty-but-valid shape when there are no transactions", () => {
    const stats = buildDashboardStats([], BUDGET_DATA);
    expect(stats.month).toBeNull();
    expect(stats.monthlyIncome).toBe(0);
  });
});

describe("buildSavingsGoalProgress", () => {
  // m16.12.0 STUB: `linkedSubcategoryId` was removed from `SavingsGoal`; the
  // domain still measures the implicit surplus for a configured explicit goal
  // (the real explicit/derived + signed savings-role progress is a follow-up PR).
  it("explicit goal measures the implicit surplus (linked tracking removed — stub)", () => {
    const data = { ...BUDGET_DATA, savingsGoal: { mode: "explicit" as const, targetAmount: 1000 } };
    const p = buildSavingsGoalProgress(TXNS, data, "2026-06");
    expect(p.configured).toBe(true);
    expect(p.implicit).toBe(true);
    expect(p.savedAmount).toBe(5600 - 500);
    expect(p.fraction).toBe(1);
  });

  it("falls back to implicit income - spending", () => {
    const data = { ...BUDGET_DATA, savingsGoal: { mode: "explicit" as const, targetAmount: 10000 } };
    const p = buildSavingsGoalProgress(TXNS, data, "2026-06");
    expect(p.implicit).toBe(true);
    expect(p.savedAmount).toBe(5600 - 500);
  });

  it("reports not-configured when absent", () => {
    expect(buildSavingsGoalProgress(TXNS, BUDGET_DATA, "2026-06").configured).toBe(false);
  });
});

describe("buildSpendingByCategory", () => {
  it("groups this-month expenses by category, descending, excluding income", () => {
    const rows = buildSpendingByCategory(TXNS, BUDGET_DATA, "2026-06");
    const names = rows.map((r) => r.category);
    expect(names).not.toContain("Income");
    expect(rows[0].amount).toBeGreaterThanOrEqual(rows[rows.length - 1].amount);
  });
});

describe("getRecentTransactions", () => {
  it("returns newest-first and respects the limit", () => {
    const recent = getRecentTransactions(TXNS, 2);
    expect(recent).toHaveLength(2);
    expect(recent[0].date).toBe("20/06/2026");
  });
});

describe("latestMonth", () => {
  it("returns the most recent YYYY-MM present", () => {
    expect(latestMonth(TXNS)).toBe("2026-06");
    expect(latestMonth([])).toBeNull();
  });
});
