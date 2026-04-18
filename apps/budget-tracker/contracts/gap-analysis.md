# Gap Analysis

**This document flags known deviations between the current state of each repo and these contracts.** Both tools should read this before starting work, so they know what needs to be brought into line.

This is a living document. As gaps are closed, cross them off. As new gaps appear, add them.

---

## For v0 (transformotion-apps-b8)

### Known gaps in current UI

1. **Data layer not using adaptor pattern**
   - Current: v0's UI makes direct calls / uses mock data inline
   - Required: route everything through Zustand stores, which route through adaptor interfaces. See `state-management.md`.
   - Action: rearchitect data flow. Introduce `/lib/services/budget/`, `/lib/services/ai/`, `/lib/services/auth/` folders with the documented interfaces and stub implementations.

2. **AI calls are stubbed without matching the real contract**
   - Current: AI is a visual placeholder
   - Required: stub implementations of `AIService` that match the interface exactly, so when Claude Code's real implementation swaps in, no UI changes needed
   - Action: read `ai-prompts.md` and `state-management.md` → `AIService`. Implement stubs that return plausible canned responses matching the documented shapes.

3. **Storage keys need unified prefix**
   - Required: all localStorage keys prefixed `budget-tracker.` per `state-management.md`
   - Action: if any localStorage is used in the current v0 build, update keys.

4. **Type definitions may not match**
   - Required: single shared file `/types/contracts.ts` with every type from `data-models.md`
   - Action: create this file, import throughout the app. Delete any duplicated or drifted type definitions.

5. **Tab structure may not match**
   - Required: 6 tabs in the order Transactions / Summary / Budget / Cashflow / Rules / Review (see `ui-patterns.md`)
   - Action: verify current tab list and order. Add missing tabs with placeholder content if needed.

6. **Exclusion rules may be inconsistent**
   - Required: the four exclusion rules in `data-models.md` must apply to every total/chart in the app
   - Action: audit every calculation. Centralise exclusion logic in `/lib/domain/budget/exclusions.ts` as a shared pure function, use it everywhere.

### What v0 must NOT do

- Do not attempt to call any AWS service
- Do not introduce new data types, endpoints, or storage patterns without updating `/contracts` first
- Do not change the AI prompt wording — the stub can return canned data, but when the real impl swaps in, it will use the exact prompt in `ai-prompts.md`
- Do not invent new tabs or restructure the 6-tab layout without a contract update

---

## For Claude Code (transformotion-apps)

### Known gaps in current backend

1. **Budget Tracker backend does not exist yet**
   - Current: no Budget Tracker-specific Lambdas, DynamoDB tables, or API Gateway routes
   - Required: everything in `aws-infrastructure.md` and `api-endpoints.md`
   - Action: build from scratch. Follow the patterns established for the Stock Analyser.

2. **Budget Tracker logic currently lives in a Claude chat artifact**
   - Current: categorisation rules, AI prompts, exclusion logic, Sankey transformation, cashflow calcs live in a single-file React artifact built in a previous Claude chat
   - Required: port all domain logic to `/lib/domain/budget/` as shared pure functions, then consume from both Lambdas (server-side) and the UI (client-side)
   - Action:
     - Extract the built-in rules engine → `/lib/domain/budget/builtin-rules.ts`
     - Extract the exclusion logic → `/lib/domain/budget/exclusions.ts`
     - Extract the Sankey data transformation → `/lib/domain/budget/sankey.ts`
     - Extract the cashflow calculations → `/lib/domain/budget/cashflow.ts`
     - Extract the budget-vs-actual logic → `/lib/domain/budget/budget-tracking.ts`
     - The source reference is the working artifact (`budget-categoriser.jsx`) from the earlier Claude chat. Steve has access to this.

3. **Account model not yet implemented**
   - Current: Stock Analyser is per-user (no shared household concept)
   - Required: `budget-tracker.accounts` table with members list — Steve and Liz share one `accountId`
   - Action: build the accounts table, migration logic, and Cognito → accountId resolution middleware. This may be reusable across future household-shared apps.

