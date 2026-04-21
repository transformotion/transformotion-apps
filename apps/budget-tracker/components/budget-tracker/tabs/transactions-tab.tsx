"use client"

import { useState, useMemo, useRef } from "react"
import { useBudgetNavigation } from "../app-shell"
import { PageHeader, Card, PrimaryButton, SecondaryButton, EmptyState } from "@/components/ui/design-system"
import { 
  Upload, Receipt, Filter, Download, Briefcase, X, ChevronDown, ChevronRight,
  RotateCcw, Check, BookOpen, Calendar, Search, FileText, Sparkles, AlertCircle
} from "lucide-react"
import { BUDGET_CATEGORIES, CATEGORY_LIST, getSubcategories } from "../data/categories"
import { CATEGORY_COLORS } from "../data/category-colors"
import { applyRules } from "../data/builtin-rules"
import type { Transaction, TransactionFilters } from "../data/types"
import { cn } from "@/lib/utils"
import { useClaude } from "@/lib/hooks"

// Date grouping helper
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

// Format date for display
function formatDate(dateStr: string): string {
  const [day, month, year] = dateStr.split("/").map(Number)
  const date = new Date(year, month - 1, day)
  return date.toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" })
}

// Parse amount to number
function parseAmount(amount: string): number {
  return parseFloat(amount) || 0
}

// Group transactions by date
function groupByDate(transactions: Transaction[]): Map<string, Transaction[]> {
  const groups = new Map<string, Transaction[]>()
  const sortedTransactions = [...transactions].sort((a, b) => {
    const [aDay, aMonth, aYear] = a.date.split("/").map(Number)
    const [bDay, bMonth, bYear] = b.date.split("/").map(Number)
    const aDate = new Date(aYear, aMonth - 1, aDay)
    const bDate = new Date(bYear, bMonth - 1, bDay)
    return bDate.getTime() - aDate.getTime() // Most recent first
  })
  
  for (const tx of sortedTransactions) {
    const group = getDateGroup(tx.date)
    if (!groups.has(group)) {
      groups.set(group, [])
    }
    groups.get(group)!.push(tx)
  }
  
  return groups
}

