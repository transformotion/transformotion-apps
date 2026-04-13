import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import {
  withAuth,
  parseBody,
  getPathParam,
  ok,
  noContent,
  notFound,
  badRequest,
} from '@transformotion/lambda-middleware';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE = process.env.CACHE_TABLE!;

export const handler = withAuth(async ({ auth, account, event }) => {
  void auth;
  const { accountId } = account;
  const cacheKey = getPathParam(event, 'key');

  // ── GET /analysis-cache/{key} ─────────────────────────────────────────────
  if (event.httpMethod === 'GET') {
    const res = await ddb.send(new GetCommand({
      TableName: TABLE,
      Key: { accountId, cacheKey },
    }));

    if (!res.Item) {
      throw notFound(`Cache entry '${cacheKey}' not found`);
    }

    return ok({
      data:      res.Item['data'],
      cachedAt:  res.Item['cachedAt'] as string,
      expiresAt: res.Item['expiresAt'] as number,
    });
  }

  // ── DELETE /analysis-cache/{key} ──────────────────────────────────────────
  if (event.httpMethod === 'DELETE') {
    await ddb.send(new DeleteCommand({
      TableName: TABLE,
      Key: { accountId, cacheKey },
    }));

    return noContent();
  }

  // ── PUT /analysis-cache/{key} ─────────────────────────────────────────────
  const { data, ttlSeconds } = parseBody<{ data: unknown; ttlSeconds: number }>(event);

  if (data === undefined) throw badRequest('data is required');
  if (typeof ttlSeconds !== 'number' || ttlSeconds < 1) {
    throw badRequest('ttlSeconds must be a positive number');
  }

  const now       = new Date();
  const expiresAt = Math.floor(now.getTime() / 1000) + ttlSeconds;

  await ddb.send(new PutCommand({
    TableName: TABLE,
    Item: {
      accountId,
      cacheKey,
      data,
      cachedAt:  now.toISOString(),
      expiresAt,           // DynamoDB TTL — epoch seconds
    },
  }));

  return ok({ ok: true });
});
