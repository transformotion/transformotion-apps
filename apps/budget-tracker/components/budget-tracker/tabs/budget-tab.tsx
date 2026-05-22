"use client"

import { useState, useMemo } from "react"
import { useBudgetStore } from "@/stores/budget-tracker/use-budget-store"
import { PageHeader, Card, PrimaryButton, SecondaryButton } from "@transformotion/ui-primitives"
import { ChevronDown, Plus, Pencil, Trash2, RotateCcw, X, Check, Undo2, Eye, EyeOff } from "lucide-react"
import {
  getActiveCategories,
  getActiveSubcategories,
  getCategoriesByType,
  excludeFromCashflow,
  FREQUENCY_LABELS,
  toMonthlyAmount,
  type BudgetFrequency,
} from "@/lib/categories"
import { CATEGORY_COLORS } from "../data/category-colors"
import { ExcludedBadge } from "../badges/excluded-badge"
import type { Category, Subcategory } from "@transformotion/budget-domain"
import { cn } from "@/lib/utils"

function getMonthKey(dateStr: string): string {
  const [, month, year] = dateStr.split("/").map(Number)
  return `${year}-${String(month).padStart(2, "0")}`
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

export function BudgetTab() {
  const transactions = useBudgetStore((s) => s.transactions)
  const setTransactions = useBudgetStore((s) => s.setTransactions)
  const budgetData = useBudgetStore((s) => s.budgetData)
  const updateBudgetData = useBudgetStore((s) => s.updateBudgetData)

  const categories = budgetData.categories

  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set())
  const [editingSubcategoryId, setEditingSubcategoryId] = useState<string | null>(null)
  const [editBudget, setEditBudget] = useState("")
  const [editFrequency, setEditFrequency] = useState<BudgetFrequency>("monthly")
  const [editName, setEditName] = useState("")
  const [editExclude, setEditExclude] = useState(false)
  const [addingToCategoryId, setAddingToCategoryId] = useState<string | null>(null)
  const [newSubcategoryName, setNewSubcategoryName] = useState("")
  const [showUpdateFeedback, setShowUpdateFeedback] = useState<string | null>(null)
  const [addingCategory, setAddingCategory] = useState<"regular" | "capital" | null>(null)
  const [newCategoryName, setNewCategoryName] = useState("")
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null)
  const [editCategoryName, setEditCategoryName] = useState("")

  type DeleteTarget =
    | { kind: "subcategory"; subcategoryId: string; categoryId: string; count: number }
    | { kind: "category"; categoryId: string; count: number }
  const [deleteModal, setDeleteModal] = useState<DeleteTarget | null>(null)
  const [deleteTransferTo, setDeleteTransferTo] = useState("")

  function getBudgetAmount(subcategoryId: string): number {
    return budgetData.budgetAmounts[subcategoryId] ?? 0
  }

  function getBudgetFrequency(subcategoryId: string): BudgetFrequency {
    return (budgetData.budgetFrequencies[subcategoryId] ?? "monthly") as BudgetFrequency
  }

  const actualsBySubcategoryId = useMemo(() => {
    const actuals: Record<string, number> = {}
    const months = new Set<string>()

    for (const tx of transactions) {
      if (tx._business) continue

      let resolvedId: string | null = tx.subcategoryId ?? null
      if (!resolvedId && tx.subcategory) {
        for (const cat of categories) {
          const found = cat.subcategories.find(s => s.name === tx.subcategory)
          if (found) { resolvedId = found.subcategoryId; break }
        }
      }
      if (!resolvedId) continue
      if (excludeFromCashflow(categories, resolvedId)) continue

      const monthKey = getMonthKey(tx.date)
      months.add(monthKey)
      actuals[resolvedId] = (actuals[resolvedId] ?? 0) + Math.abs(parseFloat(String(tx.amount)) || 0)
    }

    const monthCount = Math.max(months.size, 1)
    const avgActuals: Record<string, number> = {}
    for (const [id, total] of Object.entries(actuals)) {
      avgActuals[id] = total / monthCount
    }
    return { actuals: avgActuals, monthCount }
  }, [transactions, categories])

  const budgetSummary = useMemo(() => {
    let totalIncome = 0
    let totalExpenses = 0

    for (const cat of getActiveCategories(budgetData.categories)) {
      if (cat.type === "capital") continue
      for (const sub of getActiveSubcategories(cat)) {
        const amount = budgetData.budgetAmounts[sub.subcategoryId] ?? 0
        const freq = (budgetData.budgetFrequencies[sub.subcategoryId] ?? "monthly") as BudgetFrequency
        const monthly = toMonthlyAmount(amount, freq)
        if (cat.name === "Income") {
          totalIncome += monthly
        } else {
          totalExpenses += monthly
        }
      }
    }

    const net = totalIncome - totalExpenses
    return { totalIncome, totalExpenses, net, isSurplus: net >= 0 }
  }, [budgetData])

  const deletedItems = useMemo(() => {
    const deletedCats: Category[] = []
    const deletedSubs: Array<{ sub: Subcategory; categoryName: string; categoryId: string }> = []
    for (const cat of categories) {
      if (cat.deleted) {
        deletedCats.push(cat)
      } else {
        for (const sub of cat.subcategories) {
          if (sub.deleted) deletedSubs.push({ sub, categoryName: cat.name, categoryId: cat.categoryId })
        }
      }
    }
    return { deletedCats, deletedSubs }
  }, [categories])

  function toggleCategory(categoryId: string) {
    setExpandedCategories(prev => {
      const next = new Set(prev)
      if (next.has(categoryId)) next.delete(categoryId)
      else next.add(categoryId)
      return next
    })
  }

  function startEdit(sub: Subcategory) {
    setEditingSubcategoryId(sub.subcategoryId)
    setEditName(sub.name)
    setEditBudget(getBudgetAmount(sub.subcategoryId).toString())
    setEditFrequency(getBudgetFrequency(sub.subcategoryId))
    setEditExclude(sub.excludeFromCashflow ?? false)
  }

  function saveEdit(categoryId: string) {
    if (!editingSubcategoryId) return
    const amount = parseFloat(editBudget) || 0
    const updatedCategories = categories.map(cat => {
      if (cat.categoryId !== categoryId) return cat
      return {
        ...cat,
        subcategories: cat.subcategories.map(sub =>
          sub.subcategoryId === editingSubcategoryId
            ? { ...sub, name: editName.trim() || sub.name, excludeFromCashflow: editExclude || undefined }
            : sub
        ),
      }
    })
    updateBudgetData({
      categories: updatedCategories,
      budgetAmounts: { ...budgetData.budgetAmounts, [editingSubcategoryId]: amount },
      budgetFrequencies: { ...budgetData.budgetFrequencies, [editingSubcategoryId]: editFrequency },
    })
    setEditingSubcategoryId(null)
  }

  function toggleSubcategoryExclude(sub: Subcategory, categoryId: string) {
    const updatedCategories = categories.map(cat => {
      if (cat.categoryId !== categoryId) return cat
      return {
        ...cat,
        subcategories: cat.subcategories.map(s =>
          s.subcategoryId === sub.subcategoryId
            ? { ...s, excludeFromCashflow: !s.excludeFromCashflow || undefined }
            : s
        ),
      }
    })
    updateBudgetData({ categories: updatedCategories })
  }

  function getParentCategoryId(subcategoryId: string): string | null {
    for (const cat of categories) {
      if (cat.subcategories.some(s => s.subcategoryId === subcategoryId)) return cat.categoryId
    }
    return null
  }

  function openDeleteSubcategoryModal(subcategoryId: string, categoryId: string) {
    const count = transactions.filter(t => t.subcategoryId === subcategoryId).length
    setDeleteModal({ kind: "subcategory", subcategoryId, categoryId, count })
    setDeleteTransferTo("")
  }

  function openDeleteCategoryModal(categoryId: string) {
    const count = transactions.filter(t => t.categoryId === categoryId).length
    setDeleteModal({ kind: "category", categoryId, count })
    setDeleteTransferTo("")
  }

  function confirmDelete() {
    if (!deleteModal) return

    if (deleteModal.kind === "subcategory") {
      const { subcategoryId, categoryId } = deleteModal
      if (deleteModal.count > 0) {
        const parentCatId = deleteTransferTo ? getParentCategoryId(deleteTransferTo) : null
        const updated = transactions.map(t =>
          t.subcategoryId === subcategoryId
            ? { ...t, subcategoryId: deleteTransferTo || null, categoryId: parentCatId || null, _manual: !!deleteTransferTo }
            : t
        )
        setTransactions(updated)
      }
      const updatedCategories = categories.map(cat =>
        cat.categoryId === categoryId
          ? {
              ...cat,
              subcategories: cat.subcategories.map(sub =>
                sub.subcategoryId === subcategoryId ? { ...sub, deleted: true } : sub
              ),
            }
          : cat
      )
      updateBudgetData({ categories: updatedCategories })
    } else {
      const { categoryId } = deleteModal
      if (deleteModal.count > 0) {
        const updated = transactions.map(t =>
          t.categoryId === categoryId
            ? { ...t, categoryId: deleteTransferTo || null, subcategoryId: null, _manual: !!deleteTransferTo }
            : t
        )
        setTransactions(updated)
      }
      const updatedCategories = categories.map(cat =>
        cat.categoryId === categoryId ? { ...cat, deleted: true } : cat
      )
      updateBudgetData({ categories: updatedCategories })
    }

    setDeleteModal(null)
    setDeleteTransferTo("")
  }

  function addSubcategory(categoryId: string) {
    if (!newSubcategoryName.trim()) return
    const newSub: Subcategory = {
      subcategoryId: crypto.randomUUID(),
      name: newSubcategoryName.trim(),
      displayOrder: Date.now(),
    }
    const updatedCategories = categories.map(cat =>
      cat.categoryId === categoryId
        ? { ...cat, subcategories: [...cat.subcategories, newSub] }
        : cat
    )
    updateBudgetData({ categories: updatedCategories })
    setNewSubcategoryName("")
    setAddingToCategoryId(null)
  }

  function addCategory(type: "regular" | "capital") {
    const name = newCategoryName.trim()
    if (!name) return
    const newCat: Category = {
      categoryId: crypto.randomUUID(),
      name,
      type,
      displayOrder: Date.now(),
      subcategories: [],
    }
    updateBudgetData({ categories: [...categories, newCat] })
    setNewCategoryName("")
    setAddingCategory(null)
  }

  function saveCategoryRename(categoryId: string) {
    const newName = editCategoryName.trim()
    if (!newName) { setEditingCategoryId(null); return }
    const updatedCategories = categories.map(cat =>
      cat.categoryId === categoryId ? { ...cat, name: newName } : cat
    )
    updateBudgetData({ categories: updatedCategories })
    setEditingCategoryId(null)
  }

  function restoreCategory(categoryId: string) {
    const updatedCategories = categories.map(cat =>
      cat.categoryId === categoryId ? { ...cat, deleted: false } : cat
    )
    updateBudgetData({ categories: updatedCategories })
  }

  function restoreSubcategory(subcategoryId: string) {
    const updatedCategories = categories.map(cat => ({
      ...cat,
      subcategories: cat.subcategories.map(sub =>
        sub.subcategoryId === subcategoryId ? { ...sub, deleted: false } : sub
      ),
    }))
    updateBudgetData({ categories: updatedCategories })
  }

  function updateFromActuals() {
    const updates: Record<string, number> = {}
    for (const [id, avgSpend] of Object.entries(actualsBySubcategoryId.actuals)) {
      if (avgSpend > 0) updates[id] = Math.round(avgSpend)
    }
    if (Object.keys(updates).length > 0) {
      updateBudgetData({ budgetAmounts: { ...budgetData.budgetAmounts, ...updates } })
      setShowUpdateFeedback(`Updated ${Object.keys(updates).length} budgets from ${actualsBySubcategoryId.monthCount} months of data`)
    } else {
      setShowUpdateFeedback("No actuals to update from")
    }
    setTimeout(() => setShowUpdateFeedback(null), 3000)
  }

  const regularCategories = getCategoriesByType(categories, "regular").filter(c => !c.deleted)
  const capitalCategories = getCategoriesByType(categories, "capital").filter(c => !c.deleted)

  function renderCategorySection(sectionCategories: Category[], sectionType: "regular" | "capital") {
    const isCapitalSection = sectionType === "capital"

    return sectionCategories.map((category) => {
      const activeSubs = getActiveSubcategories(category)
      const isExpanded = expandedCategories.has(category.categoryId)
      const categoryTotal = activeSubs.reduce(
        (sum, sub) => sum + toMonthlyAmount(getBudgetAmount(sub.subcategoryId), getBudgetFrequency(sub.subcategoryId)),
        0
      )
      const categoryColor = isCapitalSection
        ? "hsl(var(--signal-amber))"
        : (CATEGORY_COLORS[category.name] || CATEGORY_COLORS["default"])
      const isEditingThisCategory = editingCategoryId === category.categoryId

      return (
        <Card key={category.categoryId} className={cn(isCapitalSection && "border-signal-amber/30")}>
          {isEditingThisCategory ? (
            <div className="flex items-center gap-3">
              <div className="w-1 self-stretch rounded-full shrink-0" style={{ backgroundColor: categoryColor }} />
              <input
                type="text"
                value={editCategoryName}
                onChange={(e) => setEditCategoryName(e.target.value)}
                className="flex-1 h-8 px-2 bg-background border border-primary rounded text-sm font-medium"
                placeholder="Category name"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveCategoryRename(category.categoryId)
                  if (e.key === "Escape") setEditingCategoryId(null)
                }}
              />
              <button onClick={() => saveCategoryRename(category.categoryId)} className="p-1.5 rounded bg-signal-green text-white">
                <Check className="size-4" />
              </button>
              <button onClick={() => setEditingCategoryId(null)} className="p-1.5 rounded bg-surface2 text-muted-foreground hover:text-foreground">
                <X className="size-4" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1 group">
              <div
                role="button"
                tabIndex={0}
                onClick={() => toggleCategory(category.categoryId)}
                onKeyDown={(e) => e.key === "Enter" && toggleCategory(category.categoryId)}
                className="flex-1 flex items-center gap-3 min-w-0 cursor-pointer"
              >
                <div className="w-1 self-stretch rounded-full shrink-0" style={{ backgroundColor: categoryColor }} />
                <div className="flex-1 flex items-center justify-between min-w-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setEditCategoryName(category.name)
                        setEditingCategoryId(category.categoryId)
                      }}
                      className="text-sm font-medium text-foreground truncate hover:underline decoration-dashed underline-offset-2"
                      title="Click to rename"
                    >
                      {category.name}
                    </button>
                    <Pencil className="size-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                  </div>
                  <div className="flex items-center gap-2 ml-2">
                    <span className="text-sm text-muted-foreground whitespace-nowrap">
                      {formatCurrency(categoryTotal)}/mo
                    </span>
                    <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", isExpanded && "rotate-180")} />
                  </div>
                </div>
              </div>
              <button
                onClick={() => openDeleteCategoryModal(category.categoryId)}
                className="shrink-0 p-1.5 rounded text-muted-foreground hover:text-signal-red opacity-0 group-hover:opacity-100 transition-opacity"
                title="Delete category"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          )}

          {isExpanded && (
            <div className="mt-3 pt-3 border-t border-border space-y-1">
              {activeSubs.map((sub) => {
                const budget = getBudgetAmount(sub.subcategoryId)
                const freq = getBudgetFrequency(sub.subcategoryId)
                const monthlyBudget = toMonthlyAmount(budget, freq)
                const actual = actualsBySubcategoryId.actuals[sub.subcategoryId] || 0
                const isOver = actual > monthlyBudget && monthlyBudget > 0

                if (editingSubcategoryId === sub.subcategoryId) {
                  return (
                    <div key={sub.subcategoryId} className="py-2 px-2 bg-surface2 rounded-lg space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">Edit subcategory</span>
                        <div className="flex items-center gap-1">
                          <button onClick={() => saveEdit(category.categoryId)} className="p-1.5 rounded bg-primary text-primary-foreground">
                            <Check className="size-3.5" />
                          </button>
                          <button onClick={() => setEditingSubcategoryId(null)} className="p-1.5 rounded bg-surface text-muted-foreground">
                            <X className="size-3.5" />
                          </button>
                        </div>
                      </div>
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
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={editExclude}
                          onChange={(e) => setEditExclude(e.target.checked)}
                          className="rounded border-border"
                        />
                        <span className="text-xs text-muted-foreground">Exclude from Summary &amp; Cashflow</span>
                      </label>
                    </div>
                  )
                }

                return (
                  <div key={sub.subcategoryId} className="flex items-center justify-between py-1.5 group">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className={cn("text-sm truncate", sub.excludeFromCashflow ? "text-muted-foreground/50 italic" : "text-muted-foreground")}>
                        {sub.name}
                      </span>
                      {sub.excludeFromCashflow && <ExcludedBadge />}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {actual > 0 && !sub.excludeFromCashflow && (
                        <span className={cn("text-xs", isOver ? "text-signal-red" : "text-muted-foreground")}>
                          {formatCurrency(actual)} actual
                        </span>
                      )}
                      <span className={cn("text-sm", sub.excludeFromCashflow ? "text-muted-foreground/50" : "text-foreground")}>
                        {formatCurrency(budget)}
                      </span>
                      {freq !== "monthly" && (
                        <span className="text-[10px] text-muted-foreground">
                          /{FREQUENCY_LABELS[freq].toLowerCase().slice(0, 2)}
                        </span>
                      )}
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => toggleSubcategoryExclude(sub, category.categoryId)}
                          className="size-6 rounded flex items-center justify-center text-muted-foreground hover:text-amber-500"
                          title={sub.excludeFromCashflow ? "Include in cashflow" : "Exclude from cashflow"}
                        >
                          {sub.excludeFromCashflow ? <Eye className="size-3" /> : <EyeOff className="size-3" />}
                        </button>
                        <button
                          onClick={() => startEdit(sub)}
                          className="size-6 rounded flex items-center justify-center text-muted-foreground hover:text-foreground"
                          title="Edit"
                        >
                          <Pencil className="size-3" />
                        </button>
                        <button
                          onClick={() => openDeleteSubcategoryModal(sub.subcategoryId, category.categoryId)}
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

              {addingToCategoryId === category.categoryId ? (
                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="text"
                    value={newSubcategoryName}
                    onChange={(e) => setNewSubcategoryName(e.target.value)}
                    placeholder="New subcategory name..."
                    className="flex-1 h-8 px-2 bg-surface2 border border-border rounded text-sm"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter") addSubcategory(category.categoryId)
                      if (e.key === "Escape") setAddingToCategoryId(null)
                    }}
                  />
                  <button onClick={() => addSubcategory(category.categoryId)} className="p-1.5 rounded bg-primary text-primary-foreground">
                    <Check className="size-3.5" />
                  </button>
                  <button onClick={() => setAddingToCategoryId(null)} className="p-1.5 rounded bg-surface2 text-muted-foreground">
                    <X className="size-3.5" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setAddingToCategoryId(category.categoryId)}
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
    })
  }

  const deleteModalSubName = deleteModal?.kind === "subcategory"
    ? categories.flatMap(c => c.subcategories).find(s => s.subcategoryId === deleteModal.subcategoryId)?.name
    : null
  const deleteModalCatName = deleteModal?.kind === "category"
    ? categories.find(c => c.categoryId === deleteModal.categoryId)?.name
    : null

  return (
    <div className="p-4 space-y-4">
      <PageHeader title="Budget" subtitle="Set your monthly spending targets" />

      <div className="flex items-center gap-2">
        <PrimaryButton onClick={updateFromActuals} className="flex-1">
          <RotateCcw className="size-4 mr-2" />
          Update from actuals
        </PrimaryButton>
      </div>

      {/* Surplus / Deficit Banner */}
      <div className={cn(
        "rounded-xl border p-4 flex items-center justify-between gap-4",
        budgetSummary.isSurplus ? "bg-signal-green/10 border-signal-green/25" : "bg-signal-red/10 border-signal-red/25"
      )}>
        <div className="min-w-0">
          <p className={cn("text-sm font-bold", budgetSummary.isSurplus ? "text-signal-green" : "text-signal-red")}>
            {budgetSummary.isSurplus ? "Budget in surplus" : "Budget in deficit"}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {budgetSummary.isSurplus
              ? `Income exceeds expenses by ${formatCurrency(budgetSummary.net)} / mo`
              : `Expenses exceed income by ${formatCurrency(Math.abs(budgetSummary.net))} / mo`}
          </p>
        </div>
        <div className="flex items-center gap-5 shrink-0 text-right">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Income</p>
            <p className="text-sm font-semibold text-foreground">
              {formatCurrency(budgetSummary.totalIncome)}<span className="text-xs font-normal text-muted-foreground"> /mo</span>
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Expenses</p>
            <p className="text-sm font-semibold text-foreground">
              {formatCurrency(budgetSummary.totalExpenses)}<span className="text-xs font-normal text-muted-foreground"> /mo</span>
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Net</p>
            <p className={cn("text-sm font-bold", budgetSummary.isSurplus ? "text-signal-green" : "text-signal-red")}>
              {budgetSummary.isSurplus ? "" : "-"}{formatCurrency(Math.abs(budgetSummary.net))}<span className="text-xs font-normal opacity-70"> /mo</span>
            </p>
          </div>
        </div>
      </div>

      {showUpdateFeedback && (
        <div className="p-3 bg-primary/10 border border-primary/20 rounded-lg text-sm text-primary">
          {showUpdateFeedback}
        </div>
      )}

      {/* Monthly Recurring */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-foreground">Monthly Recurring</h3>
        {renderCategorySection(regularCategories, "regular")}
        {addingCategory === "regular" ? (
          <div className="flex items-center gap-2 pt-1">
            <input
              type="text"
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              placeholder="New category name..."
              className="flex-1 h-9 px-3 bg-card border border-border rounded-lg text-sm"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") addCategory("regular")
                if (e.key === "Escape") { setAddingCategory(null); setNewCategoryName("") }
              }}
            />
            <button onClick={() => addCategory("regular")} className="p-2 rounded-lg bg-primary text-primary-foreground">
              <Check className="size-4" />
            </button>
            <button onClick={() => { setAddingCategory(null); setNewCategoryName("") }} className="p-2 rounded-lg bg-surface2 text-muted-foreground">
              <X className="size-4" />
            </button>
          </div>
        ) : (
          <button
            onClick={() => { setAddingCategory("regular"); setNewCategoryName("") }}
            className="flex items-center gap-1.5 text-sm text-primary hover:text-primary/80 transition-colors py-1"
          >
            <Plus className="size-4" />
            Add category
          </button>
        )}
      </div>

      {/* Capital Expenditure */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-signal-amber">Capital Expenditure</h3>
        <p className="text-xs text-muted-foreground">Excluded from regular P&amp;L cashflow calculations.</p>
        {renderCategorySection(capitalCategories, "capital")}
        {addingCategory === "capital" ? (
          <div className="flex items-center gap-2 pt-1">
            <input
              type="text"
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              placeholder="New capital category name..."
              className="flex-1 h-9 px-3 bg-card border border-border rounded-lg text-sm"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") addCategory("capital")
                if (e.key === "Escape") { setAddingCategory(null); setNewCategoryName("") }
              }}
            />
            <button onClick={() => addCategory("capital")} className="p-2 rounded-lg bg-primary text-primary-foreground">
              <Check className="size-4" />
            </button>
            <button onClick={() => { setAddingCategory(null); setNewCategoryName("") }} className="p-2 rounded-lg bg-surface2 text-muted-foreground">
              <X className="size-4" />
            </button>
          </div>
        ) : (
          <button
            onClick={() => { setAddingCategory("capital"); setNewCategoryName("") }}
            className="flex items-center gap-1.5 text-sm text-signal-amber hover:text-signal-amber/80 transition-colors py-1"
          >
            <Plus className="size-4" />
            Add capital category
          </button>
        )}
      </div>

      {/* Hidden Items */}
      {(deletedItems.deletedCats.length > 0 || deletedItems.deletedSubs.length > 0) && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-muted-foreground">Hidden Items</h3>
          <Card className="border-border/50">
            <div className="space-y-2">
              {deletedItems.deletedCats.map((cat) => (
                <div key={cat.categoryId} className="flex items-center justify-between py-1">
                  <div>
                    <span className={cn(
                      "text-xs font-medium px-1.5 py-0.5 rounded mr-2",
                      cat.type === "capital" ? "bg-signal-amber/10 text-signal-amber" : "bg-primary/10 text-primary"
                    )}>
                      {cat.type === "capital" ? "Capital" : "Category"}
                    </span>
                    <span className="text-sm text-muted-foreground line-through">{cat.name}</span>
                  </div>
                  <button
                    onClick={() => restoreCategory(cat.categoryId)}
                    className="flex items-center gap-1 text-xs text-primary hover:text-primary/80"
                  >
                    <Undo2 className="size-3" />
                    Restore
                  </button>
                </div>
              ))}
              {deletedItems.deletedSubs.map(({ sub, categoryName }) => (
                <div key={sub.subcategoryId} className="flex items-center justify-between py-1">
                  <div>
                    <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-surface2 text-muted-foreground mr-2">Subcategory</span>
                    <span className="text-sm text-muted-foreground line-through">{sub.name}</span>
                    <span className="text-xs text-muted-foreground ml-2">({categoryName})</span>
                  </div>
                  <button
                    onClick={() => restoreSubcategory(sub.subcategoryId)}
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
                {deleteModal.kind === "category" ? deleteModalCatName : deleteModalSubName}
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
                <label className="text-xs text-muted-foreground block mb-1">Move transactions to:</label>
                {deleteModal.kind === "subcategory" ? (
                  <select
                    value={deleteTransferTo}
                    onChange={(e) => setDeleteTransferTo(e.target.value)}
                    className="w-full h-9 px-2 bg-card border border-border rounded text-sm"
                  >
                    <option value="">Leave uncategorised</option>
                    {getActiveCategories(categories).flatMap(cat =>
                      getActiveSubcategories(cat)
                        .filter(s => s.subcategoryId !== deleteModal.subcategoryId)
                        .map(s => (
                          <option key={s.subcategoryId} value={s.subcategoryId}>
                            {s.name} ({cat.name})
                          </option>
                        ))
                    )}
                  </select>
                ) : (
                  <select
                    value={deleteTransferTo}
                    onChange={(e) => setDeleteTransferTo(e.target.value)}
                    className="w-full h-9 px-2 bg-card border border-border rounded text-sm"
                  >
                    <option value="">Leave uncategorised</option>
                    {getActiveCategories(categories)
                      .filter(c => c.categoryId !== deleteModal.categoryId)
                      .map(c => (
                        <option key={c.categoryId} value={c.categoryId}>{c.name}</option>
                      ))}
                  </select>
                )}
              </div>
            )}

            <div className="flex items-center gap-2 justify-end">
              <SecondaryButton onClick={() => setDeleteModal(null)}>Cancel</SecondaryButton>
              <button
                onClick={confirmDelete}
                className="px-4 py-2 rounded-lg bg-signal-red text-white text-sm font-medium hover:bg-signal-red/90 transition-colors"
              >
                {deleteModal.count > 0 && !deleteTransferTo ? "Delete & Leave Uncategorised" : "Delete"}
              </button>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
