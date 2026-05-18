// Shared contract types — source of truth is v0-reference/contracts/budget-tracker/data-models.md
// Do not extend these without updating data-models.md in the v0 repo first.

// ── Category tree ─────────────────────────────────────────────────────────────

export interface Subcategory {
  subcategoryId: string;          // UUID, account-scoped — stable forever
  name: string;
  displayOrder: number;
  deleted?: boolean;              // Soft-delete — transactions continue to display
  excludeFromCashflow?: boolean;  // When true, transactions in this subcategory excluded from cashflow analysis
}

export interface Category {
  categoryId: string;             // UUID, account-scoped — stable forever
  name: string;
  type: 'regular' | 'capital';   // 'capital' = excluded from cashflow; dedicated Budget section
  displayOrder: number;
  deleted?: boolean;              // Soft-delete
  subcategories: Subcategory[];
}

export type BudgetFrequency = 'weekly' | 'fortnightly' | 'monthly' | 'quarterly' | 'annually' | 'one-off';

export interface BudgetData {
  categories: Category[];
  budgetAmounts: Record<string, number>;           // subcategoryId → monthly amount
  budgetFrequencies: Record<string, BudgetFrequency>; // subcategoryId → frequency
}

// ── Transaction ───────────────────────────────────────────────────────────────

export interface Transaction {
  transactionId: string;
  accountId: string;
  date: string;                   // DD/MM/YYYY
  amount: string;                 // Negative = expense, positive = income/refund
  description: string;
  categoryId: string | null;      // UUID FK; null = uncategorised
  subcategoryId: string | null;   // UUID FK; null = uncategorised
  file: string;
  _manual: boolean;
  _business: boolean;

  // DEPRECATED — present during migration window only
  category?: string;
  subcategory?: string;
}

// ── Matching Rule (formerly CustomRule) ───────────────────────────────────────

export interface MatchingRule {
  ruleId: string;
  accountId: string;
  name: string;
  match: string;
  matchType: 'contains' | 'startsWith' | 'regex';
  categoryId: string;             // UUID FK
  subcategoryId: string;          // UUID FK
  enabled: boolean;
  priority: number;
  isBusiness: boolean;
  learned: boolean;
  createdAt: string;
}

// ── Settings ──────────────────────────────────────────────────────────────────

export interface BudgetSettings {
  csvFormatMappings: Record<string, CSVMapping>;
  aiReviewBatchSize?: number;
  aiReviewParallelLimit?: number;
  aiReviewConfidenceThreshold?: 'low' | 'medium';
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

// ── Repository interfaces ─────────────────────────────────────────────────────

export interface TransactionRepository {
  findAll(accountId: string): Promise<Transaction[]>;
  findById(accountId: string, id: string): Promise<Transaction | null>;
  upsertBulk(transactions: Transaction[]): Promise<Transaction[]>;
  update(id: string, accountId: string, updates: Partial<Transaction>): Promise<Transaction>;
  delete(id: string, accountId: string): Promise<void>;
}

export interface MatchingRulesRepository {
  findAll(accountId: string): Promise<MatchingRule[]>;
  findById(accountId: string, id: string): Promise<MatchingRule | null>;
  save(rule: MatchingRule): Promise<MatchingRule>;
  delete(id: string, accountId: string): Promise<void>;
}

export interface BudgetDataRepository {
  get(accountId: string): Promise<BudgetData>;
  patch(accountId: string, partial: Partial<BudgetData>): Promise<BudgetData>;
}

export interface SettingsRepository {
  get(accountId: string): Promise<BudgetSettings>;
  patch(accountId: string, updates: Partial<BudgetSettings>): Promise<BudgetSettings>;
}

// ── Account ───────────────────────────────────────────────────────────────────

export interface Account {
  accountId: string;
  name: string;
  members: AccountMember[];
  createdAt: string;
}

export interface AccountMember {
  userId: string;
  role: 'owner' | 'member';
  email: string;
  joinedAt: string;
}

// ── AI response schemas ───────────────────────────────────────────────────────

export interface AiReviewResponse {
  jobId: string;
}

export interface WsMessageConnected {
  type: 'connected';
  connectionId: string;
}

export interface WsMessageBatchResult {
  type: 'batch_result';
  jobId: string;
  pass: 1 | 2;
  results: Array<{
    index: number;
    categoryId: string;
    subcategoryId: string;
    reason: string;
    confidence: 'high' | 'medium' | 'low';
  }>;
  completedCount: number;
  totalCount: number;
}

export interface WsMessageComplete {
  type: 'complete';
  jobId: string;
}

export interface WsMessageError {
  type: 'error';
  jobId: string;
  message: string;
}

export interface AiCsvAnalysisResponse {
  dateColumn: number;
  descriptionColumn: number;
  amountColumn?: number;
  debitColumn?: number;
  creditColumn?: number;
  dateFormat: string;
  hasHeader: boolean;
  confidence: 'high' | 'medium' | 'low';
  notes: string;
}

// ── Lightweight parsed transaction before accountId assigned (CSV import) ─────

export interface RawTransaction {
  date: string;
  amount: string;
  description: string;
  file: string;
  categoryId: null;
  subcategoryId: null;
}
