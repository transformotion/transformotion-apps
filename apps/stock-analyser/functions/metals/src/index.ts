/**
 * runMetals engine (#627).
 *
 * Metals was historically a client-side free-text call where the model authored
 * both prices and the signal. This engine fixes that shape:
 *   1. fetch REAL metals.dev latest feed data for XAU/XAG/XPT/XPD;
 *   2. compute AUD spot, daily/YTD/30-day changes from that feed plus stored
 *      close/baseline rows;
 *   3. supply those numbers to the model;
 *   4. accept only structured signal/outlook output from the model;
 *   5. overlay the real feed data for the finished response.
 */
import { randomUUID } from 'crypto';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda';
import {
  withAuth,
  ok,
  badRequest,
  requireAccountData,
  type APIGatewayProxyEvent,
} from '@transformotion/lambda-middleware';
import {
  createAiProvider,
  getSecretApiKey,
  pushJobComplete,
  resolveAiRuntimeConfig,
  writeJobResult,
  type AiProvider,
  type ResolvedAiRuntimeConfig,
} from '@transformotion/fn-ai-proxy-core';
import { metalsResultJsonSchema } from '@transformotion/contracts/stock-analyser/structured-output';
import {
  METAL_IDENTITIES,
  isMetalSignal,
  isMetalSymbol,
  type Metal,
  type MetalFeedData,
  type MetalModelOutput,
  type MetalSymbol,
  type RunMetalsRequest,
  type RunMetalsResponse,
} from '@transformotion/contracts/stock-analyser/metals';
import { STOCK_ANALYSER_CACHE_TTL_SECONDS } from '@transformotion/contracts/stock-analyser/cache-freshness';

const APP_SLUG = 'stock-analyser';
const METALS_CACHE_KEY = 'METALS';
const METALS_TTL_SECONDS = STOCK_ANALYSER_CACHE_TTL_SECONDS.metals;
const METALS_DEV_BASE_URL = 'https://api.metals.dev/v1';
const METALS_CLOSES_PREFIX = 'METALS_CLOSES#';
const METALS_BASELINE_PREFIX = 'METALS_BASELINE#';
const METALS_CLOSES_TTL_SECONDS = 400 * 24 * 60 * 60;
const SHARED_ACCOUNT_ID = 'SHARED';

const lambda = new LambdaClient({});
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const saData = requireAccountData('stock-analyser');

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

interface RuntimeEnv {
  jobResultsTable: string;
  aiConfigTable: string;
  appAiConfigTable: string;
  anthropicSecretName: string;
  openaiSecretName: string;
  metalsSecretName: string;
  fallbackProvider: string;
  fallbackModel: string;
  selfFunctionName: string;
  analysisCacheFunctionName: string;
  analysisCacheTable: string;
  wsApiEndpoint: string;
}

function env(): RuntimeEnv {
  return {
    jobResultsTable: requireEnv('JOB_RESULTS_TABLE'),
    aiConfigTable: requireEnv('AI_CONFIG_TABLE'),
    appAiConfigTable: requireEnv('APP_AI_CONFIG_TABLE'),
    anthropicSecretName: requireEnv('ANTHROPIC_SECRET_NAME'),
    openaiSecretName: requireEnv('OPENAI_SECRET_NAME'),
    metalsSecretName: requireEnv('METALS_SECRET_NAME'),
    fallbackProvider: process.env.AI_FALLBACK_PROVIDER ?? 'claude',
    fallbackModel: process.env.AI_FALLBACK_MODEL ?? 'claude-sonnet-4-6',
    selfFunctionName: requireEnv('SELF_FUNCTION_NAME'),
    analysisCacheFunctionName: requireEnv('ANALYSIS_CACHE_FUNCTION_NAME'),
    analysisCacheTable: requireEnv('ANALYSIS_CACHE_TABLE'),
    wsApiEndpoint: requireEnv('WS_API_ENDPOINT'),
  };
}

interface MetalsJobEvent {
  __metalsJob: true;
  jobId: string;
  accountId: string;
  connectionId?: string;
  request: RunMetalsRequest;
}

