"use client"

import { useState, useRef, useMemo, useEffect } from "react"
import { useBudgetStore } from "@/stores/budget-tracker/use-budget-store"
import { useAuthStore, selectCurrentAccount } from "@/stores/auth/use-auth-store"
import { PageHeader, Card, PrimaryButton, SecondaryButton } from "@/components/ui/design-system"
import { Search, Plus, RotateCcw, ChevronDown, Check, X, Pencil, Trash2, Ban, HelpCircle } from "lucide-react"
import { applyRules, previewRuleMatches } from "@transformotion/budget-domain"
import { CATEGORY_COLORS } from "../data/category-colors"
import { getActiveCategories, getActiveSubcategories, getCategoryName, getSubcategoryName } from "@/lib/categories"
import type { MatchingRule } from "@transformotion/budget-domain"
import { cn } from "@/lib/utils"

export function RulesTab() {
  const matchingRules = useBudgetStore((s) => s.matchingRules)
  const setMatchingRules = useBudgetStore((s) => s.setMatchingRules)
  const addMatchingRule = useBudgetStore((s) => s.addMatchingRule)
  const transactions = useBudgetStore((s) => s.transactions)
  const setTransactions = useBudgetStore((s) => s.setTransactions)
  const budgetData = useBudgetStore((s) => s.budgetData)
  const currentAccount = useAuthStore(selectCurrentAccount)

  const categories = budgetData.categories

  const matchingRulesRef = useRef<MatchingRule[]>([])
  matchingRulesRef.current = matchingRules

  const [testInput, setTestInput] = useState("")
  const [showRules, setShowRules] = useState(true)
  const [reapplyFeedback, setReapplyFeedback] = useState<string | null>(null)
  const [ruleAddError, setRuleAddError] = useState<string | null>(null)
  const [editingRule, setEditingRule] = useState<string | null>(null)
  const [viewingRule, setViewingRule] = useState<string | null>(null)
  const [addingRule, setAddingRule] = useState(false)
  const [showMatchTypeHelp, setShowMatchTypeHelp] = useState(false)
  const matchTypeHelpRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!showMatchTypeHelp) return
    const handler = (e: MouseEvent) => {
      if (matchTypeHelpRef.current && !matchTypeHelpRef.current.contains(e.target as Node)) {
        setShowMatchTypeHelp(false)
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [showMatchTypeHelp])

  const [newRule, setNewRule] = useState({
    name: "",
    pattern: "",
    matchType: "contains" as "contains" | "startsWith" | "regex",
    categoryId: "",
    subcategoryId: "",
    isBusiness: false,
  })

  const testMatches = useMemo(() => {
    if (!testInput.trim()) return []
    return previewRuleMatches(testInput, matchingRulesRef.current)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [testInput, matchingRules])

  const handleReapplyAll = () => {
    let updatedCount = 0

    const updatedTransactions = transactions.map(tx => {
      const result = applyRules(tx.description, matchingRulesRef.current)
      if (result) {
        const changed = tx.categoryId !== result.categoryId || tx.subcategoryId !== result.subcategoryId
        if (changed) updatedCount++
        return { ...tx, categoryId: result.categoryId, subcategoryId: result.subcategoryId, _manual: false }
      }
      return { ...tx, _manual: false }
    })

    setTransactions(updatedTransactions)

    if (updatedCount > 0) {
      setReapplyFeedback(`Re-applied rules — ${updatedCount} transaction${updatedCount !== 1 ? "s" : ""} updated`)
    } else {
      setReapplyFeedback("Re-applied rules — no changes needed")
    }
    setTimeout(() => setReapplyFeedback(null), 3000)
  }

  const addNewRule = async () => {
    if (!newRule.name.trim() || !newRule.pattern.trim()) return
    if (!newRule.categoryId || !newRule.subcategoryId) return
    if (!currentAccount) {
      setRuleAddError('Cannot create rule: no account loaded. Try signing out and back in.')
      return
    }
    setRuleAddError(null)

    const rule: MatchingRule = {
      ruleId:       crypto.randomUUID(),
      accountId:    currentAccount.id,
      name:         newRule.name.trim(),
      match:        newRule.pattern.trim(),
      matchType:    newRule.matchType,
      categoryId:   newRule.categoryId,
      subcategoryId: newRule.subcategoryId,
      isBusiness:   newRule.isBusiness,
      enabled:      true,
      priority:     Date.now(),
      learned:      false,
      createdAt:    new Date().toISOString(),
    }

    try {
      await addMatchingRule(rule)
      setNewRule({ name: "", pattern: "", matchType: "contains", categoryId: "", subcategoryId: "", isBusiness: false })
      setAddingRule(false)
    } catch (err) {
      setRuleAddError(err instanceof Error ? err.message : 'Failed to create rule — check your connection and try again')
    }
  }

  const deleteRule = (id: string) => {
    setMatchingRules(matchingRules.filter(r => r.ruleId !== id))
    setEditingRule(null)
    setViewingRule(null)
  }

  const toggleRuleEnabled = (id: string) => {
    setMatchingRules(matchingRules.map(r =>
      r.ruleId === id ? { ...r, enabled: !r.enabled } : r
    ))
  }

  const updateRule = (id: string, updates: Partial<MatchingRule>) => {
    setMatchingRules(matchingRules.map(r =>
      r.ruleId === id ? { ...r, ...updates } : r
    ))
  }

  const newRuleCat = getActiveCategories(categories).find(c => c.categoryId === newRule.categoryId)

  return (
    <div className="p-4 space-y-4 overflow-hidden">
      <PageHeader
        title="Rules"
        subtitle="Auto-categorization rules engine"
      />

      {/* Rule Tester */}
      <Card>
        <h3 className="text-sm font-semibold text-foreground mb-3">Test a transaction</h3>
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <input
            type="text"
            value={testInput}
            onChange={(e) => setTestInput(e.target.value)}
            placeholder="Type a transaction description to test..."
            className="w-full h-10 pl-10 pr-4 bg-surface2 border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>

        {testInput && (
          <div className="space-y-2">
            {testMatches.length === 0 ? (
              <p className="text-sm text-muted-foreground">No rules match this description</p>
            ) : (
              <>
                <p className="text-xs text-muted-foreground mb-2">
                  {testMatches.length} rule{testMatches.length !== 1 ? "s" : ""} match (first wins):
                </p>
                {testMatches.slice(0, 8).map(({ rule, isWinner }) => {
                  const catName = getCategoryName(categories, rule.categoryId)
                  const subName = getSubcategoryName(categories, rule.subcategoryId)
                  return (
                    <button
                      key={rule.ruleId}
                      onClick={() => {
                        setShowRules(true)
                        setViewingRule(rule.ruleId)
                      }}
                      className={cn(
                        "w-full flex items-center justify-between p-2 rounded-lg text-left transition-colors hover:bg-surface2 min-w-0",
                        isWinner ? "bg-signal-green/10 border border-signal-green/30" : "bg-surface2 opacity-60"
                      )}
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        {isWinner && <Check className="size-4 text-signal-green shrink-0" />}
                        <span className="text-xs text-muted-foreground truncate">{rule.name}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span
                          className="px-2 py-0.5 rounded text-[10px] font-medium truncate max-w-[100px]"
                          style={{
                            backgroundColor: `${CATEGORY_COLORS[catName] || CATEGORY_COLORS["default"]}20`,
                            color: CATEGORY_COLORS[catName] || CATEGORY_COLORS["default"],
                          }}
                        >
                          {subName || catName}
                        </span>
                      </div>
                    </button>
                  )
                })}
              </>
            )}
          </div>
        )}
      </Card>

      {/* Actions */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
        <PrimaryButton className="flex-1" onClick={handleReapplyAll}>
          <RotateCcw className="size-4 mr-2" />
          Re-apply all rules
        </PrimaryButton>
        <SecondaryButton onClick={() => setAddingRule(true)} className="sm:w-auto">
          <Plus className="size-4 mr-2" />
          Add rule
        </SecondaryButton>
      </div>

      {reapplyFeedback && (
        <div className="p-3 bg-signal-green/10 border border-signal-green/30 rounded-lg">
          <p className="text-sm text-signal-green">{reapplyFeedback}</p>
        </div>
      )}

      {ruleAddError && (
        <div className="p-3 bg-signal-red/10 border border-signal-red/30 rounded-lg flex items-start gap-2">
          <span className="text-sm text-signal-red">{ruleAddError}</span>
        </div>
      )}

      {/* Add Rule Form */}
      {addingRule && (
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-foreground">New Rule</h3>
            <button onClick={() => setAddingRule(false)} className="p-1 text-muted-foreground hover:text-foreground">
              <X className="size-4" />
            </button>
          </div>

          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground block mb-1">Rule Name</label>
                <input
                  type="text"
                  value={newRule.name}
                  onChange={(e) => setNewRule(r => ({ ...r, name: e.target.value }))}
                  placeholder="e.g. Woolworths Groceries"
                  className="w-full h-9 px-3 bg-surface2 border border-border rounded-lg text-sm"
                />
              </div>
              <div className="relative">
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 flex items-center gap-1">
                  Match Type
                  <button
                    type="button"
                    onClick={() => setShowMatchTypeHelp(!showMatchTypeHelp)}
                    className="text-muted-foreground hover:text-primary transition-colors"
                  >
                    <HelpCircle className="size-3.5" />
                  </button>
                </label>
                <select
                  value={newRule.matchType}
                  onChange={(e) => setNewRule(r => ({ ...r, matchType: e.target.value as "contains" | "startsWith" | "regex" }))}
                  className="w-full h-9 px-2 bg-surface2 border border-border rounded-lg text-sm"
                >
                  <option value="contains">Contains</option>
                  <option value="startsWith">Starts With</option>
                  <option value="regex">Regex</option>
                </select>
                {showMatchTypeHelp && (
                  <div ref={matchTypeHelpRef} className="absolute top-full left-0 right-0 mt-2 p-3 bg-card border border-border rounded-lg shadow-lg z-10 text-xs space-y-2">
                    <button onClick={() => setShowMatchTypeHelp(false)} className="absolute top-2 right-2 text-muted-foreground hover:text-foreground">
                      <X className="size-3" />
                    </button>
                    <p><strong className="text-foreground">Contains:</strong> <span className="text-muted-foreground">Pattern appears anywhere. Case-insensitive.</span></p>
                    <p className="text-muted-foreground pl-3">Example: &quot;woolworths&quot; matches &quot;WOOLWORTHS METRO SYDNEY&quot;</p>
                    <p><strong className="text-foreground">Starts With:</strong> <span className="text-muted-foreground">Description begins with pattern.</span></p>
                    <p className="text-muted-foreground pl-3">Example: &quot;uber&quot; matches &quot;UBER EATS&quot; but not &quot;PAYMENT UBER&quot;</p>
                    <p><strong className="text-foreground">Regex:</strong> <span className="text-muted-foreground">Advanced pattern matching.</span></p>
                    <p className="text-muted-foreground pl-3"><strong className="text-foreground/80">OR:</strong> &quot;uber|lyft|didi&quot;</p>
                    <p className="text-muted-foreground pl-3"><strong className="text-foreground/80">Wildcard:</strong> &quot;amazon.*marketplace&quot;</p>
                    <p className="text-muted-foreground pl-3"><strong className="text-foreground/80">AND:</strong> &quot;(?=.*ANZ)(?=.*TRANSFER)&quot;</p>
                  </div>
                )}
              </div>
            </div>

            <div>
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground block mb-1">Pattern</label>
              <input
                type="text"
                value={newRule.pattern}
                onChange={(e) => setNewRule(r => ({ ...r, pattern: e.target.value }))}
                placeholder="e.g. woolworths"
                className="w-full h-9 px-3 bg-surface2 border border-border rounded-lg text-sm"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-muted-foreground block mb-1">Category</label>
                  <select
                    value={newRule.categoryId}
                    onChange={(e) => setNewRule(r => ({ ...r, categoryId: e.target.value, subcategoryId: "" }))}
                    className="w-full h-9 px-2 bg-surface2 border border-border rounded-lg text-sm"
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
                    value={newRule.subcategoryId}
                    onChange={(e) => setNewRule(r => ({ ...r, subcategoryId: e.target.value }))}
                    className="w-full h-9 px-2 bg-surface2 border border-border rounded-lg text-sm"
                    disabled={!newRule.categoryId}
                  >
                    <option value="">Select...</option>
                    {newRuleCat && getActiveSubcategories(newRuleCat).map(sub => (
                      <option key={sub.subcategoryId} value={sub.subcategoryId}>{sub.name}</option>
                    ))}
                  </select>
                </div>
              </div>

            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <input
                  type="checkbox"
                  checked={newRule.isBusiness}
                  onChange={(e) => setNewRule(r => ({ ...r, isBusiness: e.target.checked }))}
                  className="rounded border-border"
                />
                Mark as business expense
              </label>

              <PrimaryButton
                onClick={addNewRule}
                disabled={!newRule.name || !newRule.pattern || !newRule.categoryId || !newRule.subcategoryId}
                className="w-full sm:w-auto"
              >
                <Check className="size-4 mr-1" />
                Create Rule
              </PrimaryButton>
            </div>
          </div>
        </Card>
      )}

      {/* Matching Rules Section */}
      <Card>
        <button
          onClick={() => setShowRules(!showRules)}
          className="w-full flex items-center justify-between"
        >
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-foreground">Matching Rules</h3>
            <span className="px-1.5 py-0.5 rounded bg-primary/15 text-[10px] font-medium text-primary">
              {matchingRules.length}
            </span>
          </div>
          <ChevronDown className={cn(
            "size-4 text-muted-foreground transition-transform",
            showRules && "rotate-180"
          )} />
        </button>

        {showRules && (
          <div className="mt-3 pt-3 border-t border-border">
            {matchingRules.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No rules yet. Create rules using the &quot;Learn&quot; button when categorizing transactions, or click &quot;Add rule&quot; above.
              </p>
            ) : (
              <div className="space-y-1">
                {matchingRules.map((rule) => {
                  const isViewing = viewingRule === rule.ruleId
                  const isEditing = editingRule === rule.ruleId
                  const catName = getCategoryName(categories, rule.categoryId)
                  const subName = getSubcategoryName(categories, rule.subcategoryId)
                  const editCat = isEditing ? getActiveCategories(categories).find(c => c.categoryId === rule.categoryId) : undefined

                  return (
                    <div key={rule.ruleId}>
                      <button
                        onClick={() => {
                          if (isEditing) return
                          setViewingRule(isViewing ? null : rule.ruleId)
                        }}
                        className={cn(
                          "w-full flex items-center justify-between py-2 px-2 hover:bg-surface2 rounded transition-colors text-left",
                          !rule.enabled && "opacity-40",
                          (isViewing || isEditing) && "bg-surface2"
                        )}
                      >
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          {!rule.enabled && <Ban className="size-3 text-signal-red shrink-0" />}
                          <span className="text-xs text-muted-foreground truncate">{rule.name}</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span
                            className="px-2 py-0.5 rounded text-[10px] font-medium"
                            style={{
                              backgroundColor: `${CATEGORY_COLORS[catName] || CATEGORY_COLORS["default"]}20`,
                              color: CATEGORY_COLORS[catName] || CATEGORY_COLORS["default"],
                            }}
                          >
                            {subName || catName}
                          </span>
                          <ChevronDown className={cn(
                            "size-3 text-muted-foreground transition-transform",
                            (isViewing || isEditing) && "rotate-180"
                          )} />
                        </div>
                      </button>

                      {/* View mode */}
                      {isViewing && !isEditing && (
                        <div className="mt-1 mb-2 p-3 bg-surface2 rounded-lg border border-border space-y-3">
                          <div>
                            <label className="text-[10px] uppercase tracking-wider text-muted-foreground block mb-1">Pattern ({rule.matchType})</label>
                            <code className="block text-xs text-primary bg-background p-2 rounded overflow-x-auto">
                              {rule.match}
                            </code>
                          </div>

                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="text-[10px] uppercase tracking-wider text-muted-foreground block mb-1">Category</label>
                              <span
                                className="inline-block px-2 py-1 rounded text-xs font-medium"
                                style={{
                                  backgroundColor: `${CATEGORY_COLORS[catName] || CATEGORY_COLORS["default"]}20`,
                                  color: CATEGORY_COLORS[catName] || CATEGORY_COLORS["default"],
                                }}
                              >
                                {catName || "—"}
                              </span>
                            </div>
                            <div>
                              <label className="text-[10px] uppercase tracking-wider text-muted-foreground block mb-1">Subcategory</label>
                              <span className="text-sm text-foreground">{subName || "—"}</span>
                            </div>
                          </div>

                          {rule.isBusiness && (
                            <p className="text-xs text-muted-foreground">Marked as business expense</p>
                          )}

                          {!rule.enabled && (
                            <div className="p-2 bg-signal-red/10 border border-signal-red/30 rounded">
                              <p className="text-xs text-signal-red">This rule is currently disabled</p>
                            </div>
                          )}

                          <div className="flex items-center gap-2 pt-1">
                            <button
                              onClick={(e) => { e.stopPropagation(); setEditingRule(rule.ruleId) }}
                              className="flex-1 h-9 rounded-lg bg-surface2 border border-border text-foreground text-sm font-medium hover:bg-surface2/80 flex items-center justify-center gap-1"
                            >
                              <Pencil className="size-4" />
                              Edit
                            </button>
                            {rule.enabled ? (
                              <button
                                onClick={(e) => { e.stopPropagation(); toggleRuleEnabled(rule.ruleId) }}
                                className="h-9 px-3 rounded-lg bg-signal-red/10 text-signal-red text-sm font-medium hover:bg-signal-red/20 flex items-center gap-1"
                              >
                                <Ban className="size-4" />
                                Disable
                              </button>
                            ) : (
                              <button
                                onClick={(e) => { e.stopPropagation(); toggleRuleEnabled(rule.ruleId) }}
                                className="h-9 px-3 rounded-lg bg-signal-green/10 text-signal-green text-sm font-medium hover:bg-signal-green/20 flex items-center gap-1"
                              >
                                <Check className="size-4" />
                                Enable
                              </button>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Edit mode */}
                      {isEditing && (
                        <div className="mt-1 mb-2 p-3 bg-primary/5 rounded-lg border border-primary/30 space-y-3">
                          <div className="flex items-center justify-between">
                            <h4 className="text-sm font-semibold text-foreground">Edit Rule</h4>
                            <button
                              onClick={(e) => { e.stopPropagation(); setEditingRule(null); setViewingRule(rule.ruleId) }}
                              className="p-1 text-muted-foreground hover:text-foreground"
                            >
                              <X className="size-4" />
                            </button>
                          </div>

                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="text-[10px] uppercase tracking-wider text-muted-foreground block mb-1">Name</label>
                              <input
                                type="text"
                                value={rule.name}
                                onChange={(e) => updateRule(rule.ruleId, { name: e.target.value })}
                                className="w-full h-8 px-2 bg-background border border-border rounded text-sm"
                                placeholder="Rule name"
                              />
                            </div>
                            <div>
                              <label className="text-[10px] uppercase tracking-wider text-muted-foreground block mb-1">Match Type</label>
                              <select
                                value={rule.matchType}
                                onChange={(e) => updateRule(rule.ruleId, { matchType: e.target.value as "contains" | "startsWith" | "regex" })}
                                className="w-full h-8 px-2 bg-background border border-border rounded text-sm"
                              >
                                <option value="contains">Contains</option>
                                <option value="startsWith">Starts With</option>
                                <option value="regex">Regex</option>
                              </select>
                            </div>
                          </div>

                          <div>
                            <label className="text-[10px] uppercase tracking-wider text-muted-foreground block mb-1">Pattern</label>
                            <input
                              type="text"
                              value={rule.match}
                              onChange={(e) => updateRule(rule.ruleId, { match: e.target.value })}
                              className="w-full h-8 px-2 bg-background border border-border rounded text-sm"
                              placeholder="Pattern"
                            />
                          </div>

                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="text-[10px] uppercase tracking-wider text-muted-foreground block mb-1">Category</label>
                              <select
                                value={rule.categoryId}
                                onChange={(e) => updateRule(rule.ruleId, { categoryId: e.target.value, subcategoryId: "" })}
                                className="w-full h-8 px-2 bg-background border border-border rounded text-sm disabled:opacity-50"
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
                                value={rule.subcategoryId}
                                onChange={(e) => updateRule(rule.ruleId, { subcategoryId: e.target.value })}
                                disabled={!rule.categoryId}
                                className="w-full h-8 px-2 bg-background border border-border rounded text-sm disabled:opacity-50"
                              >
                                <option value="">Select...</option>
                                {editCat && getActiveSubcategories(editCat).map(sub => (
                                  <option key={sub.subcategoryId} value={sub.subcategoryId}>{sub.name}</option>
                                ))}
                              </select>
                            </div>
                          </div>

                          <div className="flex items-center gap-4">
                            <label className="flex items-center gap-2 text-sm text-muted-foreground">
                              <input
                                type="checkbox"
                                checked={rule.isBusiness}
                                onChange={(e) => updateRule(rule.ruleId, { isBusiness: e.target.checked })}
                                className="rounded border-border"
                              />
                              Business expense
                            </label>
                          </div>

                          <div className="flex items-center gap-2 pt-1">
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                deleteRule(rule.ruleId)
                              }}
                              className="h-9 px-3 rounded-lg bg-signal-red/10 text-signal-red text-sm font-medium hover:bg-signal-red/20 flex items-center gap-1"
                            >
                              <Trash2 className="size-4" />
                              Delete
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                setEditingRule(null)
                                setViewingRule(rule.ruleId)
                              }}
                              className="flex-1 h-9 rounded-lg bg-primary text-primary-foreground text-sm font-medium flex items-center justify-center gap-1"
                            >
                              <Check className="size-4" />
                              Done
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  )
}
