import type { Transaction, CategoryTree, BudgetSettings } from "./contracts.js";
import { isExcludedFromCashflow, PROJECT_CATEGORIES } from "./exclusions.js";
import { getSubcategoryMonthlyBudget } from "./budget-tracking.js";

export interface MonthlyTrendPoint {
  month: string;    // e.g. "Jan 26"
  monthKey: string; // "YYYY-MM" for sorting/filtering
  income: number;
  expenses: number;
  net: number;
}

export interface CategoryBarPoint {
  category: string;
  actual: number;
  budget: number;
  over: boolean;
}

export interface SankeyNode {
  id: string;
  label: string;
  value: number;
  col: number;
  type: "incSub" | "total" | "expCat" | "expSub";
  category?: string;
}

export interface SankeyLink {
  source: string;
  target: string;
  value: number;
}

export interface SankeyData {
  nodes: SankeyNode[];
  links: SankeyLink[];
}

function txMonth(tx: Transaction): string | null {
  const p = tx.date.split("/");
  return p.length === 3 ? `${p[2]}-${p[1].padStart(2, "0")}` : null;
}

function monthLabel(key: string): string {
  const [yr, mn] = key.split("-");
  return new Date(parseInt(yr), parseInt(mn) - 1, 1).toLocaleString("en-AU", {
    month: "short",
    year: "2-digit",
  });
}

/**
 * Build monthly income / expenses / net trend data.
 * Excludes transfers, business expenses, and project transactions.
 */
export function buildMonthlyTrend(transactions: Transaction[]): MonthlyTrendPoint[] {
  const months = [...new Set(transactions.map(txMonth).filter((m): m is string => m !== null))].sort();

  return months.map((mo) => {
    const mtx = transactions.filter((t) => txMonth(t) === mo);

    const income = mtx
      .filter((t) => t.category === "Income")
      .reduce((s, t) => s + Math.abs(parseFloat(t.amount) || 0), 0);

    const expenses = mtx
      .filter((t) => t.category && t.category !== "Income" && !isExcludedFromCashflow(t))
      .reduce((s, t) => s + Math.abs(parseFloat(t.amount) || 0), 0);

    return {
      month: monthLabel(mo),
      monthKey: mo,
      income: Math.round(income),
      expenses: Math.round(expenses),
      net: Math.round(income - expenses),
    };
  });
}

/**
 * Build per-category actual vs budget bar chart data.
 * Covers all expense categories (excludes Income and project categories).
 * Budget is the sum of monthly subcategory budgets multiplied by the number of months.
 */
export function buildCategoryBarData(
  transactions: Transaction[],
  settings: Pick<BudgetSettings, "budgetOverrides" | "budgetFreqs">,
  effectiveCategories: CategoryTree
): CategoryBarPoint[] {
  const months = new Set(transactions.map(txMonth).filter(Boolean));
  const numMonths = Math.max(months.size, 1);

  return Object.keys(effectiveCategories)
    .filter((c) => c !== "Income" && !PROJECT_CATEGORIES.includes(c))
    .map((cat) => {
      const actual = transactions
        .filter((t) => t.category === cat && t.subcategory !== "Transfer")
        .reduce((s, t) => s + Math.abs(parseFloat(t.amount) || 0), 0);

      const budget = (effectiveCategories[cat] ?? []).reduce(
        (s, sub) => s + getSubcategoryMonthlyBudget(sub, settings) * numMonths,
        0
      );

      return {
        category: cat,
        actual: Math.round(actual),
        budget: Math.round(budget),
        over: actual > budget,
      };
    })
    .filter((d) => d.actual > 0 || d.budget > 0);
}

/**
 * Build Sankey diagram data from budget settings (shows planned cash flow, not actuals).
 *
 * Layout: income subcategories (col 0) → Total Income node (col 1)
 *       → expense categories (col 2) → expense subcategories (col 3)
 */
export function buildSankeyData(
  settings: Pick<BudgetSettings, "budgetOverrides" | "budgetFreqs">,
  effectiveCategories: CategoryTree
): SankeyData {
  const getSubBudget = (sub: string) => getSubcategoryMonthlyBudget(sub, settings);
  const getCatBudget = (cat: string) =>
    (effectiveCategories[cat] ?? []).reduce((s, sub) => s + getSubBudget(sub), 0);

  const incomeSubs = (effectiveCategories["Income"] ?? []).filter((s) => getSubBudget(s) > 0);
  const expCats = Object.keys(effectiveCategories).filter(
    (c) => c !== "Income" && getCatBudget(c) > 0
  );

  const totalIncomeVal = incomeSubs.reduce((s, sub) => s + getSubBudget(sub), 0);

  const nodes: SankeyNode[] = [
    ...incomeSubs.map((s) => ({
      id: `inc_${s}`,
      label: s,
      value: getSubBudget(s),
      col: 0,
      type: "incSub" as const,
    })),
    { id: "total_income", label: "Total Income", value: totalIncomeVal, col: 1, type: "total" as const },
    ...expCats.map((c) => ({
      id: `exp_cat_${c}`,
      label: c,
      value: getCatBudget(c),
      col: 2,
      type: "expCat" as const,
      category: c,
    })),
    ...expCats.flatMap((c) =>
      (effectiveCategories[c] ?? [])
        .filter((s) => getSubBudget(s) > 0)
        .map((s) => ({
          id: `exp_sub_${s}`,
          label: s,
          value: getSubBudget(s),
          col: 3,
          type: "expSub" as const,
          category: c,
        }))
    ),
  ];

  const links: SankeyLink[] = [
    ...incomeSubs.map((s) => ({ source: `inc_${s}`, target: "total_income", value: getSubBudget(s) })),
    ...expCats.map((c) => ({ source: "total_income", target: `exp_cat_${c}`, value: getCatBudget(c) })),
    ...expCats.flatMap((c) =>
      (effectiveCategories[c] ?? [])
        .filter((s) => getSubBudget(s) > 0)
        .map((s) => ({ source: `exp_cat_${c}`, target: `exp_sub_${s}`, value: getSubBudget(s) }))
    ),
  ];

  return { nodes, links };
}
