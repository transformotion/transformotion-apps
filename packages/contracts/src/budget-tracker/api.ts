import type { ApiRoute, EmptyRequest } from '../_shared/api';
import { emptyRequest } from '../_shared/api';
import type { AiRuntimeConfigUpdate, AppAiRuntimeConfigResponse } from '../_shared/ai-runtime';
import { exampleAppAiRuntimeConfigResponse } from '../_shared/ai-runtime';
import {
  exampleBudgetData,
  exampleBudgetSettings,
  exampleCsvAnalysisResponse,
  exampleMatchingRule,
  exampleTransaction,
  type AiReviewRequest,
  type BudgetData,
  type BudgetSettings,
  type BudgetTrackerAiResponse,
  type CsvAnalysisRequest,
  type ExportFormat,
  type MatchingRule,
  type Transaction,
} from './types';

export interface ListTransactionsQuery {
  from?: string;
  to?: string;
  limit?: number;
  cursor?: string;
}

export interface ListTransactionsResponse {
  transactions: Transaction[];
  nextCursor?: string;
}

export interface BulkUpsertTransactionsRequest {
  transactions: Array<Omit<Transaction, 'accountId'>>;
}

export interface BulkUpsertTransactionsResponse {
  created: number;
  updated: number;
  skipped: number;
  transactions: Transaction[];
}

export type PatchTransactionRequest = Partial<Pick<Transaction, 'categoryId' | 'subcategoryId' | '_manual' | '_business'>>;

export interface PatchTransactionResponse {
  transaction: Transaction;
}

export interface DeleteResponse {
  deleted: true;
}

export type CreateRuleRequest = Partial<Omit<MatchingRule, 'ruleId' | 'accountId' | 'createdAt'>>;
export type PatchRuleRequest = Partial<Omit<MatchingRule, 'ruleId' | 'accountId'>>;

export interface RuleResponse {
  rule: MatchingRule;
}

export interface RulesResponse {
  rules: MatchingRule[];
}

export interface SettingsResponse {
  settings: BudgetSettings;
}

export interface BudgetDataResponse {
  budgetData: BudgetData;
}

export interface ExportRequest {
  format: ExportFormat;
  month?: string;
}

export interface ExportResponse {
  contentType: string;
  body: string;
}

/**
 * App-owned AI runtime config (M15.1).
 *
 * Budget Tracker owns its own provider/model override and reads the
 * Launchpad-owned platform default read-only. Effective resolution:
 * app_override -> platform_default -> environment_fallback.
 */
const exampleBudgetAiConfigResponse: AppAiRuntimeConfigResponse = {
  ...exampleAppAiRuntimeConfigResponse,
  appSlug: 'budget-tracker',
};

export type BudgetTrackerRoute =
  | ApiRoute<ListTransactionsQuery, ListTransactionsResponse>
  | ApiRoute<BulkUpsertTransactionsRequest, BulkUpsertTransactionsResponse>
  | ApiRoute<PatchTransactionRequest, PatchTransactionResponse>
  | ApiRoute<EmptyRequest, DeleteResponse>
  | ApiRoute<EmptyRequest, RulesResponse>
  | ApiRoute<CreateRuleRequest, RuleResponse>
  | ApiRoute<PatchRuleRequest, RuleResponse>
  | ApiRoute<EmptyRequest, SettingsResponse>
  | ApiRoute<Partial<BudgetSettings>, SettingsResponse>
  | ApiRoute<EmptyRequest, BudgetDataResponse>
  | ApiRoute<Partial<BudgetData>, BudgetDataResponse>
  | ApiRoute<ExportRequest, ExportResponse>
  | ApiRoute<CsvAnalysisRequest, typeof exampleCsvAnalysisResponse>
  | ApiRoute<AiReviewRequest, BudgetTrackerAiResponse>
  | ApiRoute<EmptyRequest, AppAiRuntimeConfigResponse>
  | ApiRoute<AiRuntimeConfigUpdate, AppAiRuntimeConfigResponse>;

