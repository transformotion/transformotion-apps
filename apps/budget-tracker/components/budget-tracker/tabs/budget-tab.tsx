"use client"

import { useState, useMemo } from "react"
import { useBudgetNavigation } from "../app-shell"
import { PageHeader, Card, PrimaryButton, SecondaryButton } from "@/components/ui/design-system"
import { ChevronDown, Plus, Pencil, Trash2, RotateCcw, X, Check, Undo2 } from "lucide-react"
import { BUDGET_CATEGORIES, CATEGORY_LIST } from "../data/categories"
import { DEFAULT_BUDGETS, FREQUENCY_LABELS, FREQUENCY_TO_MONTHLY, toMonthlyAmount, type BudgetFrequency } from "../data/default-budgets"
import { CATEGORY_COLORS } from "../data/category-colors"
import { PROJECT_CATEGORIES, PROJECT_SUBCATEGORIES, isProjectCategory, isProjectSubcategory, DEFAULT_PROJECT_BUDGETS } from "../data/project-config"
import type { Transaction } from "../data/types"
import { cn } from "@/lib/utils"

// Parse date to get month key
function getMonthKey(dateStr: string): string {
  const [day, month, year] = dateStr.split("/").map(Number)
  return `${year}-${String(month).padStart(2, "0")}`
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

export function BudgetTab() {
  const { 
    transactions,
    setTransactions,
    settings,
    updateSettings
  } = useBudgetNavigation()
  const budgetSettings = settings
  const setBudgetSettings = updateSettings

  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set())
  const [editingSubcategory, setEditingSubcategory] = useState<string | null>(null)
  const [editBudget, setEditBudget] = useState("")
  const [editFrequency, setEditFrequency] = useState<BudgetFrequency>("monthly")
  const [editName, setEditName] = useState("")
  const [addingToCategory, setAddingToCategory] = useState<string | null>(null)
  const [newSubcategoryName, setNewSubcategoryName] = useState("")
  const [showUpdateFeedback, setShowUpdateFeedback] = useState<string | null>(null)

  // Add category state
  const [addingCategory, setAddingCategory] = useState<"recurring" | "project" | null>(null)
  const [newCategoryName, setNewCategoryName] = useState("")

  // Edit category name state (for regular categories)
  const [editingCategory, setEditingCategory] = useState<string | null>(null)
  const [editCategoryName, setEditCategoryName] = useState("")

  // Delete modal - handles both subcategory and full category deletion
  type DeleteTarget =
    | { kind: "subcategory"; subcategory: string; category: string; count: number }
    | { kind: "category"; category: string; isProject: boolean; count: number }
  const [deleteModal, setDeleteModal] = useState<DeleteTarget | null>(null)
  const [deleteTransferTo, setDeleteTransferTo] = useState("")

  // Project editing state
  const [editingProject, setEditingProject] = useState<string | null>(null)
  const [editProjectName, setEditProjectName] = useState("")
  const [editProjectBudget, setEditProjectBudget] = useState("")
  const [editingProjectTask, setEditingProjectTask] = useState<{ project: string; task: string } | null>(null)
  const [editTaskBudget, setEditTaskBudget] = useState("")
  const [addingProjectTask, setAddingProjectTask] = useState<string | null>(null)
  const [newProjectTaskName, setNewProjectTaskName] = useState("")
  const [newProjectTaskBudget, setNewProjectTaskBudget] = useState("")

  // Calculate actual spending by subcategory
  const actualsBySubcategory = useMemo(() => {
    const actuals: Record<string, number> = {}
    const months = new Set<string>()
    
    for (const tx of transactions) {
      if (tx._business || tx.subcategory === "Transfer") continue
      
      const monthKey = getMonthKey(tx.date)
      months.add(monthKey)
      
      if (tx.subcategory) {
        if (!actuals[tx.subcategory]) actuals[tx.subcategory] = 0
        actuals[tx.subcategory] += Math.abs(parseFloat(tx.amount) || 0)
      }
    }
    
    const monthCount = Math.max(months.size, 1)
    
    // Return average monthly spend
    const avgActuals: Record<string, number> = {}
    for (const [sub, total] of Object.entries(actuals)) {
      avgActuals[sub] = total / monthCount
    }
    
    return { actuals: avgActuals, monthCount }
  }, [transactions])

  // Get all deleted subcategories (budgetOverrides = -1)
  const deletedSubcategories = useMemo(() => {
    const deleted: { subcategory: string; category: string }[] = []
    
    for (const [sub, amount] of Object.entries(budgetSettings.budgetOverrides || {})) {
      if (amount === -1) {
        // Find which category this belongs to
        for (const [cat, subs] of Object.entries(BUDGET_CATEGORIES)) {
          if (subs.includes(sub)) {
            deleted.push({ subcategory: sub, category: cat })
            break
          }
        }
      }
    }
    
    return deleted
  }, [budgetSettings])

  // Get budget amount for a subcategory
  function getBudgetAmount(subcategory: string): number {
    const override = budgetSettings.budgetOverrides?.[subcategory]
    if (override === -1) return 0 // Deleted
    if (override !== undefined) return override
    return DEFAULT_BUDGETS[subcategory] ?? 0
  }

  // Get frequency for a subcategory
  function getBudgetFrequency(subcategory: string): BudgetFrequency {
    return budgetSettings.budgetFreqs?.[subcategory] ?? "monthly"
  }

  // Calculate total budgeted income and expenses for surplus/deficit banner
  const budgetSummary = useMemo(() => {
    let totalIncome = 0
    let totalExpenses = 0

    const allCategories = [
      ...CATEGORY_LIST,
      ...(budgetSettings.customTopCategories || []),
    ]

    for (const category of allCategories) {
      const builtinSubs = BUDGET_CATEGORIES[category] || []
      const customSubs = budgetSettings.customCategories?.[category] || []
      const allSubs = [...builtinSubs, ...customSubs].filter(
        sub => !isProjectSubcategory(sub) && budgetSettings.budgetOverrides?.[sub] !== -1
      )

      for (const sub of allSubs) {
        const amount = getBudgetAmount(sub)
        const freq = getBudgetFrequency(sub)
        const monthly = toMonthlyAmount(amount, freq)

        if (category === "Income") {
          totalIncome += monthly
        } else {
          totalExpenses += monthly
        }
      }
    }

    const net = totalIncome - totalExpenses
    return { totalIncome, totalExpenses, net, isSurplus: net >= 0 }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [budgetSettings])

  // Get custom subcategories per category
  const customSubcategories = budgetSettings.customCategories || {}

  // Toggle category expansion
  function toggleCategory(category: string) {
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

  // Check if subcategory is deleted
  function isDeleted(subcategory: string): boolean {
    return budgetSettings.budgetOverrides?.[subcategory] === -1
  }

  // Start editing a subcategory (unified: name, amount, frequency)
  function startEdit(subcategory: string) {
    setEditingSubcategory(subcategory)
    setEditName(subcategory)
    setEditBudget(getBudgetAmount(subcategory).toString())
    setEditFrequency(getBudgetFrequency(subcategory))
  }

  // Save budget edit (unified: handles name, amount, frequency)
  function saveEdit(category: string) {
    if (!editingSubcategory) return
    
    const amount = parseFloat(editBudget) || 0
    const newName = editName.trim() || editingSubcategory
    const nameChanged = newName !== editingSubcategory
    
    const newOverrides = { ...budgetSettings.budgetOverrides }
    const newFreqs = { ...budgetSettings.budgetFreqs }
    
    if (nameChanged) {
      // Remove old entries
      delete newOverrides[editingSubcategory]
      delete newFreqs[editingSubcategory]
    }
    
    // Add new/updated entries
    newOverrides[newName] = amount
    newFreqs[newName] = editFrequency
    
    // If it's a custom subcategory and name changed, update the list
    const customs = budgetSettings.customCategories?.[category] || []
    const newCustoms = nameChanged 
      ? customs.map(s => s === editingSubcategory ? newName : s)
      : customs
    
    setBudgetSettings({
      budgetOverrides: newOverrides,
      budgetFreqs: newFreqs,
      ...(nameChanged && {
        customCategories: {
          ...budgetSettings.customCategories,
          [category]: newCustoms
        }
      })
    })
    
    setEditingSubcategory(null)
  }

  // Open delete modal for a subcategory
  function openDeleteSubcategoryModal(subcategory: string, category: string) {
    const count = transactions.filter(t => t.subcategory === subcategory).length
    setDeleteModal({ kind: "subcategory", subcategory, category, count })
    setDeleteTransferTo("")
  }

  // Open delete modal for a top-level category
  function openDeleteCategoryModal(category: string, isProject: boolean) {
    const count = transactions.filter(t => t.category === category).length
    setDeleteModal({ kind: "category", category, isProject, count })
    setDeleteTransferTo("")
  }

  // Confirm delete - handles both subcategory and category
  function confirmDelete() {
    if (!deleteModal) return

    if (deleteModal.kind === "subcategory") {
      const { subcategory } = deleteModal
      // Re-assign transactions if a target was chosen
      if (deleteModal.count > 0) {
        const updated = transactions.map(t =>
          t.subcategory === subcategory
            ? { ...t, subcategory: deleteTransferTo || '', category: deleteTransferTo ? t.category : '', _manual: !!deleteTransferTo }
            : t
        )
        setTransactions(updated)
      }
      // Tombstone the subcategory in budget settings
      setBudgetSettings({
        budgetOverrides: { ...budgetSettings.budgetOverrides, [subcategory]: -1 },
        // Also remove from customCategories if it was custom
        customCategories: Object.fromEntries(
          Object.entries(budgetSettings.customCategories || {}).map(([cat, subs]) => [
            cat, (subs as string[]).filter(s => s !== subcategory)
          ])
        )
      })
    } else {
      const { category, isProject } = deleteModal
      // Re-assign transactions if a target was chosen
      if (deleteModal.count > 0) {
        const updated = transactions.map(t =>
          t.category === category
            ? { ...t, category: deleteTransferTo || '', subcategory: '', _manual: !!deleteTransferTo }
            : t
        )
        setTransactions(updated)
      }
      if (isProject) {
        setBudgetSettings({
          deletedProjectCategories: [...(budgetSettings.deletedProjectCategories || []), category],
          customProjectCategories: (budgetSettings.customProjectCategories || []).filter(c => c !== category)
        })
      } else {
        setBudgetSettings({
          deletedCategories: [...(budgetSettings.deletedCategories || []), category],
          customTopCategories: (budgetSettings.customTopCategories || []).filter(c => c !== category)
        })
      }
    }

    setDeleteModal(null)
    setDeleteTransferTo("")
  }

  // Add a new top-level category
  function addCategory(type: "recurring" | "project") {
    const name = newCategoryName.trim()
    if (!name) return
    if (type === "recurring") {
      setBudgetSettings({
        customTopCategories: [...(budgetSettings.customTopCategories || []), name],
        customCategories: { ...budgetSettings.customCategories, [name]: [] }
      })
    } else {
      setBudgetSettings({
        customProjectCategories: [...(budgetSettings.customProjectCategories || []), name],
        projectBudgets: { ...budgetSettings.projectBudgets, [name]: 0 }
      })
    }
    setNewCategoryName("")
    setAddingCategory(null)
  }

  // Save category rename (regular categories)
  function saveCategoryRename(oldName: string) {
    const newName = editCategoryName.trim()
    if (!newName || newName === oldName) {
      setEditingCategory(null)
      return
    }

    // Rename in customCategories keys
    const updatedCustomCategories = { ...budgetSettings.customCategories }
    if (updatedCustomCategories[oldName]) {
      updatedCustomCategories[newName] = updatedCustomCategories[oldName]
      delete updatedCustomCategories[oldName]
    }

    // Rename in customTopCategories list
    const updatedCustomTop = (budgetSettings.customTopCategories || []).map(c => c === oldName ? newName : c)

    // Rename in deletedCategories list  
    const updatedDeleted = (budgetSettings.deletedCategories || []).map(c => c === oldName ? newName : c)

    // Re-tag all transactions with this category
    setTransactions(transactions.map(t =>
      t.category === oldName ? { ...t, category: newName } : t
    ))

    setBudgetSettings({
      customCategories: updatedCustomCategories,
      customTopCategories: updatedCustomTop,
      deletedCategories: updatedDeleted,
    })
    setEditingCategory(null)
  }

  // Restore a deleted top-level category
  function restoreCategory(category: string, isProject: boolean) {
    if (isProject) {
      setBudgetSettings({
        deletedProjectCategories: (budgetSettings.deletedProjectCategories || []).filter(c => c !== category)
      })
    } else {
      setBudgetSettings({
        deletedCategories: (budgetSettings.deletedCategories || []).filter(c => c !== category)
      })
    }
  }

  // Restore deleted subcategory
  function restoreSubcategory(subcategory: string) {
    const newOverrides = { ...budgetSettings.budgetOverrides }
    delete newOverrides[subcategory] // Remove tombstone
    setBudgetSettings({
      budgetOverrides: newOverrides
    })
  }

  // Add new subcategory
  function addSubcategory(category: string) {
    if (!newSubcategoryName.trim()) return
    
    setBudgetSettings({
      customCategories: {
        ...budgetSettings.customCategories,
        [category]: [...(budgetSettings.customCategories?.[category] || []), newSubcategoryName.trim()]
      },
      budgetOverrides: {
        ...budgetSettings.budgetOverrides,
        [newSubcategoryName.trim()]: 0
      }
    })
    
    setNewSubcategoryName("")
    setAddingToCategory(null)
  }

  // Update from actuals
  function updateFromActuals() {
    const updates: Record<string, number> = {}
    
    for (const [sub, avgSpend] of Object.entries(actualsBySubcategory.actuals)) {
      if (avgSpend > 0) {
        updates[sub] = Math.round(avgSpend)
      }
    }
    
    if (Object.keys(updates).length > 0) {
      setBudgetSettings({
        budgetOverrides: {
          ...budgetSettings.budgetOverrides,
          ...updates
        }
      })
      
      setShowUpdateFeedback(`Updated ${Object.keys(updates).length} budgets from ${actualsBySubcategory.monthCount} months of data`)
      setTimeout(() => setShowUpdateFeedback(null), 3000)
    } else {
      setShowUpdateFeedback("No actuals to update from")
      setTimeout(() => setShowUpdateFeedback(null), 3000)
    }
  }

  // Regular categories: built-in (non-project, non-deleted) + custom
  const deletedCats = budgetSettings.deletedCategories || []
  const customTopCats = budgetSettings.customTopCategories || []
  const regularCategories = [
    ...CATEGORY_LIST.filter(cat => !isProjectCategory(cat) && !deletedCats.includes(cat)),
    ...customTopCats.filter(cat => !deletedCats.includes(cat))
  ]

  // Project categories: built-in (non-deleted) + custom
  const deletedProjectCats = budgetSettings.deletedProjectCategories || []
  const customProjectCats = budgetSettings.customProjectCategories || []
  const allProjectCategories = [
    ...PROJECT_CATEGORIES.filter(cat => !deletedProjectCats.includes(cat)),
    ...customProjectCats.filter(cat => !deletedProjectCats.includes(cat))
  ]

  // Deleted categories for restore section (includes PROJECT_SUBCATEGORIES like "Capital purchases")
  const deletedTopCategoryItems = [
    ...CATEGORY_LIST.filter(cat => !isProjectCategory(cat) && deletedCats.includes(cat)).map(c => ({ category: c, isProject: false })),
    ...customTopCats.filter(c => deletedCats.includes(c)).map(c => ({ category: c, isProject: false })),
    ...PROJECT_CATEGORIES.filter(c => deletedProjectCats.includes(c)).map(c => ({ category: c, isProject: true })),
    ...PROJECT_SUBCATEGORIES.filter(c => deletedProjectCats.includes(c)).map(c => ({ category: c, isProject: true })),
    ...customProjectCats.filter(c => deletedProjectCats.includes(c)).map(c => ({ category: c, isProject: true })),
  ]

  // All non-deleted categories for transfer dropdown
  const allTransferCategories = regularCategories

  // Get all subcategories for a category (built-in + custom, excluding deleted)
  function getAllSubcategories(category: string): string[] {
    const builtin = BUDGET_CATEGORIES[category] || []
    const custom = customSubcategories[category] || []
    return [...builtin, ...custom].filter(sub => !isDeleted(sub) && !isProjectSubcategory(sub))
  }

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <PageHeader
        title="Budget"
        subtitle="Set your monthly spending targets"
      />

      {/* Actions */}
      <div className="flex items-center gap-2">
        <PrimaryButton onClick={updateFromActuals} className="flex-1">
          <RotateCcw className="size-4 mr-2" />
          Update from actuals
        </PrimaryButton>
      </div>

      {/* Surplus / Deficit Banner */}
      <div className={cn(
        "rounded-xl border p-4 flex items-center justify-between gap-4",
        budgetSummary.isSurplus
          ? "bg-signal-green/10 border-signal-green/25"
          : "bg-signal-red/10 border-signal-red/25"
      )}>
        {/* Left: status label + subtitle */}
        <div className="min-w-0">
          <p className={cn(
            "text-sm font-bold",
            budgetSummary.isSurplus ? "text-signal-green" : "text-signal-red"
          )}>
            {budgetSummary.isSurplus ? "Budget in surplus" : "Budget in deficit"}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {budgetSummary.isSurplus
              ? `Income exceeds expenses by ${formatCurrency(budgetSummary.net)} / mo`
              : `Expenses exceed income by ${formatCurrency(Math.abs(budgetSummary.net))} / mo`
            }
          </p>
        </div>

        {/* Right: Income / Expenses / Net columns */}
        <div className="flex items-center gap-5 shrink-0 text-right">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Income</p>
            <p className="text-sm font-semibold text-foreground">{formatCurrency(budgetSummary.totalIncome)}<span className="text-xs font-normal text-muted-foreground"> /mo</span></p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Expenses</p>
            <p className="text-sm font-semibold text-foreground">{formatCurrency(budgetSummary.totalExpenses)}<span className="text-xs font-normal text-muted-foreground"> /mo</span></p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Net</p>
            <p className={cn(
              "text-sm font-bold",
              budgetSummary.isSurplus ? "text-signal-green" : "text-signal-red"
            )}>
              {budgetSummary.isSurplus ? "" : "-"}{formatCurrency(Math.abs(budgetSummary.net))}<span className="text-xs font-normal opacity-70"> /mo</span>
            </p>
          </div>
        </div>
      </div>

      {/* Feedback message */}
      {showUpdateFeedback && (
        <div className="p-3 bg-primary/10 border border-primary/20 rounded-lg text-sm text-primary">
          {showUpdateFeedback}
        </div>
      )}

      {/* Monthly Recurring Budget Section */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-foreground">Monthly Recurring</h3>
        
        {regularCategories.map((category) => {
          const subcategories = getAllSubcategories(category)
          const isExpanded = expandedCategories.has(category)
          const categoryTotal = subcategories.reduce((sum, sub) => {
            const amount = getBudgetAmount(sub)
            const freq = getBudgetFrequency(sub)
            return sum + toMonthlyAmount(amount, freq)
          }, 0)
          const categoryColor = CATEGORY_COLORS[category] || CATEGORY_COLORS["default"]

          const isEditingThisCategory = editingCategory === category

          return (
            <Card key={category}>
              {isEditingThisCategory ? (
                /* Category name editing mode */
                <div className="flex items-center gap-3">
                  <div 
                    className="w-1 self-stretch rounded-full shrink-0"
                    style={{ backgroundColor: categoryColor }}
                  />
                  <input
                    type="text"
                    value={editCategoryName}
                    onChange={(e) => setEditCategoryName(e.target.value)}
                    className="flex-1 h-8 px-2 bg-background border border-primary rounded text-sm font-medium"
                    placeholder="Category name"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveCategoryRename(category)
                      if (e.key === "Escape") setEditingCategory(null)
                    }}
                  />
                  <button
                    onClick={() => saveCategoryRename(category)}
                    className="p-1.5 rounded bg-signal-green text-white"
                  >
                    <Check className="size-4" />
                  </button>
                  <button
                    onClick={() => setEditingCategory(null)}
                    className="p-1.5 rounded bg-surface2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              ) : (
                /* Normal category header */
                <div className="flex items-center gap-1 group">
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => toggleCategory(category)}
                    onKeyDown={(e) => e.key === "Enter" && toggleCategory(category)}
                    className="flex-1 flex items-center gap-3 min-w-0 cursor-pointer"
                  >
                    <div 
                      className="w-1 self-stretch rounded-full shrink-0"
                      style={{ backgroundColor: categoryColor }}
                    />
                    <div className="flex-1 flex items-center justify-between min-w-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setEditCategoryName(category)
                            setEditingCategory(category)
                          }}
                          className="text-sm font-medium text-foreground truncate hover:underline decoration-dashed underline-offset-2"
                          title="Click to rename"
                        >
                          {category}
                        </button>
                        <Pencil className="size-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                      </div>
                      <div className="flex items-center gap-2 ml-2">
                        <span className="text-sm text-muted-foreground whitespace-nowrap">
                          {formatCurrency(categoryTotal)}/mo
                        </span>
                        <ChevronDown className={cn(
                          "size-4 text-muted-foreground transition-transform",
                          isExpanded && "rotate-180"
                        )} />
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => openDeleteCategoryModal(category, false)}
                    className="shrink-0 p-1.5 rounded text-muted-foreground hover:text-signal-red opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Delete category"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              )}

              {/* Expanded Subcategories */}
              {isExpanded && (
                <div className="mt-3 pt-3 border-t border-border space-y-1">
                  {subcategories.map((subcategory) => {
                    const budget = getBudgetAmount(subcategory)
                    const freq = getBudgetFrequency(subcategory)
                    const monthlyBudget = toMonthlyAmount(budget, freq)
                    const actual = actualsBySubcategory.actuals[subcategory] || 0
                    const isOver = actual > monthlyBudget && monthlyBudget > 0
                    
                    // Editing mode (unified: name, amount, frequency)
                    if (editingSubcategory === subcategory) {
                      return (
                        <div key={subcategory} className="py-2 px-2 bg-surface2 rounded-lg space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-muted-foreground">Edit subcategory</span>
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => saveEdit(category)}
                                className="p-1.5 rounded bg-primary text-primary-foreground"
                              >
                                <Check className="size-3.5" />
                              </button>
                              <button
                                onClick={() => setEditingSubcategory(null)}
                                className="p-1.5 rounded bg-surface text-muted-foreground"
                              >
                                <X className="size-3.5" />
                              </button>
                            </div>
                          </div>
                          {/* Name field */}
                          <div>
                            <label className="text-[10px] text-muted-foreground">Name</label>
                            <input
                              type="text"
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              className="w-full h-8 px-2 bg-card border border-border rounded text-sm"
                              autoFocus
                            />
                          </div>
                          {/* Amount and Frequency */}
                          <div className="flex items-center gap-2">
                            <div className="flex-1">
                              <label className="text-[10px] text-muted-foreground">Amount</label>
                              <input
                                type="number"
                                value={editBudget}
                                onChange={(e) => setEditBudget(e.target.value)}
                                className="w-full h-8 px-2 bg-card border border-border rounded text-sm"
                              />
                            </div>
                            <div className="w-28">
                              <label className="text-[10px] text-muted-foreground">Frequency</label>
                              <select
                                value={editFrequency}
                                onChange={(e) => setEditFrequency(e.target.value as BudgetFrequency)}
                                className="w-full h-8 px-2 bg-card border border-border rounded text-sm"
                              >
                                {Object.entries(FREQUENCY_LABELS).map(([key, label]) => (
                                  <option key={key} value={key}>{label}</option>
                                ))}
                              </select>
                            </div>
                          </div>
                        </div>
                      )
                    }
                    
                    return (
                      <div
                        key={subcategory}
                        className="flex items-center justify-between py-1.5 group"
                      >
                        <span className="text-sm text-muted-foreground">{subcategory}</span>
                        <div className="flex items-center gap-2">
                          {/* Actual vs Budget */}
                          {actual > 0 && (
                            <span className={cn(
                              "text-xs",
                              isOver ? "text-signal-red" : "text-muted-foreground"
                            )}>
                              {formatCurrency(actual)} actual
                            </span>
                          )}
                          <span className="text-sm text-foreground">{formatCurrency(budget)}</span>
                          {freq !== "monthly" && (
                            <span className="text-[10px] text-muted-foreground">
                              /{FREQUENCY_LABELS[freq].toLowerCase().slice(0, 2)}
                            </span>
                          )}
                          {/* Action buttons - single edit button for name, amount, frequency */}
                          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button 
                              onClick={() => startEdit(subcategory)}
                              className="size-6 rounded flex items-center justify-center text-muted-foreground hover:text-foreground"
                              title="Edit"
                            >
                              <Pencil className="size-3" />
                            </button>
                            <button 
                              onClick={() => openDeleteSubcategoryModal(subcategory, category)}
                              className="size-6 rounded flex items-center justify-center text-muted-foreground hover:text-signal-red"
                              title="Delete"
                            >
                              <Trash2 className="size-3" />
                            </button>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                  
                  {/* Add Subcategory */}
                  {addingToCategory === category ? (
                    <div className="flex items-center gap-2 pt-1">
                      <input
                        type="text"
                        value={newSubcategoryName}
                        onChange={(e) => setNewSubcategoryName(e.target.value)}
                        placeholder="New subcategory name..."
                        className="flex-1 h-8 px-2 bg-surface2 border border-border rounded text-sm"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === "Enter") addSubcategory(category)
                          if (e.key === "Escape") setAddingToCategory(null)
                        }}
                      />
                      <button
                        onClick={() => addSubcategory(category)}
                        className="p-1.5 rounded bg-primary text-primary-foreground"
                      >
                        <Check className="size-3.5" />
                      </button>
                      <button
                        onClick={() => setAddingToCategory(null)}
                        className="p-1.5 rounded bg-surface2 text-muted-foreground"
                      >
                        <X className="size-3.5" />
                      </button>
                    </div>
                  ) : (
                    <button 
                      onClick={() => setAddingToCategory(category)}
                      className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors pt-1"
                    >
                      <Plus className="size-3" />
                      Add subcategory
                    </button>
                  )}
                </div>
              )}
            </Card>
          )
        })}

        {/* Add Category */}
        {addingCategory === "recurring" ? (
          <div className="flex items-center gap-2 pt-1">
            <input
              type="text"
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              placeholder="New category name..."
              className="flex-1 h-9 px-3 bg-card border border-border rounded-lg text-sm"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") addCategory("recurring")
                if (e.key === "Escape") { setAddingCategory(null); setNewCategoryName("") }
              }}
            />
            <button onClick={() => addCategory("recurring")} className="p-2 rounded-lg bg-primary text-primary-foreground">
              <Check className="size-4" />
            </button>
            <button onClick={() => { setAddingCategory(null); setNewCategoryName("") }} className="p-2 rounded-lg bg-surface2 text-muted-foreground">
              <X className="size-4" />
            </button>
          </div>
        ) : (
          <button
            onClick={() => { setAddingCategory("recurring"); setNewCategoryName("") }}
            className="flex items-center gap-1.5 text-sm text-primary hover:text-primary/80 transition-colors py-1"
          >
            <Plus className="size-4" />
            Add category
          </button>
        )}
      </div>

      {/* Projects & Capital Expenditure Section */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-signal-amber">
          Projects & Capital Expenditure
        </h3>
        <p className="text-xs text-muted-foreground">
          Lump-sum budgets (not monthly). Excluded from regular P&L. Click to expand and edit.
        </p>

        {allProjectCategories.map((category) => {
          const builtInTasks = BUDGET_CATEGORIES[category] || []
          const customTasks = budgetSettings.projectTasks?.[category] || []
          const allTasks = [...builtInTasks, ...customTasks]
          const isExpanded = expandedCategories.has(`project-${category}`)
          const projectBudget = budgetSettings.projectBudgets?.[category] ?? DEFAULT_PROJECT_BUDGETS[category] ?? 0
          const projectActual = allTasks.reduce((sum, sub) => {
            return sum + (actualsBySubcategory.actuals[sub] || 0) * actualsBySubcategory.monthCount
          }, 0)
          const percentUsed = projectBudget > 0 ? (projectActual / projectBudget) * 100 : 0
          const isEditingThisProject = editingProject === category
          const isDisabled = (budgetSettings.disabledProjectCategories || []).includes(category)

          function toggleProjectDisabled() {
            const current = budgetSettings.disabledProjectCategories || []
            setBudgetSettings({
              disabledProjectCategories: isDisabled
                ? current.filter(c => c !== category)
                : [...current, category]
            })
          }

          return (
            <Card key={category} className={cn("border-signal-amber/30", isDisabled && "opacity-60")}>
              {/* Project Header */}
              {isEditingThisProject ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="size-2 rounded-full bg-signal-amber shrink-0" />
                  <input
                    type="text"
                    value={editProjectName}
                    onChange={(e) => setEditProjectName(e.target.value)}
                    className="flex-1 min-w-[140px] h-8 px-2 bg-background border border-primary rounded text-sm font-medium"
                    placeholder="Project name"
                    autoFocus
                    onKeyDown={(e) => e.key === "Escape" && setEditingProject(null)}
                  />
                  <span className="text-xs text-muted-foreground shrink-0">Budget:</span>
                  <input
                    type="number"
                    value={editProjectBudget}
                    onChange={(e) => setEditProjectBudget(e.target.value)}
                    className="w-24 h-8 px-2 bg-background border border-border rounded text-sm text-right"
                    onKeyDown={(e) => e.key === "Escape" && setEditingProject(null)}
                  />
                  <button
                    onClick={() => {
                      const newName = editProjectName.trim() || category
                      const newBudget = parseFloat(editProjectBudget) || 0
                      const isRename = newName !== category

                      // Build updated settings, renaming all references if name changed
                      const updatedProjectBudgets = { ...budgetSettings.projectBudgets }
                      const updatedProjectTasks = { ...budgetSettings.projectTasks }
                      const updatedDisabled = [...(budgetSettings.disabledProjectCategories || [])]
                      const updatedDeleted = [...(budgetSettings.deletedProjectCategories || [])]
                      const updatedCustom = [...(budgetSettings.customProjectCategories || [])]

                      if (isRename) {
                        // Rename budget key
                        delete updatedProjectBudgets[category]
                        updatedProjectBudgets[newName] = newBudget
                        // Rename tasks key
                        if (updatedProjectTasks[category]) {
                          updatedProjectTasks[newName] = updatedProjectTasks[category]
                          delete updatedProjectTasks[category]
                        }
                        // Rename in disabled/deleted/custom lists
                        const rename = (arr: string[]) => arr.map(c => c === category ? newName : c)
                        updatedDisabled.splice(0, updatedDisabled.length, ...rename(updatedDisabled))
                        updatedDeleted.splice(0, updatedDeleted.length, ...rename(updatedDeleted))
                        updatedCustom.splice(0, updatedCustom.length, ...rename(updatedCustom))
                        // Re-tag all transactions that use this category name
                        setTransactions(transactions.map(t =>
                          t.category === category ? { ...t, category: newName } : t
                        ))
                      } else {
                        updatedProjectBudgets[category] = newBudget
                      }

                      setBudgetSettings({
                        projectBudgets: updatedProjectBudgets,
                        projectTasks: updatedProjectTasks,
                        disabledProjectCategories: updatedDisabled,
                        deletedProjectCategories: updatedDeleted,
                        customProjectCategories: updatedCustom,
                      })
                      setEditingProject(null)
                    }}
                    className="p-1.5 rounded bg-signal-green text-white"
                  >
                    <Check className="size-4" />
                  </button>
                  <button
                    onClick={() => setEditingProject(null)}
                    className="p-1.5 rounded bg-surface2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-1 group">
                  {/* Use div to avoid nested <button> inside <button> */}
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => toggleCategory(`project-${category}`)}
                    onKeyDown={(e) => e.key === "Enter" && toggleCategory(`project-${category}`)}
                    className="flex-1 flex items-center justify-between min-w-0 cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <span className={cn("size-2 rounded-full shrink-0", isDisabled ? "bg-muted-foreground" : "bg-signal-amber")} />
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setEditProjectName(category)
                          setEditProjectBudget(String(projectBudget))
                          setEditingProject(category)
                        }}
                        className={cn(
                          "text-sm font-medium hover:underline decoration-dashed underline-offset-2",
                          isDisabled ? "text-muted-foreground" : "text-foreground"
                        )}
                        title="Click to rename"
                      >
                        {category}
                      </button>
                      <Pencil className="size-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                      {isDisabled && (
                        <span className="text-[10px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded bg-surface2 text-muted-foreground">
                          Complete
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-foreground">
                        {formatCurrency(projectActual)}
                      </span>
                      <span className="text-xs text-muted-foreground">/</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setEditProjectName(category)
                          setEditProjectBudget(String(projectBudget))
                          setEditingProject(category)
                        }}
                        className="text-sm text-signal-amber hover:underline"
                        title="Click to edit budget"
                      >
                        {formatCurrency(projectBudget)}
                      </button>
                      <ChevronDown className={cn(
                        "size-4 text-muted-foreground transition-transform",
                        isExpanded && "rotate-180"
                      )} />
                    </div>
                  </div>
                  {/* Active / Complete toggle */}
                  <button
                    onClick={toggleProjectDisabled}
                    className={cn(
                      "shrink-0 h-7 px-2.5 rounded text-xs font-medium transition-colors whitespace-nowrap",
                      isDisabled
                        ? "bg-surface2 text-muted-foreground hover:bg-primary/10 hover:text-primary"
                        : "opacity-0 group-hover:opacity-100 bg-surface2 text-muted-foreground hover:bg-signal-amber/10 hover:text-signal-amber"
                    )}
                    title={isDisabled ? "Mark as active (will appear in dropdowns)" : "Mark as complete (hides from dropdowns)"}
                  >
                    {isDisabled ? "Re-activate" : "Complete"}
                  </button>
                  <button
                    onClick={() => openDeleteCategoryModal(category, true)}
                    className="shrink-0 p-1.5 rounded text-muted-foreground hover:text-signal-red opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Delete project category"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              )}
              
              {/* Progress bar */}
              <div className="mt-2 h-1.5 bg-surface2 rounded-full overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full transition-all",
                    percentUsed > 100 ? "bg-signal-red" : "bg-signal-amber"
                  )}
                  style={{ width: `${Math.min(percentUsed, 100)}%` }}
                />
              </div>

              {/* Expanded Tasks */}
              {isExpanded && (
                <div className="mt-3 pt-3 border-t border-signal-amber/30 space-y-2">
                  {allTasks.map((task) => {
                    const taskBudget = budgetSettings.projectBudgets?.[`${category}:${task}`] ?? 0
                    const actual = (actualsBySubcategory.actuals[task] || 0) * actualsBySubcategory.monthCount
                    const subPercent = taskBudget > 0 ? (actual / taskBudget) * 100 : 0
                    const isEditingThisTask = editingProjectTask?.project === category && editingProjectTask?.task === task
                    const isCustomTask = customTasks.includes(task)
                    
                    return (
                      <div key={task} className="py-1 group/task">
                        {isEditingThisTask ? (
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm text-muted-foreground flex-1">{task}</span>
                            <input
                              type="number"
                              value={editTaskBudget}
                              onChange={(e) => setEditTaskBudget(e.target.value)}
                              className="w-24 h-7 px-2 bg-background border border-primary rounded text-sm text-right"
                              autoFocus
                            />
                            <button
                              onClick={() => {
                                const newBudget = parseFloat(editTaskBudget) || 0
                                setBudgetSettings({
                                  ...budgetSettings,
                                  projectBudgets: { ...budgetSettings.projectBudgets, [`${category}:${task}`]: newBudget }
                                })
                                setEditingProjectTask(null)
                              }}
                              className="p-1 rounded bg-signal-green text-white"
                            >
                              <Check className="size-3" />
                            </button>
                            <button
                              onClick={() => setEditingProjectTask(null)}
                              className="p-1 rounded bg-surface2 text-muted-foreground"
                            >
                              <X className="size-3" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm text-muted-foreground">{task}</span>
                            <div className="flex items-center gap-2 text-sm">
                              <span className="text-foreground">{formatCurrency(actual)}</span>
                              <span className="text-muted-foreground">/</span>
                              <button
                                onClick={() => {
                                  setEditTaskBudget(String(taskBudget))
                                  setEditingProjectTask({ project: category, task })
                                }}
                                className="text-signal-amber hover:underline"
                              >
                                {formatCurrency(taskBudget)}
                              </button>
                              <Pencil className="size-3 text-muted-foreground opacity-0 group-hover/task:opacity-100" />
                              {isCustomTask && (
                                <button
                                  onClick={() => {
                                    // Remove custom task
                                    const updated = (budgetSettings.projectTasks?.[category] || []).filter(t => t !== task)
                                    const newProjectTasks = { ...budgetSettings.projectTasks, [category]: updated }
                                    const newProjectBudgets = { ...budgetSettings.projectBudgets }
                                    delete newProjectBudgets[`${category}:${task}`]
                                    setBudgetSettings({
                                      ...budgetSettings,
                                      projectTasks: newProjectTasks,
                                      projectBudgets: newProjectBudgets
                                    })
                                  }}
                                  className="p-1 text-signal-red opacity-0 group-hover/task:opacity-100"
                                >
                                  <Trash2 className="size-3" />
                                </button>
                              )}
                            </div>
                          </div>
                        )}
                        <div className="h-1.5 bg-surface2 rounded-full overflow-hidden">
                          <div
                            className={cn(
                              "h-full rounded-full transition-all",
                              subPercent > 100 ? "bg-signal-red" : "bg-signal-amber"
                            )}
                            style={{ width: `${Math.min(subPercent, 100)}%` }}
                          />
                        </div>
                      </div>
                    )
                  })}
                  
                  {/* Add Task Form */}
                  {addingProjectTask === category ? (
                    <div className="flex items-center gap-2 pt-2">
                      <input
                        type="text"
                        value={newProjectTaskName}
                        onChange={(e) => setNewProjectTaskName(e.target.value)}
                        placeholder="Task name"
                        className="flex-1 h-8 px-2 bg-background border border-border rounded text-sm"
                        autoFocus
                      />
                      <input
                        type="number"
                        value={newProjectTaskBudget}
                        onChange={(e) => setNewProjectTaskBudget(e.target.value)}
                        placeholder="Budget"
                        className="w-24 h-8 px-2 bg-background border border-border rounded text-sm text-right"
                      />
                      <button
                        onClick={() => {
                          if (!newProjectTaskName.trim()) return
                          const existingTasks = budgetSettings.projectTasks?.[category] || []
                          setBudgetSettings({
                            ...budgetSettings,
                            projectTasks: { ...budgetSettings.projectTasks, [category]: [...existingTasks, newProjectTaskName.trim()] },
                            projectBudgets: { ...budgetSettings.projectBudgets, [`${category}:${newProjectTaskName.trim()}`]: parseFloat(newProjectTaskBudget) || 0 }
                          })
                          setNewProjectTaskName("")
                          setNewProjectTaskBudget("")
                          setAddingProjectTask(null)
                        }}
                        className="p-1.5 rounded bg-signal-green text-white"
                      >
                        <Check className="size-4" />
                      </button>
                      <button
                        onClick={() => {
                          setAddingProjectTask(null)
                          setNewProjectTaskName("")
                          setNewProjectTaskBudget("")
                        }}
                        className="p-1.5 rounded bg-surface2 text-muted-foreground"
                      >
                        <X className="size-4" />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setAddingProjectTask(category)}
                      className="flex items-center gap-1 text-xs text-primary hover:underline pt-2"
                    >
                      <Plus className="size-3" />
                      Add task
                    </button>
                  )}
                </div>
              )}
            </Card>
          )
        })}
        
        {/* Capital Purchases (special project subcategory - treated like project categories) */}
        {PROJECT_SUBCATEGORIES
          .filter(sub => !(budgetSettings.deletedProjectCategories || []).includes(sub))
          .map(sub => {
            const budget = budgetSettings.projectBudgets?.[sub] ?? DEFAULT_PROJECT_BUDGETS[sub] ?? 0
            const actual = (actualsBySubcategory.actuals[sub] || 0) * actualsBySubcategory.monthCount
            const percentUsed = budget > 0 ? (actual / budget) * 100 : 0
            const isEditingThis = editingProject === sub
            const isDisabled = (budgetSettings.disabledProjectCategories || []).includes(sub)

            function toggleDisabled() {
              const current = budgetSettings.disabledProjectCategories || []
              setBudgetSettings({
                disabledProjectCategories: isDisabled
                  ? current.filter(c => c !== sub)
                  : [...current, sub]
              })
            }

            return (
              <Card key={sub} className={cn("border-signal-amber/30", isDisabled && "opacity-60")}>
                {isEditingThis ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="size-2 rounded-full bg-signal-amber shrink-0" />
                    <input
                      type="text"
                      value={editProjectName}
                      onChange={(e) => setEditProjectName(e.target.value)}
                      className="flex-1 min-w-[140px] h-8 px-2 bg-background border border-primary rounded text-sm font-medium"
                      placeholder="Name"
                      autoFocus
                      onKeyDown={(e) => e.key === "Escape" && setEditingProject(null)}
                    />
                    <span className="text-xs text-muted-foreground shrink-0">Budget:</span>
                    <input
                      type="number"
                      value={editProjectBudget}
                      onChange={(e) => setEditProjectBudget(e.target.value)}
                      className="w-24 h-8 px-2 bg-background border border-border rounded text-sm text-right"
                      onKeyDown={(e) => e.key === "Escape" && setEditingProject(null)}
                    />
                    <button
                      onClick={() => {
                        const newName = editProjectName.trim() || sub
                        const newBudget = parseFloat(editProjectBudget) || 0
                        const isRename = newName !== sub

                        if (isRename) {
                          // Rename across all settings
                          const updatedBudgets = { ...budgetSettings.projectBudgets }
                          delete updatedBudgets[sub]
                          updatedBudgets[newName] = newBudget

                          const rename = (arr: string[]) => arr.map(c => c === sub ? newName : c)
                          const updatedDisabled = rename(budgetSettings.disabledProjectCategories || [])
                          const updatedDeleted = rename(budgetSettings.deletedProjectCategories || [])

                          // Re-tag transactions
                          setTransactions(transactions.map(t =>
                            t.subcategory === sub ? { ...t, subcategory: newName } : t
                          ))

                          setBudgetSettings({
                            projectBudgets: updatedBudgets,
                            disabledProjectCategories: updatedDisabled,
                            deletedProjectCategories: updatedDeleted,
                          })
                        } else {
                          setBudgetSettings({
                            projectBudgets: { ...budgetSettings.projectBudgets, [sub]: newBudget }
                          })
                        }
                        setEditingProject(null)
                      }}
                      className="p-1.5 rounded bg-signal-green text-white"
                    >
                      <Check className="size-4" />
                    </button>
                    <button
                      onClick={() => setEditingProject(null)}
                      className="p-1.5 rounded bg-surface2 text-muted-foreground hover:text-foreground"
                    >
                      <X className="size-4" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1 group">
                    <div className="flex-1 flex items-center justify-between min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={cn("size-2 rounded-full shrink-0", isDisabled ? "bg-muted-foreground" : "bg-signal-amber")} />
                        <button
                          onClick={() => {
                            setEditProjectName(sub)
                            setEditProjectBudget(String(budget))
                            setEditingProject(sub)
                          }}
                          className={cn(
                            "text-sm font-medium hover:underline decoration-dashed underline-offset-2",
                            isDisabled ? "text-muted-foreground" : "text-foreground"
                          )}
                          title="Click to rename"
                        >
                          {sub}
                        </button>
                        <Pencil className="size-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                        {isDisabled && (
                          <span className="text-[10px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded bg-surface2 text-muted-foreground">
                            Complete
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-foreground">{formatCurrency(actual)}</span>
                        <span className="text-xs text-muted-foreground">/</span>
                        <button
                          onClick={() => {
                            setEditProjectName(sub)
                            setEditProjectBudget(String(budget))
                            setEditingProject(sub)
                          }}
                          className="text-sm text-signal-amber hover:underline"
                          title="Click to edit budget"
                        >
                          {formatCurrency(budget)}
                        </button>
                      </div>
                    </div>
                    {/* Active / Complete toggle */}
                    <button
                      onClick={toggleDisabled}
                      className={cn(
                        "shrink-0 h-7 px-2.5 rounded text-xs font-medium transition-colors whitespace-nowrap",
                        isDisabled
                          ? "bg-surface2 text-muted-foreground hover:bg-primary/10 hover:text-primary"
                          : "opacity-0 group-hover:opacity-100 bg-surface2 text-muted-foreground hover:bg-signal-amber/10 hover:text-signal-amber"
                      )}
                      title={isDisabled ? "Mark as active (will appear in dropdowns)" : "Mark as complete (hides from dropdowns)"}
                    >
                      {isDisabled ? "Re-activate" : "Complete"}
                    </button>
                    <button
                      onClick={() => openDeleteCategoryModal(sub, true)}
                      className="shrink-0 p-1.5 rounded text-muted-foreground hover:text-signal-red opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Delete"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                )}
                <div className="mt-2 h-1.5 bg-surface2 rounded-full overflow-hidden">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all",
                      percentUsed > 100 ? "bg-signal-red" : "bg-signal-amber"
                    )}
                    style={{ width: `${Math.min(percentUsed, 100)}%` }}
                  />
                </div>
              </Card>
            )
          })}

        {/* Add Project Category */}
        {addingCategory === "project" ? (
          <div className="flex items-center gap-2 pt-1">
            <input
              type="text"
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              placeholder="New project category name..."
              className="flex-1 h-9 px-3 bg-card border border-border rounded-lg text-sm"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") addCategory("project")
                if (e.key === "Escape") { setAddingCategory(null); setNewCategoryName("") }
              }}
            />
            <button onClick={() => addCategory("project")} className="p-2 rounded-lg bg-primary text-primary-foreground">
              <Check className="size-4" />
            </button>
            <button onClick={() => { setAddingCategory(null); setNewCategoryName("") }} className="p-2 rounded-lg bg-surface2 text-muted-foreground">
              <X className="size-4" />
            </button>
          </div>
        ) : (
          <button
            onClick={() => { setAddingCategory("project"); setNewCategoryName("") }}
            className="flex items-center gap-1.5 text-sm text-signal-amber hover:text-signal-amber/80 transition-colors py-1"
          >
            <Plus className="size-4" />
            Add project category
          </button>
        )}
      </div>

      {/* Deleted Items Section */}
      {(deletedSubcategories.length > 0 || deletedTopCategoryItems.length > 0) && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-muted-foreground">
            Hidden Items
          </h3>
          <Card className="border-border/50">
            <div className="space-y-2">
              {deletedTopCategoryItems.map(({ category, isProject }) => (
                <div key={`cat-${category}`} className="flex items-center justify-between py-1">
                  <div>
                    <span className={cn(
                      "text-xs font-medium px-1.5 py-0.5 rounded mr-2",
                      isProject ? "bg-signal-amber/10 text-signal-amber" : "bg-primary/10 text-primary"
                    )}>
                      {isProject ? "Project" : "Category"}
                    </span>
                    <span className="text-sm text-muted-foreground line-through">{category}</span>
                  </div>
                  <button
                    onClick={() => restoreCategory(category, isProject)}
                    className="flex items-center gap-1 text-xs text-primary hover:text-primary/80"
                  >
                    <Undo2 className="size-3" />
                    Restore
                  </button>
                </div>
              ))}
              {deletedSubcategories.map(({ subcategory, category }) => (
                <div key={subcategory} className="flex items-center justify-between py-1">
                  <div>
                    <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-surface2 text-muted-foreground mr-2">Subcategory</span>
                    <span className="text-sm text-muted-foreground line-through">{subcategory}</span>
                    <span className="text-xs text-muted-foreground ml-2">({category})</span>
                  </div>
                  <button
                    onClick={() => restoreSubcategory(subcategory)}
                    className="flex items-center gap-1 text-xs text-primary hover:text-primary/80"
                  >
                    <Undo2 className="size-3" />
                    Restore
                  </button>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
          <Card className="w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-foreground">
                {deleteModal.kind === "category" ? "Delete Category" : "Delete Subcategory"}
              </h3>
              <button onClick={() => setDeleteModal(null)} className="p-1 text-muted-foreground hover:text-foreground">
                <X className="size-5" />
              </button>
            </div>

            <p className="text-sm text-muted-foreground mb-4">
              Are you sure you want to delete{" "}
              <span className="text-foreground font-medium">
                {deleteModal.kind === "category" ? deleteModal.category : deleteModal.subcategory}
              </span>?
              {deleteModal.kind === "category" && (
                <span className="block mt-1 text-xs text-muted-foreground">
                  The category will be hidden. You can restore it from the Hidden Items section below.
                </span>
              )}
            </p>

            {deleteModal.count > 0 && (
              <div className="mb-4 p-3 bg-signal-amber/10 border border-signal-amber/20 rounded-lg">
                <p className="text-sm text-signal-amber font-medium mb-1">
                  {deleteModal.count} transaction{deleteModal.count !== 1 ? "s are" : " is"} assigned to this {deleteModal.kind}.
                </p>
                <p className="text-xs text-muted-foreground mb-3">
                  You must move them to another category before deleting, or leave them uncategorised.
                </p>
                <label className="text-xs text-muted-foreground block mb-1">
                  Move transactions to:
                </label>
                {deleteModal.kind === "subcategory" ? (
                  <select
                    value={deleteTransferTo}
                    onChange={(e) => setDeleteTransferTo(e.target.value)}
                    className="w-full h-9 px-2 bg-card border border-border rounded text-sm"
                  >
                    <option value="">Leave uncategorised</option>
                    {getAllSubcategories(deleteModal.category)
                      .filter(s => s !== deleteModal.subcategory)
                      .map(s => (
                        <option key={s} value={s}>{s} ({deleteModal.category})</option>
                      ))
                    }
                    {regularCategories
                      .filter(c => c !== deleteModal.category)
                      .flatMap(c => getAllSubcategories(c).map(s => ({ cat: c, sub: s })))
                      .map(({ cat, sub }) => (
                        <option key={`${cat}:${sub}`} value={sub}>{sub} ({cat})</option>
                      ))
                    }
                  </select>
                ) : (
                  <select
                    value={deleteTransferTo}
                    onChange={(e) => setDeleteTransferTo(e.target.value)}
                    className="w-full h-9 px-2 bg-card border border-border rounded text-sm"
                  >
                    <option value="">Leave uncategorised</option>
                    {allTransferCategories
                      .filter(c => c !== (deleteModal.kind === "category" ? deleteModal.category : ""))
                      .map(c => (
                        <option key={c} value={c}>{c}</option>
                      ))
                    }
                  </select>
                )}
              </div>
            )}

            <div className="flex items-center gap-2 justify-end">
              <SecondaryButton onClick={() => setDeleteModal(null)}>Cancel</SecondaryButton>
              <button
                onClick={confirmDelete}
                disabled={deleteModal.count > 0 && deleteTransferTo === "" ? false : false}
                className="px-4 py-2 rounded-lg bg-signal-red text-white text-sm font-medium hover:bg-signal-red/90 transition-colors"
              >
                {deleteModal.count > 0 && deleteTransferTo === "" ? "Delete & Leave Uncategorised" : "Delete"}
              </button>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
