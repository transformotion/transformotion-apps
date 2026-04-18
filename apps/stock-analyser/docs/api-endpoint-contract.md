# API Endpoint Contract

**Status**: The frontend currently uses localStorage for all data persistence. These endpoints define the contract for Lambda functions that will replace localStorage when migrating to AWS.

**Base URL**: `https://api.transformotion.com` (future)

**Authentication**: All endpoints require `Authorization: Bearer <id_token>` header (OIDC-compliant JWT from Cognito)

**API Key**: All endpoints require `x-api-key: <api_key>` header for Lambda authorization

---

## Auth Endpoints

### POST /auth/login
Sign in with email/password (delegates to Cognito)

**Request Body:**
```typescript
{
  email: string
  password: string
}
```

**Response:**
```typescript
{
  user: {
    id: string
    email: string
    name: string
    accounts: Array<{
      id: string
      name: string
      type: "Personal" | "Household" | "Business"
    }>
    activeAccountId: string
  }
  tokens: {
    accessToken: string
    idToken: string
    refreshToken: string
    expiresIn: number
  }
}
```

**Called by:** `lib/services/auth/mock-auth.ts` (future: `cognito-auth.ts`)

---

### POST /auth/refresh
Refresh expired tokens

**Request Body:**
```typescript
{
  refreshToken: string
}
```

**Response:**
```typescript
{
  accessToken: string
  idToken: string
  expiresIn: number
}
```

**Called by:** `lib/api/client.ts` (automatic token refresh)

---

### POST /auth/logout
Sign out and invalidate tokens

**Request Body:**
```typescript
{
  refreshToken: string
}
```

**Response:** `204 No Content`

**Called by:** `stores/auth/use-auth-store.ts` → `signOut()`

---

### GET /auth/user
Get current user profile

**Response:**
```typescript
{
  id: string
  email: string
  name: string
  accounts: Array<{
    id: string
    name: string
    type: "Personal" | "Household" | "Business"
  }>
  activeAccountId: string
}
```

**Called by:** `stores/auth/use-auth-store.ts` → `initialize()`

---

### PUT /auth/user/active-account
Switch active account

**Request Body:**
```typescript
{
  accountId: string
}
```

**Response:**
```typescript
{
  activeAccountId: string
}
```

**Called by:** `components/budget-tracker/app-shell.tsx` → `switchAccount()`
**Called by:** `components/stock-signal/app-shell.tsx` → `switchAccount()`

---

## Budget Tracker Endpoints

### GET /budget/transactions
List all transactions for the active account

**Query Parameters:**
- `limit?: number` (default: 1000)
- `offset?: number` (default: 0)
- `startDate?: string` (ISO date)
- `endDate?: string` (ISO date)
- `category?: string`
- `uncategorizedOnly?: boolean`

**Response:**
```typescript
{
  data: Array<{
    _id: number
    date: string           // ISO date
    description: string
    amount: number
    category?: string
    subcategory?: string
    _manual?: boolean
    _business?: boolean
    file?: string          // source filename
  }>
  total: number
  hasMore: boolean
}
```

**Called by:** `components/budget-tracker/app-shell.tsx` → `BudgetNavigationProvider` (initial load)

---

### POST /budget/transactions
Create new transactions (bulk import)

**Request Body:**
```typescript
{
  transactions: Array<{
    date: string
    description: string
    amount: number
    category?: string
    subcategory?: string
    _manual?: boolean
    _business?: boolean
    file?: string
  }>
}
```

**Response:**
```typescript
{
  created: Array<{
    _id: number
    date: string
    description: string
    amount: number
    category?: string
    subcategory?: string
    _manual?: boolean
    _business?: boolean
    file?: string
  }>
  duplicatesSkipped: number
}
```

**Called by:** `components/budget-tracker/tabs/transactions-tab.tsx` → `CSVImportModal` → `importTransactions()`

---

### PUT /budget/transactions/:id
Update a single transaction

**Request Body:**
```typescript
{
  category?: string
  subcategory?: string
  _business?: boolean
  _manual?: boolean
}
```

**Response:**
```typescript
{
  _id: number
  date: string
  description: string
  amount: number
  category?: string
  subcategory?: string
  _manual?: boolean
  _business?: boolean
  file?: string
}
```

