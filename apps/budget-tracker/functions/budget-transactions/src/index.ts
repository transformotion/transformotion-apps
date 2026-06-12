import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  QueryCommand,
  PutCommand,
  UpdateCommand,
  DeleteCommand,
  BatchWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import {
  withAuth,
  parseBody,
  getPathParam,
  getQueryParam,
  ok,
  notFound,
  requireAppAccess,
  requireAccountAccess,
  requireAccountWrite,
  type APIGatewayProxyEvent,
} from '@transformotion/lambda-middleware';
import { dynamoMembershipLoader } from '@transformotion/fn-account-membership';
import { randomUUID } from 'crypto';
import type { Transaction } from '@transformotion/budget-domain';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE = process.env.TRANSACTIONS_TABLE!;
const GSI   = 'accountId-dateIso-index';
// D8 write-path membership loader (scoped GetItem on launchpad-account-members).
const membershipLoader = dynamoMembershipLoader(ddb, process.env.ACCOUNT_MEMBERS_TABLE!);

function toIso(ddmmyyyy: string): string {
  const p = ddmmyyyy.split('/');
  return p.length === 3 ? `${p[2]}-${p[1]}-${p[0]}` : ddmmyyyy;
}

function naturalKey(t: Pick<Transaction, 'date' | 'amount' | 'description' | 'file'>): string {
  return `${t.date}|${t.amount}|${t.description}|${t.file}`;
}

// ── GET /api/budget/v1/transactions ───────────────────────────────────────────
async function listTransactions(event: APIGatewayProxyEvent, accountId: string) {
  const from  = getQueryParam(event, 'from',   false);
  const to    = getQueryParam(event, 'to',     false);
  const limit = parseInt(getQueryParam(event, 'limit', false) ?? '1000', 10);
  const cursor = getQueryParam(event, 'cursor', false);

  let KeyConditionExpression = 'accountId = :aid';
  const ExpressionAttributeValues: Record<string, unknown> = { ':aid': accountId };

  if (from && to) {
    KeyConditionExpression += ' AND dateIso BETWEEN :from AND :to';
    ExpressionAttributeValues[':from'] = from;
    ExpressionAttributeValues[':to']   = to;
  } else if (from) {
    KeyConditionExpression += ' AND dateIso >= :from';
    ExpressionAttributeValues[':from'] = from;
  } else if (to) {
    KeyConditionExpression += ' AND dateIso <= :to';
    ExpressionAttributeValues[':to'] = to;
  }

  const res = await ddb.send(new QueryCommand({
    TableName: from || to ? TABLE : TABLE,
    IndexName: from || to ? GSI : undefined,
    KeyConditionExpression,
    ExpressionAttributeValues,
    Limit: Math.min(limit, 5000),
    ExclusiveStartKey: cursor ? JSON.parse(Buffer.from(cursor, 'base64').toString()) : undefined,
  }));

  const nextCursor = res.LastEvaluatedKey
    ? Buffer.from(JSON.stringify(res.LastEvaluatedKey)).toString('base64')
    : undefined;

  return ok({ transactions: res.Items ?? [], nextCursor });
}

// ── POST /api/budget/v1/transactions/bulk ─────────────────────────────────────
async function bulkUpsert(event: APIGatewayProxyEvent, accountId: string) {
  const { transactions } = parseBody<{ transactions: Omit<Transaction, 'accountId'>[] }>(event);
  if (!Array.isArray(transactions) || transactions.length === 0) {
    return ok({ created: 0, updated: 0, skipped: 0, transactions: [] });
  }

  // Load existing transactions to deduplicate by natural key
  const existing: Transaction[] = [];
  let lastKey: Record<string, unknown> | undefined;
  do {
    const res = await ddb.send(new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: 'accountId = :aid',
      ExpressionAttributeValues: { ':aid': accountId },
      ProjectionExpression: 'transactionId, #d, amount, description, #f',
      ExpressionAttributeNames: { '#d': 'date', '#f': 'file' },
      ExclusiveStartKey: lastKey,
    }));
    existing.push(...(res.Items ?? []) as Transaction[]);
    lastKey = res.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (lastKey);

  const existingKeys = new Set(existing.map(naturalKey));

  let created = 0; const updated = 0; let skipped = 0;
  const resultTxs: Transaction[] = [];
  const toWrite: Transaction[] = [];

  for (const tx of transactions) {
    const key = naturalKey(tx);
    if (existingKeys.has(key)) { skipped++; continue; }
    const full: Transaction = {
      ...tx,
      accountId,
      transactionId: randomUUID(),
      categoryId:    tx.categoryId    ?? null,
      subcategoryId: tx.subcategoryId ?? null,
      _manual:       tx._manual   ?? false,
      _business:     tx._business ?? false,
    };
    toWrite.push(full);
    resultTxs.push(full);
    created++;
  }

  for (let i = 0; i < toWrite.length; i += 25) {
    const chunk = toWrite.slice(i, i + 25);
    await ddb.send(new BatchWriteCommand({
      RequestItems: {
        [TABLE]: chunk.map(tx => ({
          PutRequest: {
            Item: { ...tx, dateIso: toIso(tx.date) },
          },
        })),
      },
    }));
  }

  return ok({ created, updated, skipped, transactions: resultTxs });
}

