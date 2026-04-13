import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import {
  withAuth,
  parseBody,
  ok,
  badRequest,
} from '@transformotion/lambda-middleware';
import type { WatchlistItem } from './types';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE = process.env.WATCHLIST_TABLE!;

export const handler = withAuth(async ({ auth, account, event }) => {
  void auth;
  const { accountId } = account;

  // ── GET /watchlist ────────────────────────────────────────────────────────
  if (event.httpMethod === 'GET') {
    const res = await ddb.send(new GetCommand({
      TableName: TABLE,
      Key: { accountId },
    }));

    if (!res.Item) {
      return ok({ items: [] });
    }

    return ok({ items: res.Item['items'] as WatchlistItem[] ?? [] });
  }

  // ── PUT /watchlist ────────────────────────────────────────────────────────
  const { items } = parseBody<{ items: WatchlistItem[] }>(event);

  if (!Array.isArray(items)) {
    throw badRequest('items must be an array');
  }

  await ddb.send(new PutCommand({
    TableName: TABLE,
    Item: {
      accountId,
      items,
      updatedAt: new Date().toISOString(),
    },
  }));

  return ok({ ok: true });
});
