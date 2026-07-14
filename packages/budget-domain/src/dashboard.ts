import type { BudgetData, Transaction } from "./contracts";
import { buildBudgetVsActual, getSubcategoryMonthlyBudget } from "./budget-tracking";
import { collectIncomeHolderIds, collectSavingsHolderIds, isRoleTransaction } from "./roles";

/**
 * M21 — Home dashboard aggregation for Budget Tracker.
 *
 * All figures are client-computed from GET /transactions + BudgetData; there is
 * NO dashboard-specific server route for these numbers. Income is role-based
 * (see ./roles) and the monthly expense/budget figures are delegated to
 * `buildBudgetVsActual` so the dashboard shares one implementation with the
 * Budget/Summary tabs (no logic fork).
 */

function txMonthKey(tx: Transaction): string | null {
  const p = tx.date.split("/");
  return p.length === 3 ? `${p[2]}-${p[1].padStart(2, "0")}` : null;
}

/** Sortable YYYYMMDD key from a DD/MM/YYYY transaction date; "" when unparseable. */
function txSortKey(tx: Transaction): string {
  const p = tx.date.split("/");
  return p.length === 3 ? `${p[2]}${p[1].padStart(2, "0")}${p[0].padStart(2, "0")}` : "";
}

/** The most recent month (YYYY-MM) present in the data, or null when empty. */
export function latestMonth(transactions: Transaction[]): string | null {
  const months = transactions
    .map(txMonthKey)
    .filter((m): m is string => m !== null)
    .sort();
  return months.length ? months[months.length - 1] : null;
}

export interface SavingsGoalProgress {
  /** Whether a savings goal is configured on BudgetData. */
  configured: boolean;
  targetAmount: number;
  /** Amount saved so far this month (see behaviour.md § "Savings goal"). */
  savedAmount: number;
  /** savedAmount / targetAmount, clamped to [0, 1]; 0 when no target. */
  fraction: number;
  linkedSubcategoryId: string | null;
  /** True when progress is the implicit income − spending measure. */
  implicit: boolean;
}

export interface DashboardStats {
  /** Month these figures cover (YYYY-MM), or null when there is no data. */
  month: string | null;
  monthlyIncome: number;
  spentSoFar: number;
  /** Total monthly expense budget for the month. */
  budgetTotal: number;
  remaining: number;
  underBudget: boolean;
  /** spentSoFar / budgetTotal, clamped to [0, 1]; 0 when no budget. */
  spentFractionOfBudget: number;
  savings: SavingsGoalProgress;
}

/** Σ|amount| of income-role transactions in `month`. */
export function monthlyIncome(
  transactions: Transaction[],
  budgetData: BudgetData,
  month: string,
): number {
  const holders = collectIncomeHolderIds(budgetData.categories);
  return transactions
    .filter((t) => txMonthKey(t) === month && isRoleTransaction(t, holders))
    .reduce((s, t) => s + Math.abs(parseFloat(t.amount) || 0), 0);
}

/**
 * Derived-mode target = Σ monthly-normalized budgeted amounts of the active
 * role:'savings' subcategory holders (`savingsSubIds` already includes
 * category-level roles inherited onto their subcategories).
 */
function derivedSavingsTarget(budgetData: BudgetData, savingsSubIds: Set<string>): number {
  return budgetData.categories
    .filter((c) => !c.deleted)
    .flatMap((c) => c.subcategories.filter((s) => !s.deleted))
    .filter((s) => savingsSubIds.has(s.subcategoryId))
    .reduce((sum, s) => sum + getSubcategoryMonthlyBudget(s.subcategoryId, budgetData), 0);
}

