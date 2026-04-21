# Sub-phase 4 baseline review — detailed

Generated from `.lint-baseline.json` for PR #31. 92 entries total:
81 `@typescript-eslint/no-unused-vars` + 11 long-tail entries.

This document exists to support the review session before real
reasons are assigned to `.lint-baseline.json`.

---

## Part A — no-unused-vars (81 entries)

### Category tallies

- `unused-import`: 45 entries
- `unused-destructure`: 17 entries
- `unused-parameter`: 5 entries
- `unused-local`: 13 entries
- `unused-catch`: 1 entries

### File tallies

Top 10 files by entry count:

| File | Entries |
| ---- | ------- |
| [apps/budget-tracker/components/budget-tracker/tabs/cashflow-tab.tsx](../apps/budget-tracker/components/budget-tracker/tabs/cashflow-tab.tsx) | 6 |
| [apps/stock-analyser/components/budget-tracker/tabs/cashflow-tab.tsx](../apps/stock-analyser/components/budget-tracker/tabs/cashflow-tab.tsx) | 6 |
| [apps/stock-analyser/components/budget-tracker/tabs/transactions-tab.tsx](../apps/stock-analyser/components/budget-tracker/tabs/transactions-tab.tsx) | 6 |
| [apps/budget-tracker/components/budget-tracker/tabs/transactions-tab.tsx](../apps/budget-tracker/components/budget-tracker/tabs/transactions-tab.tsx) | 5 |
| [apps/stock-analyser/components/stock-signal/tabs/metals-tab.tsx](../apps/stock-analyser/components/stock-signal/tabs/metals-tab.tsx) | 5 |
| [apps/stock-analyser/components/stock-signal/tabs/recommendations-tab.tsx](../apps/stock-analyser/components/stock-signal/tabs/recommendations-tab.tsx) | 5 |
| [apps/budget-tracker/components/budget-tracker/tabs/budget-tab.tsx](../apps/budget-tracker/components/budget-tracker/tabs/budget-tab.tsx) | 3 |
| [apps/budget-tracker/components/budget-tracker/tabs/rules-tab.tsx](../apps/budget-tracker/components/budget-tracker/tabs/rules-tab.tsx) | 3 |
| [apps/stock-analyser/components/budget-tracker/tabs/budget-tab.tsx](../apps/stock-analyser/components/budget-tracker/tabs/budget-tab.tsx) | 3 |
| [apps/stock-analyser/components/budget-tracker/tabs/rules-tab.tsx](../apps/stock-analyser/components/budget-tracker/tabs/rules-tab.tsx) | 3 |

### Entries

Ordered by file path, then line number.

#### apps/budget-tracker/components/brand/wordmark.tsx:1

**Category:** `unused-destructure`
**Variable:** `size`
**Context:**
```tsx
1: export function Wordmark({ className, size }: { className?: string; size?: string }) {  // <-- flagged
2:   return (
3:     <span className={className} style={{ fontWeight: 600, letterSpacing: '-0.02em' }}>
```

#### apps/budget-tracker/components/budget-tracker/tabs/budget-tab.tsx:8

**Category:** `unused-import`
**Variable:** `FREQUENCY_TO_MONTHLY`
**Context:**
```tsx
6: import { ChevronDown, Plus, Pencil, Trash2, RotateCcw, X, Check, Undo2 } from "lucide-react"
7: import { BUDGET_CATEGORIES, CATEGORY_LIST } from "../data/categories"
8: import { DEFAULT_BUDGETS, FREQUENCY_LABELS, FREQUENCY_TO_MONTHLY, toMonthlyAmount, type BudgetFrequency } from "../data/default-budgets"  // <-- flagged
9: import { CATEGORY_COLORS } from "../data/category-colors"
10: import { PROJECT_CATEGORIES, PROJECT_SUBCATEGORIES, isProjectCategory, isProjectSubcategory, DEFAULT_PROJECT_BUDGETS } from "../data/project-config"
```

#### apps/budget-tracker/components/budget-tracker/tabs/budget-tab.tsx:11

**Category:** `unused-import`
**Variable:** `Transaction`
**Context:**
```tsx
9: import { CATEGORY_COLORS } from "../data/category-colors"
10: import { PROJECT_CATEGORIES, PROJECT_SUBCATEGORIES, isProjectCategory, isProjectSubcategory, DEFAULT_PROJECT_BUDGETS } from "../data/project-config"
11: import type { Transaction } from "../data/types"  // <-- flagged
12: import { cn } from "@/lib/utils"
13: 
```

#### apps/budget-tracker/components/budget-tracker/tabs/budget-tab.tsx:16

**Category:** `unused-destructure`
**Variable:** `day`
**Context:**
```tsx
14: // Parse date to get month key
15: function getMonthKey(dateStr: string): string {
16:   const [day, month, year] = dateStr.split("/").map(Number)  // <-- flagged
17:   return `${year}-${String(month).padStart(2, "0")}`
18: }
```

#### apps/budget-tracker/components/budget-tracker/tabs/cashflow-tab.tsx:9

**Category:** `unused-import`
**Variable:** `isProjectSubcategory`
**Context:**
```tsx
7: import { CATEGORY_LIST } from "../data/categories"
8: import { CATEGORY_COLORS } from "../data/category-colors"
9: import { isProjectCategory, isProjectSubcategory, isProjectTransaction } from "../data/project-config"  // <-- flagged
10: import { cn } from "@/lib/utils"
11: import {
```

#### apps/budget-tracker/components/budget-tracker/tabs/cashflow-tab.tsx:136

