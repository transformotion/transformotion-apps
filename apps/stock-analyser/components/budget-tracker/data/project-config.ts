/**
 * Project Configuration
 * Defines which categories and subcategories are treated as capital projects
 * These are excluded from monthly P&L calculations
 */

/**
 * Categories that are entirely project-based (lump sum budgets, not monthly)
 */
export const PROJECT_CATEGORIES = ["Renovations"]

/**
 * Specific subcategories within other categories that are treated as project items
 * e.g. "Capital purchases" within "Financial & Insurance"
 */
export const PROJECT_SUBCATEGORIES = ["Capital purchases"]

/**
 * Check if a category is a project category
 */
export function isProjectCategory(category: string): boolean {
  return PROJECT_CATEGORIES.includes(category)
}

/**
 * Check if a subcategory is a project subcategory
 */
export function isProjectSubcategory(subcategory: string): boolean {
  return PROJECT_SUBCATEGORIES.includes(subcategory)
}

/**
 * Check if a transaction should be excluded from monthly P&L
 * Based on category or subcategory being project-related
 */
export function isProjectTransaction(category: string, subcategory: string): boolean {
  return isProjectCategory(category) || isProjectSubcategory(subcategory)
}

/**
 * Default project budgets (lump sum totals)
 */
export const DEFAULT_PROJECT_BUDGETS: Record<string, number> = {
  "Renovations": 50000,
  "Capital purchases": 10000
}

/**
 * Get project budget
 */
export function getProjectBudget(categoryOrSubcategory: string): number {
  return DEFAULT_PROJECT_BUDGETS[categoryOrSubcategory] ?? 0
}