function isMetalsJobEvent(event: unknown): event is MetalsJobEvent {
  return !!event && (event as MetalsJobEvent).__metalsJob === true;
}

// ── #627 warm event (from the notification-engine, service-principal) ─────────────
// Runs the SAME engine core a live tab run does, then SHARED-writes the METALS key via
// the existing writeSharedMetalsCache service-principal path — instead of a per-job
// result + WSS push. No accountId/connectionId — it's a cache warm. The engine-internal
// METALS_CLOSES#/METALS_BASELINE# feed-history rows are written by computeMetals exactly
// as on the live path (direct-write, by design — see #637).
interface WarmMetalsEvent {
  __warmMetals: true;
  request: RunMetalsRequest;
}
function isWarmMetalsEvent(event: unknown): event is WarmMetalsEvent {
  return !!event && (event as WarmMetalsEvent).__warmMetals === true;
}

async function makeProvider(runtime: RuntimeEnv): Promise<{ provider: AiProvider; config: ResolvedAiRuntimeConfig }> {
  const config = await resolveAiRuntimeConfig({
    appSlug: APP_SLUG,
    tableName: runtime.aiConfigTable,
    appOverrideTableName: runtime.appAiConfigTable,
    appOverrideKey: { pk: 'AI_CONFIG', sk: `APP#${APP_SLUG}` },
    fallbackProvider: runtime.fallbackProvider,
    fallbackModel: runtime.fallbackModel,
    client: ddb,
  });
  return {
    config,
    provider: createAiProvider(config.provider, {
      anthropicSecretName: runtime.anthropicSecretName,
      openaiSecretName: runtime.openaiSecretName,
      provider: config.provider,
      model: config.model,
    }),
  };
}

interface MetalCloseSet {
  date: string;
  closes: Record<MetalSymbol, number>;
  audRate?: number;
}

interface LatestFeed {
  spot: Record<MetalSymbol, number>;
  audRate: number;
}

function dateOnly(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function round(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function pctChange(current: number, previous: number): number {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) return 0;
  return round(((current - previous) / previous) * 100, 2);
}

function isPositiveNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function readNumber(value: unknown, label: string): number {
  const n = Number(value);
  if (!Number.isFinite(n)) throw new Error(`metals.dev returned invalid ${label}`);
  return n;
}

function readOptionalNumber(value: unknown, label: string): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  return readNumber(value, label);
}

function metalValuesFromMetalsObject(source: unknown): Record<MetalSymbol, number> {
  const metals = source as Record<string, unknown>;
  return {
    'XAU/USD': readNumber(metals.gold, 'gold'),
    'XAG/USD': readNumber(metals.silver, 'silver'),
    'XPT/USD': readNumber(metals.platinum, 'platinum'),
    'XPD/USD': readNumber(metals.palladium, 'palladium'),
  };
}

async function fetchJson(url: URL): Promise<unknown> {
  const res = await fetch(url);
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`metals.dev ${res.status}: ${text.slice(0, 240)}`);
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error(`metals.dev returned non-JSON response: ${text.slice(0, 240)}`);
  }
}

function buildMetalsUrl(path: 'latest' | 'timeseries', apiKey: string, params: Record<string, string> = {}): URL {
  const url = new URL(`${METALS_DEV_BASE_URL}/${path}`);
  url.searchParams.set('api_key', apiKey);
  url.searchParams.set('currency', 'USD');
  url.searchParams.set('unit', 'toz');
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  return url;
}

function closeKey(date: string): string {
  return `${METALS_CLOSES_PREFIX}${date}`;
}

function baselineKey(year: number): string {
  return `${METALS_BASELINE_PREFIX}${year}`;
}

function toEpochSeconds(date: Date): number {
  return Math.floor(date.getTime() / 1000);
}

function cacheExpiry(now: Date): number {
  return toEpochSeconds(now) + METALS_CLOSES_TTL_SECONDS;
}

function parseStoredJson<T>(item: Record<string, unknown> | undefined): T | null {
  if (!item) return null;
  const raw = item.data;
  if (typeof raw === 'string') return JSON.parse(raw) as T;
  if (raw && typeof raw === 'object') return raw as T;
  return null;
}

