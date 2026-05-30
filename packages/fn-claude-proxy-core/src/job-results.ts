import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import type { JobResultsRecord } from './types';

export interface WriteJobResultOptions {
  tableName: string;
  accountId: string;
  jobId: string;
  payload: Record<string, unknown>;
  ttlSeconds?: number;
  client?: DynamoDBDocumentClient;
  now?: Date;
}

export function buildJobResultsRecord(options: WriteJobResultOptions): JobResultsRecord {
  const now = options.now ?? new Date();
  const cachedAt = now.toISOString();
  const expiresAt = Math.floor(now.getTime() / 1000) + (options.ttlSeconds ?? 2 * 60 * 60);

  return {
    accountId: options.accountId,
    cacheKey: `job-${options.jobId}`,
    data: {
      data: options.payload,
      cachedAt,
      mode: 'live',
      type: 'job',
    },
    cachedAt,
    expiresAt,
  };
}

export async function writeJobResult(options: WriteJobResultOptions): Promise<JobResultsRecord> {
  const record = buildJobResultsRecord(options);
  const client = options.client ?? DynamoDBDocumentClient.from(new DynamoDBClient({}));

  await client.send(new PutCommand({
    TableName: options.tableName,
    Item: record,
  }));

  return record;
}
