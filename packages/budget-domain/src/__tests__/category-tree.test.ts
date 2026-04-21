import { describe, it, expect } from "vitest";
import { buildEffectiveCategories, DEFAULT_CATEGORIES } from "../category-tree.js";

describe("buildEffectiveCategories", () => {
  it("returns default categories when no customCategories or deletedSubs", () => {
    const result = buildEffectiveCategories({ customCategories: {}, deletedSubs: [] });
    expect(result["Income"]).toEqual(DEFAULT_CATEGORIES["Income"]);
    expect(result["Groceries"]).toEqual(DEFAULT_CATEGORIES["Groceries"]);
  });

  it("merges custom subcategories (custom order first, built-ins appended)", () => {
    const result = buildEffectiveCategories({
      customCategories: {
        "Groceries": ["Fruit & veg market", "Supermarket"],
      },
      deletedSubs: [],
    });
    expect(result["Groceries"][0]).toBe("Fruit & veg market");
    expect(result["Groceries"][1]).toBe("Supermarket");
    // Built-ins not in custom list are appended
    expect(result["Groceries"]).toContain("Butcher / bakery / deli");
    expect(result["Groceries"]).toContain("Other groceries");
  });

  it("filters out deletedSubs", () => {
    const result = buildEffectiveCategories({
      customCategories: {},
      deletedSubs: ["Supermarket"],
    });
    expect(result["Groceries"]).not.toContain("Supermarket");
    expect(result["Groceries"]).toContain("Butcher / bakery / deli");
  });

  it("filters deletedSubs from custom categories too", () => {
    const result = buildEffectiveCategories({
      customCategories: { "Groceries": ["Fruit & veg market", "Supermarket"] },
      deletedSubs: ["Fruit & veg market"],
    });
    expect(result["Groceries"]).not.toContain("Fruit & veg market");
    expect(result["Groceries"]).toContain("Supermarket");
  });
});
