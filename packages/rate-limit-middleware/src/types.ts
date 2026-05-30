import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type {
  LambdaContext,
  LambdaResponse,
  ProtectedHandler,
} from '@transformotion/lambda-middleware';

export interface RateLimitOptions {
  tableName: string;
  key: string;
  windowMs: number;
  maxRequests: number;
  keyPrefix?: string;
  partitionKeyName?: string;
  countAttributeName?: string;
  expiresAtAttributeName?: string;
  client?: DynamoDBDocumentClient;
  nowMs?: number;
  failOpen?: boolean;
}

export interface RateLimitResult {
  allowed: boolean;
  key: string;
  count: number;
  remaining: number;
  resetAt: number;
  retryAfterMs?: number;
  error?: unknown;
}

export interface WithRateLimitOptions {
  getOptions: (ctx: LambdaContext) => RateLimitOptions | Promise<RateLimitOptions>;
  onLimited?: (result: RateLimitResult, ctx: LambdaContext) => LambdaResponse | Promise<LambdaResponse>;
}

export type RateLimitedProtectedHandler = ProtectedHandler;