4. **Shared Claude proxy must support `web_search` tool**
   - Current: the `claude-api-proxy` Lambda may not yet support passing through tool-use (specifically `web_search`)
   - Required: `budget-ai-review-handler` needs to invoke Claude with `web_search` enabled
   - Action: verify proxy supports tool-use pass-through. If not, extend it.

5. **Cost and rate controls**
   - Current: proxy has rate limits but may not be per-account per-day budgeted for the Budget Tracker
   - Required: $5/day AI budget per account specifically for budget AI endpoints
   - Action: add per-endpoint-class budget tracking in the proxy or in the budget Lambdas.

### What Claude Code must NOT do

- Do not change any interface documented in `state-management.md` — v0 depends on exact shapes
- Do not change the AI prompt wording in `ai-prompts.md` without coordinating a contract update
- Do not introduce new endpoints without updating `api-endpoints.md` first
- Do not modify data models without updating `data-models.md` first

---

## Code-level mismatches found in the monorepo (2026-04-18)

*These are specific type-level and structural conflicts found by reading the existing `apps/web/` code against the contracts above. They must be resolved before wiring up the real backend. Steve decides which side to change.*

### M1. `CustomRule` shape conflict — BREAKING

The monorepo's existing `CustomRule` type (`apps/web/lib/repositories/budget-tracker/rules-repository.ts`) does not match the contract.

| Field | Monorepo | Contract (`data-models.md`) |
|---|---|---|
| Pattern field | `pattern: string` | `match: string` |
| Match logic | `matchType: 'contains'|'startsWith'|'regex'` (separate field) | Single `match` string, case-insensitive keyword or regex |
| Metadata | `name`, `priority`, `enabled`, `overridesBuiltinId`, `projectId`, `isBusiness`, `isIgnore` | None of these — just `id`, `accountId`, `match`, `category`, `subcategory`, `learned`, `createdAt` |
| Learned flag | `_manual` pattern (implied) | `learned: boolean` (explicit) |

**Recommendation:** Align the contract. The monorepo's richer shape (`matchType`, `priority`, `overridesBuiltinId`, `isBusiness`, `isIgnore`) reflects real product functionality from the prototype. The contract should be updated to include these fields, not stripped down. Claude Code to update `data-models.md` before implementing.

### M2. `Transaction.amount` type conflict — BREAKING

| Field | Monorepo | Contract |
|---|---|---|
| `amount` | `string` in DynamoDB shape, but `amount: string` in `Transaction` and used as number in P&L calcs | `string` (deliberately — preserves sign and avoids float rounding) |

Both agree `amount` is a string, but the P&L calculator in the monorepo (`pl-calculator.ts`) calls `parseFloat(t.amount)` internally. This is correct — the contract says "all arithmetic parses on read". **No conflict**, but note that the monorepo uses `amount: string` consistently and the contract's note about this must be respected.

### M3. `Transaction._id` type conflict — MODERATE

| Field | Monorepo | Contract |
|---|---|---|
| `_id` | `number` (sequential, local) | `number \| string` (number for stub, UUID string for real impl) |

This is intentional drift — the contract accounts for it. The monorepo's stub uses sequential numbers; the real backend will use UUIDs. No action needed, but code that does `===` comparisons on `_id` must use loose equality or string coercion.

### M4. `BudgetSettings` shape — SIGNIFICANT EXTENSION

The monorepo's `BudgetSettings` has additional fields not in the contract:
- `deletedCategories: string[]`
- `customTopCategories: string[]`
- `projectTasks: Record<string, string[]>`
- `customProjectCategories: string[]`
- `deletedProjectCategories: string[]`
- `disabledProjectCategories: string[]`

**Recommendation:** Add these to `data-models.md`. They are real features from the prototype. Do not drop them to match the contract — update the contract.

### M5. Built-in rules are richer than the contract implies — INFORMATIONAL

