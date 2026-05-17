import { describe, it, expect } from "vitest";
import { toMonthlyAmount, getSubcategoryMonthlyBudget, buildBudgetVsActual, FREQ_FACTORS } from "../budget-tracking.js";
import type { BudgetData, Transaction } from "../contracts.js";

const SUB_A = "sub-a-uuid";
const SUB_B = "sub-b-uuid";
const CAT_INCOME = "cat-income-uuid";
const CAT_GROCERIES = "cat-groceries-uuid";

const BUDGET_DATA: BudgetData = {
  categories: [
    {
      categoryId: CAT_INCOME,
      name: "Income",
      type: "regular",
      displayOrder: 0,
      subcategories: [{ subcategoryId: SUB_A, name: "Pay", displayOrder: 0 }],
    },
    {
      categoryId: CAT_GROCERIES,
      name: "Groceries",
      type: "regular",
      displayOrder: 1,
      subcategories: [{ subcategoryId: SUB_B, name: "Supermarket", displayOrder: 0 }],
    },
  ],
  budgetAmounts: { [SUB_A]: 8000, [SUB_B]: 800 },
  budgetFrequencies: {},
};

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

  it("returns 0 for one-off", () => {
    expect(toMonthlyAmount(500, "one-off")).toBe(0);
  });
});

describe("getSubcategoryMonthlyBudget", () => {
  it("returns budget amount for known subcategory", () => {
    expect(getSubcategoryMonthlyBudget(SUB_B, BUDGET_DATA)).toBe(800);
  });

  it("returns 0 for unknown subcategoryId", () => {
    expect(getSubcategoryMonthlyBudget("unknown-uuid", BUDGET_DATA)).toBe(0);
  });

  it("applies frequency factor when set", () => {
    const bd: BudgetData = {
      ...BUDGET_DATA,
      budgetAmounts: { [SUB_B]: 200 },
      budgetFrequencies: { [SUB_B]: "weekly" },
    };
    expect(getSubcategoryMonthlyBudget(SUB_B, bd)).toBeCloseTo(200 * FREQ_FACTORS.weekly);
  });
});

describe("buildBudgetVsActual", () => {
  const tx = (catId: string, subId: string, amount: string, date = "01/01/2026"): Transaction => ({
    transactionId: crypto.randomUUID(),
    accountId: "acc-test",
    date,
    amount,
    description: "test",
    categoryId: catId,
    subcategoryId: subId,
    file: "test.csv",
    _manual: false,
    _business: false,
  });

  it("computes income and expenses correctly", () => {
    const transactions = [
      tx(CAT_INCOME, SUB_A, "1000"),
      tx(CAT_GROCERIES, SUB_B, "-200"),
    ];
    const result = buildBudgetVsActual(transactions, BUDGET_DATA);
    expect(result.totalIncome).toBe(1000);
    expect(result.totalExpenses).toBe(200);
    expect(result.numMonths).toBe(1);
  });

  it("spans multiple months when transactions are spread", () => {
    const transactions = [
      tx(CAT_INCOME, SUB_A, "1000", "01/01/2026"),
      tx(CAT_INCOME, SUB_A, "1000", "01/02/2026"),
      tx(CAT_INCOME, SUB_A, "1000", "01/03/2026"),
    ];
    const result = buildBudgetVsActual(transactions, BUDGET_DATA);
    expect(result.numMonths).toBe(3);
  });

  it("excludes business transactions from expenses", () => {
    const transactions = [
      { ...tx(CAT_GROCERIES, SUB_B, "-200"), _business: true },
    ];
    const result = buildBudgetVsActual(transactions, BUDGET_DATA);
    expect(result.totalExpenses).toBe(0);
  });
});
