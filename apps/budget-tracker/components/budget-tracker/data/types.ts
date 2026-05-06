/**
 * Budget Tracker Type Definitions
 */

// Canonical cross-boundary types — source of truth in /contracts/budget-tracker/data-models.md
import type { Transaction } from '@transformotion/budget-domain'
export type { Transaction, CustomRule } from '@transformotion/budget-domain'

/**
 * Account model - for multi-user support
 */
export interface Account {
  accountId: string
  ownerId: string
  name: string
  createdAt: string
}

/**
 * Account member
 */
export interface AccountMember {
  accountId: string
  userId: string
  email: string
  role: "owner" | "member"
  invitedAt: string
  acceptedAt?: string
  status: "pending" | "active"
}

/**
 * Invitation to join an account
 */
export interface Invitation {
  invitationId: string
  accountId: string
  email: string
  invitedBy: string
  createdAt: string
  expiresAt: string
  status: "pending" | "accepted" | "expired"
}

/**
 * CSV format mapping for import
 */
export interface CSVFormatMapping {
  accountId: string
  formatName: string
  bankName: string
  dateColumn: number
  descriptionColumn: number
  amountColumn?: number
  debitColumn?: number
  creditColumn?: number
  balanceColumn?: number
  dateFormat: string
  skipHeaderRows: number
  createdAt: string
}

/**
 * Settings stored in DynamoDB (flat structure)
 */
export interface BudgetSettings {
  budgetOverrides: Record<string, number>      // subcategory -> monthly amount (-1 = tombstoned)
  budgetFreqs: Record<string, BudgetFrequency> // subcategory -> frequency
  customCategories: Record<string, string[]>   // category -> custom subcategories
  deletedCategories: string[]                  // top-level categories hidden from view
  customTopCategories: string[]                // user-created top-level recurring categories
  projectBudgets: Record<string, number>       // project name -> lump sum budget
  projectTasks: Record<string, string[]>       // project name -> custom task names
  customProjectCategories: string[]            // user-created project categories
  deletedProjectCategories: string[]           // project categories hidden from view (Budget tab restore section)
  disabledProjectCategories: string[]          // completed projects - hidden from category dropdowns but still visible on Budget tab
  csvFormatMappings?: Record<string, unknown>  // saved CSV column mappings keyed by bank name
}

export type BudgetFrequency = "weekly" | "fortnightly" | "monthly" | "quarterly" | "annually"

/**
 * Tab IDs for navigation
 */
export type BudgetTabId = "transactions" | "summary" | "budget" | "cashflow" | "rules" | "review"

/**
 * Filter state for transactions
 */
export interface TransactionFilters {
  dateRange: { start: Date; end: Date } | null
  category: string | null
  subcategory: string | null
  bankAccount: string | null
  source: string | null
  businessFilter: "all" | "personal" | "business"
  uncategorizedOnly: boolean
}

/**
 * P&L summary for a period
 */
export interface PLSummary {
  totalIncome: number
  totalExpenses: number
  netSavings: number
  savingsRate: number
  byCategory: Record<string, CategorySummary>
  projectSpend: Record<string, number>
  businessExpenses: number
}

export interface CategorySummary {
  total: number
  budget: number
  bySubcategory: Record<string, SubcategorySummary>
}

export interface SubcategorySummary {
  total: number
  budget: number
  transactions: Transaction[]
}
