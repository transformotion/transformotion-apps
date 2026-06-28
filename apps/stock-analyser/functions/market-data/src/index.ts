import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import type { APIGatewayProxyEvent, Context } from 'aws-lambda';
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

/**
 * Core OHLCV read: SHARED cache-first, then Yahoo via the shared fetcher, then
 * cache-write. Shared by the authenticated API path AND the service-principal
 * path (#584), so both return byte-identical OHLCV from the SAME source — the
 * property the cache-warming job's grounding depends on (warm === live).
 */
async function getOhlcv(ticker: string, range: string, interval: string) {
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
    return { ...data, source: 'cache' as const };
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

  return { ...payload, source: 'live' as const };
}

const apiHandler = withAuth(async ({ auth, account, event }) => {
  saData.read(auth, account.accountId);

  const { ticker, range = '1y', interval = '1d' } = event.queryStringParameters ?? {};
  if (!ticker) throw badRequest('ticker is required');

  return ok(await getOhlcv(ticker, range, interval));
});

// ── #584 service-principal OHLCV read (no JWT/account) ───────────────────────
// The daily cache-warming job fetches sector-proxy OHLCV for #535 grounding
// through this branch — the SAME shared market-data source the frontend
// ultimately hits, so warmed sector data === live. Authorization is the
// dedicated least-privilege IAM caller (a read of SHARED market data); the
// invoke is restricted to the notification-engine role.
interface ServicePrincipalOhlcvEvent {
  servicePrincipal: 'stock-analyser-notification-engine';
  operation: 'get-ohlcv';
  ticker: string;
  range?: string;
  interval?: string;
}

function isServicePrincipalOhlcvEvent(event: unknown): event is ServicePrincipalOhlcvEvent {
  const candidate = event as Partial<ServicePrincipalOhlcvEvent> | null;
  return (
    !!candidate &&
    candidate.servicePrincipal === 'stock-analyser-notification-engine' &&
    candidate.operation === 'get-ohlcv' &&
    typeof candidate.ticker === 'string'
  );
}

async function getOhlcvForServicePrincipal(event: ServicePrincipalOhlcvEvent) {
  return getOhlcv(event.ticker, event.range ?? '3mo', event.interval ?? '1d');
}

export async function handler(event: APIGatewayProxyEvent | ServicePrincipalOhlcvEvent, _context?: Context) {
  if (isServicePrincipalOhlcvEvent(event)) {
    return getOhlcvForServicePrincipal(event);
  }
  return apiHandler(event as APIGatewayProxyEvent);
}
