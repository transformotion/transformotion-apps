import { createHash } from 'crypto';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import type { Category, WsMessageBatchResult } from '@transformotion/budget-domain';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export const REVIEW_CACHE_SCHEMA_VERSION = 'bt-review-cache-v1-provider-agnostic';
const REVIEW_CACHE_TTL_SECONDS = 7 * 24 * 60 * 60;

export interface ReviewCacheInput {
  transactions: Array<{ index: number; description: string; amount: string }>;
  categories: Category[];
  settings?: { batchSize?: number; parallelLimit?: number; confidenceThreshold?: 'low' | 'medium' | 'high' };
}

export interface ReviewCacheRecord {
  accountId: string;
  transactionsHash: string;
  batches: WsMessageBatchResult[];
  createdAt: string;
  expiresAt: number;
  schemaVersion: string;
}

export function buildReviewTransactionsHash(input: ReviewCacheInput): string {
  const payload = {
    schemaVersion: REVIEW_CACHE_SCHEMA_VERSION,
    transactions: input.transactions.map(tx => ({
      index: tx.index,
      description: normaliseText(tx.description),
      amount: normaliseAmount(tx.amount),
    })),
    categories: input.categories
      .filter(cat => !cat.deleted)
      .map(cat => ({
        categoryId: cat.categoryId,
        name: normaliseText(cat.name),
        type: cat.type,
        subcategories: cat.subcategories
          .filter(sub => !sub.deleted)
          .map(sub => ({
            subcategoryId: sub.subcategoryId,
            name: normaliseText(sub.name),
          }))
          .sort((a, b) => a.subcategoryId.localeCompare(b.subcategoryId)),
      }))
      .sort((a, b) => a.categoryId.localeCompare(b.categoryId)),
    settings: {
      confidenceThreshold: input.settings?.confidenceThreshold ?? 'low',
    },
  };

  return createHash('sha256')
    .update(JSON.stringify(payload))
    .digest('hex');
}

export async function getCachedReview(
  tableName: string | undefined,
  accountId: string,
  transactionsHash: string,
): Promise<ReviewCacheRecord | null> {
  if (!tableName) return null;

  const result = await ddb.send(new GetCommand({
    TableName: tableName,
    Key: { accountId, transactionsHash },
  }));

  if (!result.Item) return null;
  if (result.Item['schemaVersion'] !== REVIEW_CACHE_SCHEMA_VERSION) return null;

  return result.Item as ReviewCacheRecord;
}

export async function putCachedReview(
  tableName: string | undefined,
  accountId: string,
  transactionsHash: string,
  batches: WsMessageBatchResult[],
): Promise<void> {
  if (!tableName || batches.length === 0) return;

  const now = Math.floor(Date.now() / 1000);
  await ddb.send(new PutCommand({
    TableName: tableName,
    Item: {
      accountId,
      transactionsHash,
      batches,
      createdAt: new Date(now * 1000).toISOString(),
      expiresAt: now + REVIEW_CACHE_TTL_SECONDS,
      schemaVersion: REVIEW_CACHE_SCHEMA_VERSION,
    } satisfies ReviewCacheRecord,
  }));
}

function normaliseText(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

function normaliseAmount(value: string): string {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric.toFixed(2) : value.trim();
}
