import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  QueryCommand,
  PutCommand,
  DeleteCommand,
} from '@aws-sdk/lib-dynamodb';
import {
  withAuth,
  parseBody,
  ok,
  badRequest,
  requireAppAccess,
  requireAccountAccess,
  requireAccountWrite,
} from '@transformotion/lambda-middleware';
import { dynamoMembershipLoader } from '@transformotion/fn-account-membership';
import type { WatchlistItem } from './types';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE = process.env.WATCHLIST_TABLE!;
// D8 write-path membership loader (scoped GetItem on launchpad-account-members).
const membershipLoader = dynamoMembershipLoader(ddb, process.env.ACCOUNT_MEMBERS_TABLE!);

export const handler = withAuth(async ({ auth, account, event }) => {
  requireAppAccess(auth, 'stock-analyser');
  requireAccountAccess(auth, 'stock-analyser', account.accountId);
  const { accountId } = account;

  // ── GET /watchlist ──────────────────────────────────────────────────────── (read: claims-only)
  if (event.httpMethod === 'GET') {
    const res = await ddb.send(new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: 'accountId = :aid',
      ExpressionAttributeValues: { ':aid': accountId },
    }));

    const items = (res.Items ?? []) as WatchlistItem[];
    return ok({ items });
  }

  // ── PUT /watchlist ──────────────────────────────────────────────────────── (write: live row check)
  await requireAccountWrite(auth, 'stock-analyser', accountId, membershipLoader);

  const { items } = parseBody<{ items: WatchlistItem[] }>(event);

  if (!Array.isArray(items)) {
    throw badRequest('items must be an array');
  }

  // Query existing tickers for this account
  const existingRes = await ddb.send(new QueryCommand({
    TableName: TABLE,
    KeyConditionExpression: 'accountId = :aid',
    ExpressionAttributeValues: { ':aid': accountId },
  }));
  const existing = (existingRes.Items ?? []) as WatchlistItem[];

  // ── Delete removed tickers ────────────────────────────────────────────────
  const incomingTickers = new Set(items.map(i => i.ticker));
  const toDelete = existing.filter(i => !incomingTickers.has(i.ticker));
  await Promise.all(toDelete.map(i =>
    ddb.send(new DeleteCommand({
      TableName: TABLE,
      Key: { accountId, ticker: i.ticker },
    }))
  ));

  // ── Put each incoming item ────────────────────────────────────────────────
  await Promise.all(items.map(i =>
    ddb.send(new PutCommand({
      TableName: TABLE,
      Item: {
        accountId,
        ticker:     i.ticker,
        name:       i.name,
        addedAt:    i.addedAt,
        ...(i.addedPrice !== undefined && { addedPrice: i.addedPrice }),
      },
    }))
  ));

  return ok({ ok: true });
});
