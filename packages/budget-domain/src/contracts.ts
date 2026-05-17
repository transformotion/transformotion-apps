// Shared contract types — source of truth is /contracts/budget-tracker/data-models.md
// Do not extend these without updating data-models.md first.

export interface Transaction {
  transactionId: string;
  accountId: string;
  date: string;                   // DD/MM/YYYY
  amount: string;                 // Negative = expense, positive = income/refund
  description: string;
  category: string | "";
  subcategory: string | "";
  file: string;
  _manual: boolean;
  _business: boolean;
  _ignore?: boolean;              // Excluded from P&L and cashflow; still visible in Transactions tab
}

export interface CustomRule {
  ruleId: string;
  accountId: string;
  name: string;                   // Display name for the rule (shown in Rules tab)
  match: string;                  // Keyword or regex string, applied case-insensitive
  matchType: 'contains' | 'startsWith' | 'regex';
  category: string;
  subcategory: string;
  enabled: boolean;               // Disabled rules are skipped without being deleted
  priority: number;               // Lower number = higher priority; multiple matches: lowest wins
  isBusiness: boolean;            // Sets _business: true on matched transactions
  isIgnore?: boolean;             // Sets _ignore: true on matched transactions
  overridesBuiltinId?: string;    // Built-in rule ID this custom rule replaces/disables
  learned: boolean;               // true if created via "Learn" button; false if manually authored
  createdAt: string;              // ISO 8601
}

export interface TransactionRepository {
  findAll(accountId: string): Promise<Transaction[]>;
  findById(accountId: string, id: string): Promise<Transaction | null>;
  upsertBulk(transactions: Transaction[]): Promise<Transaction[]>;
  update(id: string, accountId: string, updates: Partial<Transaction>): Promise<Transaction>;
  delete(id: string, accountId: string): Promise<void>;
}

export interface CustomRulesRepository {
  findAll(accountId: string): Promise<CustomRule[]>;
  findById(accountId: string, id: string): Promise<CustomRule | null>;
  save(rule: CustomRule): Promise<CustomRule>;
  delete(id: string, accountId: string): Promise<void>;
}

export interface BuiltinRule {
  match: RegExp;
  category: string;
  subcategory: string;
}

export type CategoryTree = Record<string, string[]>;

export type Frequency = "weekly" | "fortnightly" | "monthly" | "quarterly" | "annually";

export interface BudgetSettings {
  accountId: string;
  // ── Budget configuration ────────────────────────────────────────────────────
  budgetOverrides: Record<string, number>;        // -1 = tombstoned (subcategory deleted by user)
  budgetFreqs: Record<string, Frequency>;         // per-subcategory spending frequency
  customCategories: Record<string, string[]>;     // user-added subcategories per category
  deletedSubs: string[];                           // subcategory names tombstoned by user
  // ── Project / category management ──────────────────────────────────────────
  projectBudgets: Record<string, number>;         // lump-sum budget per project category
  projectTasks: Record<string, string[]>;         // custom task subcategory names per project
  customTopCategories: string[];                   // user-created recurring top-level categories
  customProjectCategories: string[];               // user-created project categories
  deletedCategories: string[];                     // top-level categories hidden from Budget view
  deletedProjectCategories: string[];              // project categories hidden (restorable in Budget tab)
  disabledProjectCategories: string[];             // completed projects — hidden from dropdowns, visible on Budget tab
  // ── Import preferences ──────────────────────────────────────────────────────
  csvFormatMappings?: Record<string, CSVMapping>; // remembered CSV column mappings per bank
}

export interface CSVMapping {
  fingerprint: string;
  dateColumn: number;
  descriptionColumn: number;
  amountColumn?: number;
  debitColumn?: number;
  creditColumn?: number;
  dateFormat: string;
  hasHeader: boolean;
  confirmedAt: string;
}

export interface Account {
  accountId: string;
  name: string;
  members: AccountMember[];
  createdAt: string;
}

export interface AccountMember {
  userId: string;
  role: "owner" | "member";
  email: string;
  joinedAt: string;
}

export interface AiCategoriseResponse {
  results: Array<{
    index: number;
    category: string;
    subcategory: string;
  }>;
}

export interface AiReviewResponse {
  results: Array<{
    index: number;
    category: string;
    subcategory: string;
    reason: string;
  }>;
}

export interface AiCsvAnalysisResponse {
  dateColumn: number;
  descriptionColumn: number;
  amountColumn?: number;
  debitColumn?: number;
  creditColumn?: number;
  dateFormat: string;
  hasHeader: boolean;
  confidence: "high" | "medium" | "low";
  notes: string;
}

// Lightweight parsed transaction before accountId is assigned (CSV import output)
export interface RawTransaction {
  date: string;
  amount: string;
  description: string;
  file: string;
  category: "";
  subcategory: "";
}
