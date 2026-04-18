# API Endpoints

**Every backend endpoint the Budget Tracker UI calls.** v0 stubs these via adaptor interfaces. Claude Code implements them as real Lambda functions behind API Gateway.

## Common conventions

- **Base path:** `/api/budget`
- **Auth:** All endpoints require Cognito JWT with group `budget-app` in `cognito:groups`
- **AccountId resolution:** Derived server-side from JWT — never sent by client. The user's `accountId` maps to the household.
- **Request format:** JSON body, `Content-Type: application/json`
- **Response format:** JSON, `Content-Type: application/json`
- **Errors:** `{ error: string, field?: string, details?: object }`
- **HTTP status codes:**
  - `200` — success
  - `400` — validation error (see `field`)
  - `401` — missing/invalid JWT
  - `403` — authenticated but not in `budget-app` group
  - `404` — resource not found
  - `429` — rate limit exceeded (budget AI endpoints)
  - `500` — internal error
- **All IDs returned by backend are server-authoritative.** v0's stub may assign local IDs; real backend overwrites with canonical UUIDs on create.

## Transactions

### `GET /api/budget/transactions`
List transactions for the account.

**Query parameters:**
- `from` (optional): ISO date — only transactions on/after
- `to` (optional): ISO date — only transactions on/before
- `limit` (optional, default 1000, max 5000): pagination
- `cursor` (optional): opaque pagination cursor

**Response 200:**
```typescript
{
  transactions: Transaction[];
  nextCursor?: string;            // Present if more results exist
}
```

### `POST /api/budget/transactions/bulk`
Bulk upsert transactions (used on CSV import).

**Request:**
```typescript
{
  transactions: Transaction[];    // Without accountId — server fills from JWT
}
```

**Response 200:**
```typescript
{
  created: number;
  updated: number;
  skipped: number;                // Already existed with same id
  transactions: Transaction[];    // With server-assigned IDs
}
```

### `PATCH /api/budget/transactions/:id`
Update a single transaction (used for manual categorisation, business flag toggle).

**Request:**
```typescript
{
  category?: string;
  subcategory?: string;
  _manual?: boolean;              // Must set to true when user manually categorises
  _business?: boolean;
}
```

**Response 200:**
```typescript
{ transaction: Transaction }
```

### `DELETE /api/budget/transactions/:id`
Delete a transaction.

**Response 200:**
```typescript
{ deleted: true }
```

## Rules

### `GET /api/budget/rules`
List custom rules for the account.

**Response 200:**
```typescript
{ rules: CustomRule[] }
```

### `POST /api/budget/rules`
Create a custom rule.

**Request:**
```typescript
{
  match: string;
  category: string;
  subcategory: string;
  learned: boolean;
}
```

**Response 200:**
```typescript
{ rule: CustomRule }
```

### `PATCH /api/budget/rules/:id`
Update a custom rule.

### `DELETE /api/budget/rules/:id`
Delete a custom rule.

## Settings

### `GET /api/budget/settings`
Get all budget settings for the account.

**Response 200:**
```typescript
{ settings: BudgetSettings }
```

### `PATCH /api/budget/settings`
Partial update — send only fields to change.

**Request:** any subset of `BudgetSettings` fields.

**Response 200:**
```typescript
{ settings: BudgetSettings }
```

## AI endpoints

All AI endpoints proxy to Anthropic via the shared `/api/claude` Lambda (same proxy used by Stock Analyser). Rate limiting, retry, and cost controls live in that proxy — not in these endpoints.

### `POST /api/budget/ai/categorise`
Auto-categorisation on import (fast path). Batched server-side in chunks of 50.

**Request:**
```typescript
{
  transactions: Array<{
    index: number;
    description: string;
    amount: string;
  }>;
  categories: CategoryTree;
}
```

**Response 200:**
```typescript
{
  results: Array<{
    index: number;
    category: string;
    subcategory: string;
  }>;
}
```

**Notes:**
- AI omits any transaction it cannot confidently categorise — UI leaves those uncategorised for AI Review.
- See `ai-prompts.md` for the exact system prompt and response schema.

### `POST /api/budget/ai/review`
AI Review tab — deliberate review of uncategorised transactions. Batches of 20. Uses `web_search` tool to look up unknown merchants.

**Request:**
```typescript
{
  transactions: Array<{
    index: number;
    description: string;
    amount: string;
  }>;
  categories: CategoryTree;
}
```

**Response 200:**
```typescript
{
  results: Array<{
    index: number;
    category: string;
    subcategory: string;
    reason: string;
  }>;
}
```

**Notes:**
- Streamed back in batch order. UI shows batches as they arrive (server-sent events or chunked response — implementation detail, but UI expects progressive results).

### `POST /api/budget/ai/csv-analysis`
Detect CSV format on an unrecognised file.

**Request:**
```typescript
{
  sampleRows: string[][];         // First 5 data rows
  possibleHeaders?: string[];     // First row if it looks like headers
}
```

**Response 200:**
```typescript
AiCsvAnalysisResponse             // See data-models.md
```

## Business expense export

### `GET /api/budget/business-export`
Server-side CSV generation for the accountant.

**Query parameters:**
- `from` (optional): ISO date
- `to` (optional): ISO date

**Response 200:**
- `Content-Type: text/csv`
- `Content-Disposition: attachment; filename="business-expenses-{accountId}-{timestamp}.csv"`

**CSV columns:** `Date, Amount, Description, Category, Subcategory, File`

Only transactions with `_business: true` are included.

**Notes:** The prototype generates this client-side. The production backend does it server-side so that future features (signed URLs, email to accountant, scheduled reports) can hook in.

## Migration

### `POST /api/budget/migrate-from-localstorage`
One-click migration from browser localStorage to backend. Called once per account when a user first logs in with local data present.

**Request:**
```typescript
{
  transactions: Transaction[];
  rules: CustomRule[];
  settings: Partial<BudgetSettings>;
}
```

**Response 200:**
```typescript
{
  migrated: {
    transactions: number;
    rules: number;
    settings: string[];           // Keys migrated
  };
  alreadyPresent: {
    transactions: number;
    rules: number;
  };
}
```

**Notes:**
- Idempotent. Safe to call multiple times. Matches transactions by composite key: `{date, amount, description, file}`.
- Does not delete localStorage — UI offers that as a separate confirmation after migration succeeds.

## Versioning

All endpoints live under `/api/budget/v1/*` in the actual URL. This document uses the shorter `/api/budget/*` for readability. Any breaking change requires a new major version and a coordinated update here plus in both repos.
