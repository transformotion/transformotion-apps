import type { CategoryTree, BudgetSettings } from "./contracts.js";

// Seed category tree — matches /contracts/budget-tracker/data-models.md
export const DEFAULT_CATEGORIES: CategoryTree = {
  "Income": [
    "Your take-home pay",
    "Your partner's take-home pay",
    "Bonuses / overtime",
    "Income from savings and investments",
    "Child support received",
    "School fees reimbursement",
    "Rent (investment property)",
    "Other income",
  ],
  "Home & utilities": [
    "Mortgage / rent", "Water", "Gas", "Electricity", "Mobile", "Internet",
    "Streaming Services", "Home improvements & Maintenance",
    "Furniture & appliances", "Council rates", "Body corporate fees",
    "Kierans Mobile", "Ellas Mobile",
  ],
  "Financial & Insurance": [
    "Home & contents insurance", "Health insurance", "Car insurance",
    "Life & income insurance", "Bank fees", "Interest paid",
    "Financial advice", "Computers & gadgets", "Capital purchases",
  ],
  "Groceries": ["Supermarket", "Butcher / bakery / deli", "Other groceries"],
  "Medical, personal & education": [
    "Doctors & medical", "Medicines & pharmacy", "Dental", "Glasses & eye care",
    "Hair & beauty", "Clothing & shoes", "Shopping", "Sports & gym", "Education",
  ],
  "Eating-out & Entertainment": [
    "Restaurants & cafes", "Take-away & snacks", "Drinks & alcohol",
    "Entertainment & events", "Subscriptions", "Hobbies", "Holidays",
  ],
  "Car & Transport": [
    "Petrol", "Road tolls & parking", "Repairs & maintenance",
    "Rego & licence", "Uber & taxi", "Airfares", "Public transport",
  ],
  "Children": [
    "Children Clothing", "Child support payment", "School fees",
    "Toys", "Child care",
  ],
  "Renovations": [],
  "Transfers": ["Transfer"],
};

/**
 * Build the effective category tree for a given account:
 * - Start with DEFAULT_CATEGORIES
 * - Merge in user's customCategories (custom order preserved, built-ins appended if absent)
 * - Filter out any subcategories in deletedSubs (tombstoned with budgetOverride === -1)
 */
export function buildEffectiveCategories(settings: Pick<BudgetSettings, "customCategories" | "deletedSubs">): CategoryTree {
  const deleted = new Set(settings.deletedSubs ?? []);

  return Object.fromEntries(
    Object.keys(DEFAULT_CATEGORIES).map((cat) => {
      const builtin = DEFAULT_CATEGORIES[cat].filter((s) => !deleted.has(s));
      const custom = settings.customCategories[cat];

      if (!custom) return [cat, builtin];

      const customFiltered = custom.filter((s) => !deleted.has(s));
      // Custom order first, then any built-in entries not already in custom
      const merged = [
        ...customFiltered,
        ...builtin.filter((s) => !customFiltered.includes(s)),
      ];
      return [cat, merged];
    })
  );
}
