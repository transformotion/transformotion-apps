import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { withAuth, getQueryParam, requireGroup } from '@transformotion/lambda-middleware';
import type { Transaction } from '@transformotion/budget-domain';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE = process.env.TRANSACTIONS_TABLE!;
const GSI   = 'accountId-dateIso-index';

function toIso(ddmmyyyy: string): string {
  const p = ddmmyyyy.split('/');
  return p.length === 3 ? `${p[2]}-${p[1]}-${p[0]}` : ddmmyyyy;
}

// GET /api/budget/v1/business-export
export const handler = withAuth(async ({ auth, account, event }) => {
  requireGroup(auth, 'budget-app', 'admin');
  const { accountId } = account;

  const from = getQueryParam(event, 'from', false);
  const to   = getQueryParam(event, 'to',   false);

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

  const txs: Transaction[] = [];
  let lastKey: Record<string, unknown> | undefined;

  do {
    const res = await ddb.send(new QueryCommand({
      TableName: TABLE,
      IndexName: from || to ? GSI : undefined,
      KeyConditionExpression,
      FilterExpression: '_business = :true',
      ExpressionAttributeValues: { ...ExpressionAttributeValues, ':true': true },
      ExclusiveStartKey: lastKey,
    }));
    txs.push(...(res.Items ?? []) as Transaction[]);
    lastKey = res.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (lastKey);

  const rows = [
    ['Date', 'Amount', 'Description', 'Category', 'Subcategory', 'File'],
    ...txs.map(t => [
      t.date,
      t.amount,
      `"${t.description.replace(/"/g, '""')}"`,
      t.category,
      t.subcategory,
      t.file,
    ]),
  ];

  const csv = rows.map(r => r.join(',')).join('\n');
  const timestamp = new Date().toISOString().slice(0, 10);

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="business-expenses-${accountId}-${timestamp}.csv"`,
    },
    body: csv,
  };
});
