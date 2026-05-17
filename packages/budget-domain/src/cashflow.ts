import type { Transaction, BudgetData, Category } from "./contracts.js";
import { getSubcategoryMonthlyBudget } from "./budget-tracking.js";

export interface MonthlyTrendPoint {
  month: string;
  monthKey: string;
  income: number;
  expenses: number;
  net: number;
}

export interface CategoryBarPoint {
  categoryId: string;
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

function getActiveSubs(cat: Category) {
  return cat.subcategories.filter(s => !s.deleted);
}

function isExcludedTx(tx: Transaction, categories: Category[]): boolean {
  if (tx._business || tx._ignore) return true;
  if (tx.subcategoryId) {
    const sub = categories.flatMap(c => c.subcategories).find(s => s.subcategoryId === tx.subcategoryId);
    if (sub?.name === "Transfer") return true;
  } else if (tx.subcategory === "Transfer") return true;
  const cat = categories.find(c => c.categoryId === tx.categoryId);
  if (cat?.type === "capital") return true;
  return false;
}

/**
 * Build monthly income / expenses / net trend data.
 * Uses UUID categoryId when available; falls back to legacy category string.
 */
export function buildMonthlyTrend(
  transactions: Transaction[],
  categories: Category[]
): MonthlyTrendPoint[] {
  const incomeCat = categories.find(c => c.name === "Income");
  const months = [
    ...new Set(transactions.map(txMonth).filter((m): m is string => m !== null)),
  ].sort();

  return months.map(mo => {
    const mtx = transactions.filter(t => txMonth(t) === mo);

    const income = mtx
      .filter(t => t.categoryId === incomeCat?.categoryId || (!t.categoryId && t.category === "Income"))
      .reduce((s, t) => s + Math.abs(parseFloat(t.amount) || 0), 0);

    const expenses = mtx
      .filter(t => {
        const cat = categories.find(c => c.categoryId === t.categoryId);
        const catName = cat?.name || t.category;
        return catName && catName !== "Income" && !isExcludedTx(t, categories);
      })
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
 * Covers all regular expense categories (excludes Income and capital).
 */
export function buildCategoryBarData(
  transactions: Transaction[],
  budgetData: BudgetData
): CategoryBarPoint[] {
  const months = new Set(transactions.map(txMonth).filter(Boolean));
  const numMonths = Math.max(months.size, 1);

  const regularExpenseCats = budgetData.categories.filter(
    c => !c.deleted && c.type === "regular" && c.name !== "Income"
  );

  return regularExpenseCats.map(cat => {
    const actual = transactions
      .filter(t => {
        if (isExcludedTx(t, budgetData.categories)) return false;
        return t.categoryId === cat.categoryId || (!t.categoryId && t.category === cat.name);
      })
      .reduce((s, t) => s + Math.abs(parseFloat(t.amount) || 0), 0);

    const budget = getActiveSubs(cat).reduce(
      (s, sub) => s + getSubcategoryMonthlyBudget(sub.subcategoryId, budgetData) * numMonths,
      0
    );

    return {
      categoryId: cat.categoryId,
      category: cat.name,
      actual: Math.round(actual),
      budget: Math.round(budget),
      over: actual > budget,
    };
  }).filter(d => d.actual > 0 || d.budget > 0);
}

/**
 * Build Sankey diagram data from budget settings (planned cash flow, not actuals).
 */
export function buildSankeyData(budgetData: BudgetData): SankeyData {
  const getSubBudget = (subcategoryId: string) =>
    getSubcategoryMonthlyBudget(subcategoryId, budgetData);

  const regularCats = budgetData.categories.filter(c => !c.deleted && c.type === "regular");
  const incomeCat = regularCats.find(c => c.name === "Income");

  const incomeSubs = incomeCat
    ? getActiveSubs(incomeCat).filter(s => getSubBudget(s.subcategoryId) > 0)
    : [];

  const getCatBudget = (cat: Category) =>
    getActiveSubs(cat).reduce((s, sub) => s + getSubBudget(sub.subcategoryId), 0);

  const expCats = regularCats.filter(
    c => c.name !== "Income" && getCatBudget(c) > 0
  );

  const totalIncomeVal = incomeSubs.reduce((s, sub) => s + getSubBudget(sub.subcategoryId), 0);

  const nodes: SankeyNode[] = [
    ...incomeSubs.map(s => ({
      id: `inc_${s.subcategoryId}`,
      label: s.name,
      value: getSubBudget(s.subcategoryId),
      col: 0,
      type: "incSub" as const,
    })),
    { id: "total_income", label: "Total Income", value: totalIncomeVal, col: 1, type: "total" as const },
    ...expCats.map(c => ({
      id: `exp_cat_${c.categoryId}`,
      label: c.name,
      value: getCatBudget(c),
      col: 2,
      type: "expCat" as const,
      category: c.name,
    })),
    ...expCats.flatMap(c =>
      getActiveSubs(c)
        .filter(s => getSubBudget(s.subcategoryId) > 0)
        .map(s => ({
          id: `exp_sub_${s.subcategoryId}`,
          label: s.name,
          value: getSubBudget(s.subcategoryId),
          col: 3,
          type: "expSub" as const,
          category: c.name,
        }))
    ),
  ];

  const links: SankeyLink[] = [
    ...incomeSubs.map(s => ({
      source: `inc_${s.subcategoryId}`,
      target: "total_income",
      value: getSubBudget(s.subcategoryId),
    })),
    ...expCats.map(c => ({
      source: "total_income",
      target: `exp_cat_${c.categoryId}`,
      value: getCatBudget(c),
    })),
    ...expCats.flatMap(c =>
      getActiveSubs(c)
        .filter(s => getSubBudget(s.subcategoryId) > 0)
        .map(s => ({
          source: `exp_cat_${c.categoryId}`,
          target: `exp_sub_${s.subcategoryId}`,
          value: getSubBudget(s.subcategoryId),
        }))
    ),
  ];

  return { nodes, links };
}