**Called by:** `components/budget-tracker/tabs/transactions-tab.tsx` → `TransactionRow` → `onSave()`

---

### DELETE /budget/transactions/:id
Delete a single transaction

**Response:** `204 No Content`

**Called by:** `components/budget-tracker/app-shell.tsx` → `deleteTransaction()`

---

### GET /budget/rules/custom
List all custom categorization rules

**Response:**
```typescript
{
  data: Array<{
    id: string
    pattern: string
    matchType: "contains" | "startsWith" | "regex"
    category: string
    subcategory: string
    isIgnore?: boolean
    createdAt: string
    updatedAt: string
  }>
}
```

**Called by:** `components/budget-tracker/app-shell.tsx` → `BudgetNavigationProvider` (initial load)

---

### POST /budget/rules/custom
Create a new custom rule

**Request Body:**
```typescript
{
  pattern: string
  matchType: "contains" | "startsWith" | "regex"
  category: string
  subcategory: string
  isIgnore?: boolean
}
```

**Response:**
```typescript
{
  id: string
  pattern: string
  matchType: "contains" | "startsWith" | "regex"
  category: string
  subcategory: string
  isIgnore?: boolean
  createdAt: string
  updatedAt: string
}
```

**Called by:** `components/budget-tracker/tabs/rules-tab.tsx` → `saveNewRule()`
**Called by:** `components/budget-tracker/tabs/transactions-tab.tsx` → `saveAndLearn()`

---

### PUT /budget/rules/custom/:id
Update a custom rule

**Request Body:**
```typescript
{
  pattern?: string
  matchType?: "contains" | "startsWith" | "regex"
  category?: string
  subcategory?: string
  isIgnore?: boolean
}
```

**Response:**
```typescript
{
  id: string
  pattern: string
  matchType: "contains" | "startsWith" | "regex"
  category: string
  subcategory: string
  isIgnore?: boolean
  createdAt: string
  updatedAt: string
}
```

**Called by:** `components/budget-tracker/tabs/rules-tab.tsx` → `updateRule()`

---

### DELETE /budget/rules/custom/:id
Delete a custom rule

**Response:** `204 No Content`

**Called by:** `components/budget-tracker/tabs/rules-tab.tsx` → `deleteRule()`

---

### GET /budget/rules/builtin
List all built-in rules with user overrides applied

**Response:**
```typescript
{
  data: Array<{
    id: string
    pattern: string
    matchType: "contains" | "startsWith" | "regex"
    category: string
    subcategory: string
    // User override state
    _disabled?: boolean
    _categoryOverride?: string
    _subcategoryOverride?: string
    _isIgnoreOverride?: boolean
  }>
}
```

**Called by:** `components/budget-tracker/app-shell.tsx` → `BudgetNavigationProvider` (initial load)

---

### PUT /budget/rules/builtin/:id/override
Set user override for a built-in rule

**Request Body:**
```typescript
{
  _disabled?: boolean
  _categoryOverride?: string
  _subcategoryOverride?: string
  _isIgnoreOverride?: boolean
}
```

**Response:**
```typescript
{
  id: string
  _disabled?: boolean
  _categoryOverride?: string
  _subcategoryOverride?: string
  _isIgnoreOverride?: boolean
}
```

**Called by:** `components/budget-tracker/tabs/rules-tab.tsx` → `saveBuiltinEdit()`
**Called by:** `components/budget-tracker/tabs/rules-tab.tsx` → `disableBuiltinRule()`

---

### DELETE /budget/rules/builtin/:id/override
Remove user override (restore to default)

**Response:** `204 No Content`

**Called by:** `components/budget-tracker/tabs/rules-tab.tsx` → `resetBuiltinRule()`

---

### GET /budget/settings
Get user budget settings

**Response:**
```typescript
{
  budgetFrequency: "weekly" | "fortnightly" | "monthly"
  budgetStartDay: number        // 1-31 for monthly, 1-7 for weekly
  budgets: Record<string, number>  // category -> amount
  customCategories: Record<string, string[]>  // category -> subcategories
  projectBudgets: Record<string, number>
}
```

**Called by:** `components/budget-tracker/app-shell.tsx` → `BudgetNavigationProvider` (initial load)

---

### PUT /budget/settings
Update user budget settings

