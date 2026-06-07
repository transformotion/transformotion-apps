export type {
  Account,
  AccountMember,
  AiCsvAnalysisResponse,
  AiReviewResponse,
  BudgetData,
  BudgetFrequency,
  BudgetSettings,
  Category,
  CategoryType,
  CSVMapping,
  MatchingRule,
  MatchType,
  RawTransaction,
  ReviewBatchResult,
  Subcategory,
  Transaction,
} from '@transformotion/contracts/budget-tracker/types';

export type {
  BudgetTrackerWsBatchResultMessage as WsMessageBatchResult,
  BudgetTrackerWsCompleteMessage as WsMessageComplete,
  BudgetTrackerWsConnectedMessage as WsMessageConnected,
  BudgetTrackerWsServerMessage,
} from '@transformotion/contracts/budget-tracker/wss';

export type { AiErrorMessage as WsMessageError } from '@transformotion/contracts/_shared/ai-runtime';

export interface TransactionRepository {
  findAll(accountId: string): Promise<import('@transformotion/contracts/budget-tracker/types').Transaction[]>;
  findById(accountId: string, id: string): Promise<import('@transformotion/contracts/budget-tracker/types').Transaction | null>;
  upsertBulk(transactions: import('@transformotion/contracts/budget-tracker/types').Transaction[]): Promise<import('@transformotion/contracts/budget-tracker/types').Transaction[]>;
  update(
    id: string,
    accountId: string,
    updates: Partial<import('@transformotion/contracts/budget-tracker/types').Transaction>,
  ): Promise<import('@transformotion/contracts/budget-tracker/types').Transaction>;
  delete(id: string, accountId: string): Promise<void>;
}

export interface MatchingRulesRepository {
  findAll(accountId: string): Promise<import('@transformotion/contracts/budget-tracker/types').MatchingRule[]>;
  findById(accountId: string, id: string): Promise<import('@transformotion/contracts/budget-tracker/types').MatchingRule | null>;
  save(rule: import('@transformotion/contracts/budget-tracker/types').MatchingRule): Promise<import('@transformotion/contracts/budget-tracker/types').MatchingRule>;
  delete(id: string, accountId: string): Promise<void>;
}

export interface BudgetDataRepository {
  get(accountId: string): Promise<import('@transformotion/contracts/budget-tracker/types').BudgetData>;
  patch(
    accountId: string,
    partial: Partial<import('@transformotion/contracts/budget-tracker/types').BudgetData>,
  ): Promise<import('@transformotion/contracts/budget-tracker/types').BudgetData>;
}

export interface SettingsRepository {
  get(accountId: string): Promise<import('@transformotion/contracts/budget-tracker/types').BudgetSettings>;
  patch(
    accountId: string,
    updates: Partial<import('@transformotion/contracts/budget-tracker/types').BudgetSettings>,
  ): Promise<import('@transformotion/contracts/budget-tracker/types').BudgetSettings>;
}
