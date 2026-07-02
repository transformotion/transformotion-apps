# Data Models

**Every type that crosses the UI/backend boundary lives here.** If you need a type that isn't documented, update this file first.

## Core entities

### Transaction

The atomic unit of the Budget Tracker. Every imported line item becomes a Transaction.

```typescript
interface Transaction {
  transactionId: string;          // UUID — assigned by DynamoDB on write; local imports use crypto.randomUUID()
  accountId: string;              // Household account ID (Cognito-derived)
  date: string;                   // DD/MM/YYYY — preserved for display
  amount: string;                 // String to preserve sign and decimals as imported
                                  // Negative = expense, positive = income/refund
  description: string;            // Original description from CSV
  categoryId: string | null;      // UUID — FK to category in budget-data table; null = uncategorised
  subcategoryId: string | null;   // UUID — FK to subcategory within categoryId; null = uncategorised
  file: string;                   // Source CSV filename
  _manual: boolean;               // User has manually set category — rules will not overwrite
  _business: boolean;             // Flagged as business expense — excluded from personal P&L

  // DEPRECATED — present during migration window; will be removed in a follow-up PR
  category?: string;
  subcategory?: string;
}
```

**Notes:**
- `categoryId` and `subcategoryId` are the canonical FK to the categories tree (stored in `budget-tracker.budget-data`).
- `subcategoryId` must reference a subcategory that belongs to the `categoryId` category (validated at write time by the Lambda).
- `null` values mean uncategorised.
- `amount` is deliberately a string. The prototype preserves the raw CSV value to avoid floating-point rounding issues and to support banks that use separate debit/credit columns. All arithmetic parses on read.
- `_manual: true` is a sticky flag. Once a user manually categorises a transaction, the rules engine will never overwrite it on subsequent imports.
- `_business: true` excludes the transaction from personal P&L calculations everywhere but keeps it visible in the transaction list with a 💼 badge.
- **Removed:** `_ignore` field. Cashflow exclusion is now expressed via the subcategory's `excludeFromCashflow` flag. Transactions tagged with a subcategory that has `excludeFromCashflow: true` are excluded from cashflow totals.

### Matching Rule

Heuristics that categorise transactions by description match. Formerly named CustomRule.

```typescript
interface MatchingRule {
  ruleId: string;                 // UUID
  accountId: string;              // Household account ID (Cognito-derived)
  name: string;                   // Display name for the rule (shown in Rules tab)
  match: string;                  // Keyword or regex string, applied case-insensitive
  matchType: 'contains' | 'startsWith' | 'regex';
  categoryId: string;             // UUID — FK to category in budget-data table
  subcategoryId: string;          // UUID — FK to subcategory within categoryId
  enabled: boolean;               // Disabled rules are skipped without being deleted
  priority: number;               // Lower number = higher priority; multiple matches: lowest priority wins
  isBusiness: boolean;            // Sets _business: true on matched transactions
  learned: boolean;               // true if created via "Learn" button; false if manually authored in Rules tab
  createdAt: string;              // ISO 8601
}
```

**Notes:**
- Rules are user-created only — the builtin rules concept has been removed. New accounts start with an empty rule set and learn rules organically via the AI Review tab.
- The rules engine applies rules sorted by `priority` ascending (lower = higher priority). First match wins.
- **Removed:** `isIgnore` field. A rule that previously had `isIgnore: true` now points to a subcategory with `excludeFromCashflow: true` (e.g., `Excluded Transactions` under Financial & Insurance).

### Category and Subcategory

The budget categorisation tree. Per-account, stored in `budget-tracker.budget-data`.

```typescript
interface Category {
  categoryId: string;             // UUID, account-scoped — stable forever (never changes after creation)
  name: string;                   // Display name
  type: 'regular' | 'capital';   // 'capital' = excluded from cashflow analysis; rendered in dedicated section
  displayOrder: number;           // Controls UI ordering (1-based, contiguous preferred)
  deleted?: boolean;              // Soft-delete — transactions referencing this category continue to display
  subcategories: Subcategory[];
}

interface Subcategory {
  subcategoryId: string;          // UUID, account-scoped — stable forever
  name: string;                   // Display name
  displayOrder: number;           // Controls ordering within parent category (1-based)
  deleted?: boolean;              // Soft-delete — transactions referencing this subcategory continue to display
  excludeFromCashflow?: boolean;  // When true, transactions in this subcategory are excluded from cashflow analysis
}
```

