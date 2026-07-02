import type { AccountId, ISODateTime, UserId } from '../_shared/api';
import type { AiErrorMessage } from '../_shared/ai-runtime';
import { exampleReviewBatchResult, type ReviewBatchResult } from './types';

export interface BudgetTrackerWsConnectQuery {
  token: string;
  accountId?: AccountId;
  app?: 'budget-tracker';
}

export interface BudgetTrackerWsConnectionRecord {
  connectionId: string;
  userId: UserId;
  accountId?: AccountId;
  app: 'budget-tracker';
  createdAt: ISODateTime;
  expiresAt: number;
}

export interface BudgetTrackerWsInitMessage {
  action: 'init';
}

export interface BudgetTrackerWsConnectedMessage {
  type: 'connected';
  connectionId: string;
}

export interface BudgetTrackerWsBatchResultMessage {
  type: 'batch_result';
  jobId: string;
  pass: 1 | 2;
  results: ReviewBatchResult[];
  completedCount: number;
  totalCount: number;
}

export interface BudgetTrackerWsCompleteMessage {
  type: 'complete';
  jobId: string;
}

export type BudgetTrackerWsClientMessage = BudgetTrackerWsInitMessage;
export type BudgetTrackerWsServerMessage =
  | BudgetTrackerWsConnectedMessage
  | BudgetTrackerWsBatchResultMessage
  | BudgetTrackerWsCompleteMessage
  | AiErrorMessage;

export const exampleBudgetTrackerWsConnection = {
  connectionId: 'bt-connection-123',
  userId: 'user-123',
  accountId: 'acct-bt-123',
  app: 'budget-tracker',
  createdAt: '2026-06-07T00:00:00.000Z',
  expiresAt: 1798761600,
} as const satisfies BudgetTrackerWsConnectionRecord;

export const exampleBudgetTrackerWsConnectedMessage = {
  type: 'connected',
  connectionId: 'bt-connection-123',
} as const satisfies BudgetTrackerWsConnectedMessage;

export const exampleBudgetTrackerWsBatchResultMessage = {
  type: 'batch_result',
  jobId: 'job-bt-review-123',
  pass: 1,
  results: [exampleReviewBatchResult],
  completedCount: 1,
  totalCount: 1,
} as const satisfies BudgetTrackerWsBatchResultMessage;