// ── PATCH /api/budget/v1/transactions/:id ─────────────────────────────────────
async function updateTransaction(event: APIGatewayProxyEvent, accountId: string, transactionId: string) {
  const body = parseBody<Partial<Pick<Transaction, 'categoryId' | 'subcategoryId' | '_manual' | '_business'>>>(event);

  const expressions: string[] = [];
  const names: Record<string, string> = {};
  const values: Record<string, unknown> = { ':aid': accountId };

  if (body.categoryId !== undefined)    { expressions.push('categoryId = :catId');    values[':catId']   = body.categoryId; }
  if (body.subcategoryId !== undefined) { expressions.push('subcategoryId = :subId'); values[':subId']   = body.subcategoryId; }
  if (body._manual !== undefined)       { expressions.push('#manual = :manual');      names['#manual']   = '_manual';   values[':manual']   = body._manual; }
  if (body._business !== undefined)     { expressions.push('#business = :biz');       names['#business'] = '_business'; values[':biz']      = body._business; }
  if (expressions.length === 0) throw { statusCode: 400, message: 'No fields to update' };

  const res = await ddb.send(new UpdateCommand({
    TableName: TABLE,
    Key: { accountId, transactionId },
    UpdateExpression: `SET ${expressions.join(', ')}`,
    ExpressionAttributeNames: Object.keys(names).length ? names : undefined,
    ExpressionAttributeValues: values,
    ConditionExpression: 'accountId = :aid',
    ReturnValues: 'ALL_NEW',
  }));

  if (!res.Attributes) throw notFound(`Transaction ${transactionId} not found`);
  return ok({ transaction: { ...res.Attributes } });
}

// ── DELETE /api/budget/v1/transactions/:id ────────────────────────────────────
async function deleteTransaction(accountId: string, transactionId: string) {
  await ddb.send(new DeleteCommand({
    TableName: TABLE,
    Key: { accountId, transactionId },
    ConditionExpression: 'accountId = :aid',
    ExpressionAttributeValues: { ':aid': accountId },
  }));
  return ok({ deleted: true });
}

// ── Handler ───────────────────────────────────────────────────────────────────
export const handler = withAuth(async ({ auth, account, event }) => {
  requireAppAccess(auth, 'budget-tracker');
  requireAccountAccess(auth, 'budget-tracker', account.accountId);
  const { accountId } = account;
  const method   = event.httpMethod;
  const resource = event.resource ?? '';

  if (resource === '/api/budget/v1/transactions'      && method === 'GET')  return listTransactions(event, accountId);

  // Everything below mutates account data → D8 live membership-row check
  // (viewer/disabled/removed → 403; fail closed on missing row or loader error).
  await requireAccountWrite(auth, 'budget-tracker', accountId, membershipLoader);

  if (resource === '/api/budget/v1/transactions/bulk' && method === 'POST') return bulkUpsert(event, accountId);

  const transactionId = getPathParam(event, 'id');
  if (method === 'PATCH')  return updateTransaction(event, accountId, transactionId);
  if (method === 'DELETE') return deleteTransaction(accountId, transactionId);

  throw { statusCode: 400, message: `Unrecognised route: ${method} ${resource}` };
});
