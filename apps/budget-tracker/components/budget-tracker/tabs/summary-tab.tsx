"use client"

import { useState, useMemo } from "react"
import { useBudgetStore } from "@/stores/budget-tracker/use-budget-store"
import { PageHeader, Card, EmptyState } from "@transformotion/ui-primitives"
import { ChevronLeft, ChevronRight, ChevronDown, PieChart, Briefcase } from "lucide-react"
import { CATEGORY_COLORS } from "../data/category-colors"
import { ExcludedBadge } from "../badges/excluded-badge"
import {
  getActiveCategories, getActiveSubcategories, getCategoryName, getSubcategoryName,
  isCapital, excludeFromCashflow, toMonthlyAmount
} from "@/lib/categories"
import type { Transaction, BudgetFrequency } from '@transformotion/budget-domain'
import { collectIncomeHolderIds, isIncomeCategory, isRoleTransaction } from '@transformotion/budget-domain'
import { cn } from "@/lib/utils"

function parseDate(dateStr: string): Date {
  const [day, month, year] = dateStr.split("/").map(Number)
  return new Date(year, month - 1, day)
}

function getMonthKey(dateStr: string): string {
  const date = parseDate(dateStr)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`
}

function formatMonth(monthKey: string): string {
  const [year, month] = monthKey.split("-")
  const date = new Date(parseInt(year), parseInt(month) - 1)
  return date.toLocaleDateString("en-AU", { month: "long", year: "numeric" })
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount)
}

function formatDateShort(dateStr: string): string {
  const date = parseDate(dateStr)
  return date.toLocaleDateString("en-AU", { day: "numeric", month: "short" })
}

export function SummaryTab() {
  const transactions = useBudgetStore((s) => s.transactions)
  const budgetData = useBudgetStore((s) => s.budgetData)
  const categories = budgetData.categories

  const availableMonths = useMemo(() => {
    const months = new Set<string>()
    transactions.forEach(t => { if (t.date) months.add(getMonthKey(t.date)) })
    return Array.from(months).sort().reverse()
  }, [transactions])

  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
  })

  const [hasAutoSwitched, setHasAutoSwitched] = useState(false)
  useMemo(() => {
    if (!hasAutoSwitched && availableMonths.length > 0) {
      setCurrentMonth(availableMonths[0])
      setHasAutoSwitched(true)
    }
  }, [availableMonths, hasAutoSwitched])

  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set())
  const [expandedSubcategories, setExpandedSubcategories] = useState<Set<string>>(new Set())

  const monthTransactions = useMemo(() => {
    return transactions.filter(t => getMonthKey(t.date) === currentMonth)
  }, [transactions, currentMonth])

  const incomeHolders = useMemo(() => collectIncomeHolderIds(categories), [categories])

  const summary = useMemo(() => {
    const activeNonCapitalCats = getActiveCategories(categories).filter(c => c.type !== 'capital')

    const personalTransactions = monthTransactions.filter(t =>
      !t._business &&
      !excludeFromCashflow(categories, t.subcategoryId ?? null) &&
      !isCapital(categories, t.categoryId ?? null)
    )

    let totalIncome = 0
    let totalExpenses = 0
    const byCategory: Record<string, {
      categoryId: string
      total: number
      budget: number
      bySubcategory: Record<string, { subcategoryId: string; total: number; budget: number; transactions: Transaction[] }>
    }> = {}

    for (const cat of activeNonCapitalCats) {
      byCategory[cat.name] = { categoryId: cat.categoryId, total: 0, budget: 0, bySubcategory: {} }
      for (const sub of getActiveSubcategories(cat)) {
        const monthlyBudget = toMonthlyAmount(
          budgetData.budgetAmounts[sub.subcategoryId] ?? 0,
          (budgetData.budgetFrequencies[sub.subcategoryId] ?? 'monthly') as BudgetFrequency
        )
        byCategory[cat.name].bySubcategory[sub.name] = {
          subcategoryId: sub.subcategoryId,
          total: 0,
          budget: monthlyBudget,
          transactions: []
        }
        if (!sub.excludeFromCashflow) {
          byCategory[cat.name].budget += monthlyBudget
        }
      }
    }

    for (const tx of personalTransactions) {
      const amount = parseFloat(tx.amount) || 0
      const catName = getCategoryName(categories, tx.categoryId ?? null) || tx.category || ''
      const subName = getSubcategoryName(categories, tx.subcategoryId ?? null) || tx.subcategory || ''

      if (isRoleTransaction(tx, incomeHolders)) {
        totalIncome += Math.abs(amount)
      } else if (catName && byCategory[catName]) {
        totalExpenses += Math.abs(amount)
        byCategory[catName].total += Math.abs(amount)
        if (subName && byCategory[catName].bySubcategory[subName]) {
          byCategory[catName].bySubcategory[subName].total += Math.abs(amount)
          byCategory[catName].bySubcategory[subName].transactions.push(tx)
        }
      }
    }

    // Accumulate excluded subcategories from non-business transactions (shown greyed; not added to category total)
    for (const tx of monthTransactions.filter(t => !t._business)) {
      if (!excludeFromCashflow(categories, tx.subcategoryId ?? null)) continue
      const catName = getCategoryName(categories, tx.categoryId ?? null) || tx.category || ''
      const subName = getSubcategoryName(categories, tx.subcategoryId ?? null) || tx.subcategory || ''
      if (catName && byCategory[catName]?.bySubcategory[subName]) {
        byCategory[catName].bySubcategory[subName].total += Math.abs(parseFloat(tx.amount) || 0)
        byCategory[catName].bySubcategory[subName].transactions.push(tx)
      }
    }

    const netSavings = totalIncome - totalExpenses
    const savingsRate = totalIncome > 0 ? (netSavings / totalIncome) * 100 : 0
    return { totalIncome, totalExpenses, netSavings, savingsRate, byCategory }
  }, [monthTransactions, budgetData, categories, incomeHolders])

  const capitalSummary = useMemo(() => {
    const capitalTransactions = monthTransactions.filter(t =>
      !t._business && isCapital(categories, t.categoryId ?? null)
    )

    const capitalCats = getActiveCategories(categories).filter(c => c.type === 'capital')
    const byCapital: Record<string, {
      categoryId: string
      total: number
      bySubcategory: Record<string, { total: number; transactions: Transaction[] }>
    }> = {}

    for (const cat of capitalCats) {
      byCapital[cat.name] = { categoryId: cat.categoryId, total: 0, bySubcategory: {} }
      for (const sub of getActiveSubcategories(cat)) {
        byCapital[cat.name].bySubcategory[sub.name] = { total: 0, transactions: [] }
      }
    }

    for (const tx of capitalTransactions) {
      const amount = Math.abs(parseFloat(tx.amount) || 0)
      const catName = getCategoryName(categories, tx.categoryId ?? null) || tx.category || ''
      const subName = getSubcategoryName(categories, tx.subcategoryId ?? null) || tx.subcategory || ''

      if (byCapital[catName]) {
        byCapital[catName].total += amount
        if (subName && byCapital[catName].bySubcategory[subName]) {
          byCapital[catName].bySubcategory[subName].total += amount
          byCapital[catName].bySubcategory[subName].transactions.push(tx)
        }
      }
    }

    const totalCapitalSpend = Object.values(byCapital).reduce((sum, p) => sum + p.total, 0)
    return { byCapital, totalCapitalSpend }
  }, [monthTransactions, categories])

  const businessExpenses = useMemo(() => {
    return monthTransactions
      .filter(t => t._business)
      .reduce((sum, t) => sum + Math.abs(parseFloat(t.amount) || 0), 0)
  }, [monthTransactions])

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

  const toggleCategory = (key: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const toggleSubcategory = (key: string) => {
    setExpandedSubcategories(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const hasTransactions = transactions.length > 0

  return (
    <div className="p-4 space-y-4">
      <PageHeader
        title="Summary"
        subtitle="Monthly income and expenses"
        titleClassName="font-display text-xl uppercase tracking-wide"
      />

      <div className="flex items-center justify-between">
        <button onClick={goToPrevMonth} className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-surface2 transition-colors">
          <ChevronLeft className="size-5" />
        </button>
        <h2 className="text-lg font-semibold text-foreground">{formatMonth(currentMonth)}</h2>
        <button onClick={goToNextMonth} className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-surface2 transition-colors">
          <ChevronRight className="size-5" />
        </button>
      </div>

      {!hasTransactions ? (
        <EmptyState icon={PieChart} title="No data yet" description="Import transactions to see your monthly summary" />
      ) : (
        <>
          {/* P&L Overview */}
          <Card className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-sm font-medium tracking-wide text-muted-foreground">Personal Budget</h3>
              <span className="text-[10px] text-muted-foreground">(excludes business &amp; capital)</span>
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
                <p className={cn("text-xl font-bold", summary.netSavings >= 0 ? "text-primary" : "text-signal-red")}>
                  {formatCurrency(summary.netSavings)}
                </p>
              </div>
            </div>

            <div className="pt-2 border-t border-border">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-muted-foreground">Savings rate</span>
                <span className={cn("text-sm font-medium", summary.savingsRate >= 0 ? "text-primary" : "text-signal-red")}>
                  {summary.savingsRate.toFixed(1)}%
                </span>
              </div>
              <div className="h-2 bg-surface2 rounded-full overflow-hidden">
                <div
                  className={cn("h-full rounded-full transition-all", summary.savingsRate >= 0 ? "bg-primary" : "bg-signal-red")}
                  style={{ width: `${Math.min(Math.abs(summary.savingsRate), 100)}%` }}
                />
              </div>
            </div>
          </Card>

          {/* Category Breakdown */}
          <div className="space-y-2">
            <h3 className="font-display text-sm font-medium tracking-wide text-muted-foreground">By Category</h3>

            {getActiveCategories(categories).filter(c => c.type !== 'capital').map(cat => {
              const data = summary.byCategory[cat.name]
              if (!data) return null

              const isExpanded = expandedCategories.has(cat.categoryId)
              const isIncome = isIncomeCategory(cat)
              const categoryColor = CATEGORY_COLORS[cat.name] || CATEGORY_COLORS["default"]
              const isOverBudget = !isIncome && data.total > data.budget && data.budget > 0
              const percentUsed = data.budget > 0 ? (data.total / data.budget) * 100 : 0

              if (data.total === 0 && data.budget === 0) return null

              return (
                <Card key={cat.categoryId} interactive onClick={() => toggleCategory(cat.categoryId)}>
                  <div className="flex items-center gap-3">
                    <div className="w-1 self-stretch rounded-full shrink-0" style={{ backgroundColor: categoryColor }} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", isExpanded && "rotate-180")} />
                          <span className="text-sm font-medium text-foreground">{cat.name}</span>
                        </div>
                        <div className="text-right">
                          <span className={cn("text-sm font-semibold", isIncome ? "text-signal-green" : isOverBudget ? "text-signal-red" : "text-foreground")}>
                            {formatCurrency(data.total)}
                          </span>
                          {data.budget > 0 && !isIncome && (
                            <span className="text-xs text-muted-foreground ml-2">/ {formatCurrency(data.budget)}</span>
                          )}
                        </div>
                      </div>

                      {!isIncome && data.budget > 0 && (
                        <div className="mt-2 h-1.5 bg-surface2 rounded-full overflow-hidden">
                          <div
                            className={cn("h-full rounded-full transition-all", isOverBudget ? "bg-signal-red" : "bg-primary")}
                            style={{ width: `${Math.min(percentUsed, 100)}%` }}
                          />
                        </div>
                      )}

                      {isExpanded && (
                        <div className="mt-3 pt-3 border-t border-border/50 space-y-2">
                          {Object.entries(data.bySubcategory)
                            .filter(([_, subData]) => {
                              if (subData.total > 0 || subData.budget > 0) return true
                              const subObj = categories.flatMap(c => c.subcategories).find(s => s.subcategoryId === subData.subcategoryId)
                              return subObj?.excludeFromCashflow === true
                            })
                            .sort((a, b) => b[1].total - a[1].total)
                            .map(([subName, subData]) => {
                              const subKey = `${cat.categoryId}-${subData.subcategoryId}`
                              const isSubExpanded = expandedSubcategories.has(subKey)
                              const subOverBudget = !isIncome && subData.total > subData.budget && subData.budget > 0
                              const subObj = categories.flatMap(c => c.subcategories).find(s => s.subcategoryId === subData.subcategoryId)
                              const isExcluded = subObj?.excludeFromCashflow === true

                              return (
                                <div key={subName}>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); toggleSubcategory(subKey) }}
                                    className="w-full flex items-center justify-between py-1 text-left group"
                                  >
                                    <div className="flex items-center gap-1.5">
                                      {subData.transactions.length > 0 && (
                                        <ChevronDown className={cn("size-3 text-muted-foreground transition-transform", isSubExpanded && "rotate-180")} />
                                      )}
                                      <span className={cn("text-xs transition-colors", isExcluded ? "text-muted-foreground/50 italic" : "text-muted-foreground group-hover:text-foreground")}>{subName}</span>
                                      {isExcluded && <ExcludedBadge />}
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <span className={cn("text-xs font-medium", isIncome ? "text-signal-green" : isExcluded ? "text-muted-foreground/50" : subOverBudget ? "text-signal-red" : "text-foreground")}>
                                        {formatCurrency(subData.total)}
                                      </span>
                                      {subData.budget > 0 && !isIncome && (
                                        <span className="text-[10px] text-muted-foreground">/ {formatCurrency(subData.budget)}</span>
                                      )}
                                    </div>
                                  </button>

                                  {isSubExpanded && subData.transactions.length > 0 && (
                                    <div className="ml-4 mt-1 space-y-1">
                                      {subData.transactions.map(tx => {
                                        const amount = parseFloat(tx.amount) || 0
                                        const isRefund = amount > 0 && !isIncome
                                        return (
                                          <div key={tx.transactionId} className="flex items-center justify-between py-1 px-2 bg-surface2/50 rounded text-xs">
                                            <div className="flex items-center gap-2 min-w-0">
                                              <span className="text-muted-foreground shrink-0">{formatDateShort(tx.date)}</span>
                                              <span className="text-foreground truncate">{tx.description}</span>
                                              {isRefund && (
                                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-signal-green/20 text-signal-green shrink-0">refund</span>
                                              )}
                                            </div>
                                            <span className={cn("font-medium shrink-0 ml-2", isRefund || amount > 0 ? "text-signal-green" : "text-foreground")}>
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

          {/* Capital Expenditure Section */}
          {(capitalSummary.totalCapitalSpend > 0) && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <h3 className="font-display text-sm font-medium tracking-wide text-signal-amber">Capital Expenditure</h3>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-signal-amber/20 text-signal-amber">Not in budget</span>
              </div>

              {Object.entries(capitalSummary.byCapital).map(([catName, data]) => {
                if (data.total === 0) return null
                const isExpanded = expandedCategories.has(`capital-${catName}`)

                return (
                  <Card key={catName} className="border-signal-amber/30" interactive onClick={() => toggleCategory(`capital-${catName}`)}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <ChevronDown className={cn("size-4 text-signal-amber transition-transform", isExpanded && "rotate-180")} />
                        <span className="text-sm font-medium text-foreground">{catName}</span>
                      </div>
                      <span className="text-sm font-semibold text-signal-amber">{formatCurrency(data.total)}</span>
                    </div>

                    {isExpanded && (
                      <div className="mt-3 pt-3 border-t border-border/50 space-y-2">
                        {Object.entries(data.bySubcategory).map(([subName, subData]) => {
                          if (subData.total === 0) return null
                          const subKey = `capital-${catName}-${subName}`
                          const isSubExpanded = expandedSubcategories.has(subKey)

                          return (
                            <div key={subName}>
                              <button
                                onClick={(e) => { e.stopPropagation(); toggleSubcategory(subKey) }}
                                className="w-full flex items-center justify-between py-1 text-left"
                              >
                                <span className="text-xs text-muted-foreground">{subName}</span>
                                <span className="text-xs font-medium text-foreground">{formatCurrency(subData.total)}</span>
                              </button>

                              {isSubExpanded && subData.transactions.length > 0 && (
                                <div className="ml-4 mt-1 space-y-1">
                                  {subData.transactions.map(tx => (
                                    <div key={tx.transactionId} className="flex items-center justify-between py-1 px-2 bg-surface2/50 rounded text-xs">
                                      <div className="flex items-center gap-2 min-w-0">
                                        <span className="text-muted-foreground shrink-0">{formatDateShort(tx.date)}</span>
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
                <span className="text-sm font-semibold text-signal-amber">{formatCurrency(businessExpenses)}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">Excluded from personal budget. Export from Transactions tab.</p>
            </Card>
          )}
        </>
      )}
    </div>
  )
}