async function readCacheJson<T>(runtime: RuntimeEnv, cacheKey: string): Promise<T | null> {
  const result = await ddb.send(new GetCommand({
    TableName: runtime.analysisCacheTable,
    Key: { accountId: SHARED_ACCOUNT_ID, cacheKey },
  }));
  return parseStoredJson<T>(result.Item);
}

// Direct-write feed-history bookkeeping (METALS_CLOSES#/METALS_BASELINE#) — engine-internal,
// never tab-read, so it stays OUT of the analysis-cache service-principal chokepoint BY DESIGN
// (see docs/adr-service-principal-background-jobs.md — "engine-internal feed-history direct-write",
// #637). #637: cachedAt is epoch seconds — the canonical table timestamp shape (matches the
// service-principal and frontend PUT writers); do NOT reintroduce an ISO string here.
async function writeCacheJson(runtime: RuntimeEnv, cacheKey: string, dataType: string, data: unknown, now = new Date()): Promise<void> {
  await ddb.send(new PutCommand({
    TableName: runtime.analysisCacheTable,
    Item: {
      accountId: SHARED_ACCOUNT_ID,
      cacheKey,
      data: JSON.stringify(data),
      cachedAt: toEpochSeconds(now),
      dataType,
      mode: 'live',
      expiresAt: cacheExpiry(now),
    },
  }));
}

async function hasStoredCloses(runtime: RuntimeEnv): Promise<boolean> {
  const result = await ddb.send(new QueryCommand({
    TableName: runtime.analysisCacheTable,
    KeyConditionExpression: 'accountId = :accountId AND begins_with(cacheKey, :prefix)',
    ExpressionAttributeValues: {
      ':accountId': SHARED_ACCOUNT_ID,
      ':prefix': METALS_CLOSES_PREFIX,
    },
    Limit: 1,
  }));
  return (result.Items?.length ?? 0) > 0;
}

async function readMostRecentCloseBefore(runtime: RuntimeEnv, date: string): Promise<MetalCloseSet | null> {
  const result = await ddb.send(new QueryCommand({
    TableName: runtime.analysisCacheTable,
    KeyConditionExpression: 'accountId = :accountId AND cacheKey BETWEEN :start AND :end',
    ExpressionAttributeValues: {
      ':accountId': SHARED_ACCOUNT_ID,
      ':start': `${METALS_CLOSES_PREFIX}0000-00-00`,
      ':end': closeKey(formatDate(addDays(new Date(`${date}T00:00:00.000Z`), -1))),
    },
    ScanIndexForward: false,
    Limit: 1,
  }));
  return parseStoredJson<MetalCloseSet>(result.Items?.[0]);
}

async function writeClose(runtime: RuntimeEnv, close: MetalCloseSet, now = new Date()): Promise<void> {
  await writeCacheJson(runtime, closeKey(close.date), 'metals-closes', close, now);
}

function readAudRate(source: unknown): number {
  const currencies = (source as { currencies?: Record<string, unknown> }).currencies;
  const audRate = readNumber(currencies?.AUD, 'AUD currency rate');
  if (audRate <= 0) throw new Error('metals.dev returned invalid AUD currency rate');
  return audRate;
}

function audSpotFromUsd(usdSpot: number, audRate: number): number {
  // metals.dev latest returns USD per AUD in currencies.AUD; invert to AUD/oz.
  return usdSpot / audRate;
}

async function fetchLatestFeed(apiKey: string): Promise<LatestFeed> {
  const latestRaw = await fetchJson(buildMetalsUrl('latest', apiKey));
  const latestMetals = (latestRaw as { metals?: unknown }).metals;
  if (!latestMetals || typeof latestMetals !== 'object') {
    throw new Error('metals.dev latest response did not include a metals object');
  }
  return {
    spot: metalValuesFromMetalsObject(latestMetals),
    audRate: readAudRate(latestRaw),
  };
}

