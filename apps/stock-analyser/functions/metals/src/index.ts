/**
 * runMetals engine (#627).
 *
 * Metals was historically a client-side free-text call where the model authored
 * both prices and the signal. This engine fixes that shape:
 *   1. fetch REAL metals.dev feed data for XAU/XAG/XPT/XPD;
 *   2. supply those numbers to the model;
 *   3. accept only structured signal/outlook output from the model;
 *   4. overlay the real feed data for the finished response.
 */
import { randomUUID } from 'crypto';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
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
const METALS_HISTORY_DAYS = 365;
const METALS_DEV_MAX_RANGE_DAYS = 30;

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

interface MetalPoint {
  date: string;
  values: Record<MetalSymbol, number>;
}

export interface HistoryRange {
  startDate: string;
  endDate: string;
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

export function buildHistoryRanges(end = new Date(), historyDays = METALS_HISTORY_DAYS): HistoryRange[] {
  const ranges: HistoryRange[] = [];
  const floor = addDays(dateOnly(end), -historyDays);
  let cursorEnd = dateOnly(end);

  while (cursorEnd >= floor) {
    const cursorStart = new Date(Math.max(addDays(cursorEnd, -(METALS_DEV_MAX_RANGE_DAYS - 1)).getTime(), floor.getTime()));
    ranges.unshift({ startDate: formatDate(cursorStart), endDate: formatDate(cursorEnd) });
    cursorEnd = addDays(cursorStart, -1);
  }

  return ranges;
}

function round(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function pctChange(current: number, previous: number): number {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) return 0;
  return round(((current - previous) / previous) * 100, 2);
}

function readNumber(value: unknown, label: string): number {
  const n = Number(value);
  if (!Number.isFinite(n)) throw new Error(`metals.dev returned invalid ${label}`);
  return n;
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

async function fetchMetalsDevFeed(runtime: RuntimeEnv, now = new Date()): Promise<Record<MetalSymbol, MetalFeedData>> {
  const apiKey = await getSecretApiKey({ secretName: runtime.metalsSecretName }, 'Metals.dev');

  const latestRaw = await fetchJson(buildMetalsUrl('latest', apiKey));
  const latestMetals = (latestRaw as { metals?: unknown }).metals;
  if (!latestMetals || typeof latestMetals !== 'object') {
    throw new Error('metals.dev latest response did not include a metals object');
  }
  const latest = metalValuesFromMetalsObject(latestMetals);

  const points: MetalPoint[] = [];
  for (const range of buildHistoryRanges(now)) {
    const historyRaw = await fetchJson(buildMetalsUrl('timeseries', apiKey, {
      start_date: range.startDate,
      end_date: range.endDate,
    }));
    const rates = (historyRaw as { rates?: Record<string, { metals?: unknown }> }).rates;
    if (!rates || typeof rates !== 'object') continue;
    Object.entries(rates).forEach(([date, entry]) => {
      if (entry?.metals) {
        points.push({ date, values: metalValuesFromMetalsObject(entry.metals) });
      }
    });
  }

  if (points.length === 0) throw new Error('metals.dev history response did not include any usable points');
  points.sort((a, b) => a.date.localeCompare(b.date));

  return buildFeedData(latest, points, now);
}

export function buildFeedData(
  latest: Record<MetalSymbol, number>,
  history: MetalPoint[],
  now = new Date(),
): Record<MetalSymbol, MetalFeedData> {
  const ytdFloor = `${dateOnly(now).getUTCFullYear()}-01-01`;
  const result = {} as Record<MetalSymbol, MetalFeedData>;

  METAL_IDENTITIES.forEach(({ symbol }) => {
    if (!Number.isFinite(latest[symbol]) || latest[symbol] <= 0) {
      throw new Error(`metals.dev returned invalid latest spot for ${symbol}`);
    }
    const values = history
      .map((point) => ({ date: point.date, value: point.values[symbol] }))
      .filter((point) => Number.isFinite(point.value) && point.value > 0);
    if (values.length === 0) throw new Error(`No usable metals.dev history for ${symbol}`);

    const prior = [...values].reverse().find((point) => point.value !== latest[symbol]) ?? values[values.length - 1];
    const ytdBase = values.find((point) => point.date >= ytdFloor) ?? values[0];
    const allValues = [...values.map((point) => point.value), latest[symbol]];

    result[symbol] = {
      spotPrice: round(latest[symbol], symbol === 'XAG/USD' ? 4 : 3),
      todayChange: pctChange(latest[symbol], prior.value),
      ytdChange: pctChange(latest[symbol], ytdBase.value),
      week52High: round(Math.max(...allValues), symbol === 'XAG/USD' ? 4 : 3),
      week52Low: round(Math.min(...allValues), symbol === 'XAG/USD' ? 4 : 3),
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
    return (
      `- ${symbol} (${name}): spot USD ${data.spotPrice}/oz; today ${data.todayChange >= 0 ? '+' : ''}${data.todayChange}%; ` +
      `YTD ${data.ytdChange >= 0 ? '+' : ''}${data.ytdChange}%; 52-week range USD ${data.week52Low}-${data.week52High}/oz`
    );
  }).join('\n');

  return (
    'Assess the four precious metals using ONLY the supplied real feed data below. ' +
    'For each metal, assign signal BULL, NEUTRAL, or BEAR and write a concise outlook grounded in the supplied spot, daily change, YTD change, and 52-week range. ' +
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
  if (isMetalsJobEvent(event)) {
    await executeMetalsJob(event, env());
    return { statusCode: 200 };
  }
  return apiHandler(event as APIGatewayProxyEvent);
};
