import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import type { RateLimitOptions, RateLimitResult } from './types';

function isConditionalFailure(err: unknown): boolean {
  return err instanceof ConditionalCheckFailedException
    || (typeof err === 'object' && err !== null && (err as { name?: string }).name === 'ConditionalCheckFailedException');
}

function buildWindowKey(options: RateLimitOptions, nowMs: number): {
  storageKey: string;
  windowStart: number;
  resetAt: number;
} {
  const windowStart = Math.floor(nowMs / options.windowMs) * options.windowMs;
  const resetAt = windowStart + options.windowMs;
  const prefix = options.keyPrefix ? `${options.keyPrefix}#` : '';

  return {
    storageKey: `${prefix}${options.key}#${windowStart}`,
    windowStart,
    resetAt,
  };
}

export async function checkRateLimit(options: RateLimitOptions): Promise<RateLimitResult> {
  const nowMs = options.nowMs ?? Date.now();
  const { storageKey, resetAt } = buildWindowKey(options, nowMs);
  const partitionKeyName = options.partitionKeyName ?? 'pk';
  const countAttributeName = options.countAttributeName ?? 'count';
  const expiresAtAttributeName = options.expiresAtAttributeName ?? 'expiresAt';
  const client = options.client ?? DynamoDBDocumentClient.from(new DynamoDBClient({}));
  const ttlSeconds = Math.ceil(resetAt / 1000);

  try {
    const result = await client.send(new UpdateCommand({
      TableName: options.tableName,
      Key: { [partitionKeyName]: storageKey },
      UpdateExpression: [
        `ADD #count :one`,
        `SET #expiresAt = if_not_exists(#expiresAt, :expiresAt)`,
      ].join(' '),
      ConditionExpression: 'attribute_not_exists(#count) OR #count < :maxRequests',
      ExpressionAttributeNames: {
        '#count': countAttributeName,
        '#expiresAt': expiresAtAttributeName,
      },
      ExpressionAttributeValues: {
        ':one': 1,
        ':maxRequests': options.maxRequests,
        ':expiresAt': ttlSeconds,
      },
      ReturnValues: 'ALL_NEW',
    }));

    const count = Number(result.Attributes?.[countAttributeName] ?? 1);
    return {
      allowed: true,
      key: storageKey,
      count,
      remaining: Math.max(options.maxRequests - count, 0),
      resetAt,
    };
  } catch (err) {
    if (isConditionalFailure(err)) {
      return {
        allowed: false,
        key: storageKey,
        count: options.maxRequests,
        remaining: 0,
        resetAt,
        retryAfterMs: Math.max(resetAt - nowMs, 0),
      };
    }

    if (options.failOpen ?? true) {
      return {
        allowed: true,
        key: storageKey,
        count: 0,
        remaining: options.maxRequests,
        resetAt,
        error: err,
      };
    }

    throw err;
  }
}
