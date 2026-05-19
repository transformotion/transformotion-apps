"use client"

import { useState, useMemo, useRef } from "react"
import { useBudgetStore } from "@/stores/budget-tracker/use-budget-store"
import { useAuthStore, selectCurrentAccount } from "@/stores/auth/use-auth-store"
import { PageHeader, Card, PrimaryButton, SecondaryButton, EmptyState } from "@/components/ui/design-system"
import {
  Upload, Receipt, Filter, Download, Briefcase, X,
  RotateCcw, Check, BookOpen, Search, FileText, AlertCircle
} from "lucide-react"
import { CATEGORY_COLORS } from "../data/category-colors"
import { applyRules } from "@transformotion/budget-domain"
import { getActiveCategories, getActiveSubcategories, getCategoryName, getSubcategoryName, getDisplayLabel, excludeFromCashflow } from "@/lib/categories"
import type { Transaction, Category } from "@transformotion/budget-domain"
import type { MatchingRule, CSVMapping } from "@transformotion/budget-domain"
import { cn } from "@/lib/utils"

function getDateGroup(dateStr: string): string {
  const [day, month, year] = dateStr.split("/").map(Number)
  const date = new Date(year, month - 1, day)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const diffDays = Math.floor((today.getTime() - date.getTime()) / (1000 * 60 * 60 * 24))
  if (diffDays === 0) return "Today"
  if (diffDays === 1) return "Yesterday"
  if (diffDays <= 7) return "This Week"
  if (diffDays <= 30) return "This Month"
  return "Earlier"
}

function formatDate(dateStr: string): string {
  const [day, month, year] = dateStr.split("/").map(Number)
  const date = new Date(year, month - 1, day)
  return date.toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" })
}

function parseAmount(amount: string): number {
  return parseFloat(amount) || 0
}

function groupByDate(transactions: Transaction[]): Map<string, Transaction[]> {
  const groups = new Map<string, Transaction[]>()
  const sortedTransactions = [...transactions].sort((a, b) => {
    const [aDay, aMonth, aYear] = a.date.split("/").map(Number)
    const [bDay, bMonth, bYear] = b.date.split("/").map(Number)
    const aDate = new Date(aYear, aMonth - 1, aDay)
    const bDate = new Date(bYear, bMonth - 1, bDay)
    return bDate.getTime() - aDate.getTime()
  })
  for (const tx of sortedTransactions) {
    const group = getDateGroup(tx.date)
    if (!groups.has(group)) groups.set(group, [])
    groups.get(group)!.push(tx)
  }
  return groups
}

