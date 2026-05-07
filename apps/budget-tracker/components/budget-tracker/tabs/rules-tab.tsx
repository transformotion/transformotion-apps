"use client"

import { useState, useRef, useMemo, useEffect } from "react"
import { useBudgetNavigation } from "../app-shell"
import { PageHeader, Card, PrimaryButton, SecondaryButton } from "@/components/ui/design-system"
import { Search, Plus, RotateCcw, ChevronDown, Check, X, Pencil, Trash2, Ban, Eye, HelpCircle, Sparkles, AlertCircle } from "lucide-react"
import { findAllMatchingRules, applyRules, type BuiltinRule } from "../data/builtin-rules"
import { CATEGORY_LIST, getSubcategories } from "../data/categories"
import { CATEGORY_COLORS } from "../data/category-colors"
import type { CustomRule } from "../data/types"
import { cn } from "@/lib/utils"
import { useClaude } from "@/lib/hooks"

interface SuggestedRule {
  name: string
  pattern: string
  matchType: "contains" | "startsWith" | "regex"
  category: string
  subcategory: string
  isBusiness: boolean
  reason: string
}

export function RulesTab() {
  const { customRules, setCustomRules, builtinRules, updateBuiltinRule, addBuiltinRule, transactions, setTransactions } = useBudgetNavigation()
  
  // Fix stale closure issue with useRef
  const customRulesRef = useRef<CustomRule[]>([])
  customRulesRef.current = customRules
  
  const [testInput, setTestInput] = useState("")
  const [showBuiltin, setShowBuiltin] = useState(false)
  const [showCustom, setShowCustom] = useState(true)
  const [reapplyFeedback, setReapplyFeedback] = useState<string | null>(null)
  const [editingRule, setEditingRule] = useState<string | null>(null)
  const [viewingCustomRule, setViewingCustomRule] = useState<string | null>(null)
  const [addingRule, setAddingRule] = useState(false)
  const [showMatchTypeHelp, setShowMatchTypeHelp] = useState(false)
  const matchTypeHelpRef = useRef<HTMLDivElement>(null)

  // Close match type help when clicking outside
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
  const [viewingBuiltinRule, setViewingBuiltinRule] = useState<BuiltinRule | null>(null)
  const [editingBuiltinRule, setEditingBuiltinRule] = useState<BuiltinRule | null>(null)
  
  // Inline edit form state for built-in rules
  const [builtinEditForm, setBuiltinEditForm] = useState({
    pattern: "",
    category: "",
    subcategory: "",
    isBusiness: false,
    isIgnore: false
  })
  
  // New rule form state
  const [newRule, setNewRule] = useState({
    name: "",
    pattern: "",
    matchType: "contains" as "contains" | "startsWith" | "regex",
    category: "",
    subcategory: "",
    isBusiness: false,
    isIgnore: false
  })

  // AI Rule Suggestion
  const [suggestedRules, setSuggestedRules] = useState<SuggestedRule[]>([])
  const { callClaude, isLoading: isGeneratingRules, error: ruleError } = useClaude<{ rules: SuggestedRule[] }>()

  const generateRuleSuggestions = async () => {
    // Get uncategorized transactions to analyse patterns
    const uncategorized = transactions.filter(t => !t.category).slice(0, 50)
    if (uncategorized.length === 0) {
      return
    }

    const result = await callClaude({
      prompt: `Analyse these uncategorized transactions and suggest categorization rules.

Transactions:
${uncategorized.map(t => `- "${t.description}" ($${t.amount})`).join('\n')}

Available categories: ${CATEGORY_LIST.join(", ")}

Return a JSON object with "rules" array, each containing:
- name: descriptive rule name
- pattern: text pattern to match (case-insensitive)
- matchType: "contains", "startsWith", or "regex"
- category: one of the available categories
- subcategory: appropriate subcategory for that category
- isBusiness: boolean if this looks like a business expense
- reason: brief explanation why this rule makes sense

Suggest 3-5 rules that would categorize the most transactions. Return ONLY valid JSON.`,
      systemPrompt: "You are a financial categorization expert. Analyse transaction descriptions and suggest smart rules. Respond with valid JSON only.",
    })

    if (result?.rules) {
      setSuggestedRules(result.rules)
    }
  }

  const acceptSuggestedRule = (suggestion: SuggestedRule) => {
    const rule: CustomRule = {
      ruleId: `custom-${Date.now()}`,
      accountId: "",
      name: suggestion.name,
      match: suggestion.pattern,
      matchType: suggestion.matchType,
      category: suggestion.category,
      subcategory: suggestion.subcategory,
      isBusiness: suggestion.isBusiness,
      isIgnore: false,
      enabled: true,
      priority: customRules.length,
      learned: true,
      createdAt: new Date().toISOString()
    }
    setCustomRules([...customRules, rule])
    setSuggestedRules(prev => prev.filter(r => r.pattern !== suggestion.pattern))
  }

  const dismissSuggestedRule = (suggestion: SuggestedRule) => {
    setSuggestedRules(prev => prev.filter(r => r.pattern !== suggestion.pattern))
  }

  // Get disabled built-in rule IDs (via custom rule overrides)
  const disabledBuiltinIds = useMemo(() => {
    const ids = new Set<string>()
    customRules.forEach(rule => {
      if (rule.overridesBuiltinId && !rule.enabled) {
        ids.add(rule.overridesBuiltinId)
      }
    })
    return ids
  }, [customRules])

  // Find all matching rules (builtin + custom) for test input
  const matchingRules = useMemo(() => {
    if (!testInput) return []
    
    const results: Array<{
      rule: BuiltinRule | CustomRule
      isBuiltin: boolean
      isWinner: boolean
    }> = []
    
    // Check custom rules first (they have higher priority)
    for (const rule of customRulesRef.current) {
      if (!rule.enabled) continue
      try {
        let regex: RegExp
        if (rule.matchType === "regex") {
          regex = new RegExp(rule.match, "i")
        } else if (rule.matchType === "startsWith") {
          regex = new RegExp(`^${rule.match}`, "i")
        } else {
          regex = new RegExp(rule.match, "i")
        }

        if (regex.test(testInput)) {
          results.push({ rule, isBuiltin: false, isWinner: false })
        }
      } catch {
        // Invalid regex
      }
    }
    
    // Check builtin rules (excluding disabled ones)
    const builtinMatches = findAllMatchingRules(testInput, builtinRules)
    for (const rule of builtinMatches) {
      if (!disabledBuiltinIds.has(rule.id)) {
        results.push({ rule, isBuiltin: true, isWinner: false })
      }
    }
    
    // Mark the first match as winner
    if (results.length > 0) {
      results[0].isWinner = true
    }
    
    return results
  }, [testInput, customRules, builtinRules, disabledBuiltinIds])

  // Re-apply all rules to transactions
  const handleReapplyAll = () => {
    let updatedCount = 0
    
    const updatedTransactions = transactions.map(tx => {
      // Use the unified applyRules function
      const result = applyRules(tx.description, builtinRules, customRulesRef.current)
      
      if (result) {
        const changed = tx.category !== result.category || tx.subcategory !== result.subcategory
        if (changed) updatedCount++
        return { 
          ...tx, 
          category: result.category, 
          subcategory: result.subcategory, 
          _manual: false 
        }
      }
      
      // No match - keep existing category but clear manual flag
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

  // Click on rule badge to jump to it
  const handleRuleBadgeClick = (ruleId: string, isBuiltin: boolean) => {
    if (isBuiltin) {
      const rule = builtinRules.find(r => r.id === ruleId)
      if (rule) {
        setViewingBuiltinRule(rule)
        setShowBuiltin(true)
      }
    } else {
      setShowCustom(true)
      setEditingRule(ruleId)
    }
  }

  // Add new custom rule
  const addRule = () => {
    if (!newRule.name.trim() || !newRule.pattern.trim()) return
    if (!newRule.isIgnore && (!newRule.category || !newRule.subcategory)) return
    
    const rule: CustomRule = {
      ruleId: `custom-${Date.now()}`,
      accountId: "",
      name: newRule.name.trim(),
      match: newRule.pattern.trim(),
      matchType: newRule.matchType,
      category: newRule.isIgnore ? "Ignore" : newRule.category,
      subcategory: newRule.isIgnore ? "Ignored" : newRule.subcategory,
      isBusiness: newRule.isBusiness,
      isIgnore: newRule.isIgnore,
      enabled: true,
      priority: customRules.length,
      learned: false,
      createdAt: new Date().toISOString()
    }
    
    setCustomRules([...customRules, rule])
    setNewRule({ name: "", pattern: "", matchType: "contains", category: "", subcategory: "", isBusiness: false, isIgnore: false })
    setAddingRule(false)
  }

  // Start inline editing of a built-in rule
  const startEditingBuiltin = (builtinRule: BuiltinRule) => {
    // Check if there's already a custom override for this rule
    const existingOverride = customRules.find(r => r.overridesBuiltinId === builtinRule.id)
    
    // Pre-fill the form with existing override values or built-in defaults
    setBuiltinEditForm({
      pattern: existingOverride?.match || builtinRule.pattern,
      category: existingOverride?.category || builtinRule.category,
      subcategory: existingOverride?.subcategory || builtinRule.subcategory,
      isBusiness: existingOverride?.isBusiness || false,
      isIgnore: existingOverride?.isIgnore || false
    })
    setEditingBuiltinRule(builtinRule)
    setViewingBuiltinRule(null) // Close view mode, show edit mode
  }
  
  // Save inline edit of built-in rule (creates or updates custom override)
  const saveBuiltinEdit = () => {
    if (!editingBuiltinRule) return
    
    const existingOverride = customRules.find(r => r.overridesBuiltinId === editingBuiltinRule.id)
    const patternChanged = builtinEditForm.pattern !== editingBuiltinRule.pattern
    
    if (existingOverride) {
      // Update existing override
      setCustomRules(customRules.map(r =>
        r.ruleId === existingOverride.ruleId
          ? {
              ...r,
              match: builtinEditForm.pattern,
              category: builtinEditForm.isIgnore ? "Ignore" : builtinEditForm.category,
              subcategory: builtinEditForm.isIgnore ? "Ignored" : builtinEditForm.subcategory,
              isBusiness: builtinEditForm.isBusiness,
              isIgnore: builtinEditForm.isIgnore,
              // If pattern changed, remove override link so it becomes a standalone custom rule
              overridesBuiltinId: patternChanged ? undefined : r.overridesBuiltinId
            }
          : r
      ))
    } else {
      // Create new rule (either override or standalone custom rule)
      const rule: CustomRule = {
        ruleId: patternChanged ? `custom-${Date.now()}` : `override-${editingBuiltinRule.id}-${Date.now()}`,
        accountId: "",
        name: patternChanged ? `${editingBuiltinRule.name} (Modified)` : `${editingBuiltinRule.name} (Override)`,
        match: builtinEditForm.pattern,
        matchType: "regex",
        category: builtinEditForm.isIgnore ? "Ignore" : builtinEditForm.category,
        subcategory: builtinEditForm.isIgnore ? "Ignored" : builtinEditForm.subcategory,
        isBusiness: builtinEditForm.isBusiness,
        isIgnore: builtinEditForm.isIgnore,
        // Only link to built-in if pattern unchanged
        overridesBuiltinId: patternChanged ? undefined : editingBuiltinRule.id,
        enabled: true,
        priority: patternChanged ? 100 : -1,
        learned: false,
        createdAt: new Date().toISOString()
      }
      setCustomRules([rule, ...customRules])
    }
    
    setEditingBuiltinRule(null)
  }
  
  // Cancel inline edit
  const cancelBuiltinEdit = () => {
    setEditingBuiltinRule(null)
  }

  // Disable a built-in rule (creates a disabled override)
  const disableBuiltinRule = (builtinRule: BuiltinRule) => {
    const existingOverride = customRules.find(r => r.overridesBuiltinId === builtinRule.id)
    if (existingOverride) {
      // Just disable it
      setCustomRules(customRules.map(r =>
        r.ruleId === existingOverride.ruleId ? { ...r, enabled: false } : r
      ))
    } else {
      // Create disabled override
      const rule: CustomRule = {
        ruleId: `disabled-${builtinRule.id}-${Date.now()}`,
        accountId: "",
        name: `[Disabled] ${builtinRule.name}`,
        match: builtinRule.pattern,
        matchType: "regex",
        category: builtinRule.category,
        subcategory: builtinRule.subcategory,
        isBusiness: false,
        overridesBuiltinId: builtinRule.id,
        enabled: false,
        priority: -1,
        learned: false,
        createdAt: new Date().toISOString()
      }
      setCustomRules([rule, ...customRules])
    }
    setViewingBuiltinRule(null)
  }

  // Delete custom rule
  const deleteRule = (id: string) => {
    setCustomRules(customRules.filter(r => r.ruleId !== id))
    setEditingRule(null)
  }

  // Toggle rule enabled
  const toggleRuleEnabled = (id: string) => {
    setCustomRules(customRules.map(r => 
      r.ruleId === id ? { ...r, enabled: !r.enabled } : r
    ))
  }

  // Update rule
  const updateRule = (id: string, updates: Partial<CustomRule>) => {
    setCustomRules(customRules.map(r =>
      r.ruleId === id ? { ...r, ...updates } : r
    ))
  }

  return (
    <div className="p-4 space-y-4 overflow-hidden">
      {/* Header */}
      <PageHeader
        title="Rules"
        subtitle="Auto-categorization rules engine"
      />

      {/* Rule Debugger */}
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
        
        {/* Matching Rules */}
        {testInput && (
          <div className="space-y-2">
            {matchingRules.length === 0 ? (
              <p className="text-sm text-muted-foreground">No rules match this description</p>
            ) : (
              <>
                <p className="text-xs text-muted-foreground mb-2">
                  {matchingRules.length} rule{matchingRules.length !== 1 ? "s" : ""} match (first wins):
                </p>
                {matchingRules.slice(0, 8).map(({ rule, isBuiltin, isWinner }) => {
                  const ruleKey = isBuiltin ? (rule as BuiltinRule).id : (rule as CustomRule).ruleId
                  return (
                  <button
                    key={ruleKey}
                    onClick={() => handleRuleBadgeClick(ruleKey, isBuiltin)}
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
                          backgroundColor: `${CATEGORY_COLORS[rule.category] || CATEGORY_COLORS["default"]}20`,
                          color: CATEGORY_COLORS[rule.category] || CATEGORY_COLORS["default"]
                        }}
                      >
                        {rule.subcategory}
                      </span>
                      <span className={cn(
                        "text-[10px] px-1.5 py-0.5 rounded shrink-0",
                        isBuiltin 
                          ? "bg-muted/50 text-muted-foreground" 
                          : "bg-primary/15 text-primary"
                      )}>
                        {isBuiltin ? "Built-in" : "Custom"}
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
        <SecondaryButton 
          onClick={generateRuleSuggestions} 
          disabled={isGeneratingRules || transactions.filter(t => !t.category).length === 0}
          className="sm:w-auto"
        >
          <Sparkles className="size-4 mr-2" />
          {isGeneratingRules ? "Analysing..." : "Suggest Rules"}
        </SecondaryButton>
      </div>

      {/* Feedback Message */}
      {reapplyFeedback && (
        <div className="p-3 bg-signal-green/10 border border-signal-green/30 rounded-lg">
          <p className="text-sm text-signal-green">{reapplyFeedback}</p>
        </div>
      )}

      {/* AI Rule Error */}
      {ruleError && (
        <div className="p-3 rounded-lg bg-signal-red/10 border border-signal-red/20 flex items-start gap-2">
          <AlertCircle className="size-4 text-signal-red mt-0.5 shrink-0" />
          <div className="text-sm text-signal-red">{ruleError?.message}</div>
        </div>
      )}

      {/* AI Suggested Rules */}
      {suggestedRules.length > 0 && (
        <Card>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Sparkles className="size-4 text-primary" />
              AI Suggested Rules
            </h3>
            <button 
              onClick={() => setSuggestedRules([])} 
              className="p-1 text-muted-foreground hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          </div>
          <div className="space-y-3">
            {suggestedRules.map((suggestion, idx) => (
              <div key={idx} className="p-3 bg-surface2 rounded-lg space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">{suggestion.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Pattern: <code className="px-1 py-0.5 bg-background rounded text-xs">{suggestion.pattern}</code>
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">{suggestion.reason}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => acceptSuggestedRule(suggestion)}
                      className="p-1.5 rounded bg-signal-green/10 text-signal-green hover:bg-signal-green/20"
                      title="Accept rule"
                    >
                      <Check className="size-4" />
                    </button>
                    <button
                      onClick={() => dismissSuggestedRule(suggestion)}
                      className="p-1.5 rounded bg-surface2 text-muted-foreground hover:bg-signal-red/10 hover:text-signal-red"
                      title="Dismiss"
                    >
                      <X className="size-4" />
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span 
                    className="px-2 py-0.5 rounded-full font-medium"
                    style={{ 
                      backgroundColor: `${CATEGORY_COLORS[suggestion.category as keyof typeof CATEGORY_COLORS] || "#6b7280"}15`,
                      color: CATEGORY_COLORS[suggestion.category as keyof typeof CATEGORY_COLORS] || "#6b7280"
                    }}
                  >
                    {suggestion.category}
                  </span>
                  <span className="text-muted-foreground">{suggestion.subcategory}</span>
                  {suggestion.isBusiness && (
                    <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[10px] font-medium">
                      Business
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
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
                    <p><strong className="text-foreground">Contains:</strong> <span className="text-muted-foreground">Pattern appears anywhere in description. Case-insensitive.</span></p>
                    <p className="text-muted-foreground pl-3">Example: &quot;woolworths&quot; matches &quot;WOOLWORTHS METRO SYDNEY&quot;</p>
                    <p><strong className="text-foreground">Starts With:</strong> <span className="text-muted-foreground">Description begins with pattern. Case-insensitive.</span></p>
                    <p className="text-muted-foreground pl-3">Example: &quot;uber&quot; matches &quot;UBER EATS&quot; but not &quot;PAYMENT UBER&quot;</p>
                    <p><strong className="text-foreground">Regex:</strong> <span className="text-muted-foreground">Advanced pattern matching. Case-insensitive.</span></p>
                    <p className="text-muted-foreground pl-3"><strong className="text-foreground/80">OR:</strong> &quot;uber|lyft|didi&quot; — matches any of the terms</p>
                    <p className="text-muted-foreground pl-3"><strong className="text-foreground/80">Wildcard:</strong> &quot;amazon.*marketplace&quot; — .* means any characters in between</p>
                    <p className="text-muted-foreground pl-3"><strong className="text-foreground/80">AND:</strong> &quot;(?=.*ANZ MOBILE)(?=.*TO ELLA MOODIE)&quot; — both terms must appear anywhere</p>
                    <p className="text-muted-foreground pl-3"><strong className="text-foreground/80">Other:</strong> &quot;^&quot; for start of string, &quot;$&quot; for end</p>
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
            
            {/* Ignore checkbox */}
            <label className="flex items-center gap-2 text-sm text-foreground p-2 bg-surface2 rounded-lg cursor-pointer">
              <input
                type="checkbox"
                checked={newRule.isIgnore}
                onChange={(e) => setNewRule(r => ({ ...r, isIgnore: e.target.checked, category: "", subcategory: "" }))}
                className="rounded border-border"
              />
              <Ban className="size-4 text-muted-foreground" />
              <span>Ignore this transaction</span>
              <span className="text-xs text-muted-foreground ml-auto">Exclude from Summary & Cashflow</span>
            </label>
            
            {/* Category/Subcategory - only show if not ignored */}
            {!newRule.isIgnore && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-muted-foreground block mb-1">Category</label>
                  <select
                    value={newRule.category}
                    onChange={(e) => setNewRule(r => ({ ...r, category: e.target.value, subcategory: "" }))}
                    className="w-full h-9 px-2 bg-surface2 border border-border rounded-lg text-sm"
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
                    value={newRule.subcategory}
                    onChange={(e) => setNewRule(r => ({ ...r, subcategory: e.target.value }))}
                    className="w-full h-9 px-2 bg-surface2 border border-border rounded-lg text-sm"
                    disabled={!newRule.category}
                  >
                    <option value="">Select...</option>
                    {newRule.category && getSubcategories(newRule.category).map(sub => (
                      <option key={sub} value={sub}>{sub}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}
            
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              {!newRule.isIgnore && (
                <label className="flex items-center gap-2 text-sm text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={newRule.isBusiness}
                    onChange={(e) => setNewRule(r => ({ ...r, isBusiness: e.target.checked }))}
                    className="rounded border-border"
                  />
                  Mark as business expense
                </label>
              )}
              {newRule.isIgnore && <div />}
              
              <PrimaryButton 
                onClick={addRule} 
                disabled={!newRule.name || !newRule.pattern || (!newRule.isIgnore && (!newRule.category || !newRule.subcategory))} 
                className="w-full sm:w-auto"
              >
                <Check className="size-4 mr-1" />
                Create Rule
              </PrimaryButton>
            </div>
          </div>
        </Card>
      )}

      {/* Custom Rules Section */}
      <Card>
        <button
          onClick={() => setShowCustom(!showCustom)}
          className="w-full flex items-center justify-between"
        >
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-foreground">Custom Rules</h3>
            <span className="px-1.5 py-0.5 rounded bg-primary/15 text-[10px] font-medium text-primary">
              {customRules.length}
            </span>
          </div>
          <ChevronDown className={cn(
            "size-4 text-muted-foreground transition-transform",
            showCustom && "rotate-180"
          )} />
        </button>
        
        {showCustom && (
          <div className="mt-3 pt-3 border-t border-border">
            {customRules.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No custom rules yet. Create rules using the &quot;Learn&quot; button when categorizing transactions, or click &quot;Add rule&quot; above.
              </p>
            ) : (
              <div className="space-y-1">
                {customRules.map((rule) => {
                  const isViewing = viewingCustomRule === rule.ruleId
                  const isEditing = editingRule === rule.ruleId

                  return (
                    <div key={rule.ruleId}>
                      {/* Row header - click to expand */}
                      <button
                        onClick={() => {
                          if (isEditing) return
                          setViewingCustomRule(isViewing ? null : rule.ruleId)
                        }}
                        className={cn(
                          "w-full flex items-center justify-between py-2 px-2 hover:bg-surface2 rounded transition-colors text-left",
                          !rule.enabled && "opacity-40",
                          (isViewing || isEditing) && "bg-surface2"
                        )}
                      >
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          {!rule.enabled && <Ban className="size-3 text-signal-red shrink-0" />}
                          {rule.isIgnore && rule.enabled && <Ban className="size-3 text-muted-foreground shrink-0" />}
                          <span className="text-xs text-muted-foreground truncate">{rule.name}</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {rule.isIgnore ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-muted/50 text-muted-foreground">
                              Ignored
                            </span>
                          ) : (
                            <span 
                              className="px-2 py-0.5 rounded text-[10px] font-medium"
                              style={{ 
                                backgroundColor: `${CATEGORY_COLORS[rule.category] || CATEGORY_COLORS["default"]}20`,
                                color: CATEGORY_COLORS[rule.category] || CATEGORY_COLORS["default"]
                              }}
                            >
                              {rule.subcategory}
                            </span>
                          )}
                          <ChevronDown className={cn(
                            "size-3 text-muted-foreground transition-transform",
                            (isViewing || isEditing) && "rotate-180"
                          )} />
                        </div>
                      </button>
                      
                      {/* Inline view mode */}
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
                                  backgroundColor: `${CATEGORY_COLORS[rule.category] || CATEGORY_COLORS["default"]}20`,
                                  color: CATEGORY_COLORS[rule.category] || CATEGORY_COLORS["default"]
                                }}
                              >
                                {rule.category}
                              </span>
                            </div>
                            <div>
                              <label className="text-[10px] uppercase tracking-wider text-muted-foreground block mb-1">Subcategory</label>
                              <span className="text-sm text-foreground">{rule.subcategory}</span>
                            </div>
                          </div>
                          
                          {rule.isBusiness && (
                            <p className="text-xs text-muted-foreground">Marked as business expense</p>
                          )}
                          
                          {rule.overridesBuiltinId && (
                            <p className="text-[10px] text-muted-foreground">
                              Overrides built-in rule: {builtinRules.find(r => r.id === rule.overridesBuiltinId)?.name}
                            </p>
                          )}
                          
                          {!rule.enabled && (
                            <div className="p-2 bg-signal-red/10 border border-signal-red/30 rounded">
                              <p className="text-xs text-signal-red">This rule is currently disabled</p>
                            </div>
                          )}
                          
                          <div className="flex items-center gap-2 pt-1">
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                setEditingRule(rule.ruleId)
                              }}
                              className="flex-1 h-9 rounded-lg bg-surface2 border border-border text-foreground text-sm font-medium hover:bg-surface2/80 flex items-center justify-center gap-1"
                            >
                              <Pencil className="size-4" />
                              Edit
                            </button>
                            {rule.enabled ? (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  toggleRuleEnabled(rule.ruleId)
                                }}
                                className="h-9 px-3 rounded-lg bg-signal-red/10 text-signal-red text-sm font-medium hover:bg-signal-red/20 flex items-center gap-1"
                              >
                                <Ban className="size-4" />
                                Disable
                              </button>
                            ) : (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  toggleRuleEnabled(rule.ruleId)
                                }}
                                className="h-9 px-3 rounded-lg bg-signal-green/10 text-signal-green text-sm font-medium hover:bg-signal-green/20 flex items-center gap-1"
                              >
                                <Check className="size-4" />
                                Enable
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                      
                      {/* Inline edit mode */}
                      {isEditing && (
                        <div className="mt-1 mb-2 p-3 bg-primary/5 rounded-lg border border-primary/30 space-y-3">
                          <div className="flex items-center justify-between">
                            <h4 className="text-sm font-semibold text-foreground">Edit Rule</h4>
                            <button 
                              onClick={(e) => { e.stopPropagation(); setEditingRule(null); setViewingCustomRule(rule.ruleId) }}
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
                                value={rule.matchType}
                                onChange={(e) => updateRule(rule.ruleId, { matchType: e.target.value as "contains" | "startsWith" | "regex" })}
                                className="w-full h-8 px-2 bg-background border border-border rounded text-sm"
                              >
                                <option value="contains">Contains</option>
                                <option value="startsWith">Starts With</option>
                                <option value="regex">Regex</option>
                              </select>
                              {showMatchTypeHelp && (
                                <div ref={matchTypeHelpRef} className="absolute top-full left-0 mt-2 p-3 bg-card border border-border rounded-lg shadow-lg z-10 text-xs space-y-2 w-80">
                                  <button onClick={() => setShowMatchTypeHelp(false)} className="absolute top-2 right-2 text-muted-foreground hover:text-foreground">
                                    <X className="size-3" />
                                  </button>
                                  <p><strong className="text-foreground">Contains:</strong> <span className="text-muted-foreground">Pattern anywhere in description</span></p>
                                  <p><strong className="text-foreground">Starts With:</strong> <span className="text-muted-foreground">Description begins with pattern</span></p>
                                  <p><strong className="text-foreground">Regex:</strong> <span className="text-muted-foreground">Advanced pattern matching</span></p>
                                  <p className="text-muted-foreground pl-2"><strong className="text-foreground/80">OR:</strong> &quot;uber|lyft&quot;</p>
                                  <p className="text-muted-foreground pl-2"><strong className="text-foreground/80">Wildcard:</strong> &quot;amazon.*marketplace&quot;</p>
                                  <p className="text-muted-foreground pl-2"><strong className="text-foreground/80">AND:</strong> &quot;(?=.*TERM1)(?=.*TERM2)&quot;</p>
                                </div>
                              )}
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
                                value={rule.category}
                                onChange={(e) => updateRule(rule.ruleId, { category: e.target.value, subcategory: "" })}
                                disabled={rule.isIgnore}
                                className="w-full h-8 px-2 bg-background border border-border rounded text-sm disabled:opacity-50"
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
                                value={rule.subcategory}
                                onChange={(e) => updateRule(rule.ruleId, { subcategory: e.target.value })}
                                disabled={rule.isIgnore || !rule.category}
                                className="w-full h-8 px-2 bg-background border border-border rounded text-sm disabled:opacity-50"
                              >
                                <option value="">Select...</option>
                                {getSubcategories(rule.category).map(sub => (
                                  <option key={sub} value={sub}>{sub}</option>
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
                            <label className="flex items-center gap-2 text-sm text-muted-foreground">
                              <input
                                type="checkbox"
                                checked={rule.isIgnore || false}
                                onChange={(e) => updateRule(rule.ruleId, {
                                  isIgnore: e.target.checked,
                                  category: e.target.checked ? "Ignore" : rule.category,
                                  subcategory: e.target.checked ? "Ignored" : rule.subcategory
                                })}
                                className="rounded border-border"
                              />
                              Ignore
                            </label>
                          </div>
                          
                          {rule.overridesBuiltinId && (
                            <p className="text-[10px] text-muted-foreground">
                              Overrides built-in rule: {builtinRules.find(r => r.id === rule.overridesBuiltinId)?.name}
                            </p>
                          )}
                          
                          <div className="flex items-center gap-2 pt-1">
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                deleteRule(rule.ruleId)
                                setEditingRule(null)
                                setViewingCustomRule(null)
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
                                setViewingCustomRule(rule.ruleId)
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

      {/* Built-in Rules Section - no nested scrollbar */}
      <Card>
        <button
          onClick={() => setShowBuiltin(!showBuiltin)}
          className="w-full flex items-center justify-between"
        >
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-foreground">Built-in Rules</h3>
            <span className="px-1.5 py-0.5 rounded bg-muted/50 text-[10px] font-medium text-muted-foreground">
              {builtinRules.length}
            </span>
          </div>
          <ChevronDown className={cn(
            "size-4 text-muted-foreground transition-transform",
            showBuiltin && "rotate-180"
          )} />
        </button>
        
        {showBuiltin && (
          <div className="mt-3 pt-3 border-t border-border space-y-1">
            {builtinRules.map((rule) => {
              const isDisabled = !rule.enabled || disabledBuiltinIds.has(rule.id)
              const isViewing = viewingBuiltinRule?.id === rule.id
              const isEditing = editingBuiltinRule?.id === rule.id
              
              return (
                <div key={rule.id}>
                  <button
                    onClick={() => {
                      if (isEditing) return // Don't toggle if editing
                      setViewingBuiltinRule(isViewing ? null : rule)
                    }}
                    className={cn(
                      "w-full flex items-center justify-between py-2 px-2 hover:bg-surface2 rounded transition-colors text-left",
                      isDisabled && "opacity-40",
                      (isViewing || isEditing) && "bg-surface2"
                    )}
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      {isDisabled && <Ban className="size-3 text-signal-red shrink-0" />}
                      <span className="text-xs text-muted-foreground truncate">{rule.name}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span 
                        className="px-2 py-0.5 rounded text-[10px] font-medium"
                        style={{ 
                          backgroundColor: `${CATEGORY_COLORS[rule.category] || CATEGORY_COLORS["default"]}20`,
                          color: CATEGORY_COLORS[rule.category] || CATEGORY_COLORS["default"]
                        }}
                      >
                        {rule.subcategory}
                      </span>
                      <ChevronDown className={cn(
                        "size-3 text-muted-foreground transition-transform",
                        isViewing && "rotate-180"
                      )} />
                    </div>
                  </button>
                  
                  {/* Inline detail view */}
                  {isViewing && !isEditing && (
                    <div className="mt-1 mb-2 p-3 bg-surface2 rounded-lg border border-border space-y-3">
                      <div>
                        <label className="text-[10px] uppercase tracking-wider text-muted-foreground block mb-1">Pattern (Regex)</label>
                        <code className="block text-xs text-primary bg-background p-2 rounded overflow-x-auto">
                          {rule.pattern}
                        </code>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-[10px] uppercase tracking-wider text-muted-foreground block mb-1">Category</label>
                          <span 
                            className="inline-block px-2 py-1 rounded text-xs font-medium"
                            style={{ 
                              backgroundColor: `${CATEGORY_COLORS[rule.category] || CATEGORY_COLORS["default"]}20`,
                              color: CATEGORY_COLORS[rule.category] || CATEGORY_COLORS["default"]
                            }}
                          >
                            {rule.category}
                          </span>
                        </div>
                        <div>
                          <label className="text-[10px] uppercase tracking-wider text-muted-foreground block mb-1">Subcategory</label>
                          <span className="text-sm text-foreground">{rule.subcategory}</span>
                        </div>
                      </div>
                      
                      {isDisabled && (
                        <div className="p-2 bg-signal-red/10 border border-signal-red/30 rounded">
                          <p className="text-xs text-signal-red">This rule is currently disabled</p>
                        </div>
                      )}
                      
                      <div className="flex items-center gap-2 pt-1">
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            startEditingBuiltin(rule)
                          }}
                          className="flex-1 h-9 rounded-lg bg-surface2 border border-border text-foreground text-sm font-medium hover:bg-surface2/80 flex items-center justify-center gap-1"
                        >
                          <Pencil className="size-4" />
                          Edit
                        </button>
                        {!isDisabled ? (
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              disableBuiltinRule(rule)
                            }}
                            className="h-9 px-3 rounded-lg bg-signal-red/10 text-signal-red text-sm font-medium hover:bg-signal-red/20 flex items-center gap-1"
                          >
                            <Ban className="size-4" />
                            Disable
                          </button>
                        ) : (
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              const override = customRules.find(r => r.overridesBuiltinId === rule.id)
                              if (override) toggleRuleEnabled(override.ruleId)
                              setViewingBuiltinRule(null)
                            }}
                            className="h-9 px-3 rounded-lg bg-signal-green/10 text-signal-green text-sm font-medium hover:bg-signal-green/20 flex items-center gap-1"
                          >
                            <Check className="size-4" />
                            Enable
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                  
                  {/* Inline edit form */}
                  {isEditing && (
                    <div className="mt-1 mb-2 p-3 bg-primary/5 rounded-lg border border-primary/30 space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-semibold text-foreground">Edit Rule Override</h4>
                        <button 
                          onClick={(e) => { e.stopPropagation(); cancelBuiltinEdit() }}
                          className="p-1 text-muted-foreground hover:text-foreground"
                        >
                          <X className="size-4" />
                        </button>
                      </div>
                      
                      <div>
                        <label className="text-[10px] uppercase tracking-wider text-muted-foreground block mb-1">
                          Pattern (Regex)
                          {builtinEditForm.pattern !== rule.pattern && (
                            <span className="ml-2 text-signal-amber">Modified - will create custom rule</span>
                          )}
                        </label>
                        <input
                          type="text"
                          value={builtinEditForm.pattern}
                          onChange={(e) => setBuiltinEditForm(f => ({ ...f, pattern: e.target.value }))}
                          className="w-full h-9 px-3 bg-background border border-border rounded-lg text-sm font-mono text-primary focus:outline-none focus:ring-2 focus:ring-primary/50"
                        />
                        <p className="text-[10px] text-muted-foreground mt-1">
                          Editing the pattern will create a new custom rule instead of overriding the built-in.
                        </p>
                      </div>
                      
                      {/* Category & Subcategory selectors */}
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-[10px] uppercase tracking-wider text-muted-foreground block mb-1">Category</label>
                          <select
                            value={builtinEditForm.category}
                            onChange={(e) => {
                              const cat = e.target.value
                              setBuiltinEditForm(f => ({ ...f, category: cat, subcategory: "" }))
                            }}
                            disabled={builtinEditForm.isIgnore}
                            className="w-full h-9 px-2 text-sm bg-background border border-border rounded-lg disabled:opacity-50"
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
                            value={builtinEditForm.subcategory}
                            onChange={(e) => setBuiltinEditForm(f => ({ ...f, subcategory: e.target.value }))}
                            disabled={builtinEditForm.isIgnore || !builtinEditForm.category}
                            className="w-full h-9 px-2 text-sm bg-background border border-border rounded-lg disabled:opacity-50"
                          >
                            <option value="">Select...</option>
                            {getSubcategories(builtinEditForm.category).map(sub => (
                              <option key={sub} value={sub}>{sub}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                      
                      {/* Flags */}
                      <div className="flex items-center gap-4">
                        <label className="flex items-center gap-2 text-sm text-muted-foreground">
                          <input
                            type="checkbox"
                            checked={builtinEditForm.isBusiness}
                            onChange={(e) => setBuiltinEditForm(f => ({ ...f, isBusiness: e.target.checked }))}
                            className="rounded border-border"
                          />
                          Business expense
                        </label>
                        <label className="flex items-center gap-2 text-sm text-muted-foreground">
                          <input
                            type="checkbox"
                            checked={builtinEditForm.isIgnore}
                            onChange={(e) => setBuiltinEditForm(f => ({ ...f, isIgnore: e.target.checked }))}
                            className="rounded border-border"
                          />
                          Ignore
                        </label>
                      </div>
                      
                      {/* Action buttons */}
                      <div className="flex items-center gap-2 pt-1">
                        <button
                          onClick={(e) => { e.stopPropagation(); cancelBuiltinEdit() }}
                          className="h-9 px-4 rounded-lg bg-surface2 text-muted-foreground text-sm font-medium hover:text-foreground"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            disableBuiltinRule(rule)
                            setEditingBuiltinRule(null)
                          }}
                          className="h-9 px-3 rounded-lg bg-signal-red/10 text-signal-red text-sm font-medium hover:bg-signal-red/20 flex items-center gap-1"
                        >
                          <Ban className="size-4" />
                          Disable
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); saveBuiltinEdit() }}
                          disabled={!builtinEditForm.isIgnore && (!builtinEditForm.category || !builtinEditForm.subcategory)}
                          className="flex-1 h-9 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-1"
                        >
                          <Check className="size-4" />
                          Save Override
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </Card>
    </div>
  )
}