**Invariants:**
- Every category must have at least one subcategory. If a category is created with no subcategories, a default subcategory `"<Category name> subcategory"` is auto-created.
- Subcategories may only be soft-deleted (set `deleted: true`). Hard-deleting a subcategory that is referenced by existing transactions would corrupt display.
- `categoryId` and `subcategoryId` are UUIDs minted at account creation / migration time. They never change. They are account-scoped — the same category name across two accounts will have different UUIDs.
- `type: 'capital'` categories are excluded from cashflow analysis and rendered in a dedicated "Capital Expenditure" section on the Budget tab.
- `excludeFromCashflow: true` on a subcategory excludes all transactions in that subcategory from cashflow totals. The flag is independent of `deleted` — a soft-deleted subcategory still excludes its historical transactions. Typical subcategories with this flag: `Transfer` (own-account movements), `Excluded Transactions` (catch-all for items that should not appear in personal P&L).

### Budget Data

The budget domain for an account. Stored in `budget-tracker.budget-data`, one item per concept.

```typescript
interface BudgetData {
  categories: Category[];
  budgetAmounts: { [subcategoryId: string]: number };
  budgetFrequencies: {
    [subcategoryId: string]: 'weekly' | 'fortnightly' | 'monthly' | 'quarterly' | 'annually' | 'one-off'
  };
}
```

**Notes:**
- `budgetAmounts` and `budgetFrequencies` are keyed by `subcategoryId` (UUID). Category-level totals are derived by summing subcategory totals.
- A missing entry in `budgetAmounts` means the subcategory has no budget set (not $0).
- A missing entry in `budgetFrequencies` defaults to `'monthly'`.
- Capital category subcategories may use `'one-off'` frequency.

### Budget Settings

Per-account configuration narrowly scoped to user-facing app settings. Budget amounts and category structure live in `BudgetData` (above).

```typescript
interface BudgetSettings {
  csvFormatMappings: { [fingerprint: string]: CSVMapping };  // remembered CSV column mappings per bank
  aiReviewBatchSize?: number;                                // transactions per AI batch (1–20, default 5)
  aiReviewParallelLimit?: number;                            // max concurrent batches (1–10, default 4)
  aiReviewConfidenceThreshold?: 'low' | 'medium';           // Pass 2 triggers below this confidence (default 'low')
}

interface CSVMapping {
  fingerprint: string;            // columnCount + hash of header names
  dateColumn: number;
  descriptionColumn: number;
  amountColumn?: number;          // Single amount column (signed)
  debitColumn?: number;           // OR separate debit column
  creditColumn?: number;          // OR separate credit column
  dateFormat: string;             // e.g. "DD/MM/YYYY", "YYYY-MM-DD"
  hasHeader: boolean;
  confirmedAt: string;            // ISO 8601 — when user confirmed this mapping
}
```

### Account

The shared household container. Steve and Liz share one `accountId`, not one per user.

```typescript
interface Account {
  accountId: string;              // UUID
  name: string;                   // Household name
  members: AccountMember[];
  createdAt: string;
}

interface AccountMember {
  userId: string;                 // Cognito sub claim
  role: "owner" | "member";
  email: string;
  joinedAt: string;
}
```

## Exclusion rules (CRITICAL — apply everywhere)

A transaction is **excluded from cashflow analysis** if ANY of these are true:

1. `_business === true` (business expense — tracked separately in the Business view)
2. The transaction's `subcategoryId` resolves to a subcategory with `excludeFromCashflow === true` (e.g., Transfer, Excluded Transactions)
3. The transaction's `categoryId` resolves to a category with `type === 'capital'` (Renovations, Capital Purchases — tracked against lump-sum budgets)

The canonical helper is `excludeFromCashflow(categories, subcategoryId): boolean` in `apps/budget-tracker/lib/categories/index.ts`. Use it everywhere — do not inline the check.

These exclusions must be applied **consistently** across:
- Summary tab totals (income, expenses, net position)
- Category card totals
- Subcategory totals
- Cashflow trend chart
- Cashflow category bar chart
- Budget deficit/surplus card
- Sankey diagram

Excluded transactions are **still visible** in the Transactions tab (select the "Excluded" filter chip) and in the dedicated Capital Expenditure and Business Expenses views.

## AI response schemas

### AI Review response (HTTP — initial acknowledgement)

```typescript
interface AiReviewResponse {
  jobId: string;                  // UUID — poll or subscribe via WebSocket for results
}
```

### AI Review WebSocket messages (pushed from server to client)