**Request Body:**
```typescript
{
  budgetFrequency?: "weekly" | "fortnightly" | "monthly"
  budgetStartDay?: number
  budgets?: Record<string, number>
  customCategories?: Record<string, string[]>
  projectBudgets?: Record<string, number>
}
```

**Response:**
```typescript
{
  budgetFrequency: "weekly" | "fortnightly" | "monthly"
  budgetStartDay: number
  budgets: Record<string, number>
  customCategories: Record<string, string[]>
  projectBudgets: Record<string, number>
}
```

**Called by:** `components/budget-tracker/app-shell.tsx` → `updateSettings()`
**Called by:** `components/budget-tracker/tabs/budget-tab.tsx` → category budget changes
**Called by:** `components/budget-tracker/tabs/settings-tab.tsx` → settings changes

---

### GET /budget/filters
Get saved transaction filters

**Response:**
```typescript
{
  dateRange: { start: string, end: string } | null
  category: string | null
  subcategory: string | null
  bankAccount: string | null
  source: string | null
  businessFilter: "all" | "personal" | "business"
  uncategorizedOnly: boolean
}
```

**Called by:** `components/budget-tracker/app-shell.tsx` → `BudgetNavigationProvider` (initial load)

---

### PUT /budget/filters
Save transaction filters

**Request Body:**
```typescript
{
  dateRange?: { start: string, end: string } | null
  category?: string | null
  subcategory?: string | null
  bankAccount?: string | null
  source?: string | null
  businessFilter?: "all" | "personal" | "business"
  uncategorizedOnly?: boolean
}
```

**Response:** Same as GET

**Called by:** `components/budget-tracker/app-shell.tsx` → `setTransactionFilters()`

---

## Stock Signal Analyser Endpoints

### GET /stocks/watchlist
Get user's watchlist

**Response:**
```typescript
{
  data: Array<{
    ticker: string
    addedAt: string
  }>
}
```

**Called by:** `components/stock-signal/app-shell.tsx` → `NavigationProvider` (initial load)

---

### POST /stocks/watchlist
Add ticker to watchlist

**Request Body:**
```typescript
{
  ticker: string
}
```

**Response:**
```typescript
{
  ticker: string
  addedAt: string
}
```

**Called by:** `components/stock-signal/app-shell.tsx` → `addToWatchlist()`

---

### DELETE /stocks/watchlist/:ticker
Remove ticker from watchlist

**Response:** `204 No Content`

**Called by:** `components/stock-signal/app-shell.tsx` → `removeFromWatchlist()`

---

### GET /stocks/portfolio
Get user's portfolio holdings

**Response:**
```typescript
{
  data: Array<{
    ticker: string
    shares: number
    avgCost: number
    addedAt: string
  }>
}
```

**Called by:** `components/stock-signal/app-shell.tsx` → `NavigationProvider` (initial load)

---

### POST /stocks/portfolio
Add holding to portfolio

**Request Body:**
```typescript
{
  ticker: string
  shares: number
  avgCost: number
}
```

**Response:**
```typescript
{
  ticker: string
  shares: number
  avgCost: number
  addedAt: string
}
```

**Called by:** `components/portfolio/portfolio-dashboard.tsx` (future)

---

### PUT /stocks/portfolio/:ticker
Update portfolio holding

**Request Body:**
```typescript
{
  shares?: number
  avgCost?: number
}
```

**Response:**
```typescript
{
  ticker: string
  shares: number
  avgCost: number
  addedAt: string
  updatedAt: string
}
```

**Called by:** `components/portfolio/portfolio-dashboard.tsx` (future)

---

### DELETE /stocks/portfolio/:ticker
Remove holding from portfolio

**Response:** `204 No Content`

**Called by:** `components/portfolio/portfolio-dashboard.tsx` (future)

---

## Cache Endpoints (TTL-based)

### GET /cache/:key
Get cached data by key

**Response:**
```typescript
{
  data: unknown
  expiresAt: string
  ttl: number  // seconds remaining
}
```
Or `404` if not found/expired

**Called by:** `lib/services/cache/memory-cache.ts` (future: DynamoDB TTL cache)

---

### PUT /cache/:key
Set cached data with TTL

**Request Body:**
```typescript
{
  data: unknown
  ttl: number  // seconds
}
```

