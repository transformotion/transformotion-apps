# State Management

**How the Budget Tracker UI stores and retrieves data.** v0 defines the interfaces and writes in-memory/localStorage stubs. Claude Code writes the real adaptors against the same interfaces.

## The adaptor pattern (recap)

```
UI Component
    ↓
Zustand store
    ↓
Adaptor interface  ← defined here, shared by both implementations
    ↓
┌─────────────────────────────────────┐
│ v0 stub              Claude Code    │
│ (in-memory or        real impl      │
│  localStorage)       (Lambda/DDB)   │
└─────────────────────────────────────┘
```

Neither implementation is "better" — they serve different purposes. The stub makes the UI work standalone during design; the real adaptor makes it work in production.

## Folder structure (both repos)

```
/lib/services/
  ├── budget/
  │   ├── index.ts                 ← re-exports interfaces + picker
  │   ├── types.ts                 ← interface definitions
  │   ├── stub-adaptor.ts          ← v0's stub (in-memory + localStorage)
  │   └── aws-adaptor.ts           ← Claude Code's real impl (absent in v0 repo)
  ├── ai/
  │   ├── index.ts
  │   ├── types.ts
  │   ├── stub-adaptor.ts          ← returns canned responses
  │   └── claude-proxy.ts          ← real impl calls Lambda
  └── auth/
      ├── index.ts
      ├── types.ts
      ├── stub-adaptor.ts          ← hardcoded test user
      └── cognito-adaptor.ts       ← real impl
```

The `index.ts` exports a single `getBudgetService()` (etc.) that returns the configured adaptor based on an environment variable. v0's repo always uses the stub; Claude Code's repo uses the real adaptor for production builds.

## Adaptor interfaces

### BudgetRepository

```typescript
interface BudgetRepository {
  // Transactions
  listTransactions(filters?: {
    from?: string;
    to?: string;
    limit?: number;
    cursor?: string;
  }): Promise<{ transactions: Transaction[]; nextCursor?: string }>;

  bulkUpsertTransactions(transactions: Omit<Transaction, "accountId">[]):
    Promise<{ created: number; updated: number; skipped: number; transactions: Transaction[] }>;

  updateTransaction(id: number | string, patch: Partial<Transaction>):
    Promise<Transaction>;

  deleteTransaction(id: number | string): Promise<void>;

  // Rules
  listRules(): Promise<CustomRule[]>;
  createRule(rule: Omit<CustomRule, "id" | "accountId" | "createdAt">): Promise<CustomRule>;
  updateRule(id: string, patch: Partial<CustomRule>): Promise<CustomRule>;
  deleteRule(id: string): Promise<void>;

  // Settings
  getSettings(): Promise<BudgetSettings>;
  updateSettings(patch: Partial<BudgetSettings>): Promise<BudgetSettings>;

  // Business export
  generateBusinessExportCsv(filters?: { from?: string; to?: string }): Promise<Blob>;

  // Migration — calls POST /api/migrations/budget-tracker/transactions/import
  // (MigrationsApi stack, not BudgetTrackerApi). UI adaptor update tracked in #180.
  migrateFromLocalStorage(data: {
    transactions: Transaction[];
    rules: CustomRule[];
    settings: Partial<BudgetSettings>;
  }): Promise<{ migrated: object; alreadyPresent: object }>;
}
```

### AIService

```typescript
interface AIService {
  categoriseTransactions(input: {
    transactions: Array<{ index: number; description: string; amount: string }>;
    categories: CategoryTree;
  }): Promise<AiCategoriseResponse>;

  reviewTransactions(input: {
    transactions: Array<{ index: number; description: string; amount: string }>;
    categories: CategoryTree;
    onBatch?: (batchResults: AiReviewResponse["results"]) => void;  // streaming callback
  }): Promise<AiReviewResponse>;

  analyseCsvFormat(input: {
    sampleRows: string[][];
    possibleHeaders?: string[];
  }): Promise<AiCsvAnalysisResponse>;
}
```

### AuthService

```typescript
interface AuthService {
  getCurrentUser(): Promise<{ userId: string; email: string; accountId: string; groups: string[] } | null>;
  signIn(): Promise<void>;         // Real impl triggers Cognito Hosted UI
  signOut(): Promise<void>;
  getIdToken(): Promise<string | null>;
}
```

## Stub implementation rules (v0)

The stub adaptors must:

1. **Persist to localStorage** so data survives page reloads (critical for design review)
2. **Use the same storage keys** as the prototype — see "Storage keys" below
3. **Simulate async** — every method returns a Promise, even if data is instant
4. **Simulate AI calls** — return canned categorisation for a fixed seed dataset, or use a simple keyword match against the built-in rules
5. **NOT call any external service** — no fetch, no API calls. The stub is fully offline.

The stub's job is to make the UI feel real during design. It does not need to be production-quality.

## Real implementation rules (Claude Code)

The real adaptors must:

1. **Call the documented endpoints** in `api-endpoints.md` — nothing else
2. **Include the Cognito JWT** on every request as `Authorization: Bearer <token>`
3. **Handle 401** by redirecting to sign-in
4. **Handle 429** by showing a user-friendly rate limit message
5. **Cache with TTL** where documented — no implicit caching elsewhere
6. **Never modify the interface** without updating `/contracts/state-management.md` first

## Zustand stores

