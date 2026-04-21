// Shared contract types — source of truth is /contracts/budget-tracker/data-models.md
// Do not extend these without updating data-models.md first.

export interface Transaction {
  _id: string;
  accountId: string;
  date: string;                   // DD/MM/YYYY
  amount: string;                 // Negative = expense, positive = income/refund
  description: string;
  category: string | "";
  subcategory: string | "";
  file: string;
  _manual: boolean;
  _business: boolean;
}

export interface CustomRule {
  id: string;
  accountId: string;
  match: string;                  // Keyword or regex pattern, case-insensitive
  category: string;
  subcategory: string;
  learned: boolean;
  createdAt: string;              // ISO 8601
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
