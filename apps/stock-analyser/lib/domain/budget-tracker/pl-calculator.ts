/**
 * P&L Calculator - Business Logic
 * 
 * Pure functions for financial calculations.
 * No I/O, no React - can run in browser or Lambda.
 */

export interface Transaction {
  _id: number
  date: string
  amount: string
  description: string
  category: string
  subcategory: string
  file: string
  _manual: boolean
  _business: boolean
}

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
  variance: number
  bySubcategory: Record<string, SubcategorySummary>
}

export interface SubcategorySummary {
  total: number
  budget: number
  variance: number
  count: number
}

export interface BudgetConfig {
  budgetOverrides: Record<string, number>
  budgetFreqs: Record<string, BudgetFrequency>
  projectBudgets: Record<string, number>
}

export type BudgetFrequency = 'weekly' | 'fortnightly' | 'monthly' | 'quarterly' | 'annually'

/**
 * Calculate monthly budget amount based on frequency.
 */
export function normalizeToMonthly(amount: number, frequency: BudgetFrequency): number {
  switch (frequency) {
    case 'weekly':
      return amount * 52 / 12
    case 'fortnightly':
      return amount * 26 / 12
    case 'monthly':
      return amount
    case 'quarterly':
      return amount / 3
    case 'annually':
      return amount / 12
    default:
      return amount
  }
}

/**
 * Parse date string (DD/MM/YYYY) to Date object.
 */
export function parseTransactionDate(dateStr: string): Date {
  const [day, month, year] = dateStr.split('/').map(Number)
  return new Date(year, month - 1, day)
}

/**
 * Get month key for grouping (YYYY-MM).
 */
export function getMonthKey(date: Date): string {
  return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`
}

/**
 * Filter transactions by date range.
 */
export function filterByDateRange(
  transactions: Transaction[],
  start: Date,
  end: Date
): Transaction[] {
  return transactions.filter(tx => {
    const txDate = parseTransactionDate(tx.date)
    return txDate >= start && txDate <= end
  })
}

/**
 * Filter transactions for P&L calculation.
 * Excludes business expenses and ignored transactions.
 */
export function filterForPL(transactions: Transaction[]): Transaction[] {
  return transactions.filter(tx => 
    !tx._business && 
    tx.category !== 'Ignore' &&
    tx.category !== 'Transfer'
  )
}

/**
 * Calculate P&L summary for a set of transactions.
 */
export function calculatePLSummary(
  transactions: Transaction[],
  budgetConfig?: BudgetConfig
): PLSummary {
  const filtered = filterForPL(transactions)
  
  let totalIncome = 0
  let totalExpenses = 0
  let businessExpenses = 0
  const byCategory: Record<string, CategorySummary> = {}
  const projectSpend: Record<string, number> = {}
  
  // Calculate business expenses (before filtering)
  for (const tx of transactions) {
    if (tx._business) {
      const amount = parseFloat(tx.amount)
      if (amount < 0) {
        businessExpenses += Math.abs(amount)
      }
    }
  }
  
  // Process filtered transactions
  for (const tx of filtered) {
    const amount = parseFloat(tx.amount)
    
    if (amount > 0) {
      totalIncome += amount
    } else {
      totalExpenses += Math.abs(amount)
    }
    
    // Skip uncategorized for category breakdown
    if (!tx.category) continue
    
    // Initialize category if needed
    if (!byCategory[tx.category]) {
      byCategory[tx.category] = {
        total: 0,
        budget: 0,
        variance: 0,
        bySubcategory: {},
      }
    }
    
    const cat = byCategory[tx.category]
    
    // Add to category total (expenses are negative, so we use abs)
    if (amount < 0) {
      cat.total += Math.abs(amount)
    }
    
    // Initialize subcategory if needed
    const subKey = tx.subcategory || 'Other'
    if (!cat.bySubcategory[subKey]) {
      cat.bySubcategory[subKey] = {
        total: 0,
        budget: 0,
        variance: 0,
        count: 0,
      }
    }
    
    const sub = cat.bySubcategory[subKey]
    if (amount < 0) {
      sub.total += Math.abs(amount)
    }
    sub.count++
  }
  
  // Apply budgets if provided
  if (budgetConfig) {
    for (const [subcategoryPath, budgetAmount] of Object.entries(budgetConfig.budgetOverrides)) {
      if (budgetAmount < 0) continue // Tombstoned
      
      const [category, subcategory] = subcategoryPath.includes('/')
        ? subcategoryPath.split('/')
        : [subcategoryPath, 'Other']
      
      const freq = budgetConfig.budgetFreqs[subcategoryPath] || 'monthly'
      const monthlyBudget = normalizeToMonthly(budgetAmount, freq)
      
      if (byCategory[category]?.bySubcategory[subcategory]) {
        byCategory[category].bySubcategory[subcategory].budget = monthlyBudget
        byCategory[category].bySubcategory[subcategory].variance = 
          monthlyBudget - byCategory[category].bySubcategory[subcategory].total
      }
    }
    
    // Calculate category totals from subcategories
    for (const cat of Object.values(byCategory)) {
      cat.budget = Object.values(cat.bySubcategory).reduce((sum, sub) => sum + sub.budget, 0)
      cat.variance = cat.budget - cat.total
    }
  }
  
  const netSavings = totalIncome - totalExpenses
  const savingsRate = totalIncome > 0 ? (netSavings / totalIncome) * 100 : 0
  
  return {
    totalIncome,
    totalExpenses,
    netSavings,
    savingsRate,
    byCategory,
    projectSpend,
    businessExpenses,
  }
}

/**
 * Group transactions by month.
 */
export function groupByMonth(
  transactions: Transaction[]
): Record<string, Transaction[]> {
  const groups: Record<string, Transaction[]> = {}
  
  for (const tx of transactions) {
    const date = parseTransactionDate(tx.date)
    const key = getMonthKey(date)
    
    if (!groups[key]) {
      groups[key] = []
    }
    groups[key].push(tx)
  }
  
  return groups
}

/**
 * Calculate monthly trend data.
 */
export function calculateMonthlyTrend(
  transactions: Transaction[],
  months: number = 12
): Array<{ month: string; income: number; expenses: number; savings: number }> {
  const now = new Date()
  const results: Array<{ month: string; income: number; expenses: number; savings: number }> = []
  
  for (let i = months - 1; i >= 0; i--) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const endDate = new Date(now.getFullYear(), now.getMonth() - i + 1, 0)
    const key = getMonthKey(date)
    
    const monthTxs = filterByDateRange(transactions, date, endDate)
    const filtered = filterForPL(monthTxs)
    
    let income = 0
    let expenses = 0
    
    for (const tx of filtered) {
      const amount = parseFloat(tx.amount)
      if (amount > 0) {
        income += amount
      } else {
        expenses += Math.abs(amount)
      }
    }
    
    results.push({
      month: key,
      income,
      expenses,
      savings: income - expenses,
    })
  }
  
  return results
}