// CSV Export using data: URI (CSP-safe)
function exportToCSV(transactions: Transaction[], filename: string) {
  const headers = ["Date", "Description", "Amount", "Category", "Subcategory", "Source", "Business"]
  const rows = transactions.map(t => [
    t.date,
    `"${t.description.replace(/"/g, '""')}"`,
    t.amount,
    t.category || "",
    t.subcategory || "",
    t.file || "",
    t._business ? "Yes" : "No"
  ])
  
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
  const { transactions, setTransactions, settings, customRules, addCustomRule, builtinRules, uncategorizedCount, transactionFilters, setTransactionFilters } = useBudgetNavigation()
  const customRulesRef = useRef(customRules) // Fix stale closure
  customRulesRef.current = customRules

  // Category list with disabled projects filtered out
  const disabledProjects = settings.disabledProjectCategories || []
  const activeCategoryList = CATEGORY_LIST.filter(cat => !disabledProjects.includes(cat))

  // Helper to get subcategories with disabled ones filtered out
  const getActiveSubcategories = (category: string) => {
    return getSubcategories(category).filter(sub => !disabledProjects.includes(sub))
  }
  
  const [showImport, setShowImport] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const [showSource, setShowSource] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editCategory, setEditCategory] = useState("")
  const [editSubcategory, setEditSubcategory] = useState("")
  const [searchQuery, setSearchQuery] = useState("")
  
  // Multi-select for bulk operations
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [bulkCategory, setBulkCategory] = useState("")
  const [bulkSubcategory, setBulkSubcategory] = useState("")
  const [showBulkEdit, setShowBulkEdit] = useState(false)
  
  // Use filters from context (persisted across tab navigation)
  const filters = transactionFilters
  const setFilters = setTransactionFilters

  // Get unique sources for filter dropdown
  const uniqueSources = useMemo(() => {
    const sources = new Set<string>()
    transactions.forEach(t => { if (t.file) sources.add(t.file) })
    return Array.from(sources).sort()
  }, [transactions])

  // Get unique categories from actual transactions (not master list)
  const usedCategories = useMemo(() => {
    const cats = new Set<string>()
    transactions.forEach(t => { if (t.category) cats.add(t.category) })
    return Array.from(cats).sort()
  }, [transactions])

  // Get unique subcategories for selected category
  const usedSubcategories = useMemo(() => {
    if (!filters.category) return []
    const subs = new Set<string>()
    transactions.forEach(t => {
      if (t.category === filters.category && t.subcategory) subs.add(t.subcategory)
    })
    return Array.from(subs).sort()
  }, [transactions, filters.category])

  // Count active filters for badge
  const activeFilterCount = useMemo(() => {
    let count = 0
    if (filters.category) count++
    if (filters.subcategory) count++
    if (filters.source) count++
    if (filters.dateRange) count++
    if (filters.uncategorizedOnly) count++
    if (filters.businessFilter !== "all") count++
    return count
  }, [filters])

  // Filter transactions
  const filteredTransactions = useMemo(() => {
    return transactions.filter(t => {
      // Business filter
      if (filters.businessFilter === "personal" && t._business) return false
      if (filters.businessFilter === "business" && !t._business) return false
      
      // Category filter
      if (filters.category && t.category !== filters.category) return false

      // Subcategory filter
      if (filters.subcategory && t.subcategory !== filters.subcategory) return false
      
      // Source filter
      if (filters.source && t.file !== filters.source) return false
      
      // Uncategorized only
      if (filters.uncategorizedOnly && t.category) return false

      // Date range filter
      if (filters.dateRange) {
        const txDate = new Date(t.date)
        if (txDate < filters.dateRange.start || txDate > filters.dateRange.end) return false
      }
      
      // Search query
      if (searchQuery) {
        const query = searchQuery.toLowerCase()
        return t.description.toLowerCase().includes(query) ||
               (t.category?.toLowerCase().includes(query)) ||
               (t.subcategory?.toLowerCase().includes(query))
      }
      
      return true
    })
  }, [transactions, filters, searchQuery])

  // Group filtered transactions
  const groupedTransactions = useMemo(() => groupByDate(filteredTransactions), [filteredTransactions])
  
  const hasTransactions = transactions.length > 0
  const businessCount = transactions.filter(t => t._business).length

  // Toggle business flag
  const toggleBusiness = (id: number) => {
    const updatedTransactions = transactions.map(t => 
      t._id === id ? { ...t, _business: !t._business } : t
    )
    setTransactions(updatedTransactions)
  }

  // Reset single transaction (re-apply rules)
  const resetTransaction = (id: number) => {
    const updatedTransactions = transactions.map(t => {
      if (t._id !== id) return t
      
      // Re-apply rules using unified applyRules function
      const result = applyRules(t.description, builtinRules, customRulesRef.current)
      if (result) {
        return { ...t, category: result.category, subcategory: result.subcategory, _manual: false }
      }
      
      return { ...t, _manual: false }
    })
    setTransactions(updatedTransactions)
  }

  // Start editing a transaction
  const startEdit = (tx: Transaction) => {
    setEditingId(tx._id)
    setEditCategory(tx.category || "")
    setEditSubcategory(tx.subcategory || "")
  }

  // Save edit (Done button)
  const saveEdit = () => {
    if (editingId === null) return
    
    // setTransactions expects an array, not a callback
    const updatedTransactions = transactions.map(t =>
      t._id === editingId 
        ? { ...t, category: editCategory, subcategory: editSubcategory, _manual: true }
        : t
    )
    setTransactions(updatedTransactions)
    setEditingId(null)
  }

  // Save and create rule (Learn button)
  const saveAndLearn = () => {
    if (editingId === null) return
    const tx = transactions.find(t => t._id === editingId)
    if (!tx) return
    
    // Create a rule from first 3 words
    const words = tx.description.split(/\s+/).slice(0, 3).join(" ")
    const newRule = {
      id: `custom-${Date.now()}`,
      name: words,
      pattern: words,
      matchType: "contains" as const,
      category: editCategory,
      subcategory: editSubcategory,
      isBusiness: false,
      enabled: true,
      priority: 100,
      createdAt: new Date().toISOString(),
    }
    addCustomRule(newRule)
    
    // Re-apply ALL rules to ALL uncategorized transactions (and the edited one)
    // Include the new rule in the set
    const allCustomRules = [...customRules, newRule]
    const updatedTransactions = transactions.map(t => {
      // Always update the current transaction being edited
      if (t._id === editingId) {
        return { ...t, category: editCategory, subcategory: editSubcategory, _manual: true }
      }
      // Re-apply rules to uncategorized transactions
      if (!t.category || !t._manual) {
        const result = applyRules(t.description, builtinRules, allCustomRules)
        if (result) {
          return { ...t, category: result.category, subcategory: result.subcategory, _business: result.isBusiness ?? false, _manual: false }
        }
      }
      return t
    })
    setTransactions(updatedTransactions)

    setEditingId(null)
  }

  // Export business transactions
  const exportBusiness = () => {
    const businessTx = transactions.filter(t => t._business)
    exportToCSV(businessTx, `business-expenses-${new Date().toISOString().split("T")[0]}.csv`)
  }

  // Export all filtered transactions
  const exportFiltered = () => {
    exportToCSV(filteredTransactions, `transactions-${new Date().toISOString().split("T")[0]}.csv`)
  }

  // Multi-select helpers
  const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectAll = () => {
    setSelectedIds(new Set(filteredTransactions.map(t => t._id)))
  }

  const clearSelection = () => {
    setSelectedIds(new Set())
    setShowBulkEdit(false)
    setBulkCategory("")
    setBulkSubcategory("")
  }

  // Apply bulk category to selected transactions
  const applyBulkCategory = () => {
    if (!bulkCategory || selectedIds.size === 0) return
    const updatedTransactions = transactions.map(t =>
      selectedIds.has(t._id)
        ? { ...t, category: bulkCategory, subcategory: bulkSubcategory || '', _manual: true }
        : t
    )
    setTransactions(updatedTransactions)
    clearSelection()
  }

  // Re-apply rules to selected transactions
  const reapplyRulesToSelected = () => {
    if (selectedIds.size === 0) return
    const updatedTransactions = transactions.map(t => {
      if (!selectedIds.has(t._id)) return t
      const result = applyRules(t.description, builtinRules, customRules)
      if (result) {
        return { ...t, category: result.category, subcategory: result.subcategory, _business: result.isBusiness ?? false, _manual: false }
      }
      return { ...t, category: '', subcategory: '', _business: false, _manual: false }
    })
    setTransactions(updatedTransactions)
    clearSelection()
  }

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <PageHeader
        title="Transactions"
        subtitle={hasTransactions 
          ? `${transactions.length} transactions${uncategorizedCount > 0 ? ` • ${uncategorizedCount} uncategorised` : ""}`
          : "Import and manage your transactions"
        }
      />

      {/* Action Bar */}
      <div className="flex items-center gap-2">
        {hasTransactions ? (
          <>
            {/* Compact import button when transactions exist */}
            <button
              onClick={() => setShowImport(true)}
              className="size-11 rounded-xl bg-card border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors"
              title="Import CSV"
            >
              <Upload className="size-5" />
            </button>
            <div className="flex-1" />
            {/* Uncategorised quick-toggle */}
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
              <button
                onClick={() => setFilters({ dateRange: null, category: null, subcategory: null, bankAccount: null, source: null, businessFilter: "all", uncategorizedOnly: false })}
                className="text-xs text-primary hover:underline"
              >
                Clear all ({activeFilterCount})
              </button>
            )}
          </div>

          {/* Type */}
          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground block mb-2">Type</label>
            <div className="flex items-center gap-2 flex-wrap">
              {(["all", "personal", "business"] as const).map((filter) => (
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
                </button>
              ))}
            </div>
          </div>

          {/* Date Range */}
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

          {/* Category + Subcategory */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground block mb-2">Category</label>
              <select
                value={filters.category || ""}
                onChange={(e) => setFilters(f => ({ ...f, category: e.target.value || null, subcategory: null }))}
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
                value={filters.subcategory || ""}
                onChange={(e) => setFilters(f => ({ ...f, subcategory: e.target.value || null }))}
                disabled={!filters.category || usedSubcategories.length === 0}
                className="w-full h-10 px-3 bg-surface2 border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-40"
              >
                <option value="">All subcategories</option>
                {usedSubcategories.map(sub => (
                  <option key={sub} value={sub}>{sub}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Source File */}
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

          {/* Uncategorised Toggle */}
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

          {/* Business Export */}
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
                value={bulkCategory}
                onChange={(e) => {
                  setBulkCategory(e.target.value)
                  setBulkSubcategory("")
                }}
                className="h-8 px-2 bg-background border border-border rounded text-sm min-w-[140px]"
              >
                <option value="">Select category</option>
                {activeCategoryList.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
              {bulkCategory && (
                <select
                  value={bulkSubcategory}
                  onChange={(e) => setBulkSubcategory(e.target.value)}
                  className="h-8 px-2 bg-background border border-border rounded text-sm min-w-[140px]"
                >
                  <option value="">No subcategory</option>
                  {getActiveSubcategories(bulkCategory).map(sub => (
                    <option key={sub} value={sub}>{sub}</option>
                  ))}
                </select>
              )}
              <PrimaryButton onClick={applyBulkCategory} disabled={!bulkCategory}>
                Apply
              </PrimaryButton>
              <button onClick={() => setShowBulkEdit(false)} className="p-1 text-muted-foreground hover:text-foreground">
                <X className="size-4" />
              </button>
            </div>
          )}
        </Card>
      )}

      {/* Empty State */}
      {!hasTransactions && (
        <EmptyState
          icon={Receipt}
          title="No transactions yet"
          description="Import a CSV file from your bank to get started"
        />
      )}

      {/* Transaction List */}
      {hasTransactions && filteredTransactions.length === 0 && (
        <div className="py-12 text-center">
          <p className="text-muted-foreground">No transactions match your filters</p>
          <button
            onClick={() => {
              setFilters({
                dateRange: null,
                category: null,
                subcategory: null,
                bankAccount: null,
                source: null,
                businessFilter: "all",
                uncategorizedOnly: false
              })
              setSearchQuery("")
            }}
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
              {/* Date Group Header */}
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{group}</span>
                <div className="flex-1 h-px bg-border" />
              </div>
              
              {/* Transactions in Group */}
              <div className="space-y-2">
                {txs.map((tx) => (
                  <TransactionRow
                    key={tx._id}
                    transaction={tx}
                    isEditing={editingId === tx._id}
                    editCategory={editCategory}
                    editSubcategory={editSubcategory}
                    showSource={showSource}
                    isSelected={selectedIds.has(tx._id)}
                    categoryList={activeCategoryList}
                    disabledProjects={disabledProjects}
                    onToggleSelect={() => toggleSelect(tx._id)}
                    onStartEdit={() => startEdit(tx)}
                    onCancelEdit={() => setEditingId(null)}
                    onSave={saveEdit}
                    onSaveAndLearn={saveAndLearn}
                    onToggleBusiness={() => toggleBusiness(tx._id)}
                    onReset={() => resetTransaction(tx._id)}
                    onCategoryChange={setEditCategory}
                    onSubcategoryChange={setEditSubcategory}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Import Modal */}
      {showImport && (
        <CSVImportModal onClose={() => setShowImport(false)} />
      )}
    </div>
  )
}

// Transaction Row Component
interface TransactionRowProps {
  transaction: Transaction
  isEditing: boolean
  editCategory: string
  editSubcategory: string
  showSource: boolean
  isSelected: boolean
  categoryList: string[]
  disabledProjects: string[]
  onToggleSelect: () => void
  onStartEdit: () => void
  onCancelEdit: () => void
  onSave: () => void
  onSaveAndLearn: () => void
  onToggleBusiness: () => void
  onReset: () => void
  onCategoryChange: (cat: string) => void
  onSubcategoryChange: (sub: string) => void
}

function TransactionRow({
  transaction: tx,
  isEditing,
  editCategory,
  editSubcategory,
  showSource,
  isSelected,
  categoryList,
  disabledProjects,
  onToggleSelect,
  onStartEdit,
  onCancelEdit,
  onSave,
  onSaveAndLearn,
  onToggleBusiness,
  onReset,
  onCategoryChange,
  onSubcategoryChange
}: TransactionRowProps) {
  const amount = parseAmount(tx.amount)
  const isIncome = amount > 0
  const categoryColor = CATEGORY_COLORS[tx.category] || CATEGORY_COLORS["default"]
  
  if (isEditing) {
    return (
      <Card className="space-y-3">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground truncate">{tx.description}</p>
            <p className="text-xs text-muted-foreground">{formatDate(tx.date)}</p>
          </div>
          <button onClick={onCancelEdit} className="p-1 text-muted-foreground hover:text-foreground">
            <X className="size-4" />
          </button>
        </div>
        
        {/* Category Picker */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground block mb-1">Category</label>
            <select
              value={editCategory}
              onChange={(e) => {
                onCategoryChange(e.target.value)
                onSubcategoryChange("")
              }}
              className="w-full h-9 px-2 bg-surface2 border border-border rounded-lg text-sm text-foreground"
            >
              <option value="">Select...</option>
              {categoryList.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground block mb-1">Subcategory</label>
            <select
              value={editSubcategory}
              onChange={(e) => onSubcategoryChange(e.target.value)}
              className="w-full h-9 px-2 bg-surface2 border border-border rounded-lg text-sm text-foreground"
              disabled={!editCategory}
            >
              <option value="">Select...</option>
              {editCategory && getSubcategories(editCategory)
                .filter(sub => !disabledProjects.includes(sub))
                .map(sub => (
                  <option key={sub} value={sub}>{sub}</option>
                ))}
            </select>
          </div>
        </div>
        
        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={onCancelEdit}
            className="h-9 px-4 rounded-lg bg-surface2 text-muted-foreground text-sm font-medium hover:text-foreground flex items-center justify-center"
          >
            Cancel
          </button>
          <button
            onClick={onSave}
            disabled={!editCategory || !editSubcategory}
            className="flex-1 h-9 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-1.5"
          >
            <Check className="size-4" />
            Done
          </button>
          <button
            onClick={onSaveAndLearn}
            disabled={!editCategory || !editSubcategory}
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
    <Card 
      interactive 
      onClick={onStartEdit}
      className="group"
    >
      <div className="flex items-start gap-3">
        {/* Selection Checkbox */}
        <input
          type="checkbox"
          checked={isSelected}
          onChange={(e) => { e.stopPropagation(); onToggleSelect() }}
          onClick={(e) => e.stopPropagation()}
          className="size-4 rounded border-border accent-primary mt-0.5 shrink-0"
        />
        {/* Category Color Bar */}
        <div 
          className="w-1 self-stretch rounded-full shrink-0"
          style={{ backgroundColor: categoryColor }}
        />
        
        <div className="flex-1 min-w-0 overflow-hidden">
          {/* Top Row: Description + Amount */}
          {/* 
            Layout:
            - Mobile (default): two rows - description+amount on top, meta on bottom
            - Desktop (sm+): single row when showSource is off
                             two rows when showSource is on
          */}

          {/* Single-line desktop layout */}
          <div className={cn(
            "hidden items-center gap-3 min-w-0",
            !showSource && "sm:flex"
          )}>
            {/* Description */}
            <span className="text-sm font-medium text-foreground truncate flex-1 min-w-0">
              {tx.description}
            </span>
            {/* Badges */}
            {tx._business && <Briefcase className="size-3 text-signal-amber shrink-0" />}
            {tx._manual && <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/20 text-primary shrink-0">Manual</span>}
            {/* Date */}
            <span className="text-xs text-muted-foreground shrink-0">{formatDate(tx.date)}</span>
            {/* Category pill */}
            <span className={cn(
              "text-xs shrink-0",
              !tx.category && "text-signal-amber",
              tx.category && "text-foreground/70"
            )}>
              {tx.category ? (tx.subcategory || tx.category) : "Uncategorised"}
            </span>
            {/* Amount */}
            <span className={cn(
              "text-sm font-semibold tabular-nums shrink-0",
              isIncome ? "text-signal-green" : "text-foreground"
            )}>
              {isIncome ? "+" : "-"}${Math.abs(amount).toFixed(2)}
            </span>
            {/* Action Buttons */}
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
              {tx.category && (
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
            {/* Top row: description + amount */}
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

            {/* Bottom row: date, category, source, actions */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                <span>{formatDate(tx.date)}</span>
                {tx.category && (
                  <>
                    <span>•</span>
                    <span className="text-foreground/70">{tx.subcategory || tx.category}</span>
                  </>
                )}
                {!tx.category && (
                  <>
                    <span>•</span>
                    <span className="text-signal-amber">Uncategorised</span>
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
              {/* Action Buttons */}
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
                {tx.category && (
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

// CSV Import Modal
function CSVImportModal({ onClose }: { onClose: () => void }) {
  const { transactions, setTransactions, settings, updateSettings, builtinRules, customRules } = useBudgetNavigation()
  const [step, setStep] = useState<"upload" | "preview" | "categorizing" | "importing">("upload")
  
  // AI Smart Import
  const { callClaude, isLoading: isCategorizingAI, error: aiError } = useClaude<{
    categorizations: Array<{
      description: string
      category: string
      subcategory: string
      isBusiness: boolean
    }>
  }>()
  const [aiCategorizations, setAiCategorizations] = useState<Map<string, { category: string; subcategory: string; isBusiness: boolean }>>(new Map())
  const [file, setFile] = useState<File | null>(null)
  const [csvData, setCsvData] = useState<string[][]>([])
  const [columnMapping, setColumnMapping] = useState({
    date: 0,
    description: 1,
    amount: 2,
    debit: -1,
    credit: -1
  })
  const [dateFormat, setDateFormat] = useState("DD/MM/YYYY")
  const [skipRows, setSkipRows] = useState(1)
  const [bankName, setBankName] = useState("")
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  // Saved format mappings from settings
  const savedFormats: Record<string, unknown> = settings.csvFormatMappings || {}

  // Process file (shared by both click and drag)
  const processFile = (selectedFile: File) => {
    setFile(selectedFile)
    
    const reader = new FileReader()
    reader.onload = (event) => {
      const text = event.target?.result as string
      const lines = text.split("\n").filter(line => line.trim())
      const rows = lines.map(line => {
        // Simple CSV parsing (handles basic quoted fields)
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
      
      // Check if we have a saved format for this bank
      const matchedBank = Object.keys(savedFormats).find(bank => 
        selectedFile.name.toLowerCase().includes(bank.toLowerCase())
      )
      
      if (matchedBank && savedFormats[matchedBank]) {
        const saved = savedFormats[matchedBank] as { columnMapping: typeof columnMapping; dateFormat: string; skipRows: number }
        setBankName(matchedBank)
        setColumnMapping(saved.columnMapping)
        setDateFormat(saved.dateFormat)
        setSkipRows(saved.skipRows)
        return
      }
      
      // Auto-detect column mapping
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
          credit: creditIdx >= 0 ? creditIdx : -1
        })
        
        // Try to guess bank name from filename
        const fileNameLower = selectedFile.name.toLowerCase()
        if (fileNameLower.includes("anz")) setBankName("ANZ")
        else if (fileNameLower.includes("macquarie") || fileNameLower.includes("mqg")) setBankName("Macquarie")
        else if (fileNameLower.includes("commbank") || fileNameLower.includes("cba")) setBankName("CommBank")
        else if (fileNameLower.includes("westpac") || fileNameLower.includes("wbc")) setBankName("Westpac")
        else if (fileNameLower.includes("nab")) setBankName("NAB")
        else setBankName("")
        
        // Auto-detect date format from first data row
        if (rows.length > 1) {
          const sampleDate = rows[1][dateIdx >= 0 ? dateIdx : 0]
          if (/^\d{4}-\d{2}-\d{2}/.test(sampleDate)) {
            setDateFormat("YYYY-MM-DD")
          } else if (/^\d{2}-[A-Za-z]{3}-\d{2}/.test(sampleDate)) {
            setDateFormat("DD-Mon-YY")
          } else if (/^\d{2}-[A-Za-z]{3}-\d{4}/.test(sampleDate)) {
            setDateFormat("DD-Mon-YYYY")
          } else {
            setDateFormat("DD/MM/YYYY")
          }
        }
      }
    }
    reader.readAsText(selectedFile)
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (!selectedFile) return
    processFile(selectedFile)
  }

  // Drag and drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    
    const droppedFile = e.dataTransfer.files?.[0]
    if (droppedFile && droppedFile.name.endsWith(".csv")) {
      processFile(droppedFile)
    }
  }

  const parseDate = (dateStr: string): string => {
    // Normalize to DD/MM/YYYY
    const monthNames: Record<string, string> = {
      jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
      jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12"
    }
    
    if (dateFormat === "YYYY-MM-DD") {
      const [year, month, day] = dateStr.split("-")
      return `${day}/${month}/${year}`
    } else if (dateFormat === "DD-Mon-YY" || dateFormat === "DD-Mon-YYYY") {
      const parts = dateStr.split("-")
      const day = parts[0].padStart(2, "0")
      const month = monthNames[parts[1].toLowerCase().slice(0, 3)] || "01"
      let year = parts[2]
      if (year.length === 2) {
        year = parseInt(year) > 50 ? `19${year}` : `20${year}`
      }
      return `${day}/${month}/${year}`
    }
    
    // Assume DD/MM/YYYY
    return dateStr
  }

  // AI Smart Categorization
  const runAICategorization = async () => {
    const dataRows = csvData.slice(skipRows)
    if (dataRows.length === 0) return

    // Get unique descriptions that don't already have rules
    const descriptions = dataRows
      .map(row => row[columnMapping.description] || "")
      .filter(desc => desc && !applyRules(desc, builtinRules, customRules))
      .slice(0, 50) // Limit to 50 unique descriptions

    const uniqueDescriptions = [...new Set(descriptions)]
    if (uniqueDescriptions.length === 0) {
      setStep("importing")
      return
    }

    setStep("categorizing")

    const result = await callClaude({
      prompt: `Categorize these transaction descriptions. Return a JSON object with "categorizations" array.

Available categories: ${CATEGORY_LIST.join(", ")}

Transactions to categorize:
${uniqueDescriptions.map(d => `- "${d}"`).join('\n')}

For each transaction, return:
- description: the exact description string
- category: one of the available categories
- subcategory: appropriate subcategory for that category
- isBusiness: boolean if this looks like a business expense

Return ONLY valid JSON.`,
      systemPrompt: "You are a financial transaction categorizer. Categorize each transaction based on the description. Respond with valid JSON only.",
    })

    if (result?.categorizations) {
      const newMap = new Map<string, { category: string; subcategory: string; isBusiness: boolean }>()
      for (const cat of result.categorizations) {
        newMap.set(cat.description, {
          category: cat.category,
          subcategory: cat.subcategory,
          isBusiness: cat.isBusiness
        })
      }
      setAiCategorizations(newMap)
    }
    
    setStep("importing")
  }

  const importTransactions = () => {
    const dataRows = csvData.slice(skipRows)
    
    if (dataRows.length === 0) {
      onClose()
      return
    }
    
    const maxId = transactions.reduce((max, t) => Math.max(max, t._id), 0)
    
    const newTransactions: Transaction[] = dataRows.map((row, idx) => {
      let amount: number
      
      if (columnMapping.amount >= 0) {
        amount = parseFloat(row[columnMapping.amount]?.replace(/[^-\d.]/g, "") || "0")
      } else {
        const debit = parseFloat(row[columnMapping.debit]?.replace(/[^-\d.]/g, "") || "0")
        const credit = parseFloat(row[columnMapping.credit]?.replace(/[^-\d.]/g, "") || "0")
        amount = credit - debit
      }
      
      const description = row[columnMapping.description] || ""
      
      // Auto-categorize using unified rules function (custom rules first, then built-in)
      const ruleResult = applyRules(description, builtinRules, customRules)
      
      // Fall back to AI categorization if no rule matched
      const aiResult = !ruleResult ? aiCategorizations.get(description) : null
      
      return {
        _id: maxId + idx + 1,
        date: parseDate(row[columnMapping.date] || ""),
        amount: amount.toString(),
        description,
        category: ruleResult?.category || aiResult?.category || "",
        subcategory: ruleResult?.subcategory || aiResult?.subcategory || "",
        file: file?.name || "",
        _manual: false,
        _business: aiResult?.isBusiness || false
      }
    }).filter(t => t.description && t.date)
    
    const updatedTransactions = [...transactions, ...newTransactions]
    setTransactions(updatedTransactions)
    
    // Save format mapping for this bank
    if (bankName && !savedFormats[bankName]) {
      updateSettings({
        csvFormatMappings: {
          ...savedFormats,
          [bankName]: {
            columnMapping,
            dateFormat,
            skipRows
          }
        }
      })
    }
    
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
      <Card className="w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-border">
          <div>
            <h3 className="text-lg font-semibold text-foreground">Import CSV</h3>
            <p className="text-xs text-muted-foreground">
              {step === "upload" && "Select a CSV file from your bank"}
              {step === "preview" && "Preview and configure column mapping"}
              {step === "categorizing" && "AI is categorizing your transactions..."}
              {step === "importing" && "Ready to import"}
            </p>
          </div>
          <button onClick={onClose} className="p-2 text-muted-foreground hover:text-foreground">
            <X className="size-5" />
          </button>
        </div>
        
        {/* Content */}
        <div className="flex-1 overflow-y-auto py-4">
          {step === "upload" && (
            <div 
              className={cn(
                "border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer",
                isDragging 
                  ? "border-primary bg-primary/5" 
                  : "border-border hover:border-primary/50"
              )}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <FileText className={cn(
                "size-12 mx-auto mb-4 transition-colors",
                isDragging ? "text-primary" : "text-muted-foreground"
              )} />
              <p className="text-foreground font-medium mb-1">
                {isDragging ? "Drop CSV file here" : "Drag & drop or click to select"}
              </p>
              <p className="text-xs text-muted-foreground">Supports ANZ, Macquarie, CommBank, Westpac, NAB and most bank formats</p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={handleFileSelect}
                className="hidden"
              />
            </div>
          )}
          
          {step === "preview" && csvData.length > 0 && (
            <div className="space-y-4">
              {/* Preview Table */}
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
                            <th key={i} className={cn(
                              "px-3 py-2 text-left text-xs font-medium border-r border-border/50 last:border-0",
                              mappedAs ? "text-primary" : "text-muted-foreground"
                            )}>
                              <div>{header || `Column ${i + 1}`}</div>
                              {mappedAs && (
                                <div className="text-[10px] font-semibold text-primary/70 mt-0.5">{mappedAs}</div>
                              )}
                            </th>
                          )
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {csvData.slice(1, 6).map((row, i) => (
                        <tr key={i} className="border-b border-border/50 last:border-0">
                          {csvData[0]?.map((_, j) => {
                            const isDate = columnMapping.date === j
                            const isDesc = columnMapping.description === j
                            const isAmount = columnMapping.amount === j
                            const isDebit = columnMapping.debit === j
                            const isCredit = columnMapping.credit === j
                            const isMapped = isDate || isDesc || isAmount || isDebit || isCredit
                            return (
                              <td key={j} className={cn(
                                "px-3 py-1.5 border-r border-border/50 last:border-0 max-w-[200px] truncate",
                                isMapped ? "text-foreground bg-primary/5" : "text-muted-foreground"
                              )}>
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
              
              {/* Column Mapping */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-muted-foreground block mb-1">Date Column</label>
                  <select
                    value={columnMapping.date}
                    onChange={(e) => setColumnMapping(m => ({ ...m, date: parseInt(e.target.value) }))}
                    className="w-full h-9 px-2 bg-surface2 border border-border rounded-lg text-sm"
                  >
                    {csvData[0]?.map((h, i) => (
                      <option key={i} value={i}>{h || `Column ${i + 1}`}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-muted-foreground block mb-1">Description</label>
                  <select
                    value={columnMapping.description}
                    onChange={(e) => setColumnMapping(m => ({ ...m, description: parseInt(e.target.value) }))}
                    className="w-full h-9 px-2 bg-surface2 border border-border rounded-lg text-sm"
                  >
                    {csvData[0]?.map((h, i) => (
                      <option key={i} value={i}>{h || `Column ${i + 1}`}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-muted-foreground block mb-1">Date Format</label>
                  <select
                    value={dateFormat}
                    onChange={(e) => setDateFormat(e.target.value)}
                    className="w-full h-9 px-2 bg-surface2 border border-border rounded-lg text-sm"
                  >
                    <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                    <option value="DD-Mon-YY">DD-Mon-YY</option>
                    <option value="DD-Mon-YYYY">DD-Mon-YYYY</option>
                    <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                  </select>
                </div>
              </div>

              {/* Amount Mapping */}
              <div>
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground block mb-2">Amount Columns</label>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">Single Amount Column</label>
                    <select
                      value={columnMapping.amount}
                      onChange={(e) => setColumnMapping(m => ({ ...m, amount: parseInt(e.target.value), debit: -1, credit: -1 }))}
                      className="w-full h-9 px-2 bg-surface2 border border-border rounded-lg text-sm"
                    >
                      <option value={-1}>Not used</option>
                      {csvData[0]?.map((h, i) => (
                        <option key={i} value={i}>{h || `Column ${i + 1}`}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">Debit Column (-)</label>
                    <select
                      value={columnMapping.debit}
                      onChange={(e) => setColumnMapping(m => ({ ...m, debit: parseInt(e.target.value), amount: -1 }))}
                      disabled={columnMapping.amount >= 0}
                      className="w-full h-9 px-2 bg-surface2 border border-border rounded-lg text-sm disabled:opacity-50"
                    >
                      <option value={-1}>Not used</option>
                      {csvData[0]?.map((h, i) => (
                        <option key={i} value={i}>{h || `Column ${i + 1}`}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">Credit Column (+)</label>
                    <select
                      value={columnMapping.credit}
                      onChange={(e) => setColumnMapping(m => ({ ...m, credit: parseInt(e.target.value), amount: -1 }))}
                      disabled={columnMapping.amount >= 0}
                      className="w-full h-9 px-2 bg-surface2 border border-border rounded-lg text-sm disabled:opacity-50"
                    >
                      <option value={-1}>Not used</option>
                      {csvData[0]?.map((h, i) => (
                        <option key={i} value={i}>{h || `Column ${i + 1}`}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Use <strong>Single Amount</strong> if your bank uses one column with +/- values, or <strong>Debit/Credit</strong> if amounts are in separate columns (like Macquarie).
                </p>
              </div>
              
              {/* Bank Name Input */}
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

              {/* Import Info */}
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
          
          {step === "categorizing" && (
            <div className="py-8 text-center">
              <Sparkles className="size-8 text-primary mx-auto mb-4 animate-pulse" />
              <p className="text-foreground font-medium mb-2">AI Smart Categorization</p>
              <p className="text-muted-foreground text-sm">Analysing {csvData.length - skipRows} transactions...</p>
              {aiError && (
                <div className="mt-4 p-3 rounded-lg bg-signal-red/10 border border-signal-red/20 flex items-start gap-2 max-w-md mx-auto">
                  <AlertCircle className="size-4 text-signal-red mt-0.5 shrink-0" />
                  <div className="text-sm text-signal-red text-left">{aiError?.message}</div>
                </div>
              )}
            </div>
          )}
          
          {step === "importing" && (
            <div className="py-8 text-center space-y-4">
              <div className="flex items-center justify-center gap-2 text-signal-green">
                <Check className="size-6" />
                <p className="font-medium">Ready to import</p>
              </div>
              <p className="text-muted-foreground text-sm">
                {aiCategorizations.size > 0 
                  ? `AI categorized ${aiCategorizations.size} transactions that had no matching rules.`
                  : "All transactions will be categorized using your existing rules."}
              </p>
            </div>
          )}
        </div>
        
        {/* Footer */}
        <div className="flex items-center justify-end gap-2 pt-4 border-t border-border">
          <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
          {step === "preview" && (
            <>
              <SecondaryButton onClick={importTransactions}>
                Import without AI
              </SecondaryButton>
              <PrimaryButton onClick={runAICategorization} disabled={isCategorizingAI}>
                <Sparkles className="size-4 mr-2" />
                Smart Import
              </PrimaryButton>
            </>
          )}
          {step === "importing" && (
            <PrimaryButton onClick={importTransactions}>
              Import {csvData.length - skipRows} Transactions
            </PrimaryButton>
          )}
        </div>
      </Card>
    </div>
  )
}
