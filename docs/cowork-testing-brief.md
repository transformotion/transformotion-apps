# Claude Cowork Testing Brief — Budget Tracker

## 1. Development Plan

### Scope
Migrating the Budget Tracker from a localStorage-based single-page prototype (v0, Next.js in `transformotion-apps-b8`) to a production cloud application on AWS (monorepo at `transformotion-apps`).

### Goals
- Replace localStorage with DynamoDB-backed REST APIs (Lambda + API Gateway)
- Introduce a proper layered architecture: UI → hooks → repositories → Lambda → DynamoDB
- Preserve all existing features: transaction management, categorisation, budget vs actual, cashflow, recommendations
- Support multi-account, multi-user access via Cognito authentication

### Tech Stack
| Layer | Technology |
|---|---|
| Frontend | Next.js 14, React, TypeScript, TailwindCSS, shadcn/ui |
| State management | Zustand (`use-budget-store.ts`) |
| Data fetching | Custom React hooks (`use-transactions.ts`, `use-settings.ts`, etc.) |
| Repository layer | TypeScript classes in `lib/repositories/budget-tracker/` |
| Lambda functions | Node.js 22, TypeScript, `@transformotion/lambda-middleware` |
| Database | DynamoDB (three tables: Transactions, Rules, Settings) |
| Auth | AWS Cognito via `withAuth()` middleware |
| Domain logic | `@transformotion/budget-domain` package (shared between Lambda and tests) |
| Build | Turborepo + pnpm workspaces |
| Infra | AWS CDK (`infrastructure/`) |

### Key Milestones Completed
- S1: Core infrastructure (DynamoDB, Lambda, API Gateway, CDK)
- S2: Transaction CRUD, CSV import, classification engine
- S2.7: Migrate endpoint (`/api/budget/v1/migrate-from-localstorage`)
- S3 (in progress): Budget vs Actual, Cashflow, Recommendations tabs

---

## 2. Architecture Description

### Components

```
transformotion-apps/
├── apps/stock-analyser/                  ← Next.js frontend
│   ├── components/budget-tracker/        ← React UI components
│   │   ├── app-shell.tsx                 ← Root layout, context provider
│   │   ├── tabs/                         ← Tab panels (transactions, budget, cashflow, etc.)
│   │   └── data/types.ts                 ← FRONTEND CONTRACT (source of truth for UI layer)
│   ├── lib/
│   │   ├── hooks/budget-tracker/         ← Data-fetching hooks (useTransactions, useSettings, etc.)
│   │   └── repositories/budget-tracker/  ← HTTP clients wrapping Lambda API calls
│   └── stores/budget-tracker/
│       └── use-budget-store.ts           ← Zustand global state
│
├── apps/budget-tracker/functions/        ← Lambda handlers
│   ├── budget-transactions/              ← GET/POST/PUT/DELETE /api/budget/v1/transactions
│   ├── budget-rules/                     ← GET/POST/PUT/DELETE /api/budget/v1/rules
│   ├── budget-settings/                  ← GET/PUT /api/budget/v1/settings
│   └── budget-migrate/                   ← POST /api/budget/v1/migrate-from-localstorage
│
└── packages/budget-domain/               ← Shared domain logic (no AWS deps)
    └── src/
        ├── contracts.ts                  ← BACKEND CONTRACT (Transaction, BudgetSettings, etc.)
        ├── budget-tracking.ts            ← buildBudgetVsActual()
        ├── cashflow.ts                   ← buildMonthlyTrend(), buildCategoryBarData()
        ├── category-tree.ts              ← buildEffectiveCategories()
        ├── exclusions.ts                 ← isExcludedFromCashflow()
        └── __tests__/                    ← Vitest unit tests with real export data
```

### Data Flow
```
User action
  → React component (tabs/)
  → Zustand store action (use-budget-store.ts)
  → Repository method (lib/repositories/budget-tracker/)
  → HTTP fetch → API Gateway → Lambda handler
  → DynamoDB read/write
  → Response mapped back through repository
  → Store updated → UI re-renders
```

### DynamoDB Tables
| Table | Partition Key | Sort Key | Notes |
|---|---|---|---|
| Transactions | `accountId` | `transactionId` (UUID) | `dateIso` GSI for date queries |
| Rules | `accountId` | `ruleId` (UUID) | |
| Settings | `accountId` | `settingKey` (string) | One item per setting field |

---

## 3. Layering Contracts

### Layer Responsibilities

#### UI Layer (`components/budget-tracker/`)
- Renders state from Zustand store
- Calls store actions (never calls repositories directly)
- Types: uses `Transaction`, `BudgetSettings`, `CustomRule` from `data/types.ts`
- **Must not** contain business logic (sorting, filtering, aggregation belong in domain package or hooks)

