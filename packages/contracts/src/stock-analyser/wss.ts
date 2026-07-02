import type { AccountId, ISODateTime, UserId } from '../_shared/api';
import type { AiErrorMessage, AiTextResponse } from '../_shared/ai-runtime';

export interface StockAnalyserWsConnectQuery {
  token: string;
  accountId?: AccountId;
  app?: 'stock-analyser';
}

export interface StockAnalyserWsConnectionRecord {
  connectionId: string;
  userId: UserId;
  accountId?: AccountId;
  app: 'stock-analyser';
  createdAt: ISODateTime;
  expiresAt: number;
}

export interface StockAnalyserWsInitMessage {
  action: 'init';
}

export interface StockAnalyserWsConnectedMessage {
  type: 'connected';
  connectionId: string;
}

export interface StockAnalyserWsAiResultMessage {
  type: 'result';
  jobId: string;
  cacheKey?: string;
  result: AiTextResponse;
}

export type StockAnalyserWsClientMessage = StockAnalyserWsInitMessage;
export type StockAnalyserWsServerMessage =
  | StockAnalyserWsConnectedMessage
  | StockAnalyserWsAiResultMessage
  | AiErrorMessage;

export const exampleStockAnalyserWsConnection = {
  connectionId: 'sa-connection-123',
  userId: 'user-123',
  accountId: 'acct-sa-123',
  app: 'stock-analyser',
  createdAt: '2026-06-07T00:00:00.000Z',
  expiresAt: 1798761600,
} as const satisfies StockAnalyserWsConnectionRecord;

export const exampleStockAnalyserWsConnectedMessage = {
  type: 'connected',
  connectionId: 'sa-connection-123',
} as const satisfies StockAnalyserWsConnectedMessage;
