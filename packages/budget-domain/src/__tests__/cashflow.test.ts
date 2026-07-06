import { describe, it, expect } from "vitest";
import { buildMonthlyTrend, buildCategoryBarData } from "../cashflow.js";
import type { Transaction, BudgetData, Category } from "../contracts.js";

const CAT_INCOME_ID = "cat-income";
const CAT_GROCERIES_ID = "cat-groceries";
const SUB_PAY_ID = "sub-pay";
const SUB_SUPERMARKET_ID = "sub-supermarket";
const SUB_TRANSFER_ID = "sub-transfer";
const CAT_FINANCIAL_ID = "cat-financial";

const CATEGORIES: Category[] = [
  {
    categoryId: CAT_INCOME_ID,
    name: "Income",
    type: "regular",
    displayOrder: 0,
    role: "income",
    subcategories: [{ subcategoryId: SUB_PAY_ID, name: "Pay", displayOrder: 0 }],
  },
  {
    categoryId: CAT_GROCERIES_ID,
    name: "Groceries",
    type: "regular",
    displayOrder: 1,
    subcategories: [{ subcategoryId: SUB_SUPERMARKET_ID, name: "Supermarket", displayOrder: 0 }],
  },
  {
    categoryId: CAT_FINANCIAL_ID,
    name: "Financial & Insurance",
    type: "regular",
    displayOrder: 2,
    subcategories: [{ subcategoryId: SUB_TRANSFER_ID, name: "Transfer", displayOrder: 0, excludeFromCashflow: true }],
  },
];

const BUDGET_DATA: BudgetData = {
  categories: CATEGORIES,
  budgetAmounts: { [SUB_PAY_ID]: 5000, [SUB_SUPERMARKET_ID]: 800 },
  budgetFrequencies: {},
};

function makeTx(overrides: Partial<Transaction> & { date: string; amount: string }): Transaction {
  return {
    transactionId: crypto.randomUUID(),
    accountId: "acc-test",
    description: "test",
    categoryId: null,
    subcategoryId: null,
    file: "test.csv",
    _manual: false,
    _business: false,
    ...overrides,
  };
}

const SAMPLE_TRANSACTIONS: Transaction[] = [
  makeTx({ date: "01/01/2026", amount: "5000", categoryId: CAT_INCOME_ID, subcategoryId: SUB_PAY_ID }),
  makeTx({ date: "15/01/2026", amount: "-200", categoryId: CAT_GROCERIES_ID, subcategoryId: SUB_SUPERMARKET_ID }),
  makeTx({ date: "01/02/2026", amount: "5000", categoryId: CAT_INCOME_ID, subcategoryId: SUB_PAY_ID }),
  makeTx({ date: "15/02/2026", amount: "-180", categoryId: CAT_GROCERIES_ID, subcategoryId: SUB_SUPERMARKET_ID }),
  makeTx({ date: "01/03/2026", amount: "5000", categoryId: CAT_INCOME_ID, subcategoryId: SUB_PAY_ID }),
  makeTx({ date: "15/03/2026", amount: "-220", categoryId: CAT_GROCERIES_ID, subcategoryId: SUB_SUPERMARKET_ID }),
];

describe("buildMonthlyTrend", () => {
  it("returns 3 months for 3-month dataset", () => {
    const trend = buildMonthlyTrend(SAMPLE_TRANSACTIONS, CATEGORIES);
    expect(trend).toHaveLength(3);
  });

  it("months are in ascending order", () => {
    const trend = buildMonthlyTrend(SAMPLE_TRANSACTIONS, CATEGORIES);
    const keys = trend.map(t => t.monthKey);
    expect(keys).toEqual([...keys].sort());
  });

  it("each month has positive income", () => {
    const trend = buildMonthlyTrend(SAMPLE_TRANSACTIONS, CATEGORIES);
    trend.forEach(m => {
      expect(m.income).toBeGreaterThan(0);
    });
  });

  it("net = income - expenses", () => {
    const trend = buildMonthlyTrend(SAMPLE_TRANSACTIONS, CATEGORIES);
    trend.forEach(m => {
      expect(m.net).toBe(m.income - m.expenses);
    });
  });

  it("excludes Transfer transactions from expenses", () => {
    const withTransfer: Transaction[] = [
      ...SAMPLE_TRANSACTIONS,
      makeTx({
        date: "15/01/2026",
        amount: "-1000000",
        categoryId: CAT_FINANCIAL_ID,
        subcategoryId: SUB_TRANSFER_ID,
      }),
    ];
    const withTrend = buildMonthlyTrend(withTransfer, CATEGORIES);
    const withoutTrend = buildMonthlyTrend(SAMPLE_TRANSACTIONS, CATEGORIES);
    const jan = withTrend.find(m => m.monthKey === "2026-01");
    const janBase = withoutTrend.find(m => m.monthKey === "2026-01");
    expect(jan?.expenses).toBe(janBase?.expenses);
  });
});

describe("buildCategoryBarData", () => {
  it("returns at least one category", () => {
    const bars = buildCategoryBarData(SAMPLE_TRANSACTIONS, BUDGET_DATA);
    expect(bars.length).toBeGreaterThan(0);
  });

  it("excludes Income category", () => {
    const bars = buildCategoryBarData(SAMPLE_TRANSACTIONS, BUDGET_DATA);
    expect(bars.find(b => b.category === "Income")).toBeUndefined();
  });

  it("Groceries has actual > 0", () => {
    const bars = buildCategoryBarData(SAMPLE_TRANSACTIONS, BUDGET_DATA);
    const groceries = bars.find(b => b.category === "Groceries");
    expect(groceries).toBeDefined();
    expect(groceries!.actual).toBeGreaterThan(0);
  });
});
