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
} from '@transformotion/lambda-middleware';
import type { PortfolioHolding } from './types';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE = process.env.PORTFOLIO_TABLE!;

export const handler = withAuth(async ({ auth, account, event }) => {
  requireAppAccess(auth, 'stock-analyser');
  requireAccountAccess(auth, 'stock-analyser', account.accountId);
  const { accountId } = account;

  // ── GET /portfolio ────────────────────────────────────────────────────────
  if (event.httpMethod === 'GET') {
    const res = await ddb.send(new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: 'accountId = :aid',
      ExpressionAttributeValues: { ':aid': accountId },
    }));

    const holdings = (res.Items ?? []) as PortfolioHolding[];
    return ok({ holdings });
  }

  // ── PUT /portfolio ────────────────────────────────────────────────────────
  const { holdings } = parseBody<{ holdings: PortfolioHolding[] }>(event);

  if (!Array.isArray(holdings)) {
    throw badRequest('holdings must be an array');
  }

  // Query all existing tickers for this account
  const existingRes = await ddb.send(new QueryCommand({
    TableName: TABLE,
    KeyConditionExpression: 'accountId = :aid',
    ExpressionAttributeValues: { ':aid': accountId },
  }));
  const existing = (existingRes.Items ?? []) as PortfolioHolding[];

  // ── Immutability guard ────────────────────────────────────────────────────
  // avgCost and shares are set on initial CSV import and must never be
  // overwritten. The only way to change them is to clear all holdings
  // (PUT []) then re-import.
  if (holdings.length > 0 && existing.length > 0) {
    const byTicker = new Map(existing.map(h => [h.ticker, h]));
    for (const incoming of holdings) {
      const prev = byTicker.get(incoming.ticker);
      if (!prev) continue; // new ticker — allowed

      // avgCost: allow change for gifted (isGifted=true / avgCost=0), never change non-zero
      if (!prev.isGifted && prev.avgCost !== 0 && incoming.avgCost !== prev.avgCost) {
        throw badRequest(
          `Cannot modify avgCost for existing holding ${incoming.ticker} ` +
          `(existing: ${prev.avgCost}, incoming: ${incoming.avgCost}). ` +
          `Clear all holdings first, then re-import.`
        );
      }
      // shares: never change
      if (incoming.shares !== prev.shares) {
        throw badRequest(
          `Cannot modify shares for existing holding ${incoming.ticker} ` +
          `(existing: ${prev.shares}, incoming: ${incoming.shares}). ` +
          `Clear all holdings first, then re-import.`
        );
      }
    }
  }

  // ── Delete removed tickers ────────────────────────────────────────────────
  const incomingTickers = new Set(holdings.map(h => h.ticker));
  const toDelete = existing.filter(h => !incomingTickers.has(h.ticker));
  await Promise.all(toDelete.map(h =>
    ddb.send(new DeleteCommand({
      TableName: TABLE,
      Key: { accountId, ticker: h.ticker },
    }))
  ));

  // ── Put each incoming holding ─────────────────────────────────────────────
  await Promise.all(holdings.map(h =>
    ddb.send(new PutCommand({
      TableName: TABLE,
      Item: {
        accountId,
        ticker:   h.ticker,
        shares:   h.shares,
        avgCost:  h.avgCost,
        isGifted: h.isGifted ?? false,
        addedAt:  h.addedAt,
      },
    }))
  ));

  return ok({ ok: true });
});