#### State Layer (`stores/budget-tracker/use-budget-store.ts`)
- Single source of truth for in-memory budget state
- Calls repository methods to sync with backend
- Exposes typed actions: `addTransaction`, `updateTransaction(id: string, ...)`, `deleteTransaction(id: string)`, etc.
- **Must not** call APIs directly (delegates to repositories)

#### Repository Layer (`lib/repositories/budget-tracker/`)
- Wraps all HTTP calls to Lambda endpoints
- Maps API responses to frontend types (from `data/types.ts`)
- Each repository owns one resource: `TransactionRepository`, `RulesRepository`, `SettingsRepository`
- **Must not** import from `components/` (no circular deps)
- Types defined locally must be **identical** to `data/types.ts` (tracked as R14 — future refactor to `lib/types/budget-tracker.ts`)

#### Lambda Layer (`apps/budget-tracker/functions/`)
- Each function handles one resource via `withAuth()` middleware
- Reads `accountId` from the authenticated JWT claim
- Uses `@transformotion/lambda-middleware` for auth, body parsing, response formatting
- **Must not** contain domain/business logic (delegate to `budget-domain` package)

#### Domain Package (`packages/budget-domain/`)
- Pure TypeScript, no AWS dependencies
- Canonical backend types in `contracts.ts`
- Testable in isolation via Vitest
- Exported via `@transformotion/budget-domain`

