"use client"

import { useState } from "react"
import { useBudgetStore } from "@/stores/budget-tracker/use-budget-store"
import { useAuthStore, selectCurrentAccount } from "@/stores/auth/use-auth-store"
import { PageHeader, Card, PrimaryButton, EmptyState } from "@/components/ui/design-system"
import { Sparkles, Check, X, ChevronRight, Pencil, AlertCircle } from "lucide-react"
import { getCategoryBadgeClasses } from "../data/category-colors"
import { CATEGORY_LIST, getSubcategories, BUDGET_CATEGORIES } from "../data/categories"
import { cn } from "@/lib/utils"
import { getAIService } from "@/lib/services/ai"

interface ReviewResult {
  transactionId: string
  description: string
  suggestedCategory: string
  suggestedSubcategory: string
  reason: string
  status: "pending" | "accepted" | "rejected"
}

export function ReviewTab() {
  const transactions = useBudgetStore((s) => s.transactions)
  const uncategorizedCount = useBudgetStore((s) => s.uncategorizedCount)
  const updateTransaction = useBudgetStore((s) => s.updateTransaction)
  const addCustomRule = useBudgetStore((s) => s.addCustomRule)
  const currentAccount = useAuthStore(selectCurrentAccount)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editCategory, setEditCategory] = useState("")
  const [editSubcategory, setEditSubcategory] = useState("")
  const [reviewResults, setReviewResults] = useState<ReviewResult[]>([])

  const uncategorizedTransactions = transactions.filter(t => !t.category)

  const handleAIReview = async () => {
    setLoading(true)
    setError(null)
    try {
      const batch = uncategorizedTransactions.slice(0, 20)
      const indexedTxs = batch.map((t, i) => ({
        index: i,
        description: t.description,
        amount: String(t.amount),
      }))

      const result = await getAIService().reviewTransactions({
        transactions: indexedTxs,
        categories: BUDGET_CATEGORIES,
      })

      const formatted: ReviewResult[] = result.results.map(r => {
        const tx = batch[r.index]
        return {
          transactionId: tx?.transactionId ?? '',
          description: tx?.description ?? '',
          suggestedCategory: r.category,
          suggestedSubcategory: r.subcategory,
          reason: r.reason,
          status: "pending" as const,
        }
      }).filter(r => r.transactionId)

      setReviewResults(formatted)
    } catch (err) {
      setError(err instanceof Error ? err : new Error("AI review failed"))
    } finally {
      setLoading(false)
    }
  }

  const acceptResult = async (result: ReviewResult, category: string, subcategory: string) => {
    await updateTransaction(result.transactionId, {
      category,
      subcategory,
      _manual: true,
    })
    if (currentAccount && result.description && category && subcategory) {
      await addCustomRule({
        ruleId: crypto.randomUUID(),
        accountId: currentAccount.id,
        name: result.description,
        match: result.description,
        matchType: 'contains',
        category,
        subcategory,
        enabled: true,
        priority: Date.now(),
        isBusiness: false,
        learned: true,
        createdAt: new Date().toISOString(),
      })
    }
    setReviewResults(prev =>
      prev.map(r => r.transactionId === result.transactionId ? { ...r, status: "accepted" } : r)
    )
  }

  const handleAccept = (transactionId: string) => {
    const result = reviewResults.find(r => r.transactionId === transactionId)
    if (result) {
      acceptResult(result, result.suggestedCategory, result.suggestedSubcategory)
    }
  }

  const handleAcceptAll = () => {
    const pending = reviewResults.filter(r => r.status === "pending")
    for (const result of pending) {
      acceptResult(result, result.suggestedCategory, result.suggestedSubcategory)
    }
  }

  const handleReject = (transactionId: string) => {
    setReviewResults(prev =>
      prev.map(r => r.transactionId === transactionId ? { ...r, status: "rejected" } : r)
    )
  }

  const startEdit = (result: ReviewResult) => {
    setEditingId(result.transactionId)
    setEditCategory(result.suggestedCategory)
    setEditSubcategory(result.suggestedSubcategory)
  }

  const acceptEdited = (result: ReviewResult) => {
    acceptResult(result, editCategory, editSubcategory)
    setEditingId(null)
  }

  const pendingResults = reviewResults.filter(r => r.status === "pending")
  const completedResults = reviewResults.filter(r => r.status !== "pending")

  return (
    <div className="p-4 space-y-4 overflow-hidden">
      {/* Header */}
      <PageHeader
        title="Review"
        subtitle="AI-powered transaction categorization"
      />

      {/* Status Card */}
      <Card>
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-sm font-medium text-foreground">Uncategorised transactions</p>
            <p className="text-2xl font-bold text-signal-amber">{uncategorizedCount}</p>
          </div>
          <div className="size-12 rounded-full bg-signal-amber/15 flex items-center justify-center">
            <Sparkles className="size-6 text-signal-amber" />
          </div>
        </div>

        <PrimaryButton
          onClick={handleAIReview}
          disabled={uncategorizedCount === 0 || loading}
          className="w-full"
        >
          {loading ? (
            <>
              <span className="inline-block animate-spin mr-2">⏳</span>
              Analysing transactions...
            </>
          ) : (
            <>
              <Sparkles className="size-4 mr-2" />
              Review with AI
            </>
          )}
        </PrimaryButton>

        {error && (
          <div className="mt-3 p-3 rounded-lg bg-signal-red/10 border border-signal-red/20 flex items-start gap-2">
            <AlertCircle className="size-4 text-signal-red mt-0.5 shrink-0" />
            <div className="text-sm text-signal-red">{error.message}</div>
          </div>
        )}
      </Card>

      {/* Empty State */}
      {uncategorizedCount === 0 && reviewResults.length === 0 && (
        <EmptyState
          icon={Sparkles}
          title="All caught up!"
          description="All your transactions have been categorized"
        />
      )}

      {/* Review Results */}
      {pendingResults.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">AI Suggestions</h3>
            <button
              onClick={handleAcceptAll}
              className="text-xs text-primary hover:text-primary/80 transition-colors"
            >
              Accept all
            </button>
          </div>

          {pendingResults.map((result) => {
            const transaction = transactions.find(t => t.transactionId === result.transactionId)
            if (!transaction) return null
            const isEditing = editingId === result.transactionId

            return (
              <Card key={result.transactionId}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {transaction.description}
                    </p>
                    <p className="text-xs text-muted-foreground mb-2">
                      {transaction.date} • ${Math.abs(parseFloat(String(transaction.amount))).toFixed(2)}
                    </p>

                    {/* Editing mode */}
                    {isEditing ? (
                      <div className="space-y-2">
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-[10px] uppercase tracking-wider text-muted-foreground block mb-1">Category</label>
                            <select
                              value={editCategory}
                              onChange={(e) => {
                                setEditCategory(e.target.value)
                                setEditSubcategory("")
                              }}
                              className="w-full h-8 px-2 bg-surface2 border border-border rounded text-sm"
                            >
                              <option value="">Select...</option>
                              {CATEGORY_LIST.map(cat => (
                                <option key={cat} value={cat}>{cat}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="text-[10px] uppercase tracking-wider text-muted-foreground block mb-1">Subcategory</label>
                            <select
                              value={editSubcategory}
                              onChange={(e) => setEditSubcategory(e.target.value)}
                              className="w-full h-8 px-2 bg-surface2 border border-border rounded text-sm"
                              disabled={!editCategory}
                            >
                              <option value="">Select...</option>
                              {editCategory && getSubcategories(editCategory).map(sub => (
                                <option key={sub} value={sub}>{sub}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => acceptEdited(result)}
                            disabled={!editCategory || !editSubcategory}
                            className="flex-1 h-8 rounded-lg bg-signal-green text-white text-xs font-medium disabled:opacity-50 flex items-center justify-center gap-1"
                          >
                            <Check className="size-3" />
                            Accept
                          </button>
                          <button
                            onClick={() => setEditingId(null)}
                            className="h-8 px-3 rounded-lg bg-surface2 text-muted-foreground text-xs"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        {/* Suggestion */}
                        <div className="flex items-center gap-2 mb-1">
                          <ChevronRight className="size-3 text-primary" />
                          <span className={cn("px-2 py-0.5 rounded text-[10px] font-medium", getCategoryBadgeClasses(result.suggestedCategory))}>
                            {result.suggestedSubcategory}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground italic">{result.reason}</p>
                      </>
                    )}
                  </div>

                  {/* Actions - only show when not editing */}
                  {!isEditing && (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => startEdit(result)}
                        className="size-8 rounded-lg bg-surface2 text-muted-foreground hover:text-foreground hover:bg-surface flex items-center justify-center transition-colors"
                        title="Edit suggestion"
                      >
                        <Pencil className="size-4" />
                      </button>
                      <button
                        onClick={() => handleAccept(result.transactionId)}
                        className="size-8 rounded-lg bg-signal-green/15 text-signal-green hover:bg-signal-green/25 flex items-center justify-center transition-colors"
                        title="Accept"
                      >
                        <Check className="size-4" />
                      </button>
                      <button
                        onClick={() => handleReject(result.transactionId)}
                        className="size-8 rounded-lg bg-signal-red/15 text-signal-red hover:bg-signal-red/25 flex items-center justify-center transition-colors"
                        title="Reject"
                      >
                        <X className="size-4" />
                      </button>
                    </div>
                  )}
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {/* Completed Results */}
      {completedResults.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-muted-foreground">Completed</h3>
          <p className="text-xs text-muted-foreground">
            {completedResults.filter(r => r.status === "accepted").length} accepted, {" "}
            {completedResults.filter(r => r.status === "rejected").length} rejected
          </p>
        </div>
      )}
    </div>
  )
}