export const budgetTrackerRoutes = [
  {
    method: 'GET',
    path: '/api/budget/v1/transactions',
    auth: 'account',
    request: { limit: 1000 },
    response: { transactions: [exampleTransaction] },
  },
  {
    method: 'POST',
    path: '/api/budget/v1/transactions/bulk',
    auth: 'account',
    request: { transactions: [exampleTransaction] },
    response: { created: 1, updated: 0, skipped: 0, transactions: [exampleTransaction] },
  },
  {
    method: 'PATCH',
    path: '/api/budget/v1/transactions/{id}',
    auth: 'account',
    request: { categoryId: 'cat-living', subcategoryId: 'subcat-groceries', _manual: true },
    response: { transaction: exampleTransaction },
  },
  { method: 'DELETE', path: '/api/budget/v1/transactions/{id}', auth: 'account', request: emptyRequest, response: { deleted: true } },
  { method: 'GET', path: '/api/budget/v1/rules', auth: 'account', request: emptyRequest, response: { rules: [exampleMatchingRule] } },
  {
    method: 'POST',
    path: '/api/budget/v1/rules',
    auth: 'account',
    request: { name: 'Supermarket groceries', match: 'supermarket', categoryId: 'cat-living', subcategoryId: 'subcat-groceries' },
    response: { rule: exampleMatchingRule },
  },
  {
    method: 'PATCH',
    path: '/api/budget/v1/rules/{id}',
    auth: 'account',
    request: { enabled: false },
    response: { rule: exampleMatchingRule },
  },
  { method: 'DELETE', path: '/api/budget/v1/rules/{id}', auth: 'account', request: emptyRequest, response: { deleted: true } },
  { method: 'GET', path: '/api/budget/v1/settings', auth: 'account', request: emptyRequest, response: { settings: exampleBudgetSettings } },
  {
    method: 'PATCH',
    path: '/api/budget/v1/settings',
    auth: 'account',
    request: { aiReviewBatchSize: 5, aiReviewConfidenceThreshold: 'low' },
    response: { settings: exampleBudgetSettings },
  },
  { method: 'GET', path: '/api/budget/v1/budget-data', auth: 'account', request: emptyRequest, response: { budgetData: exampleBudgetData } },
  {
    method: 'PATCH',
    path: '/api/budget/v1/budget-data',
    auth: 'account',
    request: { budgetAmounts: { 'subcat-groceries': 800 } },
    response: { budgetData: exampleBudgetData },
  },
  { method: 'POST', path: '/api/budget/v1/export', auth: 'account', request: { format: 'csv', month: '2026-06' }, response: { contentType: 'text/csv', body: 'date,description,amount' } },
  {
    method: 'POST',
    path: '/api/budget/v1/ai/csv-analysis',
    auth: 'account',
    request: { prompt: 'Analyse CSV', sampleRows: [['Date', 'Description', 'Amount']], appName: 'budget-tracker' },
    response: exampleCsvAnalysisResponse,
  },
  {
    method: 'POST',
    path: '/api/budget/v1/ai/review',
    auth: 'account',
    request: {
      prompt: 'Review transactions',
      transactions: [{ index: 0, description: 'Supermarket', amount: '-84.50' }],
      categories: exampleBudgetData.categories,
      batchSize: 5,
      parallelLimit: 4,
      confidenceThreshold: 'low',
      asyncMode: true,
      appName: 'budget-tracker',
    },
    response: { jobId: 'job-bt-review-123' },
  },
  {
    method: 'GET',
    path: '/api/budget/v1/ai-config',
    auth: 'account',
    request: emptyRequest,
    response: exampleBudgetAiConfigResponse,
  },
  {
    method: 'PUT',
    path: '/api/budget/v1/ai-config/override',
    auth: 'account',
    request: { provider: 'openai', model: 'gpt-5.4-mini' },
    response: {
      ...exampleBudgetAiConfigResponse,
      appOverride: {
        pk: 'AI_CONFIG',
        sk: 'APP#budget-tracker',
        provider: 'openai',
        model: 'gpt-5.4-mini',
        updatedAt: '2026-06-07T00:00:00.000Z',
      },
      effective: { provider: 'openai', model: 'gpt-5.4-mini', source: 'app_override' },
    },
  },
  {
    method: 'DELETE',
    path: '/api/budget/v1/ai-config/override',
    auth: 'account',
    request: emptyRequest,
    response: exampleBudgetAiConfigResponse,
  },
] as const satisfies readonly BudgetTrackerRoute[];