function exportToCSV(transactions: Transaction[], categories: Category[], filename: string) {
  const headers = ["Date", "Description", "Amount", "Category", "Subcategory", "Source", "Business"]
  const rows = transactions.map(t => {
    const catName = getCategoryName(categories, t.categoryId ?? null) || t.category || ""
    const subName = getSubcategoryName(categories, t.subcategoryId ?? null) || t.subcategory || ""
    return [
      t.date,
      `"${t.description.replace(/"/g, '""')}"`,
      t.amount,
      catName,
      subName,
      t.file || "",
      t._business ? "Yes" : "No",
    ]
  })
  const csv = [headers.join(","), ...rows.map(r => r.join(","))].join("\n")
  const dataUri = `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`
  const link = document.createElement("a")
  link.href = dataUri
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

export function TransactionsTab() {
  const transactions = useBudgetStore((s) => s.transactions)
  const setTransactions = useBudgetStore((s) => s.setTransactions)
  const settings = useBudgetStore((s) => s.settings)
  const updateSettings = useBudgetStore((s) => s.updateSettings)
  const matchingRules = useBudgetStore((s) => s.matchingRules)
  const addMatchingRule = useBudgetStore((s) => s.addMatchingRule)
  const budgetData = useBudgetStore((s) => s.budgetData)
  const uncategorizedCount = useBudgetStore((s) => s.uncategorizedCount)
  const filters = useBudgetStore((s) => s.filters)
  const setFilters = useBudgetStore((s) => s.setFilters)
  const currentAccount = useAuthStore(selectCurrentAccount)

  const categories = budgetData.categories

  const matchingRulesRef = useRef(matchingRules)
  matchingRulesRef.current = matchingRules

  const [showImport, setShowImport] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const [showSource, setShowSource] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editCategoryId, setEditCategoryId] = useState("")
  const [editSubcategoryId, setEditSubcategoryId] = useState("")
  const [searchQuery, setSearchQuery] = useState("")

  const [learnError, setLearnError] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkCategoryId, setBulkCategoryId] = useState("")
  const [bulkSubcategoryId, setBulkSubcategoryId] = useState("")
  const [showBulkEdit, setShowBulkEdit] = useState(false)

  const uniqueSources = useMemo(() => {
    const sources = new Set<string>()
    transactions.forEach(t => { if (t.file) sources.add(t.file) })
    return Array.from(sources).sort()
  }, [transactions])

  const usedCategories = useMemo(() => {
    const cats = new Set<string>()
    transactions.forEach(t => {
      const name = getCategoryName(categories, t.categoryId ?? null) || t.category
      if (name) cats.add(name)
    })
    return Array.from(cats).sort()
  }, [transactions, categories])

  const usedSubcategories = useMemo(() => {
    if (!filters.categoryId) return []
    const subs = new Set<string>()
    transactions.forEach(t => {
      const txCatName = getCategoryName(categories, t.categoryId ?? null) || t.category || ''
      if (txCatName === filters.categoryId) {
        const subName = getSubcategoryName(categories, t.subcategoryId ?? null) || t.subcategory
        if (subName) subs.add(subName)
      }
    })
    return Array.from(subs).sort()
  }, [transactions, filters.categoryId, categories])

  const activeFilterCount = useMemo(() => {
    let count = 0
    if (filters.categoryId) count++
    if (filters.subcategoryId) count++
    if (filters.source) count++
    if (filters.dateRange) count++
    if (filters.uncategorizedOnly) count++
    if (filters.businessFilter !== "all") count++
    return count
  }, [filters])

  const filteredTransactions = useMemo(() => {
    return transactions.filter(t => {
      if (filters.businessFilter === "personal" && t._business) return false
      if (filters.businessFilter === "business" && !t._business) return false
      if (filters.businessFilter === "excluded" && !(excludeFromCashflow(categories, t.subcategoryId ?? null))) return false

      if (filters.categoryId) {
        const txCatName = getCategoryName(categories, t.categoryId ?? null) || t.category || ''
        if (txCatName !== filters.categoryId) return false
      }
      if (filters.subcategoryId) {
        const txSubName = getSubcategoryName(categories, t.subcategoryId ?? null) || t.subcategory || ''
        if (txSubName !== filters.subcategoryId) return false
      }

      if (filters.source && t.file !== filters.source) return false
      if (filters.uncategorizedOnly && (t.categoryId || t.category)) return false

      if (filters.dateRange) {
        const txDate = new Date(t.date)
        if (txDate < filters.dateRange.start || txDate > filters.dateRange.end) return false
      }

      if (searchQuery) {
        const query = searchQuery.toLowerCase()
        const catName = getCategoryName(categories, t.categoryId ?? null) || t.category || ''
        const subName = getSubcategoryName(categories, t.subcategoryId ?? null) || t.subcategory || ''
        return t.description.toLowerCase().includes(query) ||
               catName.toLowerCase().includes(query) ||
               subName.toLowerCase().includes(query)
      }

      return true
    })
  }, [transactions, filters, searchQuery, categories])

  const groupedTransactions = useMemo(() => groupByDate(filteredTransactions), [filteredTransactions])

  const hasTransactions = transactions.length > 0
  const businessCount = transactions.filter(t => t._business).length
  const excludedCount = transactions.filter(t => !t._business && excludeFromCashflow(categories, t.subcategoryId ?? null)).length

  const bulkCat = getActiveCategories(categories).find(c => c.categoryId === bulkCategoryId)

  const toggleBusiness = (id: string) => {
    setTransactions(transactions.map(t =>
      t.transactionId === id ? { ...t, _business: !t._business } : t
    ))
  }

  const resetTransaction = (id: string) => {
    setTransactions(transactions.map(t => {
      if (t.transactionId !== id) return t
      const result = applyRules(t.description, matchingRulesRef.current)
      if (result) {
        return { ...t, categoryId: result.categoryId, subcategoryId: result.subcategoryId, _manual: false }
      }
      return { ...t, _manual: false }
    }))
  }

  const startEdit = (tx: Transaction) => {
    setEditingId(tx.transactionId)
    setEditCategoryId(tx.categoryId ?? "")
    setEditSubcategoryId(tx.subcategoryId ?? "")
  }

  const saveEdit = () => {
    if (editingId === null) return
    setTransactions(transactions.map(t =>
      t.transactionId === editingId
        ? { ...t, categoryId: editCategoryId || null, subcategoryId: editSubcategoryId || null, _manual: true }
        : t
    ))
    setEditingId(null)
  }

  const saveAndLearn = async () => {
    if (editingId === null) return
    const tx = transactions.find(t => t.transactionId === editingId)
    if (!tx) return
    if (!currentAccount) {
      setLearnError('Cannot create rule: no account loaded. Try signing out and back in.')
      return
    }
    setLearnError(null)

    const words = tx.description.split(/\s+/).slice(0, 3).join(" ")
    const newMatchingRule: MatchingRule = {
      ruleId:       crypto.randomUUID(),
      accountId:    currentAccount.id,
      name:         words,
      match:        words,
      matchType:    'contains',
      categoryId:   editCategoryId,
      subcategoryId: editSubcategoryId,
      isBusiness:   false,
      enabled:      true,
      priority:     matchingRules.length > 0 ? Math.min(...matchingRules.map(r => r.priority)) - 1000 : 1000,
      learned:      true,
      createdAt:    new Date().toISOString(),
    }

    try {
      await addMatchingRule(newMatchingRule)
    } catch (err) {
      setLearnError(err instanceof Error ? err.message : 'Failed to save rule — check your connection and try again')
      return
    }

    const allRules = [...matchingRules, newMatchingRule]
    setTransactions(transactions.map(t => {
      if (t.transactionId === editingId) {
        return { ...t, categoryId: editCategoryId || null, subcategoryId: editSubcategoryId || null, _manual: true }
      }
      if ((!t.categoryId && !t.category) || !t._manual) {
        const result = applyRules(t.description, allRules)
        if (result) {
          return { ...t, categoryId: result.categoryId, subcategoryId: result.subcategoryId, _business: result.isBusiness ?? false, _manual: false }
        }
      }
      return t
    }))
    setEditingId(null)
  }

  const exportBusiness = () => {
    exportToCSV(transactions.filter(t => t._business), categories, `business-expenses-${new Date().toISOString().split("T")[0]}.csv`)
  }

  const exportFiltered = () => {
    exportToCSV(filteredTransactions, categories, `transactions-${new Date().toISOString().split("T")[0]}.csv`)
  }

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectAll = () => setSelectedIds(new Set(filteredTransactions.map(t => t.transactionId)))

  const clearSelection = () => {
    setSelectedIds(new Set())
    setShowBulkEdit(false)
    setBulkCategoryId("")
    setBulkSubcategoryId("")
  }

  const applyBulkCategory = () => {
    if (!bulkCategoryId || selectedIds.size === 0) return
    setTransactions(transactions.map(t =>
      selectedIds.has(t.transactionId)
        ? { ...t, categoryId: bulkCategoryId, subcategoryId: bulkSubcategoryId || null, _manual: true }
        : t
    ))
    clearSelection()
  }

  const reapplyRulesToSelected = () => {
    if (selectedIds.size === 0) return
    setTransactions(transactions.map(t => {
      if (!selectedIds.has(t.transactionId)) return t
      const result = applyRules(t.description, matchingRules)
      if (result) {
        return { ...t, categoryId: result.categoryId, subcategoryId: result.subcategoryId, _business: result.isBusiness ?? false, _manual: false }
      }
      return { ...t, categoryId: null, subcategoryId: null, _business: false, _manual: false }
    }))
    clearSelection()
  }

  const clearFilters = () => setFilters({ dateRange: null, categoryId: null, subcategoryId: null, bankAccount: null, source: null, businessFilter: "all", uncategorizedOnly: false })

  return (
    <div className="p-4 space-y-4">
      <PageHeader
        title="Transactions"
        subtitle={hasTransactions
          ? `${transactions.length} transactions${uncategorizedCount > 0 ? ` • ${uncategorizedCount} uncategorised` : ""}`
          : "Import and manage your transactions"
        }
      />

      {learnError && (
        <div className="p-3 rounded-lg bg-signal-red/10 border border-signal-red/20 flex items-start gap-2">
          <AlertCircle className="size-4 text-signal-red mt-0.5 shrink-0" />
          <span className="text-sm text-signal-red">{learnError}</span>
        </div>
      )}

      {/* Action Bar */}
      <div className="flex items-center gap-2">
        {hasTransactions ? (
          <>
            <button
              onClick={() => setShowImport(true)}
              className="size-11 rounded-xl bg-card border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors"
              title="Import CSV"
            >
              <Upload className="size-5" />
            </button>
            <div className="flex-1" />
            {uncategorizedCount > 0 && (
              <button
                onClick={() => setFilters(f => ({ ...f, uncategorizedOnly: !f.uncategorizedOnly }))}
                className={cn(
                  "relative h-11 px-3 rounded-xl border flex items-center gap-2 text-sm font-medium transition-colors",
                  filters.uncategorizedOnly
                    ? "bg-signal-amber text-background border-signal-amber"
                    : "bg-card border-border text-signal-amber hover:border-signal-amber/50"
                )}
                title="Show uncategorised only"
              >
                <span className={cn(
                  "size-2 rounded-full shrink-0",
                  filters.uncategorizedOnly ? "bg-background" : "bg-signal-amber"
                )} />
                <span className="hidden sm:inline">Uncategorised</span>
                <span className={cn(
                  "text-xs font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center",
                  filters.uncategorizedOnly
                    ? "bg-background/30 text-background"
                    : "bg-signal-amber/20 text-signal-amber"
                )}>
                  {uncategorizedCount}
                </span>
              </button>
            )}
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={cn(
                "relative size-11 rounded-xl border flex items-center justify-center transition-colors",
                showFilters || activeFilterCount > 0
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card border-border text-muted-foreground hover:text-foreground"
              )}
              title="Filters"
            >
              <Filter className="size-5" />
              {activeFilterCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 size-5 rounded-full bg-signal-amber text-background text-[10px] font-bold flex items-center justify-center">
                  {activeFilterCount}
                </span>
              )}
            </button>
            <button
              onClick={() => setShowSource(!showSource)}
              className={cn(
                "size-11 rounded-xl border flex items-center justify-center transition-colors",
                showSource
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card border-border text-muted-foreground hover:text-foreground"
              )}
              title="Show transaction source"
            >
              <FileText className="size-5" />
            </button>
            <button
              onClick={exportFiltered}
              className="size-11 rounded-xl bg-card border border-border flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
              title="Export filtered transactions"
            >
              <Download className="size-5" />
            </button>
          </>
        ) : (
          <PrimaryButton onClick={() => setShowImport(true)} className="flex-1">
            <Upload className="size-4 mr-2" />
            Import CSV
          </PrimaryButton>
        )}
      </div>

      {/* Search */}
      {hasTransactions && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search transactions..."
            className="w-full h-11 pl-10 pr-4 bg-card border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>
      )}

      {/* Filters Panel */}
      {showFilters && hasTransactions && (
        <Card className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">Filters</h3>
            {activeFilterCount > 0 && (
              <button onClick={clearFilters} className="text-xs text-primary hover:underline">
                Clear all ({activeFilterCount})
              </button>
            )}
          </div>

          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground block mb-2">Type</label>
            <div className="flex items-center gap-2 flex-wrap">
              {(["all", "personal", "business", "excluded"] as const).map((filter) => (
                <button
                  key={filter}
                  onClick={() => setFilters(f => ({ ...f, businessFilter: filter }))}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1",
                    filters.businessFilter === filter
                      ? "bg-primary text-primary-foreground"
                      : "bg-surface2 text-muted-foreground hover:text-foreground"
                  )}
                >
                  {filter === "all" && "All"}
                  {filter === "personal" && "Personal"}
                  {filter === "business" && <><Briefcase className="size-3" />Business {businessCount > 0 && `(${businessCount})`}</>}
                  {filter === "excluded" && <>Excluded {excludedCount > 0 && `(${excludedCount})`}</>}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground block mb-2">Date Range</label>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={filters.dateRange?.start ? filters.dateRange.start.toISOString().split("T")[0] : ""}
                onChange={(e) => {
                  const start = e.target.value ? new Date(e.target.value) : null
                  setFilters(f => ({
                    ...f,
                    dateRange: start ? { start, end: f.dateRange?.end || new Date() } : null
                  }))
                }}
                className="flex-1 h-10 px-3 bg-surface2 border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
              <span className="text-muted-foreground text-sm">to</span>
              <input
                type="date"
                value={filters.dateRange?.end ? filters.dateRange.end.toISOString().split("T")[0] : ""}
                onChange={(e) => {
                  const end = e.target.value ? new Date(e.target.value) : null
                  setFilters(f => ({
                    ...f,
                    dateRange: end ? { start: f.dateRange?.start || new Date(0), end } : null
                  }))
                }}
                className="flex-1 h-10 px-3 bg-surface2 border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
              {filters.dateRange && (
                <button onClick={() => setFilters(f => ({ ...f, dateRange: null }))} className="p-1 text-muted-foreground hover:text-foreground">
                  <X className="size-4" />
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground block mb-2">Category</label>
              <select
                value={filters.categoryId || ""}
                onChange={(e) => setFilters(f => ({ ...f, categoryId: e.target.value || null, subcategoryId: null }))}
                className="w-full h-10 px-3 bg-surface2 border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                <option value="">All categories</option>
                {usedCategories.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground block mb-2">Subcategory</label>
              <select
                value={filters.subcategoryId || ""}
                onChange={(e) => setFilters(f => ({ ...f, subcategoryId: e.target.value || null }))}
                disabled={!filters.categoryId || usedSubcategories.length === 0}
                className="w-full h-10 px-3 bg-surface2 border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-40"
              >
                <option value="">All subcategories</option>
                {usedSubcategories.map(sub => (
                  <option key={sub} value={sub}>{sub}</option>
                ))}
              </select>
            </div>
          </div>

          {uniqueSources.length > 0 && (
            <div>
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground block mb-2">Source File</label>
              <select
                value={filters.source || ""}
                onChange={(e) => setFilters(f => ({ ...f, source: e.target.value || null }))}
                className="w-full h-10 px-3 bg-surface2 border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                <option value="">All sources</option>
                {uniqueSources.map(src => (
                  <option key={src} value={src}>{src}</option>
                ))}
              </select>
            </div>
          )}

          <div className="flex items-center justify-between">
            <div>
              <span className="text-sm text-foreground">Uncategorised only</span>
              {uncategorizedCount > 0 && (
                <span className="ml-2 text-xs text-signal-amber">{uncategorizedCount} transactions</span>
              )}
            </div>
            <button
              onClick={() => setFilters(f => ({ ...f, uncategorizedOnly: !f.uncategorizedOnly }))}
              className={cn(
                "w-12 h-6 rounded-full transition-colors relative shrink-0",
                filters.uncategorizedOnly ? "bg-primary" : "bg-surface2"
              )}
            >
              <span className={cn(
                "absolute top-1 size-4 rounded-full bg-white transition-transform",
                filters.uncategorizedOnly ? "translate-x-7" : "translate-x-1"
              )} />
            </button>
          </div>

          {businessCount > 0 && (
            <SecondaryButton onClick={exportBusiness} className="w-full">
              <Briefcase className="size-4 mr-2" />
              Export Business Transactions ({businessCount})
            </SecondaryButton>
          )}
        </Card>
      )}

      {/* Bulk Action Bar */}
      {selectedIds.size > 0 && (
        <Card className="sticky top-0 z-20 flex flex-wrap items-center gap-3 bg-primary/10 border-primary/30">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={selectedIds.size === filteredTransactions.length}
              onChange={() => selectedIds.size === filteredTransactions.length ? clearSelection() : selectAll()}
              className="size-4 rounded border-border accent-primary"
            />
            <span className="text-sm font-medium text-foreground">{selectedIds.size} selected</span>
          </div>
          <div className="flex-1" />
          {!showBulkEdit ? (
            <div className="flex items-center gap-2">
              <SecondaryButton onClick={() => setShowBulkEdit(true)}>
                Set Category
              </SecondaryButton>
              <SecondaryButton onClick={reapplyRulesToSelected}>
                <RotateCcw className="size-3 mr-1" />
                Re-apply Rules
              </SecondaryButton>
              <button onClick={clearSelection} className="p-1 text-muted-foreground hover:text-foreground">
                <X className="size-4" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 flex-wrap">
              <select
                value={bulkCategoryId}
                onChange={(e) => {
                  setBulkCategoryId(e.target.value)
                  setBulkSubcategoryId("")
                }}
                className="h-8 px-2 bg-background border border-border rounded text-sm min-w-[140px]"
              >
                <option value="">Select category</option>
                {getActiveCategories(categories).map(cat => (
                  <option key={cat.categoryId} value={cat.categoryId}>{cat.name}</option>
                ))}
              </select>
              {bulkCategoryId && bulkCat && (
                <select
                  value={bulkSubcategoryId}
                  onChange={(e) => setBulkSubcategoryId(e.target.value)}
                  className="h-8 px-2 bg-background border border-border rounded text-sm min-w-[140px]"
                >
                  <option value="">No subcategory</option>
                  {getActiveSubcategories(bulkCat).map(sub => (
                    <option key={sub.subcategoryId} value={sub.subcategoryId}>{sub.name}</option>
                  ))}
                </select>
              )}
              <PrimaryButton onClick={applyBulkCategory} disabled={!bulkCategoryId}>
                Apply
              </PrimaryButton>
              <button onClick={() => setShowBulkEdit(false)} className="p-1 text-muted-foreground hover:text-foreground">
                <X className="size-4" />
              </button>
            </div>
          )}
        </Card>
      )}

      {!hasTransactions && (
        <EmptyState
          icon={Receipt}
          title="No transactions yet"
          description="Import a CSV file from your bank to get started"
        />
      )}

      {hasTransactions && filteredTransactions.length === 0 && (
        <div className="py-12 text-center">
          <p className="text-muted-foreground">No transactions match your filters</p>
          <button
            onClick={() => { clearFilters(); setSearchQuery("") }}
            className="mt-2 text-sm text-primary hover:underline"
          >
            Clear filters
          </button>
        </div>
      )}

      {hasTransactions && filteredTransactions.length > 0 && (
        <div className="space-y-4">
          {Array.from(groupedTransactions.entries()).map(([group, txs]) => (
            <div key={group}>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{group}</span>
                <div className="flex-1 h-px bg-border" />
              </div>
              <div className="space-y-2">
                {txs.map((tx) => (
                  <TransactionRow
                    key={tx.transactionId}
                    transaction={tx}
                    isEditing={editingId === tx.transactionId}
                    editCategoryId={editCategoryId}
                    editSubcategoryId={editSubcategoryId}
                    showSource={showSource}
                    isSelected={selectedIds.has(tx.transactionId)}
                    categories={categories}
                    onToggleSelect={() => toggleSelect(tx.transactionId)}
                    onStartEdit={() => startEdit(tx)}
                    onCancelEdit={() => setEditingId(null)}
                    onSave={saveEdit}
                    onSaveAndLearn={saveAndLearn}
                    onToggleBusiness={() => toggleBusiness(tx.transactionId)}
                    onReset={() => resetTransaction(tx.transactionId)}
                    onCategoryChange={setEditCategoryId}
                    onSubcategoryChange={setEditSubcategoryId}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {showImport && (
        <CSVImportModal
          onClose={() => setShowImport(false)}
          matchingRules={matchingRules}
          settings={settings}
          updateSettings={updateSettings}
          transactions={transactions}
          setTransactions={setTransactions}
        />
      )}
    </div>
  )
}

interface TransactionRowProps {
  transaction: Transaction
  isEditing: boolean
  editCategoryId: string
  editSubcategoryId: string
  showSource: boolean
  isSelected: boolean
  categories: Category[]
  onToggleSelect: () => void
  onStartEdit: () => void
  onCancelEdit: () => void
  onSave: () => void
  onSaveAndLearn: () => void
  onToggleBusiness: () => void
  onReset: () => void
  onCategoryChange: (catId: string) => void
  onSubcategoryChange: (subId: string) => void
}

function TransactionRow({
  transaction: tx,
  isEditing,
  editCategoryId,
  editSubcategoryId,
  showSource,
  isSelected,
  categories,
  onToggleSelect,
  onStartEdit,
  onCancelEdit,
  onSave,
  onSaveAndLearn,
  onToggleBusiness,
  onReset,
  onCategoryChange,
  onSubcategoryChange,
}: TransactionRowProps) {
  const amount = parseAmount(tx.amount)
  const isIncome = amount > 0
  const isUncategorised = !tx.categoryId && !tx.category
  const catName = getCategoryName(categories, tx.categoryId ?? null) || tx.category || ''
  const categoryColor = CATEGORY_COLORS[catName] || CATEGORY_COLORS["default"]
  const displayLabel = getDisplayLabel(categories, tx.categoryId ?? null, tx.subcategoryId ?? null, tx.category, tx.subcategory)

  const editCat = isEditing ? getActiveCategories(categories).find(c => c.categoryId === editCategoryId) : undefined

  if (isEditing) {
    return (
      <Card className="space-y-3">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground truncate">{tx.description}</p>
            <p className="text-xs text-muted-foreground">{formatDate(tx.date)}</p>
          </div>
          <button onClick={onCancelEdit} className="p-1 text-muted-foreground hover:text-foreground">
            <X className="size-4" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground block mb-1">Category</label>
            <select
              value={editCategoryId}
              onChange={(e) => {
                onCategoryChange(e.target.value)
                onSubcategoryChange("")
              }}
              className="w-full h-9 px-2 bg-surface2 border border-border rounded-lg text-sm text-foreground"
            >
              <option value="">Select...</option>
              {getActiveCategories(categories).map(cat => (
                <option key={cat.categoryId} value={cat.categoryId}>{cat.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground block mb-1">Subcategory</label>
            <select
              value={editSubcategoryId}
              onChange={(e) => onSubcategoryChange(e.target.value)}
              className="w-full h-9 px-2 bg-surface2 border border-border rounded-lg text-sm text-foreground"
              disabled={!editCategoryId}
            >
              <option value="">Select...</option>
              {editCat && getActiveSubcategories(editCat).map(sub => (
                <option key={sub.subcategoryId} value={sub.subcategoryId}>{sub.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onCancelEdit}
            className="h-9 px-4 rounded-lg bg-surface2 text-muted-foreground text-sm font-medium hover:text-foreground flex items-center justify-center"
          >
            Cancel
          </button>
          <button
            onClick={onSave}
            disabled={!editCategoryId || !editSubcategoryId}
            className="flex-1 h-9 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-1.5"
          >
            <Check className="size-4" />
            Done
          </button>
          <button
            onClick={onSaveAndLearn}
            disabled={!editCategoryId || !editSubcategoryId}
            className="flex-1 h-9 rounded-lg bg-signal-amber text-background text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-1.5"
          >
            <BookOpen className="size-4" />
            Learn
          </button>
        </div>
      </Card>
    )
  }

  return (
    <Card interactive onClick={onStartEdit} className="group">
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={(e) => { e.stopPropagation(); onToggleSelect() }}
          onClick={(e) => e.stopPropagation()}
          className="size-4 rounded border-border accent-primary mt-0.5 shrink-0"
        />
        <div
          className="w-1 self-stretch rounded-full shrink-0"
          style={{ backgroundColor: categoryColor }}
        />

        <div className="flex-1 min-w-0 overflow-hidden">
          {/* Single-line desktop layout */}
          <div className={cn(
            "hidden items-center gap-3 min-w-0",
            !showSource && "sm:flex"
          )}>
            <span className="text-sm font-medium text-foreground truncate flex-1 min-w-0">
              {tx.description}
            </span>
            {tx._business && <Briefcase className="size-3 text-signal-amber shrink-0" />}
            {tx._manual && <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/20 text-primary shrink-0">Manual</span>}
            <span className="text-xs text-muted-foreground shrink-0">{formatDate(tx.date)}</span>
            <span className={cn(
              "text-xs shrink-0",
              isUncategorised && "text-signal-amber",
              !isUncategorised && "text-foreground/70"
            )}>
              {isUncategorised ? "Uncategorised" : displayLabel}
            </span>
            <span className={cn(
              "text-sm font-semibold tabular-nums shrink-0",
              isIncome ? "text-signal-green" : "text-foreground"
            )}>
              {isIncome ? "+" : "-"}${Math.abs(amount).toFixed(2)}
            </span>
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
              <button
                onClick={(e) => { e.stopPropagation(); onToggleBusiness() }}
                className={cn(
                  "p-1.5 rounded-md transition-colors",
                  tx._business ? "text-signal-amber bg-signal-amber/20" : "text-muted-foreground hover:text-foreground hover:bg-surface2"
                )}
                title={tx._business ? "Mark as personal" : "Mark as business"}
              >
                <Briefcase className="size-3.5" />
              </button>
              {!isUncategorised && (
                <button
                  onClick={(e) => { e.stopPropagation(); onReset() }}
                  className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-surface2 transition-colors"
                  title="Re-apply rules"
                >
                  <RotateCcw className="size-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Two-line layout: mobile always, desktop when showSource is on */}
          <div className={cn(
            "flex flex-col gap-1",
            !showSource && "sm:hidden"
          )}>
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0 overflow-hidden">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-sm font-medium text-foreground truncate block flex-1 min-w-0">
                    {tx.description}
                  </span>
                  {tx._business && <Briefcase className="size-3 text-signal-amber shrink-0" />}
                  {tx._manual && <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/20 text-primary shrink-0">Manual</span>}
                </div>
              </div>
              <span className={cn(
                "text-sm font-semibold tabular-nums shrink-0",
                isIncome ? "text-signal-green" : "text-foreground"
              )}>
                {isIncome ? "+" : "-"}${Math.abs(amount).toFixed(2)}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                <span>{formatDate(tx.date)}</span>
                {isUncategorised ? (
                  <>
                    <span>•</span>
                    <span className="text-signal-amber">Uncategorised</span>
                  </>
                ) : (
                  <>
                    <span>•</span>
                    <span className="text-foreground/70">{displayLabel}</span>
                  </>
                )}
                {showSource && tx.file && (
                  <>
                    <span>•</span>
                    <span className="flex items-center gap-1 text-muted-foreground/70">
                      <FileText className="size-3" />
                      {tx.file}
                    </span>
                  </>
                )}
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                <button
                  onClick={(e) => { e.stopPropagation(); onToggleBusiness() }}
                  className={cn(
                    "p-1.5 rounded-md transition-colors",
                    tx._business ? "text-signal-amber bg-signal-amber/20" : "text-muted-foreground hover:text-foreground hover:bg-surface2"
                  )}
                  title={tx._business ? "Mark as personal" : "Mark as business"}
                >
                  <Briefcase className="size-3.5" />
                </button>
                {!isUncategorised && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onReset() }}
                    className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-surface2 transition-colors"
                    title="Re-apply rules"
                  >
                    <RotateCcw className="size-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </Card>
  )
}

function CSVImportModal({
  onClose,
  matchingRules,
  settings,
  updateSettings,
  transactions,
  setTransactions,
}: {
  onClose: () => void
  matchingRules: MatchingRule[]
  settings: { csvFormatMappings?: Record<string, CSVMapping> }
  updateSettings: (u: { csvFormatMappings: Record<string, CSVMapping> }) => void
  transactions: Transaction[]
  setTransactions: (txs: Transaction[]) => void
}) {
  const [step, setStep] = useState<"upload" | "preview" | "importing">("upload")
  const [file, setFile] = useState<File | null>(null)
  const [csvData, setCsvData] = useState<string[][]>([])
  const [columnMapping, setColumnMapping] = useState({
    date: 0, description: 1, amount: 2, debit: -1, credit: -1,
  })
  const [dateFormat, setDateFormat] = useState("DD/MM/YYYY")
  const [skipRows, setSkipRows] = useState(1)
  const [bankName, setBankName] = useState("")
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const savedFormats = settings.csvFormatMappings || {}

  const processFile = (selectedFile: File) => {
    setFile(selectedFile)
    const reader = new FileReader()
    reader.onload = (event) => {
      const text = event.target?.result as string
      const lines = text.split("\n").filter(line => line.trim())
      const rows = lines.map(line => {
        const result: string[] = []
        let current = ""
        let inQuotes = false
        for (let i = 0; i < line.length; i++) {
          const char = line[i]
          if (char === '"') {
            inQuotes = !inQuotes
          } else if (char === "," && !inQuotes) {
            result.push(current.trim())
            current = ""
          } else {
            current += char
          }
        }
        result.push(current.trim())
        return result
      })

      setCsvData(rows)
      setStep("preview")

      const matchedBank = Object.keys(savedFormats).find(bank =>
        selectedFile.name.toLowerCase().includes(bank.toLowerCase())
      )

      if (matchedBank && savedFormats[matchedBank]) {
        const saved = savedFormats[matchedBank]
        setBankName(matchedBank)
        setColumnMapping({
          date: saved.dateColumn,
          description: saved.descriptionColumn,
          amount: saved.amountColumn ?? -1,
          debit: saved.debitColumn ?? -1,
          credit: saved.creditColumn ?? -1,
        })
        setDateFormat(saved.dateFormat)
        setSkipRows(saved.hasHeader ? 1 : 0)
        return
      }

      if (rows.length > 0) {
        const header = rows[0].map(h => h.toLowerCase())
        const dateIdx = header.findIndex(h => h.includes("date"))
        const descIdx = header.findIndex(h => h.includes("description") || h.includes("narrative") || h.includes("details"))
        const amountIdx = header.findIndex(h => h === "amount" || h.includes("amount"))
        const debitIdx = header.findIndex(h => h.includes("debit") || h.includes("withdrawal"))
        const creditIdx = header.findIndex(h => h.includes("credit") || h.includes("deposit"))

        setColumnMapping({
          date: dateIdx >= 0 ? dateIdx : 0,
          description: descIdx >= 0 ? descIdx : 1,
          amount: amountIdx >= 0 ? amountIdx : -1,
          debit: debitIdx >= 0 ? debitIdx : -1,
          credit: creditIdx >= 0 ? creditIdx : -1,
        })

        const fileNameLower = selectedFile.name.toLowerCase()
        if (fileNameLower.includes("anz")) setBankName("ANZ")
        else if (fileNameLower.includes("macquarie") || fileNameLower.includes("mqg")) setBankName("Macquarie")
        else if (fileNameLower.includes("commbank") || fileNameLower.includes("cba")) setBankName("CommBank")
        else if (fileNameLower.includes("westpac") || fileNameLower.includes("wbc")) setBankName("Westpac")
        else if (fileNameLower.includes("nab")) setBankName("NAB")
        else setBankName("")

        if (rows.length > 1) {
          const sampleDate = rows[1][dateIdx >= 0 ? dateIdx : 0]
          if (/^\d{4}-\d{2}-\d{2}/.test(sampleDate)) setDateFormat("YYYY-MM-DD")
          else if (/^\d{2}-[A-Za-z]{3}-\d{2}/.test(sampleDate)) setDateFormat("DD-Mon-YY")
          else if (/^\d{2}-[A-Za-z]{3}-\d{4}/.test(sampleDate)) setDateFormat("DD-Mon-YYYY")
          else setDateFormat("DD/MM/YYYY")
        }
      }
    }
    reader.readAsText(selectedFile)
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (selectedFile) processFile(selectedFile)
  }

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true) }
  const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(false) }
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const droppedFile = e.dataTransfer.files?.[0]
    if (droppedFile && droppedFile.name.endsWith(".csv")) processFile(droppedFile)
  }

  const parseDate = (dateStr: string): string => {
    const monthNames: Record<string, string> = {
      jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
      jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
    }
    if (dateFormat === "YYYY-MM-DD") {
      const [year, month, day] = dateStr.split("-")
      return `${day}/${month}/${year}`
    } else if (dateFormat === "DD-Mon-YY" || dateFormat === "DD-Mon-YYYY") {
      const parts = dateStr.split("-")
      const day = parts[0].padStart(2, "0")
      const month = monthNames[parts[1].toLowerCase().slice(0, 3)] || "01"
      let year = parts[2]
      if (year.length === 2) year = parseInt(year) > 50 ? `19${year}` : `20${year}`
      return `${day}/${month}/${year}`
    }
    return dateStr
  }

  const importTransactions = () => {
    const dataRows = csvData.slice(skipRows)
    if (dataRows.length === 0) { onClose(); return }

    const newTransactions: Transaction[] = dataRows.map((row) => {
      let amount: number
      if (columnMapping.amount >= 0) {
        amount = parseFloat(row[columnMapping.amount]?.replace(/[^-\d.]/g, "") || "0")
      } else {
        const debit = parseFloat(row[columnMapping.debit]?.replace(/[^-\d.]/g, "") || "0")
        const credit = parseFloat(row[columnMapping.credit]?.replace(/[^-\d.]/g, "") || "0")
        amount = credit - debit
      }

      const description = row[columnMapping.description] || ""
      const ruleResult = applyRules(description, matchingRules)

      return {
        transactionId: crypto.randomUUID(),
        accountId: "",
        date: parseDate(row[columnMapping.date] || ""),
        amount: amount.toString(),
        description,
        categoryId: ruleResult?.categoryId ?? null,
        subcategoryId: ruleResult?.subcategoryId ?? null,
        file: file?.name || "",
        _manual: false,
        _business: ruleResult?.isBusiness ?? false,
      }
    }).filter(t => t.description && t.date)

    setTransactions([...transactions, ...newTransactions])

    if (bankName && !savedFormats[bankName]) {
      updateSettings({
        csvFormatMappings: {
          ...savedFormats,
          [bankName]: {
            fingerprint: file?.name || "",
            dateColumn: columnMapping.date,
            descriptionColumn: columnMapping.description,
            amountColumn: columnMapping.amount >= 0 ? columnMapping.amount : undefined,
            debitColumn: columnMapping.debit >= 0 ? columnMapping.debit : undefined,
            creditColumn: columnMapping.credit >= 0 ? columnMapping.credit : undefined,
            dateFormat,
            hasHeader: skipRows > 0,
            confirmedAt: new Date().toISOString(),
          },
        },
      })
    }

    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
      <Card className="w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between pb-4 border-b border-border">
          <div>
            <h3 className="text-lg font-semibold text-foreground">Import CSV</h3>
            <p className="text-xs text-muted-foreground">
              {step === "upload" && "Select a CSV file from your bank"}
              {step === "preview" && "Preview and configure column mapping"}
              {step === "importing" && "Ready to import"}
            </p>
          </div>
          <button onClick={onClose} className="p-2 text-muted-foreground hover:text-foreground">
            <X className="size-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-4">
          {step === "upload" && (
            <div
              className={cn(
                "border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer",
                isDragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
              )}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <FileText className={cn("size-12 mx-auto mb-4 transition-colors", isDragging ? "text-primary" : "text-muted-foreground")} />
              <p className="text-foreground font-medium mb-1">
                {isDragging ? "Drop CSV file here" : "Drag & drop or click to select"}
              </p>
              <p className="text-xs text-muted-foreground">Supports ANZ, Macquarie, CommBank, Westpac, NAB and most bank formats</p>
              <input ref={fileInputRef} type="file" accept=".csv" onChange={handleFileSelect} className="hidden" />
            </div>
          )}

          {step === "preview" && csvData.length > 0 && (
            <div className="space-y-4">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">File Preview (first 5 rows)</p>
                <div className="overflow-x-auto rounded-lg border border-border">
                  <table className="text-sm whitespace-nowrap">
                    <thead>
                      <tr className="border-b border-border bg-surface2">
                        {csvData[0]?.map((header, i) => {
                          const isDate = columnMapping.date === i
                          const isDesc = columnMapping.description === i
                          const isAmount = columnMapping.amount === i
                          const isDebit = columnMapping.debit === i
                          const isCredit = columnMapping.credit === i
                          const mappedAs = isDate ? "Date" : isDesc ? "Description" : isAmount ? "Amount" : isDebit ? "Debit" : isCredit ? "Credit" : null
                          return (
                            <th key={i} className={cn("px-3 py-2 text-left text-xs font-medium border-r border-border/50 last:border-0", mappedAs ? "text-primary" : "text-muted-foreground")}>
                              <div>{header || `Column ${i + 1}`}</div>
                              {mappedAs && <div className="text-[10px] font-semibold text-primary/70 mt-0.5">{mappedAs}</div>}
                            </th>
                          )
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {csvData.slice(1, 6).map((row, i) => (
                        <tr key={i} className="border-b border-border/50 last:border-0">
                          {csvData[0]?.map((_, j) => {
                            const isMapped = [columnMapping.date, columnMapping.description, columnMapping.amount, columnMapping.debit, columnMapping.credit].includes(j)
                            return (
                              <td key={j} className={cn("px-3 py-1.5 border-r border-border/50 last:border-0 max-w-[200px] truncate", isMapped ? "text-foreground bg-primary/5" : "text-muted-foreground")}>
                                {row[j] || ""}
                              </td>
                            )
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-muted-foreground block mb-1">Date Column</label>
                  <select value={columnMapping.date} onChange={(e) => setColumnMapping(m => ({ ...m, date: parseInt(e.target.value) }))} className="w-full h-9 px-2 bg-surface2 border border-border rounded-lg text-sm">
                    {csvData[0]?.map((h, i) => <option key={i} value={i}>{h || `Column ${i + 1}`}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-muted-foreground block mb-1">Description</label>
                  <select value={columnMapping.description} onChange={(e) => setColumnMapping(m => ({ ...m, description: parseInt(e.target.value) }))} className="w-full h-9 px-2 bg-surface2 border border-border rounded-lg text-sm">
                    {csvData[0]?.map((h, i) => <option key={i} value={i}>{h || `Column ${i + 1}`}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-muted-foreground block mb-1">Date Format</label>
                  <select value={dateFormat} onChange={(e) => setDateFormat(e.target.value)} className="w-full h-9 px-2 bg-surface2 border border-border rounded-lg text-sm">
                    <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                    <option value="DD-Mon-YY">DD-Mon-YY</option>
                    <option value="DD-Mon-YYYY">DD-Mon-YYYY</option>
                    <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground block mb-2">Amount Columns</label>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">Single Amount Column</label>
                    <select value={columnMapping.amount} onChange={(e) => setColumnMapping(m => ({ ...m, amount: parseInt(e.target.value), debit: -1, credit: -1 }))} className="w-full h-9 px-2 bg-surface2 border border-border rounded-lg text-sm">
                      <option value={-1}>Not used</option>
                      {csvData[0]?.map((h, i) => <option key={i} value={i}>{h || `Column ${i + 1}`}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">Debit Column (-)</label>
                    <select value={columnMapping.debit} onChange={(e) => setColumnMapping(m => ({ ...m, debit: parseInt(e.target.value), amount: -1 }))} disabled={columnMapping.amount >= 0} className="w-full h-9 px-2 bg-surface2 border border-border rounded-lg text-sm disabled:opacity-50">
                      <option value={-1}>Not used</option>
                      {csvData[0]?.map((h, i) => <option key={i} value={i}>{h || `Column ${i + 1}`}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">Credit Column (+)</label>
                    <select value={columnMapping.credit} onChange={(e) => setColumnMapping(m => ({ ...m, credit: parseInt(e.target.value), amount: -1 }))} disabled={columnMapping.amount >= 0} className="w-full h-9 px-2 bg-surface2 border border-border rounded-lg text-sm disabled:opacity-50">
                      <option value={-1}>Not used</option>
                      {csvData[0]?.map((h, i) => <option key={i} value={i}>{h || `Column ${i + 1}`}</option>)}
                    </select>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Use <strong>Single Amount</strong> if your bank uses one column with +/- values, or <strong>Debit/Credit</strong> if amounts are in separate columns.
                </p>
              </div>

              <div>
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground block mb-1">Bank Name (to remember format)</label>
                <input
                  type="text"
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  placeholder="e.g. ANZ, CommBank, Macquarie"
                  className="w-full h-9 px-3 bg-surface2 border border-border rounded-lg text-sm placeholder:text-muted-foreground"
                />
                {bankName && !!savedFormats[bankName] && (
                  <p className="text-xs text-signal-green mt-1">Using saved format for {bankName}</p>
                )}
              </div>

              <div className="p-3 bg-surface2 rounded-lg">
                <p className="text-sm text-muted-foreground">
                  Ready to import <span className="text-foreground font-medium">{csvData.length - skipRows}</span> transactions from{" "}
                  <span className="text-foreground font-medium">{file?.name}</span>
                  {bankName && !savedFormats[bankName] && (
                    <span className="text-xs text-primary ml-2">(format will be saved for {bankName})</span>
                  )}
                </p>
              </div>
            </div>
          )}

          {step === "importing" && (
            <div className="py-8 text-center space-y-4">
              <div className="flex items-center justify-center gap-2 text-signal-green">
                <Check className="size-6" />
                <p className="font-medium">Ready to import</p>
              </div>
              <p className="text-muted-foreground text-sm">All transactions will be categorized using your existing rules.</p>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 pt-4 border-t border-border">
          <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
          {(step === "preview" || step === "importing") && (
            <PrimaryButton onClick={importTransactions}>
              Import {csvData.length - skipRows} Transactions
            </PrimaryButton>
          )}
        </div>
      </Card>
    </div>
  )
}
