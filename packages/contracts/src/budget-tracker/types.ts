import type { AccountId, ISODateTime } from '../_shared/api';
import type { AiAsyncStartResponse, AiProxyRequest } from '../_shared/ai-runtime';

export type BudgetTrackerContractVersion = 'm15.2.0';
export type BudgetFrequency = 'weekly' | 'fortnightly' | 'monthly' | 'quarterly' | 'annually' | 'one-off';
export type BudgetConfidence = 'high' | 'medium' | 'low';
export type MatchType = 'contains' | 'startsWith' | 'regex';
export type CategoryType = 'regular' | 'capital';
export type ExportFormat = 'csv' | 'json';

/**
 * M21 — optional user-assigned semantic role on a category OR subcategory.
 * Absent ⇒ no role. `income` marks holders whose classified transactions count
 * as income for dashboard/cashflow purposes; `savings` marks holders that
 * represent money deliberately set aside. A role is USER-ASSIGNED, multiple
 * holders are allowed, and a role NEVER affects budget limits — it is purely a
 * classification signal. This supersedes the deprecated `name === "Income"`
 * detection (removed from domain code in PR-2 after backfill).
 * See spec/budget-tracker/behaviour.md § "Category roles".
 */
export type CategoryRole = 'income' | 'savings';

export interface Subcategory {
  subcategoryId: string;
  name: string;
  displayOrder: number;
  deleted?: boolean;
  excludeFromCashflow?: boolean;
  /** M21: optional user-assigned semantic role; absent ⇒ no role. */
  role?: CategoryRole;
}

export interface Category {
  categoryId: string;
  name: string;
  type: CategoryType;
  displayOrder: number;
  deleted?: boolean;
  subcategories: Subcategory[];
  /** M21: optional user-assigned semantic role; absent ⇒ no role. */
  role?: CategoryRole;
}

/**
 * M21 — an account's savings goal, carried on `BudgetData` (travels through the
 * existing budget-data read/write routes; no new route). Progress semantics
 * (spec/budget-tracker/behaviour.md § "Savings goal"): if `linkedSubcategoryId`
 * is set → Σ|transactions| classified into that subcategory THIS MONTH;
 * otherwise the goal is IMPLICIT and progress = (role-based income − spending)
 * THIS MONTH.
 */
export interface SavingsGoal {
  targetAmount: number;
  linkedSubcategoryId?: string | null;
}

export interface BudgetData {
  categories: Category[];
  budgetAmounts: Record<string, number>;
  budgetFrequencies: Record<string, BudgetFrequency>;
  /** M21: optional per-account savings goal; absent ⇒ none configured. */
  savingsGoal?: SavingsGoal;
}

export interface Transaction {
  transactionId: string;
  accountId: AccountId;
  date: string;
  amount: string;
  description: string;
  categoryId: string | null;
  subcategoryId: string | null;
  file: string;
  _manual: boolean;
  _business: boolean;
  category?: string;
  subcategory?: string;
}

export interface RawTransaction {
  date: string;
  amount: string;
  description: string;
  file: string;
  categoryId: null;
  subcategoryId: null;
}

