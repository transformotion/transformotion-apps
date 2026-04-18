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

// Special partition key used for data shared across all accounts.
// Market analysis, recommendations, ETFs, metals, and stock analyses
// are the same regardless of who fetches them — no need to re-fetch
// per user.
const SHARED = 'SHARED';

/**
 * Normalise a DynamoDB item to the canonical response shape.
 * Handles two historical formats:
 *
 *   Legacy (pre-SHARED): data was stored as a nested CachedValue object
 *     { data: { data: T, cachedAt: string, mode, type }, cachedAt: ISO, expiresAt }
 *
 *   Current: data is a JSON string, top-level dataType/mode/cachedAt (epoch seconds)
 *     { data: '{"..."}', dataType, mode, cachedAt: number, expiresAt }
 */
function normaliseItem(item: Record<string, unknown>) {
  const raw = item['data'];
  let data: unknown;
  let cachedAt: number;
  let dataType: string | undefined = item['dataType'] as string | undefined;
  let mode: string | undefined     = item['mode']     as string | undefined;

  if (typeof raw === 'string') {
    // Current format — data is already a JSON string
    data = raw;
    const ca = item['cachedAt'];
    cachedAt = typeof ca === 'number' ? ca : Math.floor(new Date(ca as string).getTime() / 1000);
  } else if (raw && typeof raw === 'object' && 'data' in (raw as object)) {
    // Legacy CachedValue wrapper — flatten it and re-stringify
    const cv = raw as { data: unknown; cachedAt: string; mode?: string; type?: string };
    data     = JSON.stringify(cv.data);
    cachedAt = Math.floor(new Date(cv.cachedAt).getTime() / 1000);
    mode     ??= cv.mode;
    dataType ??= cv.type;
  } else {
    // Fallback: stringify whatever is there
    data     = JSON.stringify(raw);
    const ca = item['cachedAt'];
    cachedAt = typeof ca === 'number' ? ca : Math.floor(new Date(ca as string ?? new Date()).getTime() / 1000);
  }

  return {
    data,
    cachedAt,
    expiresAt: item['expiresAt'] as number,
    dataType,
    mode,
  };
}

// Key prefixes whose data is shared across all accounts — always write to SHARED partition.
// This overrides the client's `shared` flag so a misbehaving client can't pollute the
// per-account partition with data that should be global.
const SHARED_PREFIXES = ['MARKET', 'ETFS', 'RECS', 'METALS', 'ANALYSIS', 'CYCLE'];

function resolveWriteAccountId(cacheKey: string, fallbackAccountId: string, clientShared: boolean): string {
  const prefix = cacheKey.split('#')[0];
  if (SHARED_PREFIXES.includes(prefix)) return SHARED;
  return clientShared ? SHARED : fallbackAccountId;
}

export const handler = withAuth(async ({ auth, account, event }) => {
  void auth;
  const { accountId } = account;
  // URL-decode the key so clients can send MARKET%23Global and the DDB key is MARKET#Global.
  const cacheKey = decodeURIComponent(getPathParam(event, 'key'));

  // ── GET /analysis-cache/{key} ─────────────────────────────────────────────
  if (event.httpMethod === 'GET') {
    // Check SHARED partition first (benefits all users), then fall back to
    // the account-specific partition (legacy items written before SHARED was introduced).
    let res = await ddb.send(new GetCommand({
      TableName: TABLE,
      Key: { accountId: SHARED, cacheKey },
    }));

    if (!res.Item) {
      res = await ddb.send(new GetCommand({
        TableName: TABLE,
        Key: { accountId, cacheKey },
      }));
    }

    if (!res.Item) {
      throw notFound(`Cache entry '${cacheKey}' not found`);
    }

    return ok(normaliseItem(res.Item as Record<string, unknown>));
  }

  // ── DELETE /analysis-cache/{key} ──────────────────────────────────────────
  if (event.httpMethod === 'DELETE') {
    // Delete from both partitions in case legacy items exist
    await Promise.allSettled([
      ddb.send(new DeleteCommand({ TableName: TABLE, Key: { accountId: SHARED, cacheKey } })),
      ddb.send(new DeleteCommand({ TableName: TABLE, Key: { accountId,        cacheKey } })),
    ]);

    return noContent();
  }

  // ── PUT /analysis-cache/{key} ─────────────────────────────────────────────
  const {
    data,
    ttlSeconds,
    mode    = 'live',
    type    = 'unknown',
    shared  = true,          // default to SHARED — all analysis data benefits everyone
  } = parseBody<{
    data:       unknown;
    ttlSeconds: number;
    mode?:      string;
    type?:      string;
    shared?:    boolean;
  }>(event);

  if (data === undefined) throw badRequest('data is required');
  if (typeof ttlSeconds !== 'number' || ttlSeconds < 1) {
    throw badRequest('ttlSeconds must be a positive number');
  }

  const writeAccountId = resolveWriteAccountId(cacheKey, accountId, shared);
  const nowSeconds     = Math.floor(Date.now() / 1000);
  const expiresAt      = nowSeconds + ttlSeconds;

  await ddb.send(new PutCommand({
    TableName: TABLE,
    Item: {
      accountId:  writeAccountId,
      cacheKey,
      data:       typeof data === 'string' ? data : JSON.stringify(data),
      dataType:   type,
      mode,
      cachedAt:   nowSeconds,    // epoch seconds — consistent with expiresAt
      expiresAt,                 // DynamoDB TTL attribute (epoch seconds)
    },
  }));

  console.log(`[cache] Written: ${cacheKey} accountId=${writeAccountId} ttl=${ttlSeconds} type=${type}`);

  return ok({ ok: true });
});