**Category:** `unused-local`
**Variable:** `currentMonth`
**Context:**
```tsx
134:   const filteredMonths = useMemo(() => {
135:     const now = new Date()
136:     const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`  // <-- flagged
137:     
138:     let monthsToShow: number
```

#### apps/budget-tracker/components/budget-tracker/tabs/cashflow-tab.tsx:276

**Category:** `unused-destructure`
**Variable:** `_`
**Context:**
```tsx
274:     // Add income sources
275:     const incomeSources = Object.entries(incomeBySource)
276:       .filter(([_, v]) => v > 100)  // <-- flagged
277:       .sort((a, b) => b[1] - a[1])
278:       .slice(0, 5)
```

#### apps/budget-tracker/components/budget-tracker/tabs/cashflow-tab.tsx:291

**Category:** `unused-destructure`
**Variable:** `_`
**Context:**
```tsx
289:     // Add expense categories
290:     const categories = Object.entries(expensesByCategory)
291:       .filter(([_, v]) => v > 100)  // <-- flagged
292:       .sort((a, b) => b[1] - a[1])
293:       .slice(0, 6)
```

#### apps/budget-tracker/components/budget-tracker/tabs/cashflow-tab.tsx:302

**Category:** `unused-destructure`
**Variable:** `_`
**Context:**
```tsx
300:     // Add top subcategories per category
301:     const topSubcategories = Object.entries(expensesBySubcategory)
302:       .filter(([_, v]) => v.amount > 50)  // <-- flagged
303:       .sort((a, b) => b[1].amount - a[1].amount)
304:       .slice(0, 12)
```

#### apps/budget-tracker/components/budget-tracker/tabs/cashflow-tab.tsx:324

**Category:** `unused-local`
**Variable:** `totalIncome`
**Context:**
```tsx
322:     
323:     // Total Income → Expense Categories
324:     const totalIncome = Object.values(incomeBySource).reduce((s, v) => s + v, 0)  // <-- flagged
325:     categories.forEach(([name, value]) => {
326:       links.push({
```

#### apps/budget-tracker/components/budget-tracker/tabs/review-tab.tsx:102

**Category:** `unused-local`
**Variable:** `saveEdit`
**Context:**
```tsx
100: 
101:   // Save edited suggestion
102:   const saveEdit = (transactionId: number) => {  // <-- flagged
103:     if (!editCategory || !editSubcategory) return
104:     
```

#### apps/budget-tracker/components/budget-tracker/tabs/rules-tab.tsx:6

**Category:** `unused-import`
**Variable:** `Eye`
**Context:**
```tsx
4: import { useBudgetNavigation } from "../app-shell"
5: import { PageHeader, Card, PrimaryButton, SecondaryButton } from "@/components/ui/design-system"
6: import { Search, Plus, RotateCcw, ChevronDown, Check, X, Pencil, Trash2, Ban, Eye, HelpCircle, Sparkles, AlertCircle } from "lucide-react"  // <-- flagged
7: import { findAllMatchingRules, applyRules, type BuiltinRule } from "../data/builtin-rules"
8: import { CATEGORY_LIST, getSubcategories } from "../data/categories"
```

#### apps/budget-tracker/components/budget-tracker/tabs/rules-tab.tsx:25 — `updateBuiltinRule`

**Category:** `unused-destructure`
**Variable:** `updateBuiltinRule`
**Context:**
```tsx
23: 
24: export function RulesTab() {
25:   const { customRules, setCustomRules, builtinRules, updateBuiltinRule, addBuiltinRule, transactions, setTransactions } = useBudgetNavigation()  // <-- flagged
26:   
27:   // Fix stale closure issue with useRef
```

#### apps/budget-tracker/components/budget-tracker/tabs/rules-tab.tsx:25 — `addBuiltinRule`

**Category:** `unused-destructure`
**Variable:** `addBuiltinRule`
**Context:**
```tsx
23: 
24: export function RulesTab() {
25:   const { customRules, setCustomRules, builtinRules, updateBuiltinRule, addBuiltinRule, transactions, setTransactions } = useBudgetNavigation()  // <-- flagged
26:   
27:   // Fix stale closure issue with useRef
```

#### apps/budget-tracker/components/budget-tracker/tabs/summary-tab.tsx:10

**Category:** `unused-import`
**Variable:** `PROJECT_SUBCATEGORIES`
**Context:**
```tsx
8: import { CATEGORY_COLORS } from "../data/category-colors"
9: import { getBudget } from "../data/default-budgets"
10: import { PROJECT_CATEGORIES, PROJECT_SUBCATEGORIES, isProjectCategory, isProjectSubcategory, isProjectTransaction, DEFAULT_PROJECT_BUDGETS } from "../data/project-config"  // <-- flagged
11: import type { Transaction } from "../data/types"
12: import { cn } from "@/lib/utils"
```

#### apps/budget-tracker/components/budget-tracker/tabs/summary-tab.tsx:420

**Category:** `unused-destructure`
**Variable:** `_`
**Context:**
```tsx
418:                         <div className="mt-3 pt-3 border-t border-border/50 space-y-2">
419:                           {Object.entries(data.bySubcategory)
420:                             .filter(([_, subData]) => subData.total > 0 || subData.budget > 0)  // <-- flagged
421:                             .sort((a, b) => b[1].total - a[1].total)
422:                             .map(([sub, subData]) => {
```

#### apps/budget-tracker/components/budget-tracker/tabs/transactions-tab.tsx:7 — `ChevronDown`

**Category:** `unused-import`
**Variable:** `ChevronDown`
**Context:**
```tsx
5: import { PageHeader, Card, PrimaryButton, SecondaryButton, EmptyState } from "@/components/ui/design-system"
6: import { 
7:   Upload, Receipt, Filter, Download, Briefcase, X, ChevronDown, ChevronRight,  // <-- flagged
8:   RotateCcw, Check, BookOpen, Calendar, Search, FileText, Sparkles, AlertCircle
9: } from "lucide-react"
```

#### apps/budget-tracker/components/budget-tracker/tabs/transactions-tab.tsx:7 — `ChevronRight`

**Category:** `unused-import`
**Variable:** `ChevronRight`
**Context:**
```tsx
5: import { PageHeader, Card, PrimaryButton, SecondaryButton, EmptyState } from "@/components/ui/design-system"
6: import { 
7:   Upload, Receipt, Filter, Download, Briefcase, X, ChevronDown, ChevronRight,  // <-- flagged
8:   RotateCcw, Check, BookOpen, Calendar, Search, FileText, Sparkles, AlertCircle
9: } from "lucide-react"
```

#### apps/budget-tracker/components/budget-tracker/tabs/transactions-tab.tsx:8

**Category:** `unused-import`
**Variable:** `Calendar`
**Context:**
```tsx
6: import { 
7:   Upload, Receipt, Filter, Download, Briefcase, X, ChevronDown, ChevronRight,
8:   RotateCcw, Check, BookOpen, Calendar, Search, FileText, Sparkles, AlertCircle  // <-- flagged
9: } from "lucide-react"
10: import { BUDGET_CATEGORIES, CATEGORY_LIST, getSubcategories } from "../data/categories"
```

#### apps/budget-tracker/components/budget-tracker/tabs/transactions-tab.tsx:10

**Category:** `unused-import`
**Variable:** `BUDGET_CATEGORIES`
**Context:**
```tsx
8:   RotateCcw, Check, BookOpen, Calendar, Search, FileText, Sparkles, AlertCircle
9: } from "lucide-react"
10: import { BUDGET_CATEGORIES, CATEGORY_LIST, getSubcategories } from "../data/categories"  // <-- flagged
11: import { CATEGORY_COLORS } from "../data/category-colors"
12: import { applyRules } from "../data/builtin-rules"
```

#### apps/budget-tracker/components/budget-tracker/tabs/transactions-tab.tsx:13

**Category:** `unused-import`
**Variable:** `TransactionFilters`
**Context:**
```tsx
11: import { CATEGORY_COLORS } from "../data/category-colors"
12: import { applyRules } from "../data/builtin-rules"
13: import type { Transaction, TransactionFilters } from "../data/types"  // <-- flagged
14: import { cn } from "@/lib/utils"
15: import { useClaude } from "@/lib/hooks"
```

#### apps/budget-tracker/components/ui/use-toast.ts:18

**Category:** `unused-local`
**Variable:** `actionTypes`
**Context:**
```ts
16: }
17: 
18: const actionTypes = {  // <-- flagged
19:   ADD_TOAST: 'ADD_TOAST',
20:   UPDATE_TOAST: 'UPDATE_TOAST',
```

#### apps/budget-tracker/functions/budget-export/src/index.ts:10

**Category:** `unused-import`
**Variable:** `toIso`
**Context:**
```ts
8: const GSI   = 'accountId-dateIso-index';
9: 
10: function toIso(ddmmyyyy: string): string {  // <-- flagged
11:   const p = ddmmyyyy.split('/');
12:   return p.length === 3 ? `${p[2]}-${p[1]}-${p[0]}` : ddmmyyyy;
```

#### apps/budget-tracker/functions/budget-transactions/src/index.ts:5

**Category:** `unused-import`
**Variable:** `PutCommand`
**Context:**
```ts
3:   DynamoDBDocumentClient,
4:   QueryCommand,
5:   PutCommand,  // <-- flagged
6:   UpdateCommand,
7:   DeleteCommand,
```

#### apps/budget-tracker/hooks/use-toast.ts:18

**Category:** `unused-local`
**Variable:** `actionTypes`
**Context:**
```ts
16: }
17: 
18: const actionTypes = {  // <-- flagged
19:   ADD_TOAST: 'ADD_TOAST',
20:   UPDATE_TOAST: 'UPDATE_TOAST',
```

#### apps/budget-tracker/lib/repositories/budget-tracker/rules-repository.ts:9

**Category:** `unused-import`
**Variable:** `Repository`
**Context:**
```ts
7:  */
8: 
9: import { Repository } from '../base-repository'  // <-- flagged
10: 
11: export interface CustomRule {
```

#### apps/budget-tracker/lib/repositories/budget-tracker/transaction-repository.ts:9

**Category:** `unused-import`
**Variable:** `RepositoryOptions`
**Context:**
```ts
7:  */
8: 
9: import { Repository, RepositoryOptions } from '../base-repository'  // <-- flagged
10: 
11: // Import Transaction type from budget-tracker
```

#### apps/budget-tracker/lib/services/auth/mock-auth.ts:80

**Category:** `unused-parameter`
**Variable:** `_credentials`
**Context:**
```ts
78:   }
79: 
80:   async signIn(_credentials: SignInCredentials): Promise<AuthSession> {  // <-- flagged
81:     // Mock: accept any credentials
82:     this.session = {
```

#### apps/budget-tracker/lib/services/cache/memory-cache.ts:9

**Category:** `unused-import`
**Variable:** `getConfig`
**Context:**
```ts
7: 
8: import { CacheService, CacheConfig, CacheEntry } from './index'
9: import { getConfig } from '../../config'  // <-- flagged
10: 
11: const DEFAULT_TTL = 300 // 5 minutes
```

#### apps/budget-tracker/stores/auth/use-auth-store.ts:10

**Category:** `unused-import`
**Variable:** `AuthSession`
**Context:**
```ts
8: import { create } from 'zustand'
9: import { persist } from 'zustand/middleware'
10: import type { User, Account, AuthSession, AuthTokens } from '@/lib/services/auth'  // <-- flagged
11: import { createMockAuthService } from '@/lib/services/auth/mock-auth'
12: 
```

#### apps/budget-tracker/stores/auth/use-auth-store.ts:166

**Category:** `unused-catch`
**Variable:** `error`
**Context:**
```ts
164:           const tokens = await authService.refreshTokens()
165:           set({ tokens })
166:         } catch (error) {  // <-- flagged
167:           // Token refresh failed, sign out
168:           await get().signOut()
```

#### apps/stock-analyser/components/auth/sign-in.tsx:321

**Category:** `unused-destructure`
**Variable:** `showCreateAccount`
**Context:**
```tsx
319: export function SignIn({ onSignIn }: { onSignIn?: () => void }) {
320:   const [forgotProviderOpen, setForgotProviderOpen] = useState(false)
321:   const [showCreateAccount, setShowCreateAccount] = useState(false)  // <-- flagged
322:   const { signIn, isLoading, error, clearError } = useAuthStore()
323: 
```

#### apps/stock-analyser/components/budget-tracker/tabs/budget-tab.tsx:9

**Category:** `unused-import`
**Variable:** `FREQUENCY_TO_MONTHLY`
**Context:**
```tsx
7: import { ChevronDown, Plus, Pencil, Trash2, RotateCcw, X, Check, Undo2 } from "lucide-react"
8: import { BUDGET_CATEGORIES, CATEGORY_LIST } from "../data/categories"
9: import { DEFAULT_BUDGETS, FREQUENCY_LABELS, FREQUENCY_TO_MONTHLY, toMonthlyAmount, type BudgetFrequency } from "../data/default-budgets"  // <-- flagged
10: import { CATEGORY_COLORS } from "../data/category-colors"
11: import { PROJECT_CATEGORIES, PROJECT_SUBCATEGORIES, isProjectCategory, isProjectSubcategory, DEFAULT_PROJECT_BUDGETS } from "../data/project-config"
```

#### apps/stock-analyser/components/budget-tracker/tabs/budget-tab.tsx:12

**Category:** `unused-import`
**Variable:** `Transaction`
**Context:**
```tsx
10: import { CATEGORY_COLORS } from "../data/category-colors"
11: import { PROJECT_CATEGORIES, PROJECT_SUBCATEGORIES, isProjectCategory, isProjectSubcategory, DEFAULT_PROJECT_BUDGETS } from "../data/project-config"
12: import type { Transaction } from "../data/types"  // <-- flagged
13: import { cn } from "@/lib/utils"
14: 
```

#### apps/stock-analyser/components/budget-tracker/tabs/budget-tab.tsx:17

**Category:** `unused-destructure`
**Variable:** `day`
**Context:**
```tsx
15: // Parse date to get month key
16: function getMonthKey(dateStr: string): string {
17:   const [day, month, year] = dateStr.split("/").map(Number)  // <-- flagged
18:   return `${year}-${String(month).padStart(2, "0")}`
19: }
```

#### apps/stock-analyser/components/budget-tracker/tabs/cashflow-tab.tsx:9

**Category:** `unused-import`
**Variable:** `isProjectSubcategory`
**Context:**
```tsx
7: import { CATEGORY_LIST } from "../data/categories"
8: import { CATEGORY_COLORS } from "../data/category-colors"
9: import { isProjectCategory, isProjectSubcategory, isProjectTransaction } from "../data/project-config"  // <-- flagged
10: import { cn } from "@/lib/utils"
11: import {
```

#### apps/stock-analyser/components/budget-tracker/tabs/cashflow-tab.tsx:136

**Category:** `unused-local`
**Variable:** `currentMonth`
**Context:**
```tsx
134:   const filteredMonths = useMemo(() => {
135:     const now = new Date()
136:     const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`  // <-- flagged
137:     
138:     let monthsToShow: number
```

#### apps/stock-analyser/components/budget-tracker/tabs/cashflow-tab.tsx:276

**Category:** `unused-destructure`
**Variable:** `_`
**Context:**
```tsx
274:     // Add income sources
275:     const incomeSources = Object.entries(incomeBySource)
276:       .filter(([_, v]) => v > 100)  // <-- flagged
277:       .sort((a, b) => b[1] - a[1])
278:       .slice(0, 5)
```

#### apps/stock-analyser/components/budget-tracker/tabs/cashflow-tab.tsx:291

**Category:** `unused-destructure`
**Variable:** `_`
**Context:**
```tsx
289:     // Add expense categories
290:     const categories = Object.entries(expensesByCategory)
291:       .filter(([_, v]) => v > 100)  // <-- flagged
292:       .sort((a, b) => b[1] - a[1])
293:       .slice(0, 6)
```

#### apps/stock-analyser/components/budget-tracker/tabs/cashflow-tab.tsx:302

**Category:** `unused-destructure`
**Variable:** `_`
**Context:**
```tsx
300:     // Add top subcategories per category
301:     const topSubcategories = Object.entries(expensesBySubcategory)
302:       .filter(([_, v]) => v.amount > 50)  // <-- flagged
303:       .sort((a, b) => b[1].amount - a[1].amount)
304:       .slice(0, 12)
```

#### apps/stock-analyser/components/budget-tracker/tabs/cashflow-tab.tsx:324

**Category:** `unused-local`
**Variable:** `totalIncome`
**Context:**
```tsx
322:     
323:     // Total Income → Expense Categories
324:     const totalIncome = Object.values(incomeBySource).reduce((s, v) => s + v, 0)  // <-- flagged
325:     categories.forEach(([name, value]) => {
326:       links.push({
```

#### apps/stock-analyser/components/budget-tracker/tabs/review-tab.tsx:102

**Category:** `unused-local`
**Variable:** `saveEdit`
**Context:**
```tsx
100: 
101:   // Save edited suggestion
102:   const saveEdit = (transactionId: string) => {  // <-- flagged
103:     if (!editCategory || !editSubcategory) return
104:     
```

#### apps/stock-analyser/components/budget-tracker/tabs/rules-tab.tsx:7

**Category:** `unused-import`
**Variable:** `Eye`
**Context:**
```tsx
5: import { useBudgetNavigation } from "../app-shell"
6: import { PageHeader, Card, PrimaryButton, SecondaryButton } from "@/components/ui/design-system"
7: import { Search, Plus, RotateCcw, ChevronDown, Check, X, Pencil, Trash2, Ban, Eye, HelpCircle, Sparkles, AlertCircle } from "lucide-react"  // <-- flagged
8: import { findAllMatchingRules, applyRules, type BuiltinRule } from "../data/builtin-rules"
9: import { CATEGORY_LIST, getSubcategories } from "../data/categories"
```

#### apps/stock-analyser/components/budget-tracker/tabs/rules-tab.tsx:26 — `updateBuiltinRule`

**Category:** `unused-destructure`
**Variable:** `updateBuiltinRule`
**Context:**
```tsx
24: 
25: export function RulesTab() {
26:   const { customRules, setCustomRules, builtinRules, updateBuiltinRule, addBuiltinRule, transactions, setTransactions } = useBudgetNavigation()  // <-- flagged
27:   
28:   // Fix stale closure issue with useRef
```

#### apps/stock-analyser/components/budget-tracker/tabs/rules-tab.tsx:26 — `addBuiltinRule`

**Category:** `unused-destructure`
**Variable:** `addBuiltinRule`
**Context:**
```tsx
24: 
25: export function RulesTab() {
26:   const { customRules, setCustomRules, builtinRules, updateBuiltinRule, addBuiltinRule, transactions, setTransactions } = useBudgetNavigation()  // <-- flagged
27:   
28:   // Fix stale closure issue with useRef
```

#### apps/stock-analyser/components/budget-tracker/tabs/summary-tab.tsx:10

**Category:** `unused-import`
**Variable:** `PROJECT_SUBCATEGORIES`
**Context:**
```tsx
8: import { CATEGORY_COLORS } from "../data/category-colors"
9: import { getBudget } from "../data/default-budgets"
10: import { PROJECT_CATEGORIES, PROJECT_SUBCATEGORIES, isProjectCategory, isProjectSubcategory, isProjectTransaction, DEFAULT_PROJECT_BUDGETS } from "../data/project-config"  // <-- flagged
11: import type { Transaction } from "../data/types"
12: import { cn } from "@/lib/utils"
```

#### apps/stock-analyser/components/budget-tracker/tabs/summary-tab.tsx:420

**Category:** `unused-destructure`
**Variable:** `_`
**Context:**
```tsx
418:                         <div className="mt-3 pt-3 border-t border-border/50 space-y-2">
419:                           {Object.entries(data.bySubcategory)
420:                             .filter(([_, subData]) => subData.total > 0 || subData.budget > 0)  // <-- flagged
421:                             .sort((a, b) => b[1].total - a[1].total)
422:                             .map(([sub, subData]) => {
```

#### apps/stock-analyser/components/budget-tracker/tabs/transactions-tab.tsx:6

**Category:** `unused-import`
**Variable:** `EmptyState`
**Context:**
```tsx
4: import { useState, useMemo, useRef } from "react"
5: import { useBudgetNavigation } from "../app-shell"
6: import { PageHeader, Card, PrimaryButton, SecondaryButton, EmptyState } from "@/components/ui/design-system"  // <-- flagged
7: import {
8:   Upload, Receipt, Filter, Download, Briefcase, X, ChevronDown, ChevronRight,
```

#### apps/stock-analyser/components/budget-tracker/tabs/transactions-tab.tsx:8 — `ChevronDown`

**Category:** `unused-import`
**Variable:** `ChevronDown`
**Context:**
```tsx
6: import { PageHeader, Card, PrimaryButton, SecondaryButton, EmptyState } from "@/components/ui/design-system"
7: import {
8:   Upload, Receipt, Filter, Download, Briefcase, X, ChevronDown, ChevronRight,  // <-- flagged
9:   RotateCcw, Check, BookOpen, Calendar, Search, FileText, Sparkles, AlertCircle,
10:   Database,
```

#### apps/stock-analyser/components/budget-tracker/tabs/transactions-tab.tsx:8 — `ChevronRight`

**Category:** `unused-import`
**Variable:** `ChevronRight`
**Context:**
```tsx
6: import { PageHeader, Card, PrimaryButton, SecondaryButton, EmptyState } from "@/components/ui/design-system"
7: import {
8:   Upload, Receipt, Filter, Download, Briefcase, X, ChevronDown, ChevronRight,  // <-- flagged
9:   RotateCcw, Check, BookOpen, Calendar, Search, FileText, Sparkles, AlertCircle,
10:   Database,
```

#### apps/stock-analyser/components/budget-tracker/tabs/transactions-tab.tsx:9

**Category:** `unused-import`
**Variable:** `Calendar`
**Context:**
```tsx
7: import {
8:   Upload, Receipt, Filter, Download, Briefcase, X, ChevronDown, ChevronRight,
9:   RotateCcw, Check, BookOpen, Calendar, Search, FileText, Sparkles, AlertCircle,  // <-- flagged
10:   Database,
11: } from "lucide-react"
```

#### apps/stock-analyser/components/budget-tracker/tabs/transactions-tab.tsx:13

**Category:** `unused-import`
**Variable:** `BUDGET_CATEGORIES`
**Context:**
```tsx
11: } from "lucide-react"
12: import { getBudgetApiClient } from "@/lib/api/client"
13: import { BUDGET_CATEGORIES, CATEGORY_LIST, getSubcategories } from "../data/categories"  // <-- flagged
14: import { CATEGORY_COLORS } from "../data/category-colors"
15: import { applyRules } from "../data/builtin-rules"
```

#### apps/stock-analyser/components/budget-tracker/tabs/transactions-tab.tsx:16

**Category:** `unused-import`
**Variable:** `TransactionFilters`
**Context:**
```tsx
14: import { CATEGORY_COLORS } from "../data/category-colors"
15: import { applyRules } from "../data/builtin-rules"
16: import type { Transaction, TransactionFilters } from "../data/types"  // <-- flagged
17: import { cn } from "@/lib/utils"
18: import { useClaude } from "@/lib/hooks"
```

#### apps/stock-analyser/components/launchpad/launchpad.tsx:226

**Category:** `unused-local`
**Variable:** `activeAccount`
**Context:**
```tsx
224:   onAccountChange: (accountId: string) => void
225: }) {
226:   const activeAccount = user.accounts.find(a => a.id === user.activeAccount)  // <-- flagged
227:   
228:   if (!isOpen) return null
```

#### apps/stock-analyser/components/stock-signal/app-shell.tsx:6

**Category:** `unused-import`
**Variable:** `BrandMark`
**Context:**
```tsx
4: import { watchlistService, type WatchlistItem } from "@/lib/services/watchlist/watchlist-service"
5: import { cn } from "@/lib/utils"
6: import { Wordmark, BrandMark } from "@/components/brand/wordmark"  // <-- flagged
7: import {
8:   BarChart3,
```

#### apps/stock-analyser/components/stock-signal/tabs/analyser-tab.tsx:8

**Category:** `unused-import`
**Variable:** `StockIcon`
**Context:**
```tsx
6:   PageHeader,
7:   Card,
8:   StockIcon,  // <-- flagged
9:   VerdictBadge,
10:   BackLink,
```

#### apps/stock-analyser/components/stock-signal/tabs/analyser-tab.tsx:16

**Category:** `unused-import`
**Variable:** `CycleGauge`
**Context:**
```tsx
14:   CacheStatusBar,
15:   ModeToggle,
16:   CycleGauge,  // <-- flagged
17:   FullCycleGauge,
18:   type Verdict,
```

#### apps/stock-analyser/components/stock-signal/tabs/etfs-tab.tsx:12

**Category:** `unused-import`
**Variable:** `Signal`
**Context:**
```tsx
10:   PrimaryButton,
11:   TextToggle,
12:   type Signal,  // <-- flagged
13: } from "@/components/ui/design-system"
14: import { ChevronRight, ChevronDown, AlertCircle } from "lucide-react"
```

#### apps/stock-analyser/components/stock-signal/tabs/metals-tab.tsx:15

**Category:** `unused-import`
**Variable:** `TrendingUp`
**Context:**
```tsx
13: } from "@/components/ui/design-system"
14: import { 
15:   TrendingUp,   // <-- flagged
16:   TrendingDown, 
17:   Minus,
```

#### apps/stock-analyser/components/stock-signal/tabs/metals-tab.tsx:16

**Category:** `unused-import`
**Variable:** `TrendingDown`
**Context:**
```tsx
14: import { 
15:   TrendingUp, 
16:   TrendingDown,   // <-- flagged
17:   Minus,
18:   ChevronDown,
```

#### apps/stock-analyser/components/stock-signal/tabs/metals-tab.tsx:17

**Category:** `unused-import`
**Variable:** `Minus`
**Context:**
```tsx
15:   TrendingUp, 
16:   TrendingDown, 
17:   Minus,  // <-- flagged
18:   ChevronDown,
19:   Sparkles,
```

#### apps/stock-analyser/components/stock-signal/tabs/metals-tab.tsx:19

**Category:** `unused-import`
**Variable:** `Sparkles`
**Context:**
```tsx
17:   Minus,
18:   ChevronDown,
19:   Sparkles,  // <-- flagged
20:   AlertCircle,
21:   RefreshCw,
```

#### apps/stock-analyser/components/stock-signal/tabs/metals-tab.tsx:104

**Category:** `unused-destructure`
**Variable:** `hasRun`
**Context:**
```tsx
102:   const { navigateToAnalyser, getTabTextVisibility, setTabTextOverride, showExplanatoryText, setTabCache, getTabCache } = useNavigation()
103:   const [isLive, setIsLive] = useState(false)
104:   const [hasRun, setHasRun] = useState(false)  // <-- flagged
105:   const cachedMetals = getTabCache("metals")?.metals as Metal[] | null
106:   const [metalResults, setMetalResults] = useState<Metal[]>(cachedMetals ?? [])
```

#### apps/stock-analyser/components/stock-signal/tabs/recommendations-tab.tsx:10

**Category:** `unused-import`
**Variable:** `StockIcon`
**Context:**
```tsx
8:   PillSelector,
9:   Card,
10:   StockIcon,  // <-- flagged
11:   VerdictBadge,
12:   CycleGauge,
```

#### apps/stock-analyser/components/stock-signal/tabs/recommendations-tab.tsx:11

**Category:** `unused-import`
**Variable:** `VerdictBadge`
**Context:**
```tsx
9:   Card,
10:   StockIcon,
11:   VerdictBadge,  // <-- flagged
12:   CycleGauge,
13:   BackLink,
```

#### apps/stock-analyser/components/stock-signal/tabs/recommendations-tab.tsx:12

**Category:** `unused-import`
**Variable:** `CycleGauge`
**Context:**
```tsx
10:   StockIcon,
11:   VerdictBadge,
12:   CycleGauge,  // <-- flagged
13:   BackLink,
14:   PrimaryButton,
```

#### apps/stock-analyser/components/stock-signal/tabs/recommendations-tab.tsx:21

**Category:** `unused-import`
**Variable:** `Sparkles`
**Context:**
```tsx
19:   type CycleStage,
20: } from "@/components/ui/design-system"
21: import { ChevronRight, ChevronDown, Sparkles, Search, Loader2, Stars, AlertCircle } from "lucide-react"  // <-- flagged
22: import { useClaude } from "@/lib/hooks"
23: import { cn } from "@/lib/utils"
```

#### apps/stock-analyser/components/stock-signal/tabs/recommendations-tab.tsx:186

**Category:** `unused-local`
**Variable:** `filteredStocks`
**Context:**
```tsx
184:   // Use AI results if available, otherwise fall back to static mock data
185:   const stocks = stockResults.length > 0 ? stockResults : (mode === "Top Picks" ? TOP_PICKS : BOTTOM_OF_CYCLE)
186:   const filteredStocks = sectorFilter   // <-- flagged
187:     ? stocks.filter(s => s.sector.toLowerCase() === sectorFilter.toLowerCase())
188:     : stocks
```

#### apps/stock-analyser/components/stock-signal/tabs/watchlist-tab.tsx:5 — `watchlistService`

**Category:** `unused-import`
**Variable:** `watchlistService`
**Context:**
```tsx
3: import { useState, useEffect, useRef, useCallback } from "react"
4: import { useNavigation } from "../app-shell"
5: import { watchlistService, type WatchlistItem } from "@/lib/services/watchlist/watchlist-service"  // <-- flagged
6: import { portfolioService, type StockAnalysisResult } from "@/lib/services/portfolio"
7: import {
```

#### apps/stock-analyser/components/stock-signal/tabs/watchlist-tab.tsx:5 — `WatchlistItem`

**Category:** `unused-import`
**Variable:** `WatchlistItem`
**Context:**
```tsx
3: import { useState, useEffect, useRef, useCallback } from "react"
4: import { useNavigation } from "../app-shell"
5: import { watchlistService, type WatchlistItem } from "@/lib/services/watchlist/watchlist-service"  // <-- flagged
6: import { portfolioService, type StockAnalysisResult } from "@/lib/services/portfolio"
7: import {
```

#### apps/stock-analyser/components/ui/use-toast.ts:18

**Category:** `unused-local`
**Variable:** `actionTypes`
**Context:**
```ts
16: }
17: 
18: const actionTypes = {  // <-- flagged
19:   ADD_TOAST: 'ADD_TOAST',
20:   UPDATE_TOAST: 'UPDATE_TOAST',
```

#### apps/stock-analyser/hooks/use-toast.ts:18

**Category:** `unused-local`
**Variable:** `actionTypes`
**Context:**
```ts
16: }
17: 
18: const actionTypes = {  // <-- flagged
19:   ADD_TOAST: 'ADD_TOAST',
20:   UPDATE_TOAST: 'UPDATE_TOAST',
```

#### apps/stock-analyser/lib/api/client.ts:11

**Category:** `unused-import`
**Variable:** `APIResponse`
**Context:**
```ts
9:  */
10: 
11: import { APIRequestOptions, APIResponse, APIException, ErrorCodes } from './types'  // <-- flagged
12: import { getConfig } from '../config'
13: import { cognitoAuth } from '../services/auth/cognito-auth'
```

#### apps/stock-analyser/lib/repositories/budget-tracker/rules-repository.ts:9

**Category:** `unused-import`
**Variable:** `Repository`
**Context:**
```ts
7:  */
8: 
9: import { Repository } from '../base-repository'  // <-- flagged
10: 
11: export interface CustomRule {
```

#### apps/stock-analyser/lib/services/auth/mock-auth.ts:80

**Category:** `unused-parameter`
**Variable:** `_credentials`
**Context:**
```ts
78:   }
79: 
80:   async signIn(_credentials: SignInCredentials): Promise<AuthSession> {  // <-- flagged
81:     // Mock: accept any credentials
82:     this.session = {
```

#### apps/stock-analyser/lib/services/cache/dynamo-ttl-cache.ts:36

**Category:** `unused-local`
**Variable:** `getAccountId`
**Context:**
```ts
34: }
35: 
36: function getAccountId(cacheKey: string): string {  // <-- flagged
37:   const type = cacheKey.split('#')[0]
38:   return SHARED_TYPES.has(type) ? 'SHARED' : 'private'
```

#### apps/stock-analyser/lib/services/cache/memory-cache.ts:9

**Category:** `unused-import`
**Variable:** `getConfig`
**Context:**
```ts
7: 
8: import { CacheService, CacheConfig, CacheEntry } from './index'
9: import { getConfig } from '../../config'  // <-- flagged
10: 
11: const DEFAULT_TTL = 300 // 5 minutes
```

#### apps/web/components/auth/sign-in.tsx:288 — `_email`

**Category:** `unused-parameter`
**Variable:** `_email`
**Context:**
```tsx
286:   const [forgotProviderOpen, setForgotProviderOpen] = useState(false)
287: 
288:   const handleEmailSignIn = (_email: string, _password: string) => {  // <-- flagged
289:     setIsLoading(true)
290:     setTimeout(() => {
```

#### apps/web/components/auth/sign-in.tsx:288 — `_password`

**Category:** `unused-parameter`
**Variable:** `_password`
**Context:**
```tsx
286:   const [forgotProviderOpen, setForgotProviderOpen] = useState(false)
287: 
288:   const handleEmailSignIn = (_email: string, _password: string) => {  // <-- flagged
289:     setIsLoading(true)
290:     setTimeout(() => {
```

#### apps/web/components/auth/sign-in.tsx:296

**Category:** `unused-parameter`
**Variable:** `_provider`
**Context:**
```tsx
294:   }
295: 
296:   const handleSocialSignIn = (_provider: string) => {  // <-- flagged
297:     setIsLoading(true)
298:     setTimeout(() => {
```

#### functions/accounts/src/index.ts:5

**Category:** `unused-import`
**Variable:** `PutCommand`
**Context:**
```ts
3:   DynamoDBDocumentClient,
4:   GetCommand,
5:   PutCommand,  // <-- flagged
6:   UpdateCommand,
7:   DeleteCommand,
```

---

## Part B — Long-tail entries (11 entries)

Grouped by rule. No categorisation — each reviewed individually.

### `@typescript-eslint/ban-ts-comment` (4 entries)

#### apps/stock-analyser/components/budget-tracker/tabs/budget-tab.tsx:1

**Message:** Do not use "@ts-nocheck" because it alters compilation errors.
**Context:**
```tsx
1: // @ts-nocheck  // <-- flagged
2: "use client"
3: 
```

#### apps/stock-analyser/components/budget-tracker/tabs/rules-tab.tsx:1

**Message:** Do not use "@ts-nocheck" because it alters compilation errors.
**Context:**
```tsx
1: // @ts-nocheck  // <-- flagged
2: "use client"
3: 
```

#### apps/stock-analyser/components/budget-tracker/tabs/transactions-tab.tsx:1

**Message:** Do not use "@ts-nocheck" because it alters compilation errors.
**Context:**
```tsx
1: // @ts-nocheck  // <-- flagged
2: "use client"
3: 
```

#### apps/stock-analyser/lib/examples/budget-tracker-usage.tsx:1

**Message:** Do not use "@ts-nocheck" because it alters compilation errors.
**Context:**
```tsx
1: // @ts-nocheck  // <-- flagged
2: /**
3:  * Example: Using the new architecture in Budget Tracker components
```

### `prefer-const` (4 entries)

#### apps/budget-tracker/functions/budget-transactions/src/index.ts:100

**Message:** 'updated' is never reassigned. Use 'const' instead.
**Context:**
```ts
98:   const existingKeys = new Set(existing.map(naturalKey));
99: 
100:   let created = 0; let updated = 0; let skipped = 0;  // <-- flagged
101:   const resultTxs: Transaction[] = [];
102:   const toWrite: Transaction[] = [];
```

#### apps/stock-analyser/lib/services/portfolio/csv-parser.ts:51

**Message:** 't' is never reassigned. Use 'const' instead.
**Context:**
```ts
49: 
50: function normaliseTicker(raw: string): string {
51:   let t = raw.toUpperCase().replace(/['"]/g, '').trim()  // <-- flagged
52:   if (t.includes(':')) {
53:     const [code, market] = t.split(':')
```

#### apps/stock-analyser/lib/services/portfolio/csv-parser.ts:125

**Message:** 'rawVal' is never reassigned. Use 'const' instead.
**Context:**
```ts
123:     const ticker  = normaliseTicker(rawTicker)
124:     const shares  = parseFloat(rawShares.replace(/[,$\s]/g, ''))
125:     let   rawVal  = parseFloat(rawPrice.replace(/[,$\s]/g, ''))  // <-- flagged
126:     const currency = rawCurrency.toUpperCase().trim()
127:     const fx      = parseFloat(rawFx.replace(/[,$\s]/g, '')) || 1
```

#### packages/cycle-engine/src/index.ts:212

**Message:** 't' is never reassigned. Use 'const' instead.
**Context:**
```ts
210:  */
211: export function normaliseTicker(raw: string): string {
212:   let t = (raw || '').trim().toUpperCase();  // <-- flagged
213: 
214:   // Strip CMC Markets exchange suffixes
```

### `react-hooks/exhaustive-deps` (2 entries)

#### apps/budget-tracker/components/budget-tracker/tabs/rules-tab.tsx:190

**Message:** React Hook useMemo has an unnecessary dependency: 'customRules'. Either exclude it or remove the dependency array.
**Context:**
```tsx
188:     
189:     return results
190:   }, [testInput, customRules, builtinRules, disabledBuiltinIds])  // <-- flagged
191: 
192:   // Re-apply all rules to transactions
```

#### apps/stock-analyser/components/budget-tracker/tabs/rules-tab.tsx:191

**Message:** React Hook useMemo has an unnecessary dependency: 'customRules'. Either exclude it or remove the dependency array.
**Context:**
```tsx
189:     
190:     return results
191:   }, [testInput, customRules, builtinRules, disabledBuiltinIds])  // <-- flagged
192: 
193:   // Re-apply all rules to transactions
```

### `@typescript-eslint/no-unused-expressions` (1 entry)

#### apps/stock-analyser/components/stock-signal/tabs/portfolio-tab.tsx:59

**Message:** Expected an assignment or function call and instead saw an expression.
**Context:**
```tsx
57:     setExpandedCards(prev => {
58:       const next = new Set(prev)
59:       next.has(ticker) ? next.delete(ticker) : next.add(ticker)  // <-- flagged
60:       return next
61:     })
```
