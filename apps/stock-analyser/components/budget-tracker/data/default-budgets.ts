/**
 * Default Monthly Budget Amounts
 * Values in AUD per month
 * Subcategories not listed default to 0
 */

export const DEFAULT_BUDGETS: Record<string, number> = {
  // Income
  "Your take-home pay": 8000,
  "Your partner's take-home pay": 5000,
  "Bonuses / overtime": 0,
  "Income from savings and investments": 0,
  "Child support received": 0,
  "School fees reimbursement": 0,
  "Rent (investment property)": 0,
  "Other income": 0,

  // Home & utilities
  "Mortgage / rent": 3200,
  "Water": 60,
  "Gas": 40,
  "Electricity": 150,
  "Mobile": 60,
  "Internet": 80,
  "Streaming Services": 60,
  "Home improvements & Maintenance": 200,
  "Furniture & appliances": 100,
  "Council rates": 80,
  "Body corporate fees": 0,
  "Kierans Mobile": 30,
  "Ellas Mobile": 30,

  // Financial & Insurance
  "Savings": 500,
  "Investments & super contributions": 200,
  "Charity donations": 50,
  "Paying off debt": 0,
  "Credit card interest": 0,
  "Other loans": 0,
  "Car loan": 0,
  "Home & contents insurance": 150,
  "Health insurance": 300,
  "Car insurance": 120,
  "Personal & life insurance": 100,
  "Transfer": 0,
  "Capital purchases": 0,

  // Groceries
  "Supermarket": 800,
  "Deli & bakery": 50,
  "Fruit & veg market": 80,
  "Cleaning products": 40,
  "Toiletries": 60,
  "Pet food": 80,

  // Medical, personal & education
  "Doctors & medical": 100,
  "Medicines & pharmacy": 50,
  "Glasses & eye care": 20,
  "Dental": 50,
  "Education": 100,
  "Computers & gadgets": 50,
  "Sports & gym": 100,
  "Clothing & shoes": 150,
  "Cosmetics": 50,
  "Hair & beauty": 80,
  "Shopping": 100,
  "Hobbies": 100,
  "Pet care / vet / pet insurance": 80,

  // Eating-out & Entertainment
  "Coffee & tea": 150,
  "Lunches bought": 100,
  "Take-away & snacks": 150,
  "Drinks & alcohol": 100,
  "Restaurants": 200,
  "Bars & clubs": 50,
  "Movies shows & music": 50,
  "Books newspapers & magazines": 30,
  "Celebrations & gifts": 100,
  "Holidays": 200,

  // Car & Transport
  "Petrol": 200,
  "Road tolls & parking": 50,
  "Repairs & maintenance": 100,
  "Rego & licence": 30,
  "Uber & taxi": 50,
  "Public Transport": 50,
  "Airfares": 100,

  // Children
  "Children Clothing": 50,
  "Childcare": 0,
  "Babysitting": 50,
  "School fees": 200,
  "School uniforms": 30,
  "Excursions": 30,
  "Other school needs": 30,
  "Children Sports & activities": 100,
  "Toys": 50,
  "Child support payment": 0,

  // Renovations (Project - lump sum, not monthly)
  "Planning & design": 0,
  "Building & labour": 0,
  "Materials & supplies": 0,
  "Fixtures & fittings": 0,
  "Appliances": 0,
  "Landscaping & outdoor": 0,
  "Other renovation costs": 0,
}

/**
 * Get budget amount for a subcategory
 * Returns 0 if not found
 */
export function getBudget(subcategory: string): number {
  return DEFAULT_BUDGETS[subcategory] ?? 0
}

/**
 * Budget frequency options and their monthly conversion factors
 */
export type BudgetFrequency = "weekly" | "fortnightly" | "monthly" | "quarterly" | "annually"

export const FREQUENCY_TO_MONTHLY: Record<BudgetFrequency, number> = {
  "weekly": 52 / 12,       // 4.333
  "fortnightly": 26 / 12,  // 2.167
  "monthly": 1,
  "quarterly": 4 / 12,     // 0.333
  "annually": 1 / 12       // 0.083
}

export const FREQUENCY_LABELS: Record<BudgetFrequency, string> = {
  "weekly": "Weekly",
  "fortnightly": "Fortnightly",
  "monthly": "Monthly",
  "quarterly": "Quarterly",
  "annually": "Annually"
}

/**
 * Convert an amount from a given frequency to monthly
 */
export function toMonthlyAmount(amount: number, frequency: BudgetFrequency): number {
  return amount * FREQUENCY_TO_MONTHLY[frequency]
}

/**
 * Convert a monthly amount to a given frequency
 */
export function fromMonthlyAmount(monthlyAmount: number, frequency: BudgetFrequency): number {
  return monthlyAmount / FREQUENCY_TO_MONTHLY[frequency]
}