The monorepo ships 63 built-in rules with `matchType`, `priority`, and `enabled` flags. The contract treats built-in rules as "not CRUDable" read-only defaults. This is correct. However, the monorepo allows users to disable or override built-in rules via `overridesBuiltinId` on a custom rule — a feature not yet documented in the contracts.

**Recommendation:** Add a "Built-in rule overrides" section to `data-models.md` and `api-endpoints.md` explaining how `overridesBuiltinId` works.

### M6. `useBudgetStore` interface mismatch — SIGNIFICANT

The monorepo's Zustand store (`apps/web/stores/budget-tracker/use-budget-store.ts`) has a different action surface than the contract's `BudgetStore`:

| Contract action | Monorepo equivalent | Notes |
|---|---|---|
| `loadAll()` | `initialize()` | Same intent |
| `importTransactions(file)` | `addTransactions(transactions[])` | Monorepo expects pre-parsed array, not a File object — CSV parsing is upstream |
| `toggleBusinessFlag(id)` | Not present | Needs to be added |
| `learnRuleFromTransaction(id)` | Not present | Needs to be added |
| `setBudgetAmount(sub, amount, freq)` | `updateSettings()` with full settings object | Monorepo is coarse-grained |
| `exportBusinessCsv()` | Not present | Needs to be added |

**Recommendation:** Align the store interface to the contract. Adds are straightforward. `importTransactions(file)` — decide whether file parsing happens in the store action or upstream; the contract says "in the store action", which is the cleaner API.

### M7. `useAiStore` does not exist in the monorepo — MISSING

The contract defines a separate `useAiStore` for the AI review queue. The monorepo has no equivalent. The AI categorisation in the monorepo currently runs inline in the transactions tab component.

**Recommendation:** v0 creates `useAiStore` per the contract. Claude Code implements the real `AIService` that backs it. This is a gap in both repos.

### M8. Category tree subcategory differences — INFORMATIONAL

The monorepo's `categories.ts` has more granular subcategories than the contract's `DEFAULT_CATEGORIES`. For example:

- Monorepo "Eating-out & Entertainment" has: Coffee & tea, Lunches bought, Take-away & snacks, Drinks & alcohol, Restaurants, Bars & clubs, Movies shows & music, Books newspapers & magazines, Celebrations & gifts, Holidays
- Contract has: Restaurants & cafes, Take-away & snacks, Drinks & alcohol, Entertainment & events, Subscriptions, Hobbies, Holidays

The monorepo version is the authoritative one (derived from the working prototype in daily use). **The contract `data-models.md` `DEFAULT_CATEGORIES` should be updated to match the monorepo exactly.** Steve to confirm before Claude Code updates the contract.

---

## Open questions for Steve

These are decisions that weren't fully resolved in the prototype and need answers before Claude Code finalises the backend:

1. **Liz's access model** — will she log in with her own Cognito identity and share the `accountId` via the `members` list? Or is there a simpler starting point (e.g. single account, both share credentials) for v1?
2. **Data backup** — do you want automated DynamoDB backups to S3, or is point-in-time recovery sufficient?
3. **AI cost alerting** — at what threshold should you be emailed? ($2/day? $3/day?)
4. **Historical transaction limits** — is there a cutoff date beyond which old transactions shouldn't be imported? The current prototype imports everything.
5. **Audit log** — should every transaction edit be logged for later review, or is "last write wins" sufficient for a household app?
6. **Which CustomRule shape wins?** — monorepo's richer shape (with `matchType`, `priority`, `overridesBuiltinId`) or the contract's simpler shape? See M1 above.
7. **Which category tree is canonical?** — monorepo's granular subcategories or the contract's consolidated ones? See M8 above.

---

## Closing a gap

When a gap is addressed:

1. Mark it complete here by striking through or moving to a "Closed" section at the bottom
2. Add an entry to `changelog.md`
3. Sync the updated `/contracts` folder to the other repo
