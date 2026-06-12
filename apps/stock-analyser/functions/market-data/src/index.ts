import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import {
  withAuth,
  ok,
  badRequest,
  requireAccountData,
  HttpError,
} from '@transformotion/lambda-middleware';
import { fetchOhlcv } from '../../_shared/market-data-fetcher';

// D9 data-tier gate (no site-admin branch). market-data is a READ of shared
// market data; a viewer member may read it.
const saData = requireAccountData('stock-analyser');
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE    = process.env.ANALYSIS_CACHE_TABLE!;
const SHARED   = 'SHARED';
const TTL_SECS = 28800; // 8 hours

const VALID_RANGES    = new Set(['1mo', '3mo', '6mo', '1y', '5y', 'max']);
const VALID_INTERVALS = new Set(['1d', '1wk', '1mo']);

export const handler = withAuth(async ({ auth, account, event }) => {
  saData.read(auth, account.accountId);

  const { ticker, range = '1y', interval = '1d' } = event.queryStringParameters ?? {};
  if (!ticker) throw badRequest('ticker is required');
  if (!VALID_RANGES.has(range)) throw badRequest(`range must be one of: ${[...VALID_RANGES].join(', ')}`);
  if (!VALID_INTERVALS.has(interval)) throw badRequest(`interval must be one of: ${[...VALID_INTERVALS].join(', ')}`);

  const cacheKey = `MARKET-DATA#${ticker}#${range}#${interval}`;

  const cached = await ddb.send(new GetCommand({
    TableName: TABLE,
    Key: { accountId: SHARED, cacheKey },
  }));

  if (cached.Item) {
    const data = typeof cached.Item.data === 'string'
      ? JSON.parse(cached.Item.data)
      : cached.Item.data;
    return ok({ ...data, source: 'cache' as const });
  }

  let ohlcv: Awaited<ReturnType<typeof fetchOhlcv>>;
  try {
    ohlcv = await fetchOhlcv(ticker, range, interval);
  } catch (err) {
    console.error(`[market-data] Yahoo Finance error for ${ticker}:`, err);
    throw new HttpError(503, 'Failed to fetch market data from Yahoo Finance');
  }

  if (ohlcv.closes.length < 2) {
    throw new HttpError(503, `Insufficient data for ${ticker}`);
  }

  const payload = {
    ticker,
    range,
    interval,
    ...ohlcv,
    fetchedAt: new Date().toISOString(),
  };

  const nowSecs = Math.floor(Date.now() / 1000);
  await ddb.send(new PutCommand({
    TableName: TABLE,
    Item: {
      accountId: SHARED,
      cacheKey,
      data:      JSON.stringify(payload),
      dataType:  'market-data-ohlcv',
      mode:      'live',
      cachedAt:  nowSecs,
      expiresAt: nowSecs + TTL_SECS,
    },
  }));

  console.log(`[market-data] Fetched and cached: ${cacheKey}`);

  return ok({ ...payload, source: 'live' as const });
});
