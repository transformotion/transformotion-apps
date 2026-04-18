/**
 * Category Color Mapping
 * Maps each category to a Tailwind color for consistent UI theming
 */

export const CATEGORY_COLORS: Record<string, string> = {
  "Income": "emerald",
  "Home & utilities": "blue",
  "Financial & Insurance": "purple",
  "Groceries": "green",
  "Medical, personal & education": "pink",
  "Eating-out & Entertainment": "orange",
  "Car & Transport": "yellow",
  "Children": "rose",
  "Renovations": "amber",
  "Uncategorised": "gray"
}

/**
 * Get the Tailwind color class for a category
 */
export function getCategoryColor(category: string): string {
  return CATEGORY_COLORS[category] || CATEGORY_COLORS["Uncategorised"]
}

/**
 * Get background color class for a category badge
 */
export function getCategoryBgClass(category: string): string {
  const color = getCategoryColor(category)
  return `bg-${color}-500/15`
}

/**
 * Get text color class for a category badge
 */
export function getCategoryTextClass(category: string): string {
  const color = getCategoryColor(category)
  return `text-${color}-400`
}

/**
 * Get full badge classes for a category
 */
export function getCategoryBadgeClasses(category: string): string {
  const color = getCategoryColor(category)
  return `bg-${color}-500/15 text-${color}-400`
}

/**
 * Get dot/indicator color class for a category
 */
export function getCategoryDotClass(category: string): string {
  const color = getCategoryColor(category)
  return `bg-${color}-400`
}

/**
 * Mapping of color names to actual hex values (for charts)
 */
export const COLOR_HEX_VALUES: Record<string, string> = {
  "emerald": "#10b981",
  "blue": "#3b82f6",
  "purple": "#a855f7",
  "green": "#22c55e",
  "pink": "#ec4899",
  "orange": "#f97316",
  "yellow": "#eab308",
  "rose": "#f43f5e",
  "amber": "#f59e0b",
  "gray": "#6b7280"
}

/**
 * Get hex color value for a category (for charts)
 */
export function getCategoryHexColor(category: string): string {
  const colorName = getCategoryColor(category)
  return COLOR_HEX_VALUES[colorName] || COLOR_HEX_VALUES["gray"]
}
