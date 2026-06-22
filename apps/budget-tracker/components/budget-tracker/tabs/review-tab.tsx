"use client"

import { useState } from "react"
import { useBudgetStore } from "@/stores/budget-tracker/use-budget-store"
import { useReviewStore } from "@/stores/budget-tracker/use-review-store"
import type { ReviewResult } from "@/stores/budget-tracker/use-review-store"
import { useAuthStore, selectCurrentAccount } from "@/stores/auth/use-auth-store"
import { PageHeader, Card, PrimaryButton, EmptyState } from "@transformotion/ui-primitives"
import { Sparkles, Check, X, ChevronRight, Pencil, AlertCircle, RefreshCw } from "lucide-react"
import { getCategoryBadgeStyle } from "../data/category-colors"
import { getActiveCategories, getActiveSubcategories, getCategoryName, getSubcategoryName } from "@/lib/categories"
import { cn } from "@/lib/utils"
import { getAIService } from "@/lib/services/ai"
import type { ReviewResult as AIReviewResult } from "@/lib/services/ai"
import type { MatchingRule } from "@transformotion/budget-domain"

function ConfidenceBadge({ confidence }: { confidence: 'high' | 'medium' | 'low' }) {
  const cls = {
    high:   'bg-signal-green/15 text-signal-green',
    medium: 'bg-signal-amber/15 text-signal-amber',
    low:    'bg-signal-red/15 text-signal-red',
  }[confidence]
  return (
    <span className={cn('px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wider', cls)}>
      {confidence}
    </span>
  )
}

