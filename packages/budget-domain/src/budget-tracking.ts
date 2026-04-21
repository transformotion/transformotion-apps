import type { Transaction, BudgetSettings, CategoryTree, Frequency } from "./contracts.js";
import { isExcludedFromCashflow, PROJECT_CATEGORIES } from "./exclusions.js";

export const FREQ_FACTORS: Record<Frequency, number> = {
  weekly: 52 / 12,
  fortnightly: 26 / 12,
  monthly: 1,
  quarterly: 4 / 12,
  annually: 1 / 12,
};

// Default monthly budget amounts derived from the reference implementation.
// Keyed by subcategory name. 0 = no default budget set.
export const DEFAULT_BUDGETS: Record<string, number> = {
  "Your take-home pay":                  8000,
  "Your partner's take-home pay":        5000,
  "Mortgage / rent":                     3200,
  "Water":                                 60,
  "Gas":                                   40,
  "Electricity":                          150,
  "Mobile":                                60,
  "Internet":                              80,
  "Streaming Services":                    60,
  "Home improvements & Maintenance":      200,
  "Furniture & appliances":               100,
  "Council rates":                         80,
  "Kierans Mobile":                        30,
  "Ellas Mobile":                          30,
  "Home & contents insurance":            150,
  "Health insurance":                     300,
  "Car insurance":                        120,
  "Life & income insurance":              100,
  "Supermarket":                          800,
  "Doctors & medical":                    100,
  "Medicines & pharmacy":                  50,
  "Dental":                                50,
  "Glasses & eye care":                    20,
  "Education":                            100,
  "Computers & gadgets":                   50,
  "Sports & gym":                         100,
  "Clothing & shoes":                     150,
  "Hair & beauty":                         80,
  "Shopping":                             100,
  "Hobbies":                              100,
  "Restaurants & cafes":                  200,
  "Take-away & snacks":                   150,
  "Drinks & alcohol":                     100,
  "Holidays":                             200,
  "Petrol":                               200,
  "Road tolls & parking":                  50,
  "Repairs & maintenance":                100,
  "Rego & licence":                        30,
  "Uber & taxi":                           50,
  "Airfares":                             100,
  "School fees":                          200,
  "Children Clothing":                     50,
  "Toys":                                  50,
};

/** Convert a budgeted amount at a given frequency to a monthly equivalent. */
export function toMonthlyAmount(amount: number, freq: Frequency): number {
  return amount * FREQ_FACTORS[freq];
}

/** Return the effective monthly budget for a subcategory, applying overrides and frequency. */
export function getSubcategoryMonthlyBudget(
  subcategory: string,
  settings: Pick<BudgetSettings, "budgetOverrides" | "budgetFreqs">
): number {
  const override = settings.budgetOverrides[subcategory];
  // -1 = tombstoned
  if (override === -1) return 0;

  const raw = override !== undefined ? override : (DEFAULT_BUDGETS[subcategory] ?? 0);
  const freq = settings.budgetFreqs[subcategory] ?? "monthly";
  return toMonthlyAmount(raw, freq);
}

export interface SubcategoryActual {
  subcategory: string;
  category: string;
  actual: number;
  budget: number;
  overspend: number;
  count: number;
}

export interface CategoryActual {
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
  /** Number of calendar months spanned by the transaction set (min 1). */
  numMonths: number;
}

function txMonth(tx: Transaction): string | null {
  const p = tx.date.split("/");
  return p.length === 3 ? `${p[2]}-${p[1].padStart(2, "0")}` : null;
}

/**
 * Compute budget vs actual figures across all categories for a given month
 * selection or all months combined.
 *
 * @param transactions All visible transactions (pre-filtered for _ignore etc.)
 * @param settings Account budget settings
 * @param effectiveCategories Merged category tree (from buildEffectiveCategories)
 * @param filterMonth Optional "YYYY-MM" string to restrict to a single month
 */
export function buildBudgetVsActual(
  transactions: Transaction[],
  settings: Pick<BudgetSettings, "budgetOverrides" | "budgetFreqs">,
  effectiveCategories: CategoryTree,
  filterMonth?: string
): BudgetVsActual {
  const activeTx = filterMonth
    ? transactions.filter((t) => txMonth(t) === filterMonth)
    : transactions;

  const allMonths = new Set(transactions.map(txMonth).filter(Boolean));
  const numMonths = filterMonth ? 1 : Math.max(allMonths.size, 1);

  const totalIncome = activeTx
    .filter((t) => t.category === "Income")
    .reduce((s, t) => s + Math.abs(parseFloat(t.amount) || 0), 0);

  const totalExpenses = activeTx
    .filter((t) => t.category && t.category !== "Income" && !isExcludedFromCashflow(t))
    .reduce((s, t) => s + Math.abs(parseFloat(t.amount) || 0), 0);

  const budgetIncome = (effectiveCategories["Income"] ?? []).reduce(
    (s, sub) => s + getSubcategoryMonthlyBudget(sub, settings) * numMonths,
    0
  );

  const budgetExpenses = Object.keys(effectiveCategories)
    .filter((c) => c !== "Income" && !PROJECT_CATEGORIES.includes(c))
    .flatMap((c) => effectiveCategories[c])
    .reduce((s, sub) => s + getSubcategoryMonthlyBudget(sub, settings) * numMonths, 0);

  const categories: CategoryActual[] = Object.keys(effectiveCategories)
    .filter((c) => c !== "Income")
    .map((cat) => {
      const subs = effectiveCategories[cat] ?? [];
      const catTx = activeTx.filter(
        (t) => t.category === cat && !isExcludedFromCashflow(t)
      );
      const actual = catTx.reduce((s, t) => s + Math.abs(parseFloat(t.amount) || 0), 0);
      const budget = subs.reduce(
        (s, sub) => s + getSubcategoryMonthlyBudget(sub, settings) * numMonths,
        0
      );

      const subMap: Record<string, { actual: number; count: number }> = {};
      catTx.forEach((t) => {
        if (!t.subcategory) return;
        subMap[t.subcategory] ??= { actual: 0, count: 0 };
        subMap[t.subcategory].actual += Math.abs(parseFloat(t.amount) || 0);
        subMap[t.subcategory].count++;
      });

      const subcategories: SubcategoryActual[] = subs.map((sub) => {
        const subActual = subMap[sub]?.actual ?? 0;
        const subBudget = getSubcategoryMonthlyBudget(sub, settings) * numMonths;
        return {
          subcategory: sub,
          category: cat,
          actual: subActual,
          budget: subBudget,
          overspend: subActual - subBudget,
          count: subMap[sub]?.count ?? 0,
        };
      });

      return { category: cat, actual, budget, count: catTx.length, subcategories };
    });

  return { categories, totalIncome, totalExpenses, budgetIncome, budgetExpenses, numMonths };
}
