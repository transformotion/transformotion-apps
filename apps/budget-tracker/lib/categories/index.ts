import type { Category, Subcategory, BudgetFrequency } from '@transformotion/budget-domain'

export type { BudgetFrequency }

export function getCategoryById(categories: Category[], id: string): Category | undefined {
  return categories.find(c => c.categoryId === id)
}

export function getSubcategoryById(categories: Category[], subcategoryId: string): Subcategory | undefined {
  for (const cat of categories) {
    const sub = cat.subcategories.find(s => s.subcategoryId === subcategoryId)
    if (sub) return sub
  }
  return undefined
}

export function getCategoryForSubcategory(categories: Category[], subcategoryId: string): Category | undefined {
  return categories.find(c => c.subcategories.some(s => s.subcategoryId === subcategoryId))
}

export function getCategoriesByType(categories: Category[], type: 'regular' | 'capital'): Category[] {
  return categories.filter(c => !c.deleted && c.type === type).sort((a, b) => a.displayOrder - b.displayOrder)
}

export function getActiveCategories(categories: Category[]): Category[] {
  return categories.filter(c => !c.deleted).sort((a, b) => a.displayOrder - b.displayOrder)
}

export function getActiveSubcategories(category: Category): Subcategory[] {
  return category.subcategories.filter(s => !s.deleted).sort((a, b) => a.displayOrder - b.displayOrder)
}

export function getDisplayLabel(
  categories: Category[],
  categoryId: string | null,
  subcategoryId: string | null,
  fallbackCategory?: string,
  fallbackSubcategory?: string,
): string {
  if (categoryId || subcategoryId) {
    if (subcategoryId) {
      const sub = getSubcategoryById(categories, subcategoryId)
      if (sub) return sub.name
    }
    if (categoryId) {
      const cat = getCategoryById(categories, categoryId)
      if (cat) return cat.name
    }
  }
  if (fallbackSubcategory) return fallbackSubcategory
  if (fallbackCategory) return fallbackCategory
  return 'Uncategorised'
}

export function getCategoryName(categories: Category[], categoryId: string | null): string {
  if (!categoryId) return ''
  return getCategoryById(categories, categoryId)?.name ?? ''
}

export function getSubcategoryName(categories: Category[], subcategoryId: string | null): string {
  if (!subcategoryId) return ''
  return getSubcategoryById(categories, subcategoryId)?.name ?? ''
}

export function isCapital(categories: Category[], categoryId: string | null): boolean {
  if (!categoryId) return false
  return getCategoryById(categories, categoryId)?.type === 'capital'
}

export function excludeFromCashflow(categories: Category[], subcategoryId: string | null): boolean {
  if (!subcategoryId) return false
  return getSubcategoryById(categories, subcategoryId)?.excludeFromCashflow === true
}

export const FREQUENCY_LABELS: Record<BudgetFrequency, string> = {
  weekly: 'Weekly',
  fortnightly: 'Fortnightly',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  annually: 'Annually',
  'one-off': 'One-off',
}

export const FREQUENCY_TO_MONTHLY: Record<BudgetFrequency, number> = {
  weekly: 52 / 12,
  fortnightly: 26 / 12,
  monthly: 1,
  quarterly: 4 / 12,
  annually: 1 / 12,
  'one-off': 0,
}

export function toMonthlyAmount(amount: number, frequency: BudgetFrequency): number {
  return amount * FREQUENCY_TO_MONTHLY[frequency]
}

export function fromMonthlyAmount(monthlyAmount: number, frequency: BudgetFrequency): number {
  const factor = FREQUENCY_TO_MONTHLY[frequency]
  return factor > 0 ? monthlyAmount / factor : 0
}
