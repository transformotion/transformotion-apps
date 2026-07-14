import { describe, it, expect } from "vitest";
import { normaliseBudgetData } from "../normalise";
import type { BudgetData, SavingsGoal } from "../contracts";

const SUB = "sub-emergency";

const base: BudgetData = {
  categories: [
    {
      categoryId: "cat-1",
      name: "Savings",
      type: "regular",
      displayOrder: 1,
      subcategories: [
        { subcategoryId: SUB, name: "Emergency", displayOrder: 1 },
        { subcategoryId: "sub-other", name: "Other", displayOrder: 2 },
      ],
    },
  ],
  budgetAmounts: {},
  budgetFrequencies: {},
};

/** Attach a legacy (pre-m16.12.0) savingsGoal shape as persisted data would carry it. */
function withLegacyGoal(goal: unknown): BudgetData {
  return { ...base, savingsGoal: goal as SavingsGoal };
}

describe("normaliseBudgetData", () => {
  it("old shape WITH link → explicit goal + linked subcategory gains role:'savings'", () => {
    const out = normaliseBudgetData(withLegacyGoal({ targetAmount: 2500, linkedSubcategoryId: SUB }));
    expect(out.savingsGoal).toEqual({ mode: "explicit", targetAmount: 2500 });
    expect(out.categories[0].subcategories.find((s) => s.subcategoryId === SUB)?.role).toBe("savings");
    // other subcategories are untouched
    expect(out.categories[0].subcategories.find((s) => s.subcategoryId === "sub-other")?.role).toBeUndefined();
  });

  it("old shape WITHOUT link → explicit goal, categories untouched", () => {
    const out = normaliseBudgetData(withLegacyGoal({ targetAmount: 1200 }));
    expect(out.savingsGoal).toEqual({ mode: "explicit", targetAmount: 1200 });
    expect(out.categories).toEqual(base.categories);
  });

  it("new explicit shape passes through untouched (same reference)", () => {
    const input = { ...base, savingsGoal: { mode: "explicit", targetAmount: 999 } as SavingsGoal };
    expect(normaliseBudgetData(input)).toBe(input);
  });

  it("new derived shape passes through untouched (same reference)", () => {
    const input = { ...base, savingsGoal: { mode: "derived" } as SavingsGoal };
    expect(normaliseBudgetData(input)).toBe(input);
  });

  it("absent goal passes through untouched (same reference)", () => {
    expect(normaliseBudgetData(base)).toBe(base);
  });

  it("legacy shape with a non-numeric target is dropped defensively", () => {
    const out = normaliseBudgetData(withLegacyGoal({ linkedSubcategoryId: SUB }));
    expect(out.savingsGoal).toBeUndefined();
  });
});
