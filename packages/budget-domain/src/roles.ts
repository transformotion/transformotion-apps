import type { Category, CategoryRole, Transaction } from "./contracts";

/**
 * M21 — role-based income/savings classification.
 *
 * Supersedes the deprecated `name === "Income"` string match that previously
 * lived across budget-tracking / cashflow / the tab components. A holder (a
 * `Category` OR a `Subcategory`) carries an optional user-assigned `role`;
 * income for dashboard/cashflow purposes = Σ transactions classified into any
 * holder with `role: 'income'`. Roles are user-assigned, multiple holders are
 * allowed, and a role NEVER affects budget limits — it is purely a
 * classification signal. See spec/budget-tracker/behaviour.md § "Category roles".
 */
export interface RoleHolderIds {
  /** categoryIds of categories that carry the role directly. */
  categoryIds: Set<string>;
  /**
   * subcategoryIds that carry the role — either directly on the subcategory, or
   * inherited because their parent category carries the role. A transaction
   * assigned to such a subcategory is classified into the role regardless of
   * which category the subcategory sits under.
   */
  subcategoryIds: Set<string>;
}

/** Collect the (active) category + subcategory ids that hold `role`. */
export function collectRoleHolderIds(categories: Category[], role: CategoryRole): RoleHolderIds {
  const categoryIds = new Set<string>();
  const subcategoryIds = new Set<string>();
  for (const cat of categories) {
    if (cat.deleted) continue;
    const catHasRole = cat.role === role;
    if (catHasRole) categoryIds.add(cat.categoryId);
    for (const sub of cat.subcategories) {
      if (sub.deleted) continue;
      // A subcategory holds the role directly, or inherits it from its parent
      // category so that transactions filed under that category's subcategories
      // still classify correctly.
      if (catHasRole || sub.role === role) subcategoryIds.add(sub.subcategoryId);
    }
  }
  return { categoryIds, subcategoryIds };
}

/** Convenience: income holders. */
export function collectIncomeHolderIds(categories: Category[]): RoleHolderIds {
  return collectRoleHolderIds(categories, "income");
}

/** Convenience: savings holders. */
export function collectSavingsHolderIds(categories: Category[]): RoleHolderIds {
  return collectRoleHolderIds(categories, "savings");
}

/**
 * True when a transaction is classified into one of the given role holders —
 * matched by its subcategory first (most specific), then its category.
 */
export function isRoleTransaction(t: Transaction, holders: RoleHolderIds): boolean {
  if (t.subcategoryId && holders.subcategoryIds.has(t.subcategoryId)) return true;
  if (t.categoryId && holders.categoryIds.has(t.categoryId)) return true;
  return false;
}

/** A category carries the income role. */
export function isIncomeCategory(cat: Pick<Category, "role">): boolean {
  return cat.role === "income";
}

/** A category carries the savings role. */
export function isSavingsCategory(cat: Pick<Category, "role">): boolean {
  return cat.role === "savings";
}