**Response:**
```typescript
{
  key: string
  expiresAt: string
}
```

**Called by:** `lib/services/cache/memory-cache.ts`

---

### DELETE /cache/:key
Invalidate cache entry

**Response:** `204 No Content`

**Called by:** `lib/services/cache/memory-cache.ts`

---

## AI Endpoints

### POST /ai/categorize
Auto-categorize a transaction description using Claude

**Request Body:**
```typescript
{
  description: string
  existingCategories: string[]  // list of known categories
}
```

**Response:**
```typescript
{
  category: string
  subcategory: string
  confidence: number  // 0-1
  reasoning?: string
}
```

**Called by:** `lib/services/ai/mock-ai.ts` (future: Claude API via Lambda)

---

### POST /ai/analyze-stock
Get AI analysis for a stock

**Request Body:**
```typescript
{
  ticker: string
  context?: {
    recentNews?: string[]
    financials?: object
  }
}
```

**Response:**
```typescript
{
  summary: string
  sentiment: "bullish" | "neutral" | "bearish"
  keyPoints: string[]
  risks: string[]
  opportunities: string[]
}
```

**Called by:** `components/analyser/analyser-dashboard.tsx` (future)

---

## Error Response Format

All error responses follow this format:

```typescript
{
  code: string       // e.g., "VALIDATION_ERROR", "NOT_FOUND", "UNAUTHORIZED"
  message: string    // Human-readable message
  details?: object   // Additional error context
}
```

**HTTP Status Codes:**
- `400` - Validation error
- `401` - Unauthorized (missing/invalid token)
- `403` - Forbidden (insufficient permissions)
- `404` - Resource not found
- `409` - Conflict (e.g., duplicate entry)
- `429` - Rate limited
- `500` - Internal server error

---

## Summary Table

| Method | Endpoint | Component |
|--------|----------|-----------|
| POST | /auth/login | `mock-auth.ts` |
| POST | /auth/refresh | `client.ts` |
| POST | /auth/logout | `use-auth-store.ts` |
| GET | /auth/user | `use-auth-store.ts` |
| PUT | /auth/user/active-account | `app-shell.tsx` (both apps) |
| GET | /budget/transactions | `app-shell.tsx` (budget) |
| POST | /budget/transactions | `transactions-tab.tsx` |
| PUT | /budget/transactions/:id | `transactions-tab.tsx` |
| DELETE | /budget/transactions/:id | `app-shell.tsx` (budget) |
| GET | /budget/rules/custom | `app-shell.tsx` (budget) |
| POST | /budget/rules/custom | `rules-tab.tsx`, `transactions-tab.tsx` |
| PUT | /budget/rules/custom/:id | `rules-tab.tsx` |
| DELETE | /budget/rules/custom/:id | `rules-tab.tsx` |
| GET | /budget/rules/builtin | `app-shell.tsx` (budget) |
| PUT | /budget/rules/builtin/:id/override | `rules-tab.tsx` |
| DELETE | /budget/rules/builtin/:id/override | `rules-tab.tsx` |
| GET | /budget/settings | `app-shell.tsx` (budget) |
| PUT | /budget/settings | `app-shell.tsx`, `budget-tab.tsx`, `settings-tab.tsx` |
| GET | /budget/filters | `app-shell.tsx` (budget) |
| PUT | /budget/filters | `app-shell.tsx` (budget) |
| GET | /stocks/watchlist | `app-shell.tsx` (stock-signal) |
| POST | /stocks/watchlist | `app-shell.tsx` (stock-signal) |
| DELETE | /stocks/watchlist/:ticker | `app-shell.tsx` (stock-signal) |
| GET | /stocks/portfolio | `app-shell.tsx` (stock-signal) |
| POST | /stocks/portfolio | `portfolio-dashboard.tsx` |
| PUT | /stocks/portfolio/:ticker | `portfolio-dashboard.tsx` |
| DELETE | /stocks/portfolio/:ticker | `portfolio-dashboard.tsx` |
| GET | /cache/:key | `memory-cache.ts` |
| PUT | /cache/:key | `memory-cache.ts` |
| DELETE | /cache/:key | `memory-cache.ts` |
| POST | /ai/categorize | `mock-ai.ts` |
| POST | /ai/analyze-stock | `analyser-dashboard.tsx` |
