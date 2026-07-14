import type { BudgetData, SavingsGoal } from "./contracts";

/**
 * The OLD (pre-m16.12.0) savings-goal shape, kept only for the read-time
 * migration below. Fields are `unknown` because this is deserialised persisted
 * data that predates the discriminated-union `SavingsGoal`.
 */
interface LegacySavingsGoal {
  mode?: unknown;
  targetAmount?: unknown;
  linkedSubcategoryId?: unknown;
}

/**
 * Read-time migration shim for the m16.12.0 `SavingsGoal` reshape (#669).
 *
 * Normalises a persisted `BudgetData` whose `savingsGoal` may still be the OLD
 * shape (`{ targetAmount, linkedSubcategoryId? }`) into the new discriminated
 * union. This runs on READ at the repository layer; there is NO write-on-read —
 * the normalised shape persists naturally on the next write.
 *
 * - old shape (no `mode`, numeric `targetAmount`) → `{ mode: 'explicit', targetAmount }`
 * - if it carried a `linkedSubcategoryId` → that subcategory ADDITIONALLY receives
 *   `role: 'savings'` in the normalised output (savings tracking moves to the role)
 * - new shapes (`{ mode: 'explicit' | 'derived' }`) and an absent goal pass through
 *   untouched
 *
 * See spec/budget-tracker/behaviour.md § "Savings goal" and the m16.12.0 changelog.
 */
export function normaliseBudgetData(data: BudgetData): BudgetData {
  const goal = data.savingsGoal as LegacySavingsGoal | undefined;

  // Absent goal, or already the new shape (carries a string `mode`) → untouched.
  if (!goal || typeof goal.mode === "string") return data;

  // Old shape (no `mode`). A numeric target maps to explicit; anything else is
  // unusable legacy data — drop the goal defensively rather than surface junk.
  if (typeof goal.targetAmount !== "number") {
    return { ...data, savingsGoal: undefined };
  }

  const normalisedGoal: SavingsGoal = { mode: "explicit", targetAmount: goal.targetAmount };
  const linkedId = typeof goal.linkedSubcategoryId === "string" ? goal.linkedSubcategoryId : null;

  if (!linkedId) {
    return { ...data, savingsGoal: normalisedGoal };
  }

  // Ensure the previously-linked subcategory carries role:'savings' so the new
  // role-based progress/exclusion picks it up.
  const categories = data.categories.map((c) => ({
    ...c,
    subcategories: c.subcategories.map((s) =>
      s.subcategoryId === linkedId ? { ...s, role: "savings" as const } : s
    ),
  }));

  return { ...data, savingsGoal: normalisedGoal, categories };
}
