import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import {
  withAuth,
  parseBody,
  ok,
  notFound,
} from '@transformotion/lambda-middleware';
import type { PortfolioHolding } from './types';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE = process.env.PORTFOLIO_TABLE!;

export const handler = withAuth(async ({ auth, account, event }) => {
  void auth;
  const { accountId } = account;

  // ── GET /portfolio ────────────────────────────────────────────────────────
  if (event.httpMethod === 'GET') {
    const res = await ddb.send(new GetCommand({
      TableName: TABLE,
      Key: { accountId },
    }));

    if (!res.Item) {
      // No holdings yet — return empty list (not a 404)
      return ok({ holdings: [] });
    }

    return ok({ holdings: res.Item['holdings'] as PortfolioHolding[] ?? [] });
  }

  // ── PUT /portfolio ────────────────────────────────────────────────────────
  const { holdings } = parseBody<{ holdings: PortfolioHolding[] }>(event);

  if (!Array.isArray(holdings)) {
    throw notFound('holdings must be an array');
  }

  await ddb.send(new PutCommand({
    TableName: TABLE,
    Item: {
      accountId,
      holdings,
      updatedAt: new Date().toISOString(),
    },
  }));

  return ok({ ok: true });
});