### The Contract (`contracts/budget-tracker/data-models.md`)
This file is the single canonical definition of all shared types. It is mirrored in:
- `contracts/budget-tracker/data-models.md` (monorepo)
- `contracts/budget-tracker/data-models.md` (monorepo canonical; moved from `apps/budget-tracker/contracts/` by M7 #301)
- `transformotion-apps-b8/contracts/data-models.md` (v0 prototype reference)

**All layers must comply with the contract. When the contract changes, ALL layers must be updated.**

### Current Contract Version: v1.1
Key types:

```typescript
interface Transaction {
  _id: string          // UUID — assigned by DynamoDB; crypto.randomUUID() for local imports
  accountId: string
  date: string         // DD/MM/YYYY
  amount: string       // Negative = expense, positive = income/refund
  description: string
  category: string | ""
  subcategory: string | ""
  file: string
  _manual: boolean
  _business: boolean
}

interface BudgetSettings {
  accountId: string
  budgetOverrides: Record<string, number>       // -1 = tombstoned
  budgetFreqs: Record<string, Frequency>
  customCategories: Record<string, string[]>
  deletedSubs: string[]
  projectBudgets: Record<string, number>
  projectTasks: Record<string, string[]>
  customTopCategories: string[]
  customProjectCategories: string[]
  deletedCategories: string[]
  deletedProjectCategories: string[]
  disabledProjectCategories: string[]
  csvFormatMappings?: Record<string, CSVMapping>
}

interface CustomRule {
  id: string
  accountId: string
  match: string        // keyword or regex, case-insensitive
  category: string
  subcategory: string
  learned: boolean
  createdAt: string    // ISO 8601
}

interface BuiltinRule {
  match: RegExp
  category: string
  subcategory: string
}
```

---

## 4. Functional Decomposition

### 4.1 Transaction Management
| Function | Location | Behaviour |
|---|---|---|
| List transactions | `GET /api/budget/v1/transactions` | Returns all transactions for account, sorted by `dateIso` desc |
| Add transaction | `POST /api/budget/v1/transactions` | Writes item; assigns `transactionId: randomUUID()`, `dateIso` |
| Update transaction | `PUT /api/budget/v1/transactions/{id}` | Partial update by `transactionId` |
| Delete transaction | `DELETE /api/budget/v1/transactions/{id}` | Hard delete by `transactionId` |
| CSV import | UI in `transactions-tab.tsx` | Parses CSV, assigns `_id: crypto.randomUUID()`, POST batch |
| Classification | `review-tab.tsx` + `use-claude.ts` | Sends uncategorised transactions to Claude; returns `{category, subcategory}` per transaction |
| Business toggle | `toggleBusiness(id: string)` in store | Sets `_business: true/false`, calls PUT |

### 4.2 Data Migration
| Function | Location | Behaviour |
|---|---|---|
| Migrate from localStorage | `POST /api/budget/v1/migrate-from-localstorage` | Accepts full localStorage export; deduplicates by natural key `date|amount|description|file`; strips legacy `_id`; writes transactions + rules + all 12 settings keys |
| Transform `_ignore` transactions | `transformTransaction()` in `budget-migrate/index.ts` | Re-categorises `_ignore` → `Financial & Insurance / Transfer` |
| Transform settings | `transformSettings()` in `budget-migrate/index.ts` | Renames `Financial & Insurance` project budget key → `New Car` |

### 4.3 Budget vs Actual
| Function | Location | Behaviour |
|---|---|---|
| `buildBudgetVsActual()` | `budget-domain/budget-tracking.ts` | Aggregates transactions by category; computes monthly budget, actual, variance |
| `getSubcategoryMonthlyBudget()` | `budget-domain/budget-tracking.ts` | Looks up default budget; applies override and frequency factor |
| `toMonthlyAmount()` | `budget-domain/budget-tracking.ts` | Converts weekly/fortnightly/quarterly/annually to monthly equivalent |
| `buildEffectiveCategories()` | `budget-domain/category-tree.ts` | Merges builtin category tree with user customisations (adds/deletes/renames) |

### 4.4 Cashflow
| Function | Location | Behaviour |
|---|---|---|
| `buildMonthlyTrend()` | `budget-domain/cashflow.ts` | Groups transactions by month; computes income, expenses, net per month |
| `buildCategoryBarData()` | `budget-domain/cashflow.ts` | Aggregates actual spend per top-level category for bar chart |
| `isExcludedFromCashflow()` | `budget-domain/exclusions.ts` | Returns true for: Transfer subcategory, `_business` transactions, project categories, Capital purchases |

### 4.5 Category Management
| Function | Location | Behaviour |
|---|---|---|
| Custom categories | Settings in `BudgetSettings.customCategories` | User can add subcategories to any top-level category |
| Custom top categories | `customTopCategories` | User-created recurring top-level categories |
| Custom project categories | `customProjectCategories` | User-created project (lump-sum budget) categories |
| Deleted subcategories | `deletedSubs` | Tombstoned via `budgetOverrides[sub] = -1`; excluded from budget display |
| Deleted categories | `deletedCategories` | Top-level categories hidden from Budget tab |
| Disabled project categories | `disabledProjectCategories` | Completed projects — hidden from dropdowns but visible in Budget tab |

### 4.6 Settings Persistence
| Function | Location | Behaviour |
|---|---|---|
| Load settings | `GET /api/budget/v1/settings` | Queries all `settingKey` items for account; merges into `BudgetSettings` object |
| Save setting | `PUT /api/budget/v1/settings/{key}` | Upserts one `{accountId, settingKey, value}` item |
| Default settings | `DEFAULT_SETTINGS` in `settings-repository.ts` and `use-budget-store.ts` | All fields initialised to empty collections; used when backend returns no data |

### 4.7 Rules Engine
| Function | Location | Behaviour |
|---|---|---|
| List rules | `GET /api/budget/v1/rules` | Returns all custom rules for account |
| Add rule | `POST /api/budget/v1/rules` | Assigns `ruleId: randomUUID()`, `createdAt: ISO` |
| Delete rule | `DELETE /api/budget/v1/rules/{id}` | Hard delete |
| Apply rules | Classification logic (review tab / Lambda) | Builtin rules matched first; custom rules by `match` keyword (case-insensitive contains) |

### 4.8 AI Classification
| Function | Location | Behaviour |
|---|---|---|
| Batch classify | `use-claude.ts` → `POST /api/claude/job` | Sends uncategorised transactions; Claude returns `{index, category, subcategory}[]` |
| AI review | `review-tab.tsx` | Shows AI suggestions with reason; user accepts/rejects/edits each |
| JSON enforcement | System prompt + user prompt tail | Both must include explicit JSON-only instruction to prevent prose preamble |
| Poll for result | `pollForResult()` in `use-claude.ts` | Polls job status; throws `__jobError` (not retried) on JSON parse failure |

---

## Testing Notes for Claude Cowork

### Test Data
Real export fixture at:
```
migration-artifacts/budget-tracker/budget-tracker-export-2026-04-18.json
```
Contains: 726 transactions (3 months), real budget overrides, custom categories, all settings fields.

### Running Domain Tests
```bash
cd packages/budget-domain
pnpm test
```

### Key Invariants to Test
1. `Transaction._id` is always a string (UUID format)
2. `buildBudgetVsActual()` returns `numMonths` matching the span of the transaction date range
3. `isExcludedFromCashflow()` always excludes Transfer, _business, and project categories
4. `buildMonthlyTrend()` months are in ascending order
5. `buildMonthlyTrend()` net = income - expenses (exact equality)
6. Migration endpoint strips legacy `_id` before writing to DynamoDB
7. All 12 `SETTING_KEYS` are persisted by the migration Lambda
8. `getSubcategoryMonthlyBudget()` returns 0 for tombstoned subcategories (override = -1)