export interface MatchingRule {
  ruleId: string;
  accountId: AccountId;
  name: string;
  match: string;
  matchType: MatchType;
  categoryId: string;
  subcategoryId: string;
  enabled: boolean;
  priority: number;
  isBusiness: boolean;
  learned: boolean;
  createdAt: string;
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

export interface BudgetSettings {
  csvFormatMappings: Record<string, CSVMapping>;
  aiReviewBatchSize?: number;
  aiReviewParallelLimit?: number;
  aiReviewConfidenceThreshold?: BudgetConfidence;
}

export interface Account {
  accountId: AccountId;
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

export interface AiReviewResponse {
  jobId: string;
}

export interface AiCsvAnalysisResponse {
  dateColumn: number;
  descriptionColumn: number;
  amountColumn?: number;
  debitColumn?: number;
  creditColumn?: number;
  dateFormat: string;
  hasHeader: boolean;
  confidence: BudgetConfidence;
  notes: string;
}

export interface ReviewBatchResult {
  index: number;
  categoryId: string;
  subcategoryId: string;
  reason: string;
  confidence: BudgetConfidence;
}

export interface CsvAnalysisRequest extends AiProxyRequest {
  sampleRows: string[][];
  appName?: 'budget-tracker';
}

export interface AiReviewRequest extends AiProxyRequest {
  transactions: Array<{ index: number; description: string; amount: string }>;
  categories: Category[];
  batchSize: number;
  parallelLimit: number;
  confidenceThreshold: BudgetConfidence;
  forceFullSearch?: boolean;
  appName?: 'budget-tracker';
}

export type BudgetTrackerAiResponse = AiAsyncStartResponse | AiCsvAnalysisResponse;

export interface BudgetTrackerFrontendState {
  accountId?: AccountId;
  selectedMonth: string;
  transactionsLoaded: boolean;
  reviewInProgress: boolean;
  pendingReviewBatchIds: string[];
}

/**
 * M21 — BT Home dashboard AI insight.
 *
 * `DashboardInsightRecord` is the persisted DERIVED row under the D12 row-class
 * model (docs/architecture/data.md § D12): an account-shared
 * (`PK = accountId`), service-principal-written, viewer-READABLE row keyed
 * `SK = 'AI_INSIGHT#DASHBOARD'`. The server regenerates it from the app-level
 * AI config (D9) when it is absent, older than 24h, or invalidated, then writes
 * it back and returns it. Invalidation is event-driven, not scheduled: a
 * transaction mutation sets `invalidatedAt` (or deletes the row).
 * See spec/budget-tracker/behaviour.md § "Dashboard insight".
 */
export interface DashboardInsightRecord {
  pk: AccountId;
  sk: 'AI_INSIGHT#DASHBOARD';
  text: string;
  generatedAt: ISODateTime;
  /** Set by transaction mutation handlers to force regeneration on next read. */
  invalidatedAt?: ISODateTime | null;
}

/** Response for `GET /api/budget/v1/dashboard-insight`. */
export interface DashboardInsightResponse {
  text: string;
  generatedAt: ISODateTime;
  /** True when the served text predates the current data (regenerated on read). */
  stale: boolean;
}

export const budgetTrackerContractVersion = 'm15.2.0' as const satisfies BudgetTrackerContractVersion;

export const exampleSubcategory = {
  subcategoryId: 'subcat-groceries',
  name: 'Groceries',
  displayOrder: 1,
  excludeFromCashflow: false,
} as const satisfies Subcategory;

export const exampleCategory = {
  categoryId: 'cat-living',
  name: 'Living',
  type: 'regular',
  displayOrder: 1,
  subcategories: [exampleSubcategory],
} as const satisfies Category;

export const exampleBudgetData = {
  categories: [exampleCategory],
  budgetAmounts: {
    'subcat-groceries': 800,
  },
  budgetFrequencies: {
    'subcat-groceries': 'monthly',
  },
} as const satisfies BudgetData;

export const exampleSavingsGoal = {
  targetAmount: 2000,
  linkedSubcategoryId: 'subcat-emergency-fund',
} as const satisfies SavingsGoal;

export const exampleDashboardInsight = {
  text: 'You are 68% through your monthly budget with 9 days left; groceries are trending 12% above your usual.',
  generatedAt: '2026-07-06T00:00:00.000Z',
  stale: false,
} as const satisfies DashboardInsightResponse;

export const exampleTransaction = {
  transactionId: 'txn-123',
  accountId: 'acct-bt-123',
  date: '07/06/2026',
  amount: '-84.50',
  description: 'Supermarket',
  categoryId: 'cat-living',
  subcategoryId: 'subcat-groceries',
  file: 'bank.csv',
  _manual: false,
  _business: false,
  category: 'Living',
  subcategory: 'Groceries',
} as const satisfies Transaction;

export const exampleMatchingRule = {
  ruleId: 'rule-123',
  accountId: 'acct-bt-123',
  name: 'Supermarket groceries',
  match: 'supermarket',
  matchType: 'contains',
  categoryId: 'cat-living',
  subcategoryId: 'subcat-groceries',
  enabled: true,
  priority: 10,
  isBusiness: false,
  learned: false,
  createdAt: '2026-06-07T00:00:00.000Z',
} as const satisfies MatchingRule;

export const exampleBudgetSettings = {
  csvFormatMappings: {
    'bank-csv-v1': {
      fingerprint: 'bank-csv-v1',
      dateColumn: 0,
      descriptionColumn: 1,
      amountColumn: 2,
      dateFormat: 'DD/MM/YYYY',
      hasHeader: true,
      confirmedAt: '2026-06-07T00:00:00.000Z',
    },
  },
  aiReviewBatchSize: 5,
  aiReviewParallelLimit: 4,
  aiReviewConfidenceThreshold: 'low',
} as const satisfies BudgetSettings;

export const exampleReviewBatchResult = {
  index: 0,
  categoryId: 'cat-living',
  subcategoryId: 'subcat-groceries',
  reason: 'Merchant and amount match the grocery category.',
  confidence: 'high',
} as const satisfies ReviewBatchResult;

export const exampleCsvAnalysisResponse = {
  dateColumn: 0,
  descriptionColumn: 1,
  amountColumn: 2,
  dateFormat: 'DD/MM/YYYY',
  hasHeader: true,
  confidence: 'high',
  notes: 'Detected a standard bank export with a single amount column.',
} as const satisfies AiCsvAnalysisResponse;