```typescript
// Sent immediately after $connect succeeds — client uses this connectionId in the HTTP review call
interface WsMessageConnected {
  type: 'connected';
  connectionId: string;
}

// Sent after each parallel batch of categorised transactions completes
interface WsMessageBatchResult {
  type: 'batch_result';
  jobId: string;
  pass: 1 | 2;                   // 1 = fast pass (no webSearch); 2 = enriched pass (webSearch)
  results: Array<{
    index: number;
    categoryId: string;           // UUID from the account's category tree
    subcategoryId: string;        // UUID from the account's category tree
    reason: string;               // 1-sentence explanation for the user
    confidence: 'high' | 'medium' | 'low';
  }>;
  completedCount: number;         // cumulative transactions processed so far
  totalCount: number;             // total transactions in this job
}

// Sent when all passes are complete
interface WsMessageComplete {
  type: 'complete';
  jobId: string;
}

// Sent if the worker encounters a fatal error
interface WsMessageError {
  type: 'error';
  jobId: string;
  message: string;
}
```

### CSV format analysis response

```typescript
interface AiCsvAnalysisResponse {
  dateColumn: number;
  descriptionColumn: number;
  amountColumn?: number;
  debitColumn?: number;
  creditColumn?: number;
  dateFormat: string;             // One of: "DD/MM/YYYY", "MM/DD/YYYY", "YYYY-MM-DD", etc.
  hasHeader: boolean;
  confidence: "high" | "medium" | "low";
  notes: string;                  // Human-readable explanation for the confirmation UI
}
```

## Repository interfaces

These are the canonical interfaces implemented by both local (localStorage) and remote (DynamoDB-via-Lambda) backends.

### TransactionRepository

```typescript
interface TransactionRepository {
  findAll(accountId: string): Promise<Transaction[]>;
  findById(accountId: string, id: string): Promise<Transaction | null>;
  upsertBulk(transactions: Transaction[]): Promise<Transaction[]>;
  update(id: string, accountId: string, updates: Partial<Transaction>): Promise<Transaction>;
  delete(id: string, accountId: string): Promise<void>;
}
```

### MatchingRulesRepository

(Formerly CustomRulesRepository.)

```typescript
interface MatchingRulesRepository {
  findAll(accountId: string): Promise<MatchingRule[]>;
  findById(accountId: string, id: string): Promise<MatchingRule | null>;
  save(rule: MatchingRule): Promise<MatchingRule>;
  delete(id: string, accountId: string): Promise<void>;
}
```

### BudgetDataRepository

```typescript
interface BudgetDataRepository {
  get(accountId: string): Promise<BudgetData>;
  patch(accountId: string, partial: Partial<BudgetData>): Promise<BudgetData>;
}
```

### SettingsRepository

```typescript
interface SettingsRepository {
  get(accountId: string): Promise<BudgetSettings>;
  patch(accountId: string, updates: Partial<BudgetSettings>): Promise<BudgetSettings>;
}
```

**Notes:**
- All interfaces are parameterised by `accountId` to enforce tenant isolation at the data access layer.
- Local implementations ignore `accountId` (single-tenant localStorage); remote implementations scope all DynamoDB operations to it.
- `upsertBulk` on the transaction side is the CSV import path — it accepts an array and returns the persisted array. Local implementation performs in-memory deduplication.

## Default category tree (coded constant for future account creation)

Defined in `packages/budget-domain/src/defaults.ts`. Used by future account creation flows to seed new accounts — NOT used by Steve's data migration (which builds the tree from his live settings export).

```typescript
interface CategoryTemplate {
  name: string;
  type: 'regular' | 'capital';
  subcategories: { name: string }[];
}

// See packages/budget-domain/src/defaults.ts for the full list
const DEFAULT_CATEGORY_TEMPLATES: CategoryTemplate[] = [
  { name: 'Income', type: 'regular', subcategories: [...] },
  { name: 'Home & utilities', type: 'regular', subcategories: [...] },
  // ...
  { name: 'Renovations', type: 'capital', subcategories: [...] },
  { name: 'Capital Purchases', type: 'capital', subcategories: [{ name: 'New Car' }] },
]
```

## Type safety requirements

- All contract types must live in a shared TypeScript file: `packages/budget-domain/src/contracts.ts` (Claude Code repo)
- Neither v0 nor Claude Code may extend these types without updating this document first
- Optional fields are marked with `?`; nullable with `| null`. Do not confuse them.
- Every endpoint and adaptor method must reference these types by name — no inline duplication.
