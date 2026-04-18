/**
 * Budget Categories and Subcategories
 * Complete hierarchical structure for transaction categorization
 */

export const BUDGET_CATEGORIES: Record<string, string[]> = {
  "Income": [
    "Your take-home pay",
    "Your partner's take-home pay",
    "Bonuses / overtime",
    "Income from savings and investments",
    "Child support received",
    "School fees reimbursement",
    "Rent (investment property)",
    "Other income"
  ],
  "Home & utilities": [
    "Mortgage / rent",
    "Water",
    "Gas",
    "Electricity",
    "Mobile",
    "Internet",
    "Streaming Services",
    "Home improvements & Maintenance",
    "Furniture & appliances",
    "Council rates",
    "Body corporate fees",
    "Kierans Mobile",
    "Ellas Mobile"
  ],
  "Financial & Insurance": [
    "Savings",
    "Investments & super contributions",
    "Charity donations",
    "Paying off debt",
    "Credit card interest",
    "Other loans",
    "Car loan",
    "Home & contents insurance",
    "Health insurance",
    "Car insurance",
    "Personal & life insurance",
    "Transfer",
    "Capital purchases"
  ],
  "Groceries": [
    "Supermarket",
    "Deli & bakery",
    "Fruit & veg market",
    "Cleaning products",
    "Toiletries",
    "Pet food"
  ],
  "Medical, personal & education": [
    "Doctors & medical",
    "Medicines & pharmacy",
    "Glasses & eye care",
    "Dental",
    "Education",
    "Computers & gadgets",
    "Sports & gym",
    "Clothing & shoes",
    "Cosmetics",
    "Hair & beauty",
    "Shopping",
    "Hobbies",
    "Pet care / vet / pet insurance"
  ],
  "Eating-out & Entertainment": [
    "Coffee & tea",
    "Lunches bought",
    "Take-away & snacks",
    "Drinks & alcohol",
    "Restaurants",
    "Bars & clubs",
    "Movies shows & music",
    "Books newspapers & magazines",
    "Celebrations & gifts",
    "Holidays"
  ],
  "Car & Transport": [
    "Petrol",
    "Road tolls & parking",
    "Repairs & maintenance",
    "Rego & licence",
    "Uber & taxi",
    "Public Transport",
    "Airfares"
  ],
  "Children": [
    "Children Clothing",
    "Childcare",
    "Babysitting",
    "School fees",
    "School uniforms",
    "Excursions",
    "Other school needs",
    "Children Sports & activities",
    "Toys",
    "Child support payment"
  ],
  "Renovations": [
    "Planning & design",
    "Building & labour",
    "Materials & supplies",
    "Fixtures & fittings",
    "Appliances",
    "Landscaping & outdoor",
    "Other renovation costs"
  ]
}

// Helper to get all categories as an array
export const CATEGORY_LIST = Object.keys(BUDGET_CATEGORIES)

// Helper to get all subcategories for a category
export function getSubcategories(category: string): string[] {
  return BUDGET_CATEGORIES[category] || []
}

// Helper to find which category a subcategory belongs to
export function findCategoryForSubcategory(subcategory: string): string | null {
  for (const [category, subs] of Object.entries(BUDGET_CATEGORIES)) {
    if (subs.includes(subcategory)) {
      return category
    }
  }
  return null
}

// Helper to check if a subcategory exists in any category
export function isValidSubcategory(subcategory: string): boolean {
  return findCategoryForSubcategory(subcategory) !== null
}
