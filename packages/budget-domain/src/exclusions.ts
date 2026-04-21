import type { Transaction } from "./contracts.js";

export const PROJECT_CATEGORIES = ["Renovations"];
export const PROJECT_SUBCATEGORIES = ["Capital purchases"];

export interface ExclusionConfig {
  projectCategories?: string[];
  projectSubcategories?: string[];
}

/**
 * Returns true if a transaction should be excluded from personal P&L.
 *
 * A transaction is excluded if ANY of these are true:
 * 1. subcategory === "Transfer"  (own-account movements)
 * 2. _business === true          (business expense)
 * 3. category is a project category (e.g. "Renovations")
 * 4. subcategory is a project subcategory (e.g. "Capital purchases")
 *
 * Excluded transactions are still visible in the Transactions tab.
 */
export function isExcludedFromCashflow(
  tx: Transaction,
  config: ExclusionConfig = {}
): boolean {
  const projCats = config.projectCategories ?? PROJECT_CATEGORIES;
  const projSubs = config.projectSubcategories ?? PROJECT_SUBCATEGORIES;

  if (tx.subcategory === "Transfer") return true;
  if (tx._business) return true;
  if (projCats.includes(tx.category as string)) return true;
  if (projSubs.includes(tx.subcategory as string)) return true;

  return false;
}