export function ReviewTab() {
  const transactions = useBudgetStore((s) => s.transactions)
  const matchingRules = useBudgetStore((s) => s.matchingRules)
  const uncategorizedCount = useBudgetStore((s) => s.uncategorizedCount)
  const updateTransaction = useBudgetStore((s) => s.updateTransaction)
  const addMatchingRule = useBudgetStore((s) => s.addMatchingRule)
  const budgetData = useBudgetStore((s) => s.budgetData)
  const settings = useBudgetStore((s) => s.settings)
  const currentAccount = useAuthStore(selectCurrentAccount)

  // Persistent across tab navigation (Zustand)
  const reviewState    = useReviewStore((s) => s.reviewState)
  const error          = useReviewStore((s) => s.error)
  const reviewResults  = useReviewStore((s) => s.reviewResults)
  const progress       = useReviewStore((s) => s.progress)
  const { setReviewState, setError, setReviewResults, setProgress, updateProgress, updateResultStatus } = useReviewStore.getState()

  // Ephemeral interaction state (local — intentionally lost on navigation)
  // forceFullSearch is local (resets per page session) — a per-run override, not a setting
  const [forceFullSearch, setForceFullSearch] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editCategoryId, setEditCategoryId] = useState("")
  const [editSubcategoryId, setEditSubcategoryId] = useState("")
  const [acceptError, setAcceptError] = useState<string | null>(null)
  const [acceptAllProgress, setAcceptAllProgress] = useState<{ current: number; total: number } | null>(null)

  const categories = budgetData.categories
  const uncategorizedTransactions = transactions.filter(t => !t.categoryId && !t.category)

  function mergeResults(prev: ReviewResult[], incoming: AIReviewResult[], pass: 1 | 2, batch: typeof uncategorizedTransactions): ReviewResult[] {
    const next = [...prev]
    for (const r of incoming) {
      const tx = batch[r.index]
      if (!tx?.transactionId) continue
      const formatted: ReviewResult = {
        transactionId: tx.transactionId,
        description: tx.description,
        suggestedCategoryId: r.categoryId,
        suggestedSubcategoryId: r.subcategoryId,
        suggestedCategoryName: getCategoryName(categories, r.categoryId),
        suggestedSubcategoryName: getSubcategoryName(categories, r.subcategoryId),
        reason: r.reason,
        confidence: r.confidence,
        pass,
        status: 'pending',
      }
      const idx = next.findIndex(x => x.transactionId === tx.transactionId)
      if (idx >= 0) {
        // Pass 2 overrides Pass 1 — keep accepted/rejected status if already actioned
        next[idx] = next[idx].status !== 'pending' ? next[idx] : formatted
      } else {
        next.push(formatted)
      }
    }
    return next
  }

  const handleAIReview = async () => {
    setReviewState('reviewing')
    setError(null)
    setAcceptError(null)
    setReviewResults([])
    const batch = uncategorizedTransactions.slice(0, 100)
    setProgress({ completed: 0, total: batch.length })

    const indexedTxs = batch.map((t, i) => ({
      index: i,
      description: t.description,
      amount: String(t.amount),
    }))

    try {
      await getAIService().reviewTransactions({
        transactions: indexedTxs,
        categories,
        settings: {
          batchSize:           settings.aiReviewBatchSize,
          parallelLimit:       settings.aiReviewParallelLimit,
          confidenceThreshold: settings.aiReviewConfidenceThreshold,
        },
        forceFullSearch,
        onBatch: (batchResults: AIReviewResult[], pass: 1 | 2) => {
          setReviewResults(prev => mergeResults(prev, batchResults, pass, batch))
          if (pass === 1) {
            updateProgress(p => ({ ...p, completed: Math.min(p.completed + batchResults.length, p.total) }))
          }
        },
      })
      setReviewState('complete')
    } catch (err) {
      setReviewState('error')
      setError(err instanceof Error ? err.message : 'AI review failed')
    }
  }

  const acceptResult = async (result: ReviewResult, categoryId: string, subcategoryId: string) => {
    await updateTransaction(result.transactionId, { categoryId, subcategoryId, _manual: true })
    if (currentAccount && result.description && categoryId && subcategoryId) {
      const rule: MatchingRule = {
        ruleId:       crypto.randomUUID(),
        accountId:    currentAccount.id,
        name:         result.description,
        match:        result.description,
        matchType:    'contains',
        categoryId,
        subcategoryId,
        isBusiness:   false,
        learned:      true,
        enabled:      true,
        priority:     matchingRules.length > 0 ? Math.min(...matchingRules.map(r => r.priority)) - 1000 : 1000,
        createdAt:    new Date().toISOString(),
      }
      await addMatchingRule(rule)
    }
    updateResultStatus(result.transactionId, 'accepted')
  }

  const handleAccept = async (transactionId: string) => {
    const result = reviewResults.find(r => r.transactionId === transactionId)
    if (!result) return
    setAcceptError(null)
    try {
      await acceptResult(result, result.suggestedCategoryId, result.suggestedSubcategoryId)
    } catch (err) {
      setAcceptError(err instanceof Error ? err.message : 'Failed to save — check your connection and try again')
    }
  }

  const handleAcceptAll = async () => {
    const pending = reviewResults.filter(r => r.status === 'pending')
    if (pending.length === 0) return
    setAcceptError(null)
    setAcceptAllProgress({ current: 0, total: pending.length })
    let failCount = 0
    for (let i = 0; i < pending.length; i++) {
      setAcceptAllProgress({ current: i + 1, total: pending.length })
      try {
        await acceptResult(pending[i], pending[i].suggestedCategoryId, pending[i].suggestedSubcategoryId)
      } catch {
        failCount++
      }
    }
    setAcceptAllProgress(null)
    if (failCount > 0) {
      setAcceptError(`${failCount} suggestion${failCount !== 1 ? 's' : ''} could not be saved — check your connection and try again`)
    }
  }

  const handleReject = (transactionId: string) => {
    updateResultStatus(transactionId, 'rejected')
  }

  const startEdit = (result: ReviewResult) => {
    setEditingId(result.transactionId)
    setEditCategoryId(result.suggestedCategoryId)
    setEditSubcategoryId(result.suggestedSubcategoryId)
  }

  const acceptEdited = async (result: ReviewResult) => {
    setAcceptError(null)
    try {
      await acceptResult(result, editCategoryId, editSubcategoryId)
      setEditingId(null)
    } catch (err) {
      setAcceptError(err instanceof Error ? err.message : 'Failed to save — check your connection and try again')
    }
  }

  const editingCategory = getActiveCategories(categories).find(c => c.categoryId === editCategoryId)

  const pendingResults   = reviewResults.filter(r => r.status === 'pending')
  const completedResults = reviewResults.filter(r => r.status !== 'pending')
  const progressPct      = progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : 0
  const isReviewing      = reviewState === 'reviewing'
  const isAcceptingAll   = acceptAllProgress !== null

  const bannerText = pendingResults.length > 0
    ? `Review complete — ${pendingResults.length} suggestion${pendingResults.length !== 1 ? 's' : ''} remaining`
    : 'Review complete — all suggestions processed'

  return (
    <div className="p-4 space-y-4 overflow-hidden">
      <PageHeader
        title="Review"
        subtitle="AI-powered transaction categorization"
        titleClassName="font-display text-xl uppercase tracking-wide"
      />

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
          disabled={uncategorizedCount === 0 || isReviewing || isAcceptingAll}
          className="w-full"
        >
          {isReviewing ? (
            <>
              <RefreshCw className="size-4 mr-2 animate-spin" />
              Reviewing...
            </>
          ) : (
            <>
              <Sparkles className="size-4 mr-2" />
              Review with AI
            </>
          )}
        </PrimaryButton>

        {/* Full search toggle — per-run override; does not modify Settings */}
        <label className="flex items-center gap-2 mt-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={forceFullSearch}
            onChange={(e) => setForceFullSearch(e.target.checked)}
            disabled={isReviewing || isAcceptingAll}
            className="rounded border-border disabled:opacity-50"
          />
          <span className="text-xs text-muted-foreground">
            Full search (slower, more accurate — uses web search for every transaction)
          </span>
        </label>

        {/* AI Review progress bar */}
        {isReviewing && progress.total > 0 && (
          <div className="mt-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-muted-foreground">
                Reviewing... {progress.completed} of {progress.total}
              </span>
              <span className="text-xs text-muted-foreground">{progressPct}%</span>
            </div>
            <div className="h-1.5 bg-surface2 rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-300"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        )}

        {/* Accept All progress */}
        {isAcceptingAll && acceptAllProgress && (
          <div className="mt-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-muted-foreground">
                Accepting... {acceptAllProgress.current} of {acceptAllProgress.total}
              </span>
            </div>
            <div className="h-1.5 bg-surface2 rounded-full overflow-hidden">
              <div
                className="h-full bg-signal-green rounded-full transition-all duration-300"
                style={{ width: `${Math.round((acceptAllProgress.current / acceptAllProgress.total) * 100)}%` }}
              />
            </div>
          </div>
        )}

        {reviewState === 'complete' && reviewResults.length > 0 && (
          <div className="mt-3 p-2.5 rounded-lg bg-signal-green/10 border border-signal-green/20">
            <p className="text-xs text-signal-green font-medium">{bannerText}</p>
          </div>
        )}

        {reviewState === 'error' && error && (
          <div className="mt-3 p-3 rounded-lg bg-signal-red/10 border border-signal-red/20 flex items-start gap-2">
            <AlertCircle className="size-4 text-signal-red mt-0.5 shrink-0" />
            <div className="text-sm text-signal-red">{error}</div>
          </div>
        )}
      </Card>

      {/* Accept error (separate from AI review error) */}
      {acceptError && (
        <div className="p-3 rounded-lg bg-signal-red/10 border border-signal-red/20 flex items-start gap-2">
          <AlertCircle className="size-4 text-signal-red mt-0.5 shrink-0" />
          <div className="text-sm text-signal-red">{acceptError}</div>
        </div>
      )}

      {uncategorizedCount === 0 && reviewResults.length === 0 && (
        <EmptyState
          icon={Sparkles}
          title="All caught up!"
          description="All your transactions have been categorized"
        />
      )}

      {pendingResults.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-base font-semibold tracking-wide text-foreground">
              AI Suggestions
              <span className="ml-2 text-xs font-normal text-muted-foreground">({pendingResults.length})</span>
            </h3>
            <button
              onClick={handleAcceptAll}
              disabled={isAcceptingAll}
              className="text-xs text-primary hover:text-primary/80 transition-colors disabled:opacity-50"
            >
              {isAcceptingAll ? 'Accepting...' : 'Accept all'}
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
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="text-sm font-medium text-foreground truncate">
                        {transaction.description}
                      </p>
                      {result.pass === 2 && (
                        <span className="shrink-0 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-primary/10 text-primary">
                          web ✓
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mb-2">
                      {transaction.date} • ${Math.abs(parseFloat(String(transaction.amount))).toFixed(2)}
                    </p>

                    {isEditing ? (
                      <div className="space-y-2">
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-[10px] uppercase tracking-wider text-muted-foreground block mb-1">Category</label>
                            <select
                              value={editCategoryId}
                              onChange={(e) => {
                                setEditCategoryId(e.target.value)
                                setEditSubcategoryId("")
                              }}
                              className="w-full h-8 px-2 bg-surface2 border border-border rounded text-sm"
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
                              onChange={(e) => setEditSubcategoryId(e.target.value)}
                              className="w-full h-8 px-2 bg-surface2 border border-border rounded text-sm"
                              disabled={!editCategoryId}
                            >
                              <option value="">Select...</option>
                              {editingCategory && getActiveSubcategories(editingCategory).map(sub => (
                                <option key={sub.subcategoryId} value={sub.subcategoryId}>{sub.name}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => acceptEdited(result)}
                            disabled={!editCategoryId || !editSubcategoryId}
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
                        <div className="flex items-center gap-2 mb-1">
                          <ChevronRight className="size-3 text-primary" />
                          <span
                            className="px-2 py-0.5 rounded text-[10px] font-medium"
                            style={getCategoryBadgeStyle(result.suggestedCategoryName)}
                          >
                            {result.suggestedSubcategoryName || result.suggestedCategoryName}
                          </span>
                          <ConfidenceBadge confidence={result.confidence} />
                        </div>
                        <p className="text-xs text-muted-foreground italic">{result.reason}</p>
                      </>
                    )}
                  </div>

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
                        disabled={isAcceptingAll}
                        className="size-8 rounded-lg bg-signal-green/15 text-signal-green hover:bg-signal-green/25 flex items-center justify-center transition-colors disabled:opacity-50"
                        title="Accept"
                      >
                        <Check className="size-4" />
                      </button>
                      <button
                        onClick={() => handleReject(result.transactionId)}
                        disabled={isAcceptingAll}
                        className="size-8 rounded-lg bg-signal-red/15 text-signal-red hover:bg-signal-red/25 flex items-center justify-center transition-colors disabled:opacity-50"
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

      {completedResults.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-muted-foreground">Completed</h3>
          <p className="text-xs text-muted-foreground">
            {completedResults.filter(r => r.status === 'accepted').length} accepted,{" "}
            {completedResults.filter(r => r.status === 'rejected').length} rejected
          </p>
        </div>
      )}
    </div>
  )
}
