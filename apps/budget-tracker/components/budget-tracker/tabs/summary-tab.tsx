"use client"

import { useState, useMemo } from "react"
import { useBudgetNavigation } from "../app-shell"
import { PageHeader, Card, EmptyState } from "@/components/ui/design-system"
import { ChevronLeft, ChevronRight, ChevronDown, PieChart, Briefcase } from "lucide-react"
import { BUDGET_CATEGORIES, CATEGORY_LIST } from "../data/categories"
import { CATEGORY_COLORS } from "../data/category-colors"
import { getBudget } from "../data/default-budgets"
import { PROJECT_CATEGORIES, PROJECT_SUBCATEGORIES, isProjectCategory, isProjectSubcategory, isProjectTransaction, DEFAULT_PROJECT_BUDGETS } from "../data/project-config"
import type { Transaction } from "../data/types"
import { cn } from "@/lib/utils"

// Parse date string to Date object
function parseDate(dateStr: string): Date {
  const [day, month, year] = dateStr.split("/").map(Number)
  return new Date(year, month - 1, day)
}

// Get month key for grouping (YYYY-MM)
function getMonthKey(dateStr: string): string {
  const date = parseDate(dateStr)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`
}

// Format month for display
function formatMonth(monthKey: string): string {
  const [year, month] = monthKey.split("-")
  const date = new Date(parseInt(year), parseInt(month) - 1)
  return date.toLocaleDateString("en-AU", { month: "long", year: "numeric" })
}

// Format currency
function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-AU", { 
    style: "currency", 
    currency: "AUD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount)
}

// Format date for drilldown
function formatDateShort(dateStr: string): string {
  const date = parseDate(dateStr)
  return date.toLocaleDateString("en-AU", { day: "numeric", month: "short" })
}

export function SummaryTab() {
  const { transactions, settings } = useBudgetNavigation()
  const budgetSettings = settings // alias for compatibility
  
  // Get available months from transactions
  const availableMonths = useMemo(() => {
    const months = new Set<string>()
    transactions.forEach(t => {
      if (t.date) {
        months.add(getMonthKey(t.date))
      }
    })
    return Array.from(months).sort().reverse() // Most recent first
  }, [transactions])
  
  // Current month state - defaults to most recent month with data, or current month
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
  })
  
  // Auto-switch to most recent month when transactions load
  const [hasAutoSwitched, setHasAutoSwitched] = useState(false)
  useMemo(() => {
    if (!hasAutoSwitched && availableMonths.length > 0) {
      setCurrentMonth(availableMonths[0])
      setHasAutoSwitched(true)
    }
  }, [availableMonths, hasAutoSwitched])
  
  // Expanded categories for drilldown
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set())
  const [expandedSubcategories, setExpandedSubcategories] = useState<Set<string>>(new Set())

  // Filter transactions for current month
  const monthTransactions = useMemo(() => {
    return transactions.filter(t => {
      const monthKey = getMonthKey(t.date)
      return monthKey === currentMonth
    })
  }, [transactions, currentMonth])

  // Calculate P&L summary (excluding business, transfers, projects, and ignored)
  const summary = useMemo(() => {
    const personalTransactions = monthTransactions.filter(t => 
      !t._business && 
      t.subcategory !== "Transfer" &&
      t.category !== "Ignore" &&
      !isProjectTransaction(t.category, t.subcategory)
    )
    
    let totalIncome = 0
    let totalExpenses = 0
    const byCategory: Record<string, { 
      total: number
      budget: number
      bySubcategory: Record<string, { total: number; budget: number; transactions: Transaction[] }>
    }> = {}
    
    // Initialize categories
    for (const category of CATEGORY_LIST) {
      if (isProjectCategory(category)) continue
      
      byCategory[category] = {
        total: 0,
        budget: 0,
        bySubcategory: {}
      }
      
      const subcategories = BUDGET_CATEGORIES[category] || []
      for (const sub of subcategories) {
        if (isProjectSubcategory(sub)) continue
        
        byCategory[category].bySubcategory[sub] = {
          total: 0,
          budget: budgetSettings.budgetOverrides?.[sub] ?? getBudget(sub),
          transactions: []
        }
        byCategory[category].budget += byCategory[category].bySubcategory[sub].budget
      }
    }
    
    // Process transactions
    for (const tx of personalTransactions) {
      const amount = parseFloat(tx.amount) || 0
      
      if (tx.category === "Income") {
        totalIncome += Math.abs(amount)
      } else if (tx.category && byCategory[tx.category]) {
        totalExpenses += Math.abs(amount)
      }
      
      // Add to category/subcategory totals
      if (tx.category && byCategory[tx.category]) {
        byCategory[tx.category].total += Math.abs(amount)
        
        if (tx.subcategory && byCategory[tx.category].bySubcategory[tx.subcategory]) {
          byCategory[tx.category].bySubcategory[tx.subcategory].total += Math.abs(amount)
          byCategory[tx.category].bySubcategory[tx.subcategory].transactions.push(tx)
        }
      }
    }
    
    const netSavings = totalIncome - totalExpenses
    const savingsRate = totalIncome > 0 ? (netSavings / totalIncome) * 100 : 0
    
    return { totalIncome, totalExpenses, netSavings, savingsRate, byCategory }
  }, [monthTransactions, budgetSettings])

  // Calculate project spending
  const projectSummary = useMemo(() => {
    const projectTransactions = monthTransactions.filter(t => 
      !t._business && isProjectTransaction(t.category, t.subcategory)
    )
    
    const byProject: Record<string, { 
      total: number
      budget: number
      bySubcategory: Record<string, { total: number; transactions: Transaction[] }>
    }> = {}
    
    // Initialize project categories
    for (const projectCat of PROJECT_CATEGORIES) {
      byProject[projectCat] = {
        total: 0,
        budget: budgetSettings.projectBudgets?.[projectCat] ?? DEFAULT_PROJECT_BUDGETS[projectCat] ?? 0,
        bySubcategory: {}
      }
      
      const subcategories = BUDGET_CATEGORIES[projectCat] || []
      for (const sub of subcategories) {
        byProject[projectCat].bySubcategory[sub] = { total: 0, transactions: [] }
      }
    }
    
    // Add Capital purchases as a special project
    byProject["Capital purchases"] = {
      total: 0,
      budget: budgetSettings.projectBudgets?.["Capital purchases"] ?? DEFAULT_PROJECT_BUDGETS["Capital purchases"] ?? 0,
      bySubcategory: {
        "Capital purchases": { total: 0, transactions: [] }
      }
    }
    
    // Process project transactions
    for (const tx of projectTransactions) {
      const amount = Math.abs(parseFloat(tx.amount) || 0)
      
      if (isProjectCategory(tx.category)) {
        byProject[tx.category].total += amount
        if (tx.subcategory && byProject[tx.category].bySubcategory[tx.subcategory]) {
          byProject[tx.category].bySubcategory[tx.subcategory].total += amount
          byProject[tx.category].bySubcategory[tx.subcategory].transactions.push(tx)
        }
      } else if (isProjectSubcategory(tx.subcategory)) {
        byProject[tx.subcategory].total += amount
        byProject[tx.subcategory].bySubcategory[tx.subcategory].total += amount
        byProject[tx.subcategory].bySubcategory[tx.subcategory].transactions.push(tx)
      }
    }
    
    const totalProjectSpend = Object.values(byProject).reduce((sum, p) => sum + p.total, 0)
    
    return { byProject, totalProjectSpend }
  }, [monthTransactions, budgetSettings])

  // Calculate business expenses
  const businessExpenses = useMemo(() => {
    return monthTransactions
      .filter(t => t._business)
      .reduce((sum, t) => sum + Math.abs(parseFloat(t.amount) || 0), 0)
  }, [monthTransactions])

  // Navigate months
  const goToPrevMonth = () => {
    const [year, month] = currentMonth.split("-").map(Number)
    const prevDate = new Date(year, month - 2)
    setCurrentMonth(`${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, "0")}`)
  }
  
  const goToNextMonth = () => {
    const [year, month] = currentMonth.split("-").map(Number)
    const nextDate = new Date(year, month)
    setCurrentMonth(`${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, "0")}`)
  }

  // Toggle category expansion
  const toggleCategory = (category: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev)
      if (next.has(category)) {
        next.delete(category)
      } else {
        next.add(category)
      }
      return next
    })
  }

  // Toggle subcategory expansion
  const toggleSubcategory = (key: string) => {
    setExpandedSubcategories(prev => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

  const hasTransactions = transactions.length > 0

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <PageHeader
        title="Summary"
        subtitle="Monthly income and expenses"
      />

      {/* Month Navigator */}
      <div className="flex items-center justify-between">
        <button
          onClick={goToPrevMonth}
          className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-surface2 transition-colors"
        >
          <ChevronLeft className="size-5" />
        </button>
        <h2 className="text-lg font-semibold text-foreground">{formatMonth(currentMonth)}</h2>
        <button
          onClick={goToNextMonth}
          className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-surface2 transition-colors"
        >
          <ChevronRight className="size-5" />
        </button>
      </div>

      {!hasTransactions ? (
        <EmptyState
          icon={PieChart}
          title="No data yet"
          description="Import transactions to see your monthly summary"
        />
      ) : (
        <>
          {/* P&L Overview Card */}
          <Card className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-muted-foreground">Personal Budget</h3>
              <span className="text-[10px] text-muted-foreground">(excludes business & projects)</span>
            </div>
            
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Income</p>
                <p className="text-xl font-bold text-signal-green">{formatCurrency(summary.totalIncome)}</p>
              </div>
              
              <div className="text-center">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Expenses</p>
                <p className="text-xl font-bold text-signal-red">{formatCurrency(summary.totalExpenses)}</p>
              </div>
              
              <div className="text-center">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Net</p>
                <p className={cn(
                  "text-xl font-bold",
                  summary.netSavings >= 0 ? "text-primary" : "text-signal-red"
                )}>
                  {formatCurrency(summary.netSavings)}
                </p>
              </div>
            </div>
            
            {/* Savings Rate */}
            <div className="pt-2 border-t border-border">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-muted-foreground">Savings rate</span>
                <span className={cn(
                  "text-sm font-medium",
                  summary.savingsRate >= 0 ? "text-primary" : "text-signal-red"
                )}>
                  {summary.savingsRate.toFixed(1)}%
                </span>
              </div>
              <div className="h-2 bg-surface2 rounded-full overflow-hidden">
                <div 
                  className={cn(
                    "h-full rounded-full transition-all",
                    summary.savingsRate >= 0 ? "bg-primary" : "bg-signal-red"
                  )}
                  style={{ width: `${Math.min(Math.abs(summary.savingsRate), 100)}%` }}
                />
              </div>
            </div>
          </Card>

          {/* Category Breakdown */}
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-muted-foreground">By Category</h3>
            
            {CATEGORY_LIST.filter(cat => !isProjectCategory(cat)).map(category => {
              const data = summary.byCategory[category]
              if (!data) return null
              
              const isExpanded = expandedCategories.has(category)
              const isIncome = category === "Income"
              const categoryColor = CATEGORY_COLORS[category] || CATEGORY_COLORS["default"]
              const isOverBudget = !isIncome && data.total > data.budget && data.budget > 0
              const percentUsed = data.budget > 0 ? (data.total / data.budget) * 100 : 0
              
              // Skip if no activity and no budget
              if (data.total === 0 && data.budget === 0) return null
              
              return (
                <Card 
                  key={category} 
                  interactive 
                  onClick={() => toggleCategory(category)}
                >
                  <div className="flex items-center gap-3">
                    {/* Color bar */}
                    <div 
                      className="w-1 self-stretch rounded-full shrink-0"
                      style={{ backgroundColor: categoryColor }}
                    />
                    
                    <div className="flex-1 min-w-0">
                      {/* Header row */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <ChevronDown className={cn(
                            "size-4 text-muted-foreground transition-transform",
                            isExpanded && "rotate-180"
                          )} />
                          <span className="text-sm font-medium text-foreground">{category}</span>
                        </div>
                        <div className="text-right">
                          <span className={cn(
                            "text-sm font-semibold",
                            isIncome ? "text-signal-green" : isOverBudget ? "text-signal-red" : "text-foreground"
                          )}>
                            {formatCurrency(data.total)}
                          </span>
                          {data.budget > 0 && !isIncome && (
                            <span className="text-xs text-muted-foreground ml-2">
                              / {formatCurrency(data.budget)}
                            </span>
                          )}
                        </div>
                      </div>
                      
                      {/* Progress bar */}
                      {!isIncome && data.budget > 0 && (
                        <div className="mt-2 h-1.5 bg-surface2 rounded-full overflow-hidden">
                          <div 
                            className={cn(
                              "h-full rounded-full transition-all",
                              isOverBudget ? "bg-signal-red" : "bg-primary"
                            )}
                            style={{ width: `${Math.min(percentUsed, 100)}%` }}
                          />
                        </div>
                      )}
                      
                      {/* Expanded subcategories */}
                      {isExpanded && (
                        <div className="mt-3 pt-3 border-t border-border/50 space-y-2">
                          {Object.entries(data.bySubcategory)
                            .filter(([_, subData]) => subData.total > 0 || subData.budget > 0)
                            .sort((a, b) => b[1].total - a[1].total)
                            .map(([sub, subData]) => {
                              const subKey = `${category}-${sub}`
                              const isSubExpanded = expandedSubcategories.has(subKey)
                              const subOverBudget = !isIncome && subData.total > subData.budget && subData.budget > 0
                              
                              return (
                                <div key={sub}>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      toggleSubcategory(subKey)
                                    }}
                                    className="w-full flex items-center justify-between py-1 text-left group"
                                  >
                                    <div className="flex items-center gap-1">
                                      {subData.transactions.length > 0 && (
                                        <ChevronDown className={cn(
                                          "size-3 text-muted-foreground transition-transform",
                                          isSubExpanded && "rotate-180"
                                        )} />
                                      )}
                                      <span className="text-xs text-muted-foreground group-hover:text-foreground transition-colors">
                                        {sub}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <span className={cn(
                                        "text-xs font-medium",
                                        isIncome ? "text-signal-green" : subOverBudget ? "text-signal-red" : "text-foreground"
                                      )}>
                                        {formatCurrency(subData.total)}
                                      </span>
                                      {subData.budget > 0 && !isIncome && (
                                        <span className="text-[10px] text-muted-foreground">
                                          / {formatCurrency(subData.budget)}
                                        </span>
                                      )}
                                    </div>
                                  </button>
                                  
                                  {/* Transaction drilldown */}
                                  {isSubExpanded && subData.transactions.length > 0 && (
                                    <div className="ml-4 mt-1 space-y-1">
                                      {subData.transactions.map(tx => {
                                        const amount = parseFloat(tx.amount) || 0
                                        const isRefund = amount > 0 && tx.category !== "Income"
                                        
                                        return (
                                          <div 
                                            key={tx.transactionId} 
                                            className="flex items-center justify-between py-1 px-2 bg-surface2/50 rounded text-xs"
                                          >
                                            <div className="flex items-center gap-2 min-w-0">
                                              <span className="text-muted-foreground shrink-0">
                                                {formatDateShort(tx.date)}
                                              </span>
                                              <span className="text-foreground truncate">{tx.description}</span>
                                              {isRefund && (
                                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-signal-green/20 text-signal-green shrink-0">
                                                  refund
                                                </span>
                                              )}
                                            </div>
                                            <span className={cn(
                                              "font-medium shrink-0 ml-2",
                                              isRefund || amount > 0 ? "text-signal-green" : "text-foreground"
                                            )}>
                                              {isRefund ? "-" : ""}{formatCurrency(Math.abs(amount))}
                                            </span>
                                          </div>
                                        )
                                      })}
                                    </div>
                                  )}
                                </div>
                              )
                            })}
                        </div>
                      )}
                    </div>
                  </div>
                </Card>
              )
            })}
          </div>

          {/* Projects Section - Amber colored */}
          {(projectSummary.totalProjectSpend > 0 || Object.values(projectSummary.byProject).some(p => p.budget > 0)) && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-medium text-signal-amber">Projects & Capital Expenditure</h3>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-signal-amber/20 text-signal-amber">
                  Not in budget
                </span>
              </div>
              
              {Object.entries(projectSummary.byProject).map(([projectName, data]) => {
                if (data.total === 0 && data.budget === 0) return null
                
                const isExpanded = expandedCategories.has(`project-${projectName}`)
                const percentUsed = data.budget > 0 ? (data.total / data.budget) * 100 : 0
                
                return (
                  <Card 
                    key={projectName} 
                    className="border-signal-amber/30"
                    interactive
                    onClick={() => toggleCategory(`project-${projectName}`)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <ChevronDown className={cn(
                          "size-4 text-signal-amber transition-transform",
                          isExpanded && "rotate-180"
                        )} />
                        <span className="text-sm font-medium text-foreground">{projectName}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-sm font-semibold text-signal-amber">
                          {formatCurrency(data.total)}
                        </span>
                        {data.budget > 0 && (
                          <span className="text-xs text-muted-foreground ml-2">
                            / {formatCurrency(data.budget)}
                          </span>
                        )}
                      </div>
                    </div>
                    
                    {/* Progress bar */}
                    {data.budget > 0 && (
                      <div className="mt-2 h-1.5 bg-surface2 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-signal-amber rounded-full transition-all"
                          style={{ width: `${Math.min(percentUsed, 100)}%` }}
                        />
                      </div>
                    )}
                    
                    {/* Expanded subcategories */}
                    {isExpanded && (
                      <div className="mt-3 pt-3 border-t border-border/50 space-y-2">
                        {Object.entries(data.bySubcategory).map(([sub, subData]) => {
                          if (subData.total === 0) return null
                          const subKey = `project-${projectName}-${sub}`
                          const isSubExpanded = expandedSubcategories.has(subKey)
                          
                          return (
                            <div key={sub}>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  toggleSubcategory(subKey)
                                }}
                                className="w-full flex items-center justify-between py-1 text-left"
                              >
                                <span className="text-xs text-muted-foreground">{sub}</span>
                                <span className="text-xs font-medium text-foreground">
                                  {formatCurrency(subData.total)}
                                </span>
                              </button>
                              
                              {/* Transaction drilldown */}
                              {isSubExpanded && subData.transactions.length > 0 && (
                                <div className="ml-4 mt-1 space-y-1">
                                  {subData.transactions.map(tx => (
                                    <div 
                                      key={tx.transactionId} 
                                      className="flex items-center justify-between py-1 px-2 bg-surface2/50 rounded text-xs"
                                    >
                                      <div className="flex items-center gap-2 min-w-0">
                                        <span className="text-muted-foreground shrink-0">
                                          {formatDateShort(tx.date)}
                                        </span>
                                        <span className="text-foreground truncate">{tx.description}</span>
                                      </div>
                                      <span className="font-medium text-foreground shrink-0 ml-2">
                                        {formatCurrency(Math.abs(parseFloat(tx.amount) || 0))}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </Card>
                )
              })}
            </div>
          )}

          {/* Business Summary */}
          {businessExpenses > 0 && (
            <Card className="border-signal-amber/30">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Briefcase className="size-4 text-signal-amber" />
                  <span className="text-sm font-medium text-foreground">Business Expenses</span>
                </div>
                <span className="text-sm font-semibold text-signal-amber">
                  {formatCurrency(businessExpenses)}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Excluded from personal budget. Export from Transactions tab.
              </p>
            </Card>
          )}
        </>
      )}
    </div>
  )
}
