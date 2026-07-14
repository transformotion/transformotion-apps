import type { Transaction, BudgetData, BudgetFrequency, Category } from "./contracts";
import { collectIncomeHolderIds, collectSavingsHolderIds, isIncomeCategory, isRoleTransaction } from "./roles";

export const FREQ_FACTORS: Record<BudgetFrequency, number> = {
  weekly: 52 / 12,
  fortnightly: 26 / 12,
  monthly: 1,
  quarterly: 4 / 12,
  annually: 1 / 12,
  "one-off": 0,
};

/** Convert a budgeted amount at a given frequency to a monthly equivalent. */
export function toMonthlyAmount(amount: number, freq: BudgetFrequency): number {
  return amount * (FREQ_FACTORS[freq] ?? 0);
}

/** Return the effective monthly budget for a subcategory. */
export function getSubcategoryMonthlyBudget(
  subcategoryId: string,
  budgetData: Pick<BudgetData, "budgetAmounts" | "budgetFrequencies">
): number {
  const amount = budgetData.budgetAmounts[subcategoryId] ?? 0;
  const freq = (budgetData.budgetFrequencies[subcategoryId] ?? "monthly") as BudgetFrequency;
  return toMonthlyAmount(amount, freq);
}

export interface BudgetSummary {
  totalIncome: number;
  totalExpenses: number;
  net: number;
  isSurplus: boolean;
}

/**
 * Planned monthly budget summary — income vs expenses vs net from the BUDGETED
 * amounts (not actuals). Savings-role holders are set aside, not spent, so they
 * are EXCLUDED from expenses — same class as capital/Transfer/_business
 * (behaviour.md § "Exclusion"). Capital categories are excluded too. This is the
 * single source for the Budget-tab surplus/deficit banner.
 */
export function buildBudgetSummary(budgetData: BudgetData): BudgetSummary {
  const incomeHolders = collectIncomeHolderIds(budgetData.categories);
  const savingsHolders = collectSavingsHolderIds(budgetData.categories);

  let totalIncome = 0;
  let totalExpenses = 0;
  for (const cat of budgetData.categories) {
    if (cat.deleted || cat.type === "capital") continue;
    for (const sub of getActiveSubs(cat)) {
      const monthly = getSubcategoryMonthlyBudget(sub.subcategoryId, budgetData);
      if (incomeHolders.subcategoryIds.has(sub.subcategoryId)) {
        totalIncome += monthly;
      } else if (savingsHolders.subcategoryIds.has(sub.subcategoryId)) {
        continue; // set aside, not spending
      } else {
        totalExpenses += monthly;
      }
    }
  }

  const net = totalIncome - totalExpenses;
  return { totalIncome, totalExpenses, net, isSurplus: net >= 0 };
}

export interface SubcategoryActual {
  subcategoryId: string;
  name: string;
  category: string;
  actual: number;
  budget: number;
  overspend: number;
  count: number;
}

export interface CategoryActual {
  categoryId: string;
  category: string;
  actual: number;
  budget: number;
  count: number;
  subcategories: SubcategoryActual[];
}

export interface BudgetVsActual {
  categories: CategoryActual[];
  totalIncome: number;
  totalExpenses: number;
  budgetIncome: number;
  budgetExpenses: number;
  numMonths: number;
}

function txMonth(tx: Transaction): string | null {
  const p = tx.date.split("/");
  return p.length === 3 ? `${p[2]}-${p[1].padStart(2, "0")}` : null;
}

function getActiveSubs(cat: Category) {
  return cat.subcategories.filter(s => !s.deleted);
}

/**
 * Compute budget vs actual figures across all categories.
 * Uses categoryId/subcategoryId UUID fields; falls back to legacy category/subcategory strings.
 */