The UI uses three Zustand stores. Each store **depends only on its adaptor interface**, not on specific implementations.

### useBudgetStore

```typescript
interface BudgetStore {
  // State
  transactions: Transaction[];
  rules: CustomRule[];
  settings: BudgetSettings;
  loading: boolean;
  error: string | null;

  // Actions
  loadAll: () => Promise<void>;
  importTransactions: (file: File) => Promise<void>;
  updateTransaction: (id: number | string, patch: Partial<Transaction>) => Promise<void>;
  toggleBusinessFlag: (id: number | string) => Promise<void>;
  learnRuleFromTransaction: (id: number | string) => Promise<void>;
  setBudgetAmount: (subcategory: string, amount: number, freq: Frequency) => Promise<void>;
  setProjectBudget: (category: string, lumpSum: number) => Promise<void>;
  exportBusinessCsv: (filters?: { from?: string; to?: string }) => Promise<Blob>;
}
```

### useAiStore

```typescript
interface AiStore {
  // State
  reviewQueue: Array<{
    transactionId: number | string;
    suggestion: { category: string; subcategory: string; reason: string };
    status: "pending" | "confirmed" | "rejected" | "overridden";
  }>;
  reviewStatus: "idle" | "running" | "done" | "failed";
  csvAnalysis: AiCsvAnalysisResponse | null;

  // Actions
  startAiReview: () => Promise<void>;
  confirmSuggestion: (transactionId: number | string) => void;
  rejectSuggestion: (transactionId: number | string) => void;
  overrideSuggestion: (transactionId: number | string, category: string, subcategory: string) => void;
  applyAllConfirmed: () => Promise<void>;
  analyseCsv: (rows: string[][]) => Promise<void>;
}
```

### useAuthStore

```typescript
interface AuthStore {
  user: { userId: string; email: string; accountId: string; groups: string[] } | null;
  loading: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
}
```

## Storage keys (browser localStorage — stub only)

All keys prefixed `budget-tracker.` to namespace against other apps on the same domain.

| Key | Value |
|---|---|
| `budget-tracker.transactions` | `Transaction[]` |
| `budget-tracker.customRules` | `CustomRule[]` |
| `budget-tracker.budgetOverrides` | `{[sub: string]: number}` |
| `budget-tracker.budgetFreqs` | `{[sub: string]: Frequency}` |
| `budget-tracker.customCategories` | `{[cat: string]: string[]}` |
| `budget-tracker.projectBudgets` | `{[cat: string]: number}` |
| `budget-tracker.deletedSubs` | `string[]` |
| `budget-tracker.csvFormatMappings` | `{[fingerprint: string]: CSVMapping}` |
| `budget-tracker.accountId` | `string` (local dev — real impl derives from JWT) |

**Debounced writes:** Transaction saves debounce to 800ms. Only 8 fields persisted: `_id, date, amount, description, category, subcategory, file, _manual`. (Note: `_business` is deliberately persisted separately in the prototype; real impl persists it normally.)

## Load order on app init

1. Load auth — determine `accountId`
2. Load settings (small payload, needed for UI to render category options)
3. Load rules (needed before transactions so rules engine can run on re-process)
4. Load transactions (largest payload, can stream/paginate)
5. Run rules engine on any transactions with `_manual: false`

**Critical ordering rule:** Never re-run rules before custom rules are loaded. The prototype had a bug where rules ran on load before custom rules arrived, clearing valid categorisations. The load order above prevents this.

## Cache policies (real impl only)

| Data | Cache duration | Cache key |
|---|---|---|
| AI categorisation results | Not cached — each call is unique | — |
| AI review results | Not cached | — |
| CSV format mappings | Stored indefinitely in `csvFormatMappings` | fingerprint |
| User's current auth state | Until JWT expiry | `accountId` |

## Rules engine behaviour (shared logic)

The rules engine runs on the client (v0 stub) and optionally on the server during bulk import (Claude Code real impl — as an optimisation). The logic is identical.

```typescript
function categoriseTransaction(
  transaction: Transaction,
  customRules: CustomRule[],
  builtinRules: BuiltinRule[]
): { category: string; subcategory: string; matchedRule: string | null } {
  if (transaction._manual) {
    return {
      category: transaction.category,
      subcategory: transaction.subcategory,
      matchedRule: null
    };
  }

  // Custom rules first, most recent wins
  for (const rule of [...customRules].reverse()) {
    if (matches(transaction.description, rule.match)) {
      return { category: rule.category, subcategory: rule.subcategory, matchedRule: rule.id };
    }
  }

  // Built-in rules
  for (const rule of builtinRules) {
    if (rule.match.test(transaction.description)) {
      return { category: rule.category, subcategory: rule.subcategory, matchedRule: "builtin" };
    }
  }

  return { category: "", subcategory: "", matchedRule: null };
}
```

`matches()` performs a case-insensitive keyword OR regex test on the description.

## What goes where — quick reference

| Responsibility | Lives in |
|---|---|
| UI rendering | Component |
| Local reactive state | Zustand store |
| Async data loading | Store action → adaptor |
| Data persistence | Adaptor (stub or real) |
| Validation | Adaptor (server-side in real impl) |
| Business rules (exclusions, calcs) | Domain layer — shared pure functions in `/lib/domain/` |
| AI prompts | `ai-prompts.md` + `claude-proxy.ts` |