/** Savings-goal progress for `month` per behaviour.md § "Savings goal". */
export function buildSavingsGoalProgress(
  transactions: Transaction[],
  budgetData: BudgetData,
  month: string,
): SavingsGoalProgress {
  const goal = budgetData.savingsGoal;
  if (!goal) {
    return {
      configured: false,
      targetAmount: 0,
      savedAmount: 0,
      fraction: 0,
      linkedSubcategoryId: null,
      implicit: true,
    };
  }

  const savingsHolders = collectSavingsHolderIds(budgetData.categories);
  const hasSavingsHolders =
    savingsHolders.categoryIds.size > 0 || savingsHolders.subcategoryIds.size > 0;

  // Target: explicit → the set amount; derived → Σ monthly savings budgets, or 0
  // when there are no savings holders (the degenerate derived value).
  const targetAmount =
    goal.mode === "explicit"
      ? goal.targetAmount
      : hasSavingsHolders
        ? derivedSavingsTarget(budgetData, savingsHolders.subcategoryIds)
        : 0;

  // Progress (both modes): same-month SIGNED sum of transactions in role:'savings'
  // holders (Math.abs superseded — a contribution is +, a withdrawal −). When no
  // savings holders exist, fall back to the implicit surplus (income − spending,
  // floored at 0) — the previously-shipped measure, now the documented fallback.
  let savedAmount: number;
  let implicit: boolean;
  if (hasSavingsHolders) {
    savedAmount = transactions
      .filter((t) => txMonthKey(t) === month && isRoleTransaction(t, savingsHolders))
      .reduce((s, t) => s + (parseFloat(t.amount) || 0), 0);
    implicit = false;
  } else {
    const income = monthlyIncome(transactions, budgetData, month);
    const spending = buildBudgetVsActual(transactions, budgetData, month).totalExpenses;
    savedAmount = Math.max(income - spending, 0);
    implicit = true;
  }

  const fraction = targetAmount > 0 ? Math.max(0, Math.min(savedAmount / targetAmount, 1)) : 0;
  return {
    configured: true,
    targetAmount,
    savedAmount,
    fraction,
    linkedSubcategoryId: null,
    implicit,
  };
}

/** The four-stat dashboard header + savings progress for `month` (defaults to latest). */
export function buildDashboardStats(
  transactions: Transaction[],
  budgetData: BudgetData,
  month?: string,
): DashboardStats {
  const resolvedMonth = month ?? latestMonth(transactions);
  if (!resolvedMonth) {
    return {
      month: null,
      monthlyIncome: 0,
      spentSoFar: 0,
      budgetTotal: 0,
      remaining: 0,
      underBudget: true,
      spentFractionOfBudget: 0,
      savings: buildSavingsGoalProgress(transactions, budgetData, ""),
    };
  }

  const bva = buildBudgetVsActual(transactions, budgetData, resolvedMonth);
  const income = monthlyIncome(transactions, budgetData, resolvedMonth);
  const spentSoFar = bva.totalExpenses;
  const budgetTotal = bva.budgetExpenses;
  const remaining = budgetTotal - spentSoFar;
  const spentFractionOfBudget = budgetTotal > 0 ? Math.min(spentSoFar / budgetTotal, 1) : 0;

  return {
    month: resolvedMonth,
    monthlyIncome: income,
    spentSoFar,
    budgetTotal,
    remaining,
    underBudget: remaining >= 0,
    spentFractionOfBudget,
    savings: buildSavingsGoalProgress(transactions, budgetData, resolvedMonth),
  };
}

export interface CategorySpend {
  categoryId: string;
  category: string;
  amount: number;
}

/**
 * Spending-by-category for `month` (defaults to latest), descending by amount.
 * Reuses `buildBudgetVsActual`'s per-category actuals — the same grouping the
 * Summary/Budget tabs use — rather than re-implementing category rollup.
 */
export function buildSpendingByCategory(
  transactions: Transaction[],
  budgetData: BudgetData,
  month?: string,
): CategorySpend[] {
  const resolvedMonth = month ?? latestMonth(transactions);
  if (!resolvedMonth) return [];
  return buildBudgetVsActual(transactions, budgetData, resolvedMonth)
    .categories.filter((c) => c.actual > 0)
    .map((c) => ({ categoryId: c.categoryId, category: c.category, amount: Math.round(c.actual) }))
    .sort((a, b) => b.amount - a.amount);
}

/** Most recent `limit` transactions, newest first. */
export function getRecentTransactions(transactions: Transaction[], limit = 5): Transaction[] {
  return [...transactions]
    .sort((a, b) => txSortKey(b).localeCompare(txSortKey(a)))
    .slice(0, limit);
}
