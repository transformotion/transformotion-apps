// Shared contract types — source of truth is /contracts/budget-tracker/data-models.md
// Do not extend these without updating data-models.md first.

export interface Transaction {
  _id: number | string;
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
  budgetOverrides: Record<string, number>;    // -1 = tombstoned (deleted)
  budgetFreqs: Record<string, Frequency>;
  customCategories: Record<string, string[]>;
  projectBudgets: Record<string, number>;     // lump-sum, not monthly
  deletedSubs: string[];
  csvFormatMappings: Record<string, CSVMapping>;
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
