/**
 * Category Color Mapping - M18 corporate palette
 *
 * Single source of truth for category colours across Budget Tracker. Values are
 * corporate-palette hex codes so inline chart fills, bars, dots, and badges stay
 * on-brand without changing category names or data shape.
 */

export const CATEGORY_COLORS: Record<string, string> = {
  "Income": "#1E8E5A",
  "Home & utilities": "#23476B",
  "Financial & Insurance": "#587494",
  "Groceries": "#2F9E8F",
  "Medical, personal & education": "#33C1C5",
  "Eating-out & Entertainment": "#DCA331",
  "Car & Transport": "#B7791F",
  "Children": "#8F9AA4",
  "Renovations": "#C77F3A",
  "Uncategorised": "#A8B2BB",
  "default": "#A8B2BB",
}

/**
 * Get the corporate hex colour for a category.
 */
export function getCategoryColor(category: string): string {
  return CATEGORY_COLORS[category] || CATEGORY_COLORS["default"]
}

/**
 * Get hex color value for a category (for charts)
 */
export function getCategoryHexColor(category: string): string {
  return getCategoryColor(category)
}

export function getCategoryBadgeStyle(category: string): {
  backgroundColor: string
  color: string
} {
  const hex = getCategoryColor(category)
  return { backgroundColor: `${hex}26`, color: hex }
}
