import type { AccountId } from '../_shared/api';
import type { AiAsyncStartResponse, AiProxyRequest } from '../_shared/ai-runtime';

export type BudgetTrackerContractVersion = 'm15.1.0';
export type BudgetFrequency = 'weekly' | 'fortnightly' | 'monthly' | 'quarterly' | 'annually' | 'one-off';
export type BudgetConfidence = 'high' | 'medium' | 'low';
export type MatchType = 'contains' | 'startsWith' | 'regex';
export type CategoryType = 'regular' | 'capital';
export type ExportFormat = 'csv' | 'json';

export interface Subcategory {
  subcategoryId: string;
  name: string;
  displayOrder: number;
  deleted?: boolean;
  excludeFromCashflow?: boolean;
}

export interface Category {
  categoryId: string;
  name: string;
  type: CategoryType;
  displayOrder: number;
  deleted?: boolean;
  subcategories: Subcategory[];
}

export interface BudgetData {
  categories: Category[];
  budgetAmounts: Record<string, number>;
  budgetFrequencies: Record<string, BudgetFrequency>;
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

export const budgetTrackerContractVersion = 'm15.1.0' as const satisfies BudgetTrackerContractVersion;

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
