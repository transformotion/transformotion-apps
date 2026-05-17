import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  QueryCommand,
  BatchWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { withAuth, parseBody, ok, requireAppAccess, requireAccountAccess } from '@transformotion/lambda-middleware';
import { randomUUID } from 'crypto';
import type { Transaction } from '@transformotion/budget-domain';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const s3  = new S3Client({});
const TRANSACTIONS_TABLE       = process.env.TRANSACTIONS_TABLE!;
const MIGRATION_UPLOADS_BUCKET = process.env.MIGRATION_UPLOADS_BUCKET!;

function toIso(ddmmyyyy: string): string {
  const p = ddmmyyyy.split('/');
  return p.length === 3 ? `${p[2]}-${p[1]}-${p[0]}` : ddmmyyyy;
}

function txNaturalKey(t: Pick<Transaction, 'date' | 'amount' | 'description' | 'file'>): string {
  return `${t.date}|${t.amount}|${t.description}|${t.file}`;
}

// Hawkins E A payments received into the ANZ account are inter-account transfers.
function transformTransaction(tx: Omit<Transaction, 'accountId'>): Omit<Transaction, 'accountId'> {
  if (tx.category === '_ignore') {
    return { ...tx, category: 'Financial & Insurance', subcategory: 'Transfer', _manual: true };
  }
  return tx;
}

async function batchWrite(table: string, items: Record<string, unknown>[]) {
  for (let i = 0; i < items.length; i += 25) {
    const chunk = items.slice(i, i + 25);
    await ddb.send(new BatchWriteCommand({
      RequestItems: {
        [table]: chunk.map(Item => ({ PutRequest: { Item } })),
      },
    }));
  }
}

// POST /api/migrations/budget-tracker/transactions/import
export const handler = withAuth(async ({ auth, account, event }) => {
  requireAppAccess(auth, 'budget-tracker');
  requireAccountAccess(auth, 'budget-tracker', account.accountId);
  const { accountId } = account;

  const { s3Key } = parseBody<{ s3Key: string }>(event);
  if (!s3Key?.trim()) throw { statusCode: 400, message: 's3Key is required' };

  const s3Res = await s3.send(new GetObjectCommand({
    Bucket: MIGRATION_UPLOADS_BUCKET,
    Key: s3Key,
  }));
  const raw = await s3Res.Body!.transformToString();
  const transactions = JSON.parse(raw) as Omit<Transaction, 'accountId'>[];
  if (!Array.isArray(transactions)) throw {
    statusCode: 422,
    message: 'Invalid export file: expected a JSON array of transactions at top level',
  };

  // Load existing transactions for deduplication by natural key
  const existingTxRes = await ddb.send(new QueryCommand({
    TableName: TRANSACTIONS_TABLE,
    KeyConditionExpression: 'accountId = :aid',
    ExpressionAttributeValues: { ':aid': accountId },
    ProjectionExpression: 'transactionId, #d, amount, description, #f',
    ExpressionAttributeNames: { '#d': 'date', '#f': 'file' },
  }));

  const existingTxKeys = new Set((existingTxRes.Items ?? []).map(t => txNaturalKey(t as Transaction)));

  let txMigrated = 0; let txAlreadyPresent = 0;
  const txItems: Record<string, unknown>[] = [];

  for (const tx of transactions) {
    const transformed = transformTransaction(tx);
    const key = txNaturalKey(transformed);
    if (existingTxKeys.has(key)) { txAlreadyPresent++; continue; }
    // Strip legacy integer _id from v0 export — DynamoDB uses transactionId (UUID) as SK.
    const { _id: _legacyId, ...txFields } = transformed as typeof transformed & { _id?: unknown };
    txItems.push({
      ...txFields,
      accountId,
      transactionId: randomUUID(),
      dateIso:       toIso(transformed.date),
      _manual:       transformed._manual ?? false,
      _business:     transformed._business ?? false,
    });
    txMigrated++;
  }
  await batchWrite(TRANSACTIONS_TABLE, txItems);

  return ok({
    migrated:       { transactions: txMigrated },
    alreadyPresent: { transactions: txAlreadyPresent },
  });
});
