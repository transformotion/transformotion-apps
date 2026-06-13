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
import { computeCyclePosition } from '../../../lib/cycle';

// D9 data-tier gate (no site-admin branch). cycle-data is a READ of shared market
// data; a viewer member may read it.
const saData = requireAccountData('stock-analyser');
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE          = process.env.ANALYSIS_CACHE_TABLE!;
const SHARED         = 'SHARED';
const CYCLE_TTL      = 3600;  // 1 hour — computed result
const MARKET_TTL     = 28800; // 8 hours — shared raw OHLCV

export const handler = withAuth(async ({ auth, account, event }) => {
  saData.read(auth, account.accountId);

  const ticker = event.queryStringParameters?.ticker;
  if (!ticker) throw badRequest('ticker is required');

  const cycleCacheKey  = `OHLCV#${ticker}`;
  const marketCacheKey = `MARKET-DATA#${ticker}#1y#1d`;

  // 1. Check computed cycle cache first
  const cachedCycle = await ddb.send(new GetCommand({
    TableName: TABLE,
    Key: { accountId: SHARED, cacheKey: cycleCacheKey },
  }));

  if (cachedCycle.Item) {
    const data = typeof cachedCycle.Item.data === 'string'
      ? JSON.parse(cachedCycle.Item.data)
      : cachedCycle.Item.data;
    return ok({ ...data, source: 'cache' as const });
  }

  // 2. Check shared raw OHLCV cache
  let closes: number[], highs: number[], volumes: number[];

  const cachedMarket = await ddb.send(new GetCommand({
    TableName: TABLE,
    Key: { accountId: SHARED, cacheKey: marketCacheKey },
  }));

  if (cachedMarket.Item) {
    const raw = typeof cachedMarket.Item.data === 'string'
      ? JSON.parse(cachedMarket.Item.data)
      : cachedMarket.Item.data;
    closes  = raw.closes;
    highs   = raw.highs;
    volumes = raw.volumes;
  } else {
    // 3. Fetch from Yahoo Finance and populate shared cache
    let ohlcv: Awaited<ReturnType<typeof fetchOhlcv>>;
    try {
      ohlcv = await fetchOhlcv(ticker, '1y', '1d');
    } catch (err) {
      console.error(`[cycle-data] Yahoo Finance error for ${ticker}:`, err);
      throw new HttpError(503, 'Failed to fetch market data from Yahoo Finance');
    }

    closes  = ohlcv.closes;
    highs   = ohlcv.highs;
    volumes = ohlcv.volumes;

    const nowSecs = Math.floor(Date.now() / 1000);
    await ddb.send(new PutCommand({
      TableName: TABLE,
      Item: {
        accountId: SHARED,
        cacheKey:  marketCacheKey,
        data:      JSON.stringify({ ticker, range: '1y', interval: '1d', fetchedAt: new Date().toISOString(), ...ohlcv }),
        dataType:  'market-data-ohlcv',
        mode:      'live',
        cachedAt:  nowSecs,
        expiresAt: nowSecs + MARKET_TTL,
      },
    }));
  }

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

  const nowSecs = Math.floor(Date.now() / 1000);
  await ddb.send(new PutCommand({
    TableName: TABLE,
    Item: {
      accountId: SHARED,
      cacheKey:  cycleCacheKey,
      data:      JSON.stringify(payload),
      dataType:  'ohlcv-cycle',
      mode:      'live',
      cachedAt:  nowSecs,
      expiresAt: nowSecs + CYCLE_TTL,
    },
  }));

  console.log(`[cycle-data] Computed and cached: ${cycleCacheKey}`);

  return ok({ ...payload, source: 'live' as const });
});
