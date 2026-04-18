# Data Models

**Every type that crosses the UI/backend boundary lives here.** If you need a type that isn't documented, update this file first.

## Core entities

### Transaction

The atomic unit of the Budget Tracker. Every imported line item becomes a Transaction.

```typescript
interface Transaction {
  _id: number;                    // Local sequential ID (v0 stub) or UUID (real impl)
  accountId: string;              // Household account ID (Cognito-derived)
  date: string;                   // DD/MM/YYYY — preserved for display
  amount: string;                 // String to preserve sign and decimals as imported
                                  // Negative = expense, positive = income/refund
  description: string;            // Original description from CSV
  category: string | "";          // "" = uncategorised
  subcategory: string | "";       // "" = uncategorised
  file: string;                   // Source CSV filename
  _manual: boolean;               // User has manually set category — rules will not overwrite
  _business: boolean;             // Flagged as business expense — excluded from personal P&L
}
```

**Notes:**
- `amount` is deliberately a string. The prototype preserves the raw CSV value to avoid floating-point rounding issues and to support banks that use separate debit/credit columns. All arithmetic parses on read.
- `_manual: true` is a sticky flag. Once a user manually categorises a transaction, the rules engine will never overwrite it on subsequent imports.
- `_business: true` excludes the transaction from personal P&L calculations everywhere but keeps it visible in the transaction list with a 💼 badge.

### Custom Rule

Heuristics that categorise transactions by description match.

```typescript
interface CustomRule {
  id: string;                     // UUID
  accountId: string;
  match: string;                  // Keyword or regex pattern, case-insensitive
  category: string;
  subcategory: string;
  learned: boolean;               // true if created via "Learn" button on a transaction
                                  // false if manually authored in Rules tab
  createdAt: string;              // ISO 8601
}
```

**Notes:**
- The rules engine also ships a large **built-in ruleset** compiled into the codebase (see `ui-patterns.md` for storage location). Built-in rules are not CRUDable — they're the default heuristics for common Australian merchants.
- Custom rules override built-in rules when both match. Most recent rule wins if multiple custom rules match.

### Category Tree

The budget categorisation structure. Shared between UI pickers and AI prompts.

```typescript
interface CategoryTree {
  [categoryName: string]: string[];  // Array of subcategory names
}
```

**Default category tree** (the starter set — users can add custom subcategories):

```typescript
const DEFAULT_CATEGORIES: CategoryTree = {
  "Income": [
    "Your take-home pay",
    "Your partner's take-home pay",
    "Bonuses / overtime",
    "Income from savings and investments",
    "Child support received",
    "School fees reimbursement",
    "Rent (investment property)",
    "Other income"
  ],
  "Home & utilities": [
    "Mortgage / rent", "Water", "Gas", "Electricity", "Mobile", "Internet",
    "Streaming Services", "Home improvements & Maintenance",
    "Furniture & appliances", "Council rates", "Body corporate fees",
    "Kierans Mobile", "Ellas Mobile"
  ],
  "Financial & Insurance": [
    "Home & contents insurance", "Health insurance", "Car insurance",
    "Life & income insurance", "Bank fees", "Interest paid",
    "Financial advice", "Computers & gadgets", "Capital purchases"
  ],
  "Groceries": ["Supermarket", "Butcher / bakery / deli", "Other groceries"],
  "Medical, personal & education": [
    "Doctors & medical", "Medicines & pharmacy", "Dental", "Glasses & eye care",
    "Hair & beauty", "Clothing & shoes", "Shopping", "Sports & gym", "Education"
  ],
  "Eating-out & Entertainment": [
    "Restaurants & cafes", "Take-away & snacks", "Drinks & alcohol",
    "Entertainment & events", "Subscriptions", "Hobbies", "Holidays"
  ],
  "Car & Transport": [
    "Petrol", "Road tolls & parking", "Repairs & maintenance",
    "Rego & licence", "Uber & taxi", "Airfares", "Public transport"
  ],
  "Children": [
    "Children Clothing", "Child support payment", "School fees",
    "Toys", "Child care"
  ],
  "Renovations": [],              // Populated by user; is a PROJECT category
  "Transfers": ["Transfer"],      // Special — excluded from P&L
};
```

### Budget Settings

Per-account configuration.

```typescript
interface BudgetSettings {
  accountId: string;
  budgetOverrides: { [subcategory: string]: number };    // -1 = tombstoned (deleted)
  budgetFreqs: { [subcategory: string]: Frequency };
  customCategories: { [category: string]: string[] };    // user-added subcategories
  projectBudgets: { [category: string]: number };        // lump-sum, not monthly
  deletedSubs: string[];                                  // subcategories hidden by user
  csvFormatMappings: { [fingerprint: string]: CSVMapping };
}

type Frequency = "weekly" | "fortnightly" | "monthly" | "quarterly" | "annually";

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

A transaction is **excluded from personal P&L** if ANY of these are true:

1. `subcategory === "Transfer"` (movements between own accounts)
2. `_business === true`
3. `category` is in `PROJECT_CATEGORIES` (default: `["Renovations"]`)
4. `subcategory` is in `PROJECT_SUBCATEGORIES` (default: `["Capital purchases"]`)

These exclusions must be applied **consistently** across:
- Summary tab totals (income, expenses, net position)
- Category card totals
- Subcategory totals
- Cashflow trend chart
- Cashflow category bar chart
- Budget deficit/surplus card
- Sankey diagram

Excluded transactions are **still visible** in the Transactions tab (with filter toggles) and in the dedicated Projects and Business Expenses views.

## AI response schemas

### Auto-categorisation response

```typescript
interface AiCategoriseResponse {
  results: Array<{
    index: number;                // Matches input transaction index
    category: string;             // Must be from provided CategoryTree
    subcategory: string;          // Must be from provided CategoryTree[category]
  }>;
}
```

Transactions the AI cannot confidently categorise are simply omitted from the response (no placeholder).

### AI Review response

```typescript
interface AiReviewResponse {
  results: Array<{
    index: number;
    category: string;
    subcategory: string;
    reason: string;               // 1-sentence explanation for the user
  }>;
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

## Type safety requirements

- All contract types must live in a shared TypeScript file: `/types/contracts.ts` (both repos)
- Neither v0 nor Claude Code may extend these types without updating this document first
- Optional fields are marked with `?`; nullable with `| null`. Do not confuse them.
- Every endpoint and adaptor method must reference these types by name — no inline duplication.
