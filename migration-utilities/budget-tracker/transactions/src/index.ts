import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  QueryCommand,
  BatchWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import { withAuth, parseBody, ok, requireAppAccess, requireAccountAccess } from '@transformotion/lambda-middleware';
import { randomUUID } from 'crypto';
import type { Transaction } from '@transformotion/budget-domain';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TRANSACTIONS_TABLE = process.env.TRANSACTIONS_TABLE!;

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

  const { transactions } = parseBody<{
    transactions: Omit<Transaction, 'accountId'>[];
  }>(event);

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

  for (const tx of transactions ?? []) {
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
      _ignore:       transformed.subcategory === 'Transfer' ? true : (transformed._ignore ?? undefined),
    });
    txMigrated++;
  }
  await batchWrite(TRANSACTIONS_TABLE, txItems);

  return ok({
    migrated:      { transactions: txMigrated },
    alreadyPresent: { transactions: txAlreadyPresent },
  });
});
