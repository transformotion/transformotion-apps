import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { withAuth, ok, requireAccountData } from '@transformotion/lambda-middleware';
import { computeCachedQuotes, type RawCacheRow } from './quotes';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE = process.env.ANALYSIS_CACHE_TABLE!;
const SHARED = 'SHARED';

// D9 read gate (claims-only; no site-admin branch, no membership loader for reads).
const saData = requireAccountData('stock-analyser');

/**
 * GET /market/cached-quotes — read-only enumeration of the latest cached quote
 * per ticker from the SHARED `MARKET-DATA#` cache. Never triggers a fetch or
 * warm; an empty cache yields an empty array (a valid, supported state).
 */
export const handler = withAuth(async ({ auth, account }) => {
  const { accountId } = account;
  saData.read(auth, accountId);

  const rows: RawCacheRow[] = [];
  let lastKey: Record<string, unknown> | undefined;
  do {
    const res = await ddb.send(
      new QueryCommand({
        TableName: TABLE,
        KeyConditionExpression: 'accountId = :aid AND begins_with(cacheKey, :prefix)',
        ExpressionAttributeValues: { ':aid': SHARED, ':prefix': 'MARKET-DATA#' },
        ProjectionExpression: 'cacheKey, #d, cachedAt',
        ExpressionAttributeNames: { '#d': 'data' },
        ExclusiveStartKey: lastKey,
      }),
    );
    for (const item of res.Items ?? []) {
      rows.push(item as RawCacheRow);
    }
    lastKey = res.LastEvaluatedKey;
  } while (lastKey);

  return ok({ quotes: computeCachedQuotes(rows) });
});