async function fetchTimeseries(apiKey: string, startDate: string, endDate: string): Promise<MetalCloseSet[]> {
  const historyRaw = await fetchJson(buildMetalsUrl('timeseries', apiKey, {
    start_date: startDate,
    end_date: endDate,
  }));
  const rates = (historyRaw as { rates?: Record<string, { metals?: unknown; currencies?: Record<string, unknown> }> }).rates;
  if (!rates || typeof rates !== 'object') return [];

  return Object.entries(rates)
    .filter(([, entry]) => !!entry?.metals)
    .map(([date, entry]) => ({
      date,
      closes: metalValuesFromMetalsObject(entry.metals),
      audRate: readOptionalNumber(entry.currencies?.AUD, `AUD currency rate for ${date}`),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

async function seedRecentClosesIfEmpty(runtime: RuntimeEnv, apiKey: string, now = new Date()): Promise<void> {
  if (await hasStoredCloses(runtime)) return;
  const endDate = formatDate(dateOnly(now));
  const startDate = formatDate(addDays(dateOnly(now), -30));
  const closes = await fetchTimeseries(apiKey, startDate, endDate);
  await Promise.all(closes.map((close) => writeClose(runtime, close, now)));
}

async function ensureYtdBaseline(runtime: RuntimeEnv, apiKey: string, now = new Date()): Promise<MetalCloseSet> {
  const currentYear = dateOnly(now).getUTCFullYear();
  const key = baselineKey(currentYear);
  const existing = await readCacheJson<MetalCloseSet>(runtime, key);
  if (existing) return existing;

  const baselineDate = `${currentYear - 1}-12-31`;
  const closes = await fetchTimeseries(apiKey, baselineDate, baselineDate);
  const baseline = closes[0];
  if (!baseline) throw new Error(`metals.dev did not return a usable YTD baseline for ${baselineDate}`);
  await writeCacheJson(runtime, key, 'metals-ytd-baseline', baseline, now);
  return baseline;
}

async function fetchMetalsDevFeed(runtime: RuntimeEnv, now = new Date()): Promise<Record<MetalSymbol, MetalFeedData>> {
  const apiKey = await getSecretApiKey({ secretName: runtime.metalsSecretName }, 'Metals.dev');
  const latest = await fetchLatestFeed(apiKey);
  await seedRecentClosesIfEmpty(runtime, apiKey, now);

  const today = formatDate(dateOnly(now));
  const [priorClose, close30d, ytdBaseline] = await Promise.all([
    readMostRecentCloseBefore(runtime, today),
    readCacheJson<MetalCloseSet>(runtime, closeKey(formatDate(addDays(dateOnly(now), -30)))),
    ensureYtdBaseline(runtime, apiKey, now),
  ]);

  await writeClose(runtime, { date: today, closes: latest.spot, audRate: latest.audRate }, now);
  return buildFeedData(latest.spot, latest.audRate, priorClose, close30d, ytdBaseline);
}

export function buildFeedData(
  latest: Record<MetalSymbol, number>,
  audRate: number,
  priorClose: MetalCloseSet | null,
  close30d: MetalCloseSet | null,
  ytdBaseline: MetalCloseSet,
): Record<MetalSymbol, MetalFeedData> {
  const result = {} as Record<MetalSymbol, MetalFeedData>;

  METAL_IDENTITIES.forEach(({ symbol }) => {
    if (!Number.isFinite(latest[symbol]) || latest[symbol] <= 0) {
      throw new Error(`metals.dev returned invalid latest spot for ${symbol}`);
    }
    const decimals = symbol === 'XAG/USD' ? 4 : 3;
    const prior = priorClose?.closes[symbol];
    const thirtyDay = close30d?.closes[symbol];
    const ytdBase = ytdBaseline.closes[symbol];
    if (!Number.isFinite(ytdBase) || ytdBase <= 0) {
      throw new Error(`No usable metals.dev YTD baseline for ${symbol}`);
    }

    result[symbol] = {
      spotPrice: round(latest[symbol], decimals),
      audSpotPrice: round(audSpotFromUsd(latest[symbol], audRate), decimals),
      todayChange: isPositiveNumber(prior) ? pctChange(latest[symbol], prior) : 0,
      ytdChange: pctChange(latest[symbol], ytdBase),
      change30d: isPositiveNumber(thirtyDay) ? pctChange(latest[symbol], thirtyDay) : null,
    };
  });

  return result;
}

function parseJsonContent<T>(content: string): T {
  const stripped = content.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
  return JSON.parse(stripped) as T;
}

function metalsPrompt(feed: Record<MetalSymbol, MetalFeedData>): string {
  const supplied = METAL_IDENTITIES.map(({ name, symbol }) => {
    const data = feed[symbol];
    const change30d = data.change30d === null
      ? '30d unavailable (insufficient stored closes)'
      : `30d ${data.change30d >= 0 ? '+' : ''}${data.change30d}%`;
    return (
      `- ${symbol} (${name}): spot USD ${data.spotPrice}/oz; spot AUD ${data.audSpotPrice}/oz; ` +
      `today ${data.todayChange >= 0 ? '+' : ''}${data.todayChange}%; ` +
      `YTD ${data.ytdChange >= 0 ? '+' : ''}${data.ytdChange}%; ${change30d}`
    );
  }).join('\n');

  return (
    'Assess the four precious metals using ONLY the supplied real feed data below. ' +
    'For each metal, assign signal BULL, NEUTRAL, or BEAR and write a concise outlook grounded in the supplied USD/AUD spot, daily change, YTD change, and 30-day change when available. ' +
    'Do NOT author, estimate, or repeat any extra prices or numeric fields in the JSON output; the engine overlays the real feed data separately.\n\n' +
    `SUPPLIED METALS.DEV FEED DATA:\n${supplied}\n\n` +
    'Return a JSON object with a "metals" array. Each item must contain symbol, signal, and outlook only. Include exactly one item for each symbol: XAU/USD, XAG/USD, XPT/USD, XPD/USD. Return ONLY valid JSON.'
  );
}

const SYSTEM_PROMPT =
  'You are a precious-metals analyst. Use supplied market data as authoritative. Respond with raw JSON only. Do not use markdown code fences.';

export function mergeMetalsResult(
  feed: Record<MetalSymbol, MetalFeedData>,
  modelOutputs: readonly MetalModelOutput[],
  generatedAt: string,
): RunMetalsResponse {
  const outputBySymbol = new Map(modelOutputs.map((item) => [item.symbol, item]));

  const metals: Metal[] = METAL_IDENTITIES.map((identity) => {
    const output = outputBySymbol.get(identity.symbol);
    if (!output) throw new Error(`Metals model omitted ${identity.symbol}`);
    if (!isMetalSymbol(output.symbol) || !isMetalSignal(output.signal) || !output.outlook?.trim()) {
      throw new Error(`Metals model returned invalid output for ${identity.symbol}`);
    }
    return {
      ...identity,
      ...feed[identity.symbol],
      signal: output.signal,
      outlook: output.outlook.trim(),
    };
  });

  return { metals, generatedAt };
}

interface ComputeResult {
  response: RunMetalsResponse;
  provider: string;
  model: string;
  usage: { inputTokens: number; outputTokens: number };
}

export async function computeMetals(request: RunMetalsRequest, runtime: RuntimeEnv): Promise<ComputeResult> {
  const [feed, providerRuntime] = await Promise.all([
    fetchMetalsDevFeed(runtime),
    makeProvider(runtime),
  ]);
  const { provider, config } = providerRuntime;

  const result = await provider.generate({
    prompt: metalsPrompt(feed),
    system: SYSTEM_PROMPT,
    model: config.model,
    webSearch: false,
    responseSchema: metalsResultJsonSchema,
    maxTokens: 1800,
  });
  const modelOutputs = parseJsonContent<{ metals?: MetalModelOutput[] }>(result.content).metals ?? [];

  return {
    response: mergeMetalsResult(feed, modelOutputs, new Date().toISOString()),
    provider: config.provider,
    model: config.model,
    usage: { inputTokens: result.inputTokens, outputTokens: result.outputTokens },
  };
}

async function writeSharedMetalsCache(runtime: RuntimeEnv, data: RunMetalsResponse, mode: RunMetalsRequest['searchMode']): Promise<void> {
  const res = await lambda.send(new InvokeCommand({
    FunctionName: runtime.analysisCacheFunctionName,
    InvocationType: 'RequestResponse',
    Payload: Buffer.from(JSON.stringify({
      servicePrincipal: 'stock-analyser-metals',
      operation: 'put-shared-cache',
      cacheKey: METALS_CACHE_KEY,
      data,
      ttlSeconds: METALS_TTL_SECONDS,
      mode,
      type: 'metals',
    })),
  }));
  if (res.FunctionError) {
    const payload = res.Payload ? Buffer.from(res.Payload).toString('utf8') : '';
    throw new Error(`metals cache service-principal write failed: ${res.FunctionError} ${payload}`);
  }
}

async function executeMetalsJob(job: MetalsJobEvent, runtime: RuntimeEnv): Promise<void> {
  const writeStatus = (payload: Record<string, unknown>) =>
    writeJobResult({ tableName: runtime.jobResultsTable, accountId: job.accountId, jobId: job.jobId, payload, client: ddb });

  try {
    const { response, provider, model, usage } = await computeMetals(job.request, runtime);
    await writeSharedMetalsCache(runtime, response, job.request.searchMode).catch((err) => {
      console.warn('[metals] SHARED cache write failed:', err instanceof Error ? err.message : String(err));
    });
    await writeStatus({ status: 'complete', content: JSON.stringify(response), provider, model, usage });
  } catch (err) {
    await writeStatus({ status: 'error', message: err instanceof Error ? err.message : 'Metals engine failed' }).catch(() => undefined);
  }

  if (job.connectionId) {
    try {
      await pushJobComplete({ endpoint: runtime.wsApiEndpoint, connectionId: job.connectionId, jobId: job.jobId });
    } catch (pushErr) {
      console.warn('[metals] WSS push failed:', (pushErr as Error).message);
    }
  }
}

// ── #627 warm: compute (SAME engine as live) → SHARED-write METALS ────────────────
async function executeWarmMetals(event: WarmMetalsEvent, runtime: RuntimeEnv): Promise<void> {
  try {
    const { response } = await computeMetals(event.request, runtime);
    await writeSharedMetalsCache(runtime, response, event.request.searchMode);
    console.log(JSON.stringify({ message: 'metals-warm-ok', count: response.metals.length }));
  } catch (err) {
    // Per-scope isolation: a warm failure is logged, never thrown (the live tab still
    // computes on demand).
    console.log(JSON.stringify({ message: 'metals-warm-error', err: String(err) }));
  }
}

const apiHandler = withAuth(async ({ auth, account, event }) => {
  saData.read(auth, account.accountId);

  const body = JSON.parse(event.body || '{}') as Partial<RunMetalsRequest> & { connectionId?: string };
  const { searchMode, connectionId } = body;
  if (searchMode !== 'fast' && searchMode !== 'live') {
    throw badRequest('searchMode (fast|live) is required');
  }

  const runtime = env();
  const jobId = randomUUID();
  await writeJobResult({ tableName: runtime.jobResultsTable, accountId: account.accountId, jobId, payload: { status: 'pending' }, client: ddb });
  await lambda.send(new InvokeCommand({
    FunctionName: runtime.selfFunctionName,
    InvocationType: 'Event',
    Payload: Buffer.from(JSON.stringify({
      __metalsJob: true,
      jobId,
      accountId: account.accountId,
      connectionId,
      request: { searchMode },
    } satisfies MetalsJobEvent)),
  }));

  return ok({ jobId });
});

export const handler = async (event: unknown): Promise<unknown> => {
  if (isWarmMetalsEvent(event)) {
    await executeWarmMetals(event, env());
    return { statusCode: 200 };
  }
  if (isMetalsJobEvent(event)) {
    await executeMetalsJob(event, env());
    return { statusCode: 200 };
  }
  return apiHandler(event as APIGatewayProxyEvent);
};