export function buildBudgetVsActual(
  transactions: Transaction[],
  budgetData: BudgetData,
  filterMonth?: string
): BudgetVsActual {
  const activeTx = filterMonth
    ? transactions.filter((t) => txMonth(t) === filterMonth)
    : transactions;

  const allMonths = new Set(transactions.map(txMonth).filter(Boolean));
  const numMonths = filterMonth ? 1 : Math.max(allMonths.size, 1);

  const regularCats = budgetData.categories.filter(c => !c.deleted && c.type === "regular");
  const incomeHolders = collectIncomeHolderIds(budgetData.categories);
  // Savings-role holders are excluded from expense aggregates (set-aside, not
  // spent) — same class as Transfer/_business/capital. behaviour.md § "Exclusion".
  const savingsHolders = collectSavingsHolderIds(budgetData.categories);

  const totalIncome = activeTx
    .filter(t => isRoleTransaction(t, incomeHolders))
    .reduce((s, t) => s + Math.abs(parseFloat(t.amount) || 0), 0);

  const totalExpenses = activeTx
    .filter(t => {
      if (t._business) return false;
      if (isRoleTransaction(t, incomeHolders)) return false;
      if (isRoleTransaction(t, savingsHolders)) return false;
      if (t.subcategoryId) {
        const sub = budgetData.categories
          .flatMap(c => c.subcategories)
          .find(s => s.subcategoryId === t.subcategoryId);
        if (sub?.excludeFromCashflow) return false;
      }
      const cat = budgetData.categories.find(c => c.categoryId === t.categoryId);
      if (cat?.type === "capital") return false;
      const catName = cat?.name || t.category;
      return !!catName;
    })
    .reduce((s, t) => s + Math.abs(parseFloat(t.amount) || 0), 0);

  const budgetIncome = regularCats
    .flatMap(c => getActiveSubs(c))
    .filter(sub => incomeHolders.subcategoryIds.has(sub.subcategoryId))
    .reduce((s, sub) => s + getSubcategoryMonthlyBudget(sub.subcategoryId, budgetData) * numMonths, 0);

  const budgetExpenses = regularCats
    .filter(c => !isIncomeCategory(c))
    .flatMap(c => getActiveSubs(c))
    .filter(sub => !incomeHolders.subcategoryIds.has(sub.subcategoryId))
    .filter(sub => !savingsHolders.subcategoryIds.has(sub.subcategoryId))
    .reduce((s, sub) => s + getSubcategoryMonthlyBudget(sub.subcategoryId, budgetData) * numMonths, 0);

  const categories: CategoryActual[] = regularCats
    .filter(c => !isIncomeCategory(c))
    .map(cat => {
      const activeSubs = getActiveSubs(cat);
      const catTx = activeTx.filter(t => {
        if (t._business) return false;
        if (isRoleTransaction(t, savingsHolders)) return false;
        if (t.subcategoryId) {
          const sub = budgetData.categories.flatMap(c => c.subcategories).find(s => s.subcategoryId === t.subcategoryId);
          if (sub?.excludeFromCashflow) return false;
        }
        return t.categoryId === cat.categoryId || (!t.categoryId && t.category === cat.name);
      });
      const actual = catTx.reduce((s, t) => s + Math.abs(parseFloat(t.amount) || 0), 0);
      const budget = activeSubs.reduce(
        (s, sub) => s + getSubcategoryMonthlyBudget(sub.subcategoryId, budgetData) * numMonths,
        0
      );

      const subActuals: Record<string, { actual: number; count: number }> = {};
      catTx.forEach(t => {
        const key = t.subcategoryId ?? t.subcategory ?? "";
        if (!key) return;
        subActuals[key] ??= { actual: 0, count: 0 };
        subActuals[key].actual += Math.abs(parseFloat(t.amount) || 0);
        subActuals[key].count++;
      });

      const subcategories: SubcategoryActual[] = activeSubs.map(sub => {
        const key = subActuals[sub.subcategoryId] ?? subActuals[sub.name];
        const subActual = key?.actual ?? 0;
        const subBudget = getSubcategoryMonthlyBudget(sub.subcategoryId, budgetData) * numMonths;
        return {
          subcategoryId: sub.subcategoryId,
          name: sub.name,
          category: cat.name,
          actual: subActual,
          budget: subBudget,
          overspend: subActual - subBudget,
          count: key?.count ?? 0,
        };
      });

      return { categoryId: cat.categoryId, category: cat.name, actual, budget, count: catTx.length, subcategories };
    });

  return { categories, totalIncome, totalExpenses, budgetIncome, budgetExpenses, numMonths };
}
