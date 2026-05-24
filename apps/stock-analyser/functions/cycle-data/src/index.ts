import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import {
  withAuth,
  ok,
  badRequest,
  requireAppAccess,
  requireAccountAccess,
  HttpError,
} from '@transformotion/lambda-middleware';
import YahooFinance from 'yahoo-finance2';
import { computeCyclePosition } from '../../../lib/cycle';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const yf    = new YahooFinance();
const TABLE   = process.env.ANALYSIS_CACHE_TABLE!;
const SHARED  = 'SHARED';
const TTL_SECS = 3600; // 1 hour

export const handler = withAuth(async ({ auth, account, event }) => {
  requireAppAccess(auth, 'stock-analyser');
  requireAccountAccess(auth, 'stock-analyser', account.accountId);

  const ticker = event.queryStringParameters?.ticker;
  if (!ticker) throw badRequest('ticker is required');

  const cacheKey = `OHLCV#${ticker}`;

  // Cache read — OHLCV is SHARED data (same for all users)
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

  // Fetch OHLCV from Yahoo Finance
  const period1 = new Date();
  period1.setFullYear(period1.getFullYear() - 1);

  let quotes: Array<{ close: number | null; high: number | null; volume: number | null }>;
  try {
    const result = await yf.chart(ticker, { period1, interval: '1d' });
    quotes = result.quotes ?? [];
  } catch (err) {
    console.error(`[cycle-data] Yahoo Finance error for ${ticker}:`, err);
    throw new HttpError(503, 'Failed to fetch market data from Yahoo Finance');
  }

  // Filter out any bars with null close/high and align all arrays
  const validQuotes = quotes.filter(q => q.close != null && q.close > 0 && q.high != null);
  const closes  = validQuotes.map(q => q.close!);
  const highs   = validQuotes.map(q => q.high!);
  const volumes = validQuotes.map(q => q.volume ?? 0);

  const position = computeCyclePosition({ closes, highs, volumes });

  if (!position) {
    throw new HttpError(503, `Insufficient data for ${ticker} — need at least 30 trading days`);
  }

  const payload = {
    cyclePosition:  position.score,
    cycleStage:     position.stage,
    rsiDivergence:  position.rsiDivergence,
    macdMomentum:   position.macdMomentum,
    volumeTrend:    position.volumeTrend,
    weekHigh52Pct:  position.weekHigh52Pct,
    signals:        position.signals,
    cycleSummary:   position.summary,
    computedAt:     new Date().toISOString(),
  };

  // Write to cache
  const nowSecs = Math.floor(Date.now() / 1000);
  await ddb.send(new PutCommand({
    TableName: TABLE,
    Item: {
      accountId: SHARED,
      cacheKey,
      data:      JSON.stringify(payload),
      dataType:  'ohlcv-cycle',
      mode:      'live',
      cachedAt:  nowSecs,
      expiresAt: nowSecs + TTL_SECS,
    },
  }));

  console.log(`[cycle-data] Computed and cached: ${cacheKey}`);

  return ok({ ...payload, source: 'live' as const });
});
