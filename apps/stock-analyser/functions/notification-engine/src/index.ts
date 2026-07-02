import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  type QueryCommandInput,
} from '@aws-sdk/lib-dynamodb';
import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda';
import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
import type { ScheduledEvent } from 'aws-lambda';
import {
  AiProviderNonJsonError,
  createAiProvider,
  resolveAiRuntimeConfig,
  type AiProvider,
  type AiProviderResult,
  type ResolvedAiRuntimeConfig,
} from '@transformotion/fn-ai-proxy-core';
import {
  defaultNotificationAccountConfig,
  isValidNotificationAccountConfig,
  type NotificationAccountConfig,
  type NotificationMemberConsent,
  type NotificationType,
} from '@transformotion/contracts/stock-analyser/notification-preferences';
import type { PortfolioHolding, WatchlistItem } from '@transformotion/contracts/stock-analyser/types';
import {
  createStockAnalysisPrompt,
  normaliseStockAnalysisSignals,
  STOCK_ANALYSIS_SYSTEM_PROMPT,
} from '../../../lib/analysis/stock-analysis-signals';
import type { StockAnalysisResult } from '../../../lib/services/portfolio/types';
import { buildNotificationEmail } from './email';
import { randomUUID } from 'crypto';
import {
  runNotificationEngine,
  type AnalysisGenerationContext,
  type MemberRow,
  type NotificationEngineDeps,
  type NotificationStateRecord,
  type NotificationTransition,
  type SendLogRun,
} from './engine';
import { SEND_LOG_TTL_SECONDS, writeSendLog } from './send-log';
import { buildSectorSuppliedData, type SectorOhlcvFetcher } from '../../../lib/analysis/market-analysis-grounding';
import { buildTickerSuppliedData, suppliedTechnicalsFromOhlcv } from '../../../lib/analysis/stock-analysis-grounding';
import type { CycleInputs } from '../../../lib/cycle';
import { createMarketAnalysisPrompt, MARKET_ANALYSIS_SYSTEM_PROMPT, MARKET_ANALYSIS_MAX_TOKENS } from '../../../lib/analysis/market-analysis-signals';
import { resolveSectorUniverse } from '../../../lib/analysis/sector-universe';
import { ANALYSIS_REGIONS, type AnalysisRegion } from '@transformotion/contracts/stock-analyser/types';
// #structured-output: canonical v0 schemas — CONSTRAIN provider output to valid
// JSON instead of prompt-and-parse (the gpt-5.5 parse-error fix).
import {
  marketAnalysisResultJsonSchema,
  stockAnalysisResultJsonSchema,
} from '@transformotion/contracts/stock-analyser/structured-output';
import { RECOMMENDATION_MODE_LABELS } from '@transformotion/contracts/stock-analyser/recommendations';
import { ETF_MARKETS } from '@transformotion/contracts/stock-analyser/etfs';

// removeUndefinedValues (#578): the safety net so a stray `undefined` (e.g. a
// member with no email) can never throw mid-write and drop subsequent records.
// Records are also kept clean at the source (see memberOutcome in engine.ts).
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});
const lambda = new LambdaClient({});
const ses = new SESv2Client({});

const APP_SLUG = 'stock-analyser';
const ANALYSIS_TTL_SECONDS = 24 * 60 * 60;
// #584: MARKET#{region} warm-write TTL — matches the live Market tab's cache TTL.
const MARKET_TTL_SECONDS = 24 * 60 * 60;
const AI_RESPONSE_LOG_PREFIX_CHARS = 1000;

interface RuntimeEnv {
  stage: string;
  portfolioTable: string;
  watchlistTable: string;
  settingsTable: string;
  notificationStateTable: string;
  analysisCacheTable: string;
  accountMembersTable: string;
  sendLogTable: string;
  accountsTable: string;
  analysisCacheFunctionName: string;
  marketDataFunctionName: string;
  // #595: recommendations Lambda, async-invoked to smart-warm RECS# for enter sectors.
  recommendationsFunctionName: string;
  // #594: etfs Lambda, async-invoked to warm ETF#{market} for each market.
  etfsFunctionName: string;
  anthropicSecretName: string;
  openaiSecretName?: string;
  aiConfigTableName?: string;
  appAiConfigTableName?: string;
  fallbackProvider?: string;
  fallbackModel?: string;
  fromEmail: string;
  appUrl: string;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function env(): RuntimeEnv {
  const stage = process.env.STAGE ?? 'dev';
  return {
    stage,
    portfolioTable: requireEnv('PORTFOLIO_TABLE'),
    watchlistTable: requireEnv('WATCHLIST_TABLE'),
    settingsTable: requireEnv('SETTINGS_TABLE'),
    notificationStateTable: requireEnv('NOTIFICATION_STATE_TABLE'),
    analysisCacheTable: requireEnv('ANALYSIS_CACHE_TABLE'),
    accountMembersTable: requireEnv('ACCOUNT_MEMBERS_TABLE'),
    sendLogTable: requireEnv('SEND_LOG_TABLE'),
    accountsTable: requireEnv('ACCOUNTS_TABLE'),
    analysisCacheFunctionName: requireEnv('ANALYSIS_CACHE_FUNCTION_NAME'),
    marketDataFunctionName: requireEnv('MARKET_DATA_FUNCTION_NAME'),
    recommendationsFunctionName: requireEnv('RECOMMENDATIONS_FUNCTION_NAME'),
    etfsFunctionName: requireEnv('ETFS_FUNCTION_NAME'),
    anthropicSecretName: requireEnv('ANTHROPIC_SECRET_NAME'),
    openaiSecretName: process.env.OPENAI_SECRET_NAME,
    aiConfigTableName: process.env.AI_CONFIG_TABLE,
    appAiConfigTableName: process.env.APP_AI_CONFIG_TABLE,
    fallbackProvider: process.env.AI_FALLBACK_PROVIDER,
    fallbackModel: process.env.AI_FALLBACK_MODEL,
    fromEmail: requireEnv('FROM_EMAIL'),
    appUrl: process.env.APP_URL ?? `https://${stage === 'prod' ? 'apps' : 'dev.apps'}.transformotion.com.au`,
  };
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function accountConfigKey(accountId: string) {
  return { pk: 'SETTINGS', sk: `NOTIFICATIONS#${accountId}` };
}

function consentKey(accountId: string, userId: string) {
  return { pk: `NOTIFICATION_CONSENT#${accountId}`, sk: `USER#${userId}` };
}

function parseNotificationConfig(
  item: Record<string, unknown> | undefined,
  accountId: string,
): NotificationAccountConfig {
  const candidate: Partial<NotificationAccountConfig> | undefined = item
    ? {
        accountId,
        intervalDays: typeof item['intervalDays'] === 'number' ? item['intervalDays'] : undefined,
        activeTypes: Array.isArray(item['activeTypes']) ? item['activeTypes'] as NotificationType[] : undefined,
        updatedAt: typeof item['updatedAt'] === 'string' ? item['updatedAt'] : undefined,
      }
    : undefined;
  if (isValidNotificationAccountConfig(candidate)) return candidate;
  return defaultNotificationAccountConfig(accountId, new Date().toISOString());
}

function parseConsent(
  item: Record<string, unknown> | undefined,
  accountId: string,
  userId: string,
): NotificationMemberConsent | null {
  if (typeof item?.['receiveConsent'] !== 'boolean') return null;
  return {
    accountId,
    userId,
    receiveConsent: item['receiveConsent'],
    updatedAt: typeof item['updatedAt'] === 'string' ? item['updatedAt'] : new Date().toISOString(),
  };
}

function parseMember(item: Record<string, unknown>): MemberRow {
  return {
    accountId: String(item['accountId'] ?? ''),
    userId: String(item['userId'] ?? ''),
    email: typeof item['email'] === 'string' ? item['email'] : undefined,
    role: typeof item['role'] === 'string' ? item['role'] : undefined,
    status: typeof item['status'] === 'string' ? item['status'] : undefined,
    appSlug: typeof item['appSlug'] === 'string' ? item['appSlug'] : undefined,
  };
}

async function queryAll(input: QueryCommandInput): Promise<Record<string, unknown>[]> {
  const items: Record<string, unknown>[] = [];
  let ExclusiveStartKey = input.ExclusiveStartKey;
  do {
    const res = await ddb.send(new QueryCommand({ ...input, ExclusiveStartKey }));
    items.push(...(res.Items ?? []) as Record<string, unknown>[]);
    ExclusiveStartKey = res.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return items;
}

async function listStockAnalyserMembers(runtime: RuntimeEnv): Promise<MemberRow[]> {
  const items = await queryAll({
    TableName: runtime.accountMembersTable,
    IndexName: 'appSlug-index',
    KeyConditionExpression: 'appSlug = :app',
    ExpressionAttributeValues: { ':app': APP_SLUG },
    ProjectionExpression: 'accountId, userId, email, appSlug, #r, #s',
    ExpressionAttributeNames: { '#r': 'role', '#s': 'status' },
  });
  return items.map(parseMember);
}

async function readLiveMember(runtime: RuntimeEnv, accountId: string, userId: string): Promise<MemberRow | null> {
  const res = await ddb.send(new GetCommand({
    TableName: runtime.accountMembersTable,
    Key: { accountId, userId },
    ProjectionExpression: 'accountId, userId, email, appSlug, #r, #s',
    ExpressionAttributeNames: { '#r': 'role', '#s': 'status' },
  }));
  return res.Item ? parseMember(res.Item as Record<string, unknown>) : null;
}

async function readMemberConsent(runtime: RuntimeEnv, accountId: string, userId: string) {
  const res = await ddb.send(new GetCommand({
    TableName: runtime.settingsTable,
    Key: consentKey(accountId, userId),
  }));
  return parseConsent(res.Item as Record<string, unknown> | undefined, accountId, userId);
}

async function readNotificationConfig(runtime: RuntimeEnv, accountId: string) {
  const res = await ddb.send(new GetCommand({
    TableName: runtime.settingsTable,
    Key: accountConfigKey(accountId),
  }));
  return parseNotificationConfig(res.Item as Record<string, unknown> | undefined, accountId);
}

async function readNotificationStates(runtime: RuntimeEnv, accountId: string): Promise<NotificationStateRecord[]> {
  const items = await queryAll({
    TableName: runtime.notificationStateTable,
    KeyConditionExpression: 'accountId = :accountId',
    ExpressionAttributeValues: { ':accountId': accountId },
  });
  return items
    .filter((item) => typeof item['sk'] === 'string')
    .map((item) => ({
      accountId,
      sk: item['sk'] as string,
      type: item['type'] === 'Watchlist' ? 'Watchlist' : 'Portfolio',
      ticker: String(item['ticker'] ?? ''),
      lastVerdict: item['lastVerdict'] as NotificationStateRecord['lastVerdict'],
      lastNotifiedAt: typeof item['lastNotifiedAt'] === 'number' ? item['lastNotifiedAt'] : undefined,
      lastProcessedDate: typeof item['lastProcessedDate'] === 'string' ? item['lastProcessedDate'] : undefined,
    }));
}

async function putNotificationState(runtime: RuntimeEnv, record: NotificationStateRecord): Promise<void> {
  await ddb.send(new PutCommand({
    TableName: runtime.notificationStateTable,
    Item: record,
  }));
}

async function readPortfolio(runtime: RuntimeEnv, accountId: string): Promise<PortfolioHolding[]> {
  const items = await queryAll({
    TableName: runtime.portfolioTable,
    KeyConditionExpression: 'accountId = :accountId',
    ExpressionAttributeValues: { ':accountId': accountId },
  });
  return items as unknown as PortfolioHolding[];
}

async function readWatchlist(runtime: RuntimeEnv, accountId: string): Promise<WatchlistItem[]> {
  const items = await queryAll({
    TableName: runtime.watchlistTable,
    KeyConditionExpression: 'accountId = :accountId',
    ExpressionAttributeValues: { ':accountId': accountId },
  });
  return items as unknown as WatchlistItem[];
}

function parseCachedAnalysis(item: Record<string, unknown> | undefined): StockAnalysisResult | null {
  if (!item) return null;
  const expiresAt = typeof item['expiresAt'] === 'number' ? item['expiresAt'] : 0;
  if (expiresAt <= Math.floor(Date.now() / 1000)) return null;

  const raw = item['data'];
  if (typeof raw !== 'string') return null;
  try {
    return normaliseStockAnalysisSignals(JSON.parse(raw) as StockAnalysisResult);
  } catch {
    return null;
  }
}

async function readSharedAnalysisCache(runtime: RuntimeEnv, ticker: string): Promise<StockAnalysisResult | null> {
  const res = await ddb.send(new GetCommand({
    TableName: runtime.analysisCacheTable,
    Key: { accountId: 'SHARED', cacheKey: `ANALYSIS#${ticker.toUpperCase()}` },
  }));
  return parseCachedAnalysis(res.Item as Record<string, unknown> | undefined);
}

function stripCodeFences(text: string): string {
  return text
    .replace(/^```(?:json)?\s*\n?/i, '')
    .replace(/\n?```\s*$/i, '')
    .trim();
}

function textPrefix(value: string): string {
  return value.slice(0, AI_RESPONSE_LOG_PREFIX_CHARS);
}

function logAnalysisGenerationError(
  message: string,
  context: {
    ticker: string;
    provider: string;
    model: string;
    generationContext?: AnalysisGenerationContext;
    err?: unknown;
    details?: Record<string, unknown>;
  },
) {
  console.log(JSON.stringify({
    message,
    ticker: context.ticker,
    provider: context.provider,
    model: context.model,
    accountId: context.generationContext?.accountId,
    runId: context.generationContext?.runId,
    sourceType: context.generationContext?.sourceType,
    ...(context.details ?? {}),
    ...(context.err ? { err: context.err instanceof Error ? context.err.message : String(context.err) } : {}),
  }));
}

export function parseStockAnalysisProviderResult(
  result: AiProviderResult,
  ticker: string,
  generationContext?: AnalysisGenerationContext,
): StockAnalysisResult {
  const rawOutput = stripCodeFences(result.content);
  try {
    return normaliseStockAnalysisSignals(JSON.parse(rawOutput) as StockAnalysisResult);
  } catch (err) {
    logAnalysisGenerationError('notification-analysis-model-output-unparseable', {
      ticker,
      provider: result.provider,
      model: result.model,
      generationContext,
      err,
      details: {
        phase: 'model_output_json_parse',
        modelOutputPrefix: textPrefix(rawOutput),
      },
    });
    throw new Error(`model output unparseable while analysing ${ticker}`);
  }
}

export function parseMarketAnalysisProviderResult(
  result: AiProviderResult,
  region: AnalysisRegion,
): unknown {
  const rawOutput = result.content;
  const strippedOutput = stripCodeFences(rawOutput);
  try {
    return JSON.parse(strippedOutput);
  } catch (err) {
    console.log(JSON.stringify({
      message: 'notification-market-warm-model-output-unparseable',
      region,
      provider: result.provider,
      model: result.model,
      phase: 'market_warm_model_output_json_parse',
      rawModelOutputPrefix: textPrefix(rawOutput),
      rawModelOutputLength: rawOutput.length,
      strippedModelOutputPrefix: textPrefix(strippedOutput),
      strippedModelOutputLength: strippedOutput.length,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      totalTokens: result.totalTokens,
      err: err instanceof Error ? err.message : String(err),
    }));
    throw new Error(`market warm model output unparseable for ${region}`);
  }
}

function makeAiProviderFactory(runtime: RuntimeEnv) {
  let cached: Promise<{ provider: AiProvider; config: ResolvedAiRuntimeConfig }> | null = null;
  return async () => {
    cached ??= (async () => {
      const config = await resolveAiRuntimeConfig({
        appSlug: APP_SLUG,
        tableName: runtime.aiConfigTableName,
        appOverrideTableName: runtime.appAiConfigTableName,
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
    })();
    return cached;
  };
}

function makeGenerateAnalysis(runtime: RuntimeEnv) {
  const providerFactory = makeAiProviderFactory(runtime);
  const fetchFullOhlcv = makeServerFullOhlcvFetcher(runtime);
  return async (ticker: string, generationContext?: AnalysisGenerationContext): Promise<StockAnalysisResult> => {
    const { provider, config } = await providerFactory();
    // #602: supply REAL computed technicals (RSI/MACD/cyclePosition/…) so the Live
    // two-pass research pass has authoritative values it cannot web-search. This
    // per-ticker call is webSearch:true + structured — the SAME shape that
    // hard-failed the interactive analyser's integrity guard. Honest degradation:
    // a dataless ticker (<30 bars) supplies nothing and never fabricates.
    const suppliedTechnicals = buildTickerSuppliedData(
      suppliedTechnicalsFromOhlcv(await fetchFullOhlcv(ticker).catch(() => null)),
    );
    let result: Awaited<ReturnType<AiProvider['generate']>>;
    try {
      result = await provider.generate({
        prompt: createStockAnalysisPrompt(ticker) + suppliedTechnicals,
        system: STOCK_ANALYSIS_SYSTEM_PROMPT,
        model: config.model,
        webSearch: true,
        responseSchema: stockAnalysisResultJsonSchema,
      });
    } catch (err) {
      if (err instanceof AiProviderNonJsonError) {
        logAnalysisGenerationError('notification-analysis-provider-non-json', {
          ticker,
          provider: err.diagnostics.provider,
          model: err.diagnostics.model,
          generationContext,
          err,
          details: {
            phase: err.diagnostics.phase,
            httpStatus: err.diagnostics.httpStatus,
            responseHeaders: err.diagnostics.responseHeaders,
            responseBodyPrefix: err.diagnostics.responseBodyPrefix,
          },
        });
        throw new Error(`provider returned non-JSON HTTP response while analysing ${ticker}`);
      }
      throw err;
    }

    return parseStockAnalysisProviderResult(result, ticker, generationContext);
  };
}

async function writeSharedAnalysisCache(runtime: RuntimeEnv, ticker: string, analysis: StockAnalysisResult) {
  const response = await lambda.send(new InvokeCommand({
    FunctionName: runtime.analysisCacheFunctionName,
    InvocationType: 'RequestResponse',
    Payload: Buffer.from(JSON.stringify({
      servicePrincipal: 'stock-analyser-notification-engine',
      operation: 'put-shared-cache',
      cacheKey: `ANALYSIS#${ticker}`,
      data: analysis,
      ttlSeconds: ANALYSIS_TTL_SECONDS,
      mode: 'live',
      type: 'analysis',
    })),
  }));
  if (response.FunctionError) {
    const payload = response.Payload ? Buffer.from(response.Payload).toString('utf8') : '';
    throw new Error(`analysis-cache service-principal write failed: ${response.FunctionError} ${payload}`);
  }
}

async function sendNotificationEmail(runtime: RuntimeEnv, recipient: MemberRow, transition: NotificationTransition) {
  if (!recipient.email) return;
  const email = buildNotificationEmail({
    appUrl: runtime.appUrl,
    accountId: transition.accountId,
    ticker: transition.ticker,
    sourceType: transition.type,
    verdict: transition.currentVerdict === 'SELL' ? 'SELL' : 'BUY',
    company: transition.analysis.company,
    summary: transition.analysis.summary ?? transition.analysis.cycleSummary,
  });
  await ses.send(new SendEmailCommand({
    FromEmailAddress: runtime.fromEmail,
    Destination: { ToAddresses: [recipient.email] },
    Content: {
      Simple: {
        Subject: { Data: email.subject, Charset: 'UTF-8' },
        Body: {
          Html: { Data: email.html, Charset: 'UTF-8' },
          Text: { Data: email.text, Charset: 'UTF-8' },
        },
      },
    },
  }));
}

// Best-effort account display name (launchpad-accounts; falls back to id).
async function readAccountName(runtime: RuntimeEnv, accountId: string): Promise<string | undefined> {
  try {
    const res = await ddb.send(new GetCommand({ TableName: runtime.accountsTable, Key: { accountId } }));
    const name = res.Item?.['name'];
    return typeof name === 'string' && name.length > 0 ? name : undefined;
  } catch {
    return undefined;
  }
}

// #572 send-log persistence — run summary + one item per account (member
// outcomes embedded), GSI keys for recency + per-account history, 90-day TTL.
// #578: the write is fault-tolerant (per-account isolation, status escalation,
// summary written last) — see writeSendLog in ./send-log.
async function recordSendLog(runtime: RuntimeEnv, run: SendLogRun): Promise<void> {
  await writeSendLog(
    async (item) => {
      await ddb.send(new PutCommand({ TableName: runtime.sendLogTable, Item: item }));
    },
    run,
    {
      ttlSeconds: SEND_LOG_TTL_SECONDS,
      log: (message, context) => console.log(JSON.stringify({ message, ...context })),
    },
  );
}

// #571 kill-switch: app-wide notificationsEnabled (default ON when absent/malformed).
async function readEngineEnabled(runtime: RuntimeEnv): Promise<boolean> {
  const res = await ddb.send(new GetCommand({
    TableName: runtime.settingsTable,
    Key: { pk: 'SETTINGS', sk: 'NOTIFICATION_ENGINE_CONFIG#stock-analyser' },
  }));
  const enabled = res.Item?.['notificationsEnabled'];
  return typeof enabled === 'boolean' ? enabled : true;
}

// ── #584 market-wide cache warming ───────────────────────────────────────────
// Server-side OHLCV for the #535 Bucket-1 grounding: invoke the market-data
// Lambda's service-principal branch — the SAME shared source the frontend
// ultimately hits, so warmed sector data === live. Best-effort: any failure
// yields null and the grounding omits that sector (never blocks the warm).
function makeServerOhlcvFetcher(runtime: RuntimeEnv): SectorOhlcvFetcher {
  return async (ticker, range, interval) => {
    try {
      const res = await lambda.send(new InvokeCommand({
        FunctionName: runtime.marketDataFunctionName,
        InvocationType: 'RequestResponse',
        Payload: Buffer.from(JSON.stringify({
          servicePrincipal: 'stock-analyser-notification-engine',
          operation: 'get-ohlcv',
          ticker, range, interval,
        })),
      }));
      if (res.FunctionError) return null;
      const payload = res.Payload ? JSON.parse(Buffer.from(res.Payload).toString('utf8')) : null;
      const closes = (payload as { closes?: unknown } | null)?.closes;
      return Array.isArray(closes) ? (closes as number[]) : null;
    } catch {
      return null;
    }
  };
}

// Full OHLCV (closes/highs/volumes) for the #602 per-ticker technical grounding —
// the SAME service-principal source as the sector fetcher, but returns every
// series computeCyclePosition needs. Best-effort: any failure yields null and the
// analysis supplies no technicals (honest degradation, never blocks the call).
function makeServerFullOhlcvFetcher(runtime: RuntimeEnv): (ticker: string) => Promise<CycleInputs | null> {
  return async (ticker) => {
    try {
      const res = await lambda.send(new InvokeCommand({
        FunctionName: runtime.marketDataFunctionName,
        InvocationType: 'RequestResponse',
        Payload: Buffer.from(JSON.stringify({
          servicePrincipal: 'stock-analyser-notification-engine',
          operation: 'get-ohlcv',
          ticker, range: '1y', interval: '1d',
        })),
      }));
      if (res.FunctionError) return null;
      const payload = res.Payload ? JSON.parse(Buffer.from(res.Payload).toString('utf8')) : null;
      const { closes, highs, volumes } = (payload ?? {}) as Partial<CycleInputs>;
      if (Array.isArray(closes) && Array.isArray(highs) && Array.isArray(volumes)) {
        return { closes, highs, volumes };
      }
      return null;
    } catch {
      return null;
    }
  };
}

// SHARED-write the warmed MARKET#{region} entry via the analysis-cache
// service-principal path (#537 SHARED-prefix; reuses the engine's existing
// analysis-cache invoke). 24h TTL — matches the live Market tab.
async function writeSharedMarketCache(runtime: RuntimeEnv, region: AnalysisRegion, data: unknown): Promise<void> {
  const response = await lambda.send(new InvokeCommand({
    FunctionName: runtime.analysisCacheFunctionName,
    InvocationType: 'RequestResponse',
    Payload: Buffer.from(JSON.stringify({
      servicePrincipal: 'stock-analyser-notification-engine',
      operation: 'put-shared-cache',
      cacheKey: `MARKET#${region}`,
      data,
      ttlSeconds: MARKET_TTL_SECONDS,
      mode: 'live',
      type: 'market',
    })),
  }));
  if (response.FunctionError) {
    const payload = response.Payload ? Buffer.from(response.Payload).toString('utf8') : '';
    throw new Error(`market cache service-principal write failed: ${response.FunctionError} ${payload}`);
  }
}

// ── #595 smart-warm Recs for the sectors Market flagged 'enter' ──────────────────
const WARM_RECS_MODE = 'top-picks' as const;               // canonical — the engine request
const WARM_RECS_MODE_LABEL = RECOMMENDATION_MODE_LABELS[WARM_RECS_MODE]; // 'Top Picks' — the cache key
const WARM_RECS_CAP = 3; // top-N enter sectors per region — bounds daily recs cost (≤12/run)

interface WarmMarketSector { sector: string; signal: string; cyclePosition: number; bestExchange: string }

// The warmed RECS# key MUST be byte-identical to what a live tab reads. The live Recs
// tab's scopeKey uses the DISPLAY mode label ("Top Picks"), NOT the canonical mode
// ('top-picks', which it only uses in the engine request body). Using the canonical here
// silently cache-misses. Exported so a test pins the identical-to-live shape.
export function recsWarmCacheKey(universe: string, sector: string): string {
  return `RECS#${universe}|${WARM_RECS_MODE_LABEL}|${sector}`;
}

// Pure: the enter-flagged sectors to warm — top-N by cyclePosition ASCENDING (0 = early
// cycle = strongest entry per the market rubric), NOT parse order. Exported for tests.
export function selectEnterSectorsToWarm(sectors: WarmMarketSector[], cap = WARM_RECS_CAP): WarmMarketSector[] {
  return sectors
    .filter((s) => s.signal === 'enter')
    .sort((a, b) => a.cyclePosition - b.cyclePosition)
    .slice(0, cap);
}

// After a region's Market warm SUCCEEDS, async-invoke the Recs engine (the SAME engine a
// live tab run uses) to warm RECS#{universe|top-picks|sector} for each enter sector.
// Per-scope isolation: a dispatch failure is logged, never thrown. No enter sectors → no
// invokes (correct, not an error). A failed/degraded Market warm never reaches here (this
// runs only after the successful write, inside the region try), so its Recs are skipped.
async function warmRecsForRegion(runtime: RuntimeEnv, region: AnalysisRegion, marketData: unknown): Promise<void> {
  const sectors = (marketData as { sectors?: WarmMarketSector[] } | null)?.sectors;
  if (!Array.isArray(sectors)) return;
  for (const sec of selectEnterSectorsToWarm(sectors)) {
    const universe = resolveSectorUniverse(sec.bestExchange, region);
    const cacheKey = recsWarmCacheKey(universe, sec.sector);
    try {
      await lambda.send(new InvokeCommand({
        FunctionName: runtime.recommendationsFunctionName,
        InvocationType: 'Event',
        Payload: Buffer.from(JSON.stringify({
          __warmRecs: true,
          request: { universe, mode: WARM_RECS_MODE, sector: sec.sector, searchMode: 'live' },
          cacheKey,
        })),
      }));
      console.log(JSON.stringify({ message: 'notification-recs-warm-dispatched', region, cacheKey }));
    } catch (err) {
      console.log(JSON.stringify({ message: 'notification-recs-warm-dispatch-error', region, cacheKey, err: String(err) }));
    }
  }
}

// Warm MARKET#{region} for EVERY region, ONCE per job run. Each region is the
// SAME grounded computation the live Market tab runs (shared prompt + system +
// grounding) → the warm-write is identical-to-live by construction. Per-region
// isolation: one region's model/cache failure never drops the others.
function makeWarmMarketCache(runtime: RuntimeEnv): () => Promise<void> {
  const providerFactory = makeAiProviderFactory(runtime);
  const fetchOhlcv = makeServerOhlcvFetcher(runtime);
  return async () => {
    const { provider, config } = await providerFactory();
    for (const region of ANALYSIS_REGIONS) {
      try {
        const suppliedSectorData = await buildSectorSuppliedData(region, fetchOhlcv).catch(() => '');
        const result = await provider.generate({
          prompt: createMarketAnalysisPrompt(region, suppliedSectorData),
          system: MARKET_ANALYSIS_SYSTEM_PROMPT,
          model: config.model,
          webSearch: true,
          responseSchema: marketAnalysisResultJsonSchema,
          // #601/market: region grounding rubric (macro + sectors) — same shared logic as
          // the interactive path, so warm + interactive can't diverge.
          groundingKind: 'market',
          // #601/market: give the grounded research pass room for macro + all sectors — at
          // the 4000 default it truncated for content-heavy regions (US macro dropped).
          maxTokens: MARKET_ANALYSIS_MAX_TOKENS,
        });
        const data = parseMarketAnalysisProviderResult(result, region);
        await writeSharedMarketCache(runtime, region, data);
        console.log(JSON.stringify({ message: 'notification-market-warm-ok', region }));
        // #595: fan out Recs warming for the sectors this region flagged 'enter'.
        await warmRecsForRegion(runtime, region, data);
      } catch (err) {
        console.log(JSON.stringify({ message: 'notification-market-warm-region-error', region, err: String(err) }));
      }
    }
  };
}

// ── #594 warm ETF#{market} for EVERY market, ONCE per job run ─────────────────────
// Async-invoke the runEtfs engine (#626 — the SAME engine a live ETF tab run uses) for
// each market; it SHARED-writes ETF#{market}. NO smart-filter: ETFs have no enter-gate
// equivalent, so all 3 markets warm every run. The cacheKey is byte-identical to what
// the live tab reads (analysisRealCacheKey → `ETF#{market}`), so the warm is consumed on
// Run. Per-market isolation: a dispatch failure is logged, never thrown.
async function warmEtfsForAllMarkets(runtime: RuntimeEnv): Promise<void> {
  for (const market of ETF_MARKETS) {
    const cacheKey = `ETF#${market}`;
    try {
      await lambda.send(new InvokeCommand({
        FunctionName: runtime.etfsFunctionName,
        InvocationType: 'Event',
        Payload: Buffer.from(JSON.stringify({
          __warmEtfs: true,
          request: { market, searchMode: 'live' },
          cacheKey,
        })),
      }));
      console.log(JSON.stringify({ message: 'notification-etfs-warm-dispatched', market, cacheKey }));
    } catch (err) {
      console.log(JSON.stringify({ message: 'notification-etfs-warm-dispatch-error', market, cacheKey, err: String(err) }));
    }
  }
}

export function createDependencies(runtime: RuntimeEnv = env()): NotificationEngineDeps {
  return {
    today: todayUtc,
    nowEpochSeconds: () => Math.floor(Date.now() / 1000),
    newRunId: () => randomUUID(),
    readEngineEnabled: () => readEngineEnabled(runtime),
    warmMarketCache: makeWarmMarketCache(runtime),
    warmEtfsCache: () => warmEtfsForAllMarkets(runtime),
    readAccountName: (accountId) => readAccountName(runtime, accountId),
    recordSendLog: (run) => recordSendLog(runtime, run),
    listStockAnalyserMembers: () => listStockAnalyserMembers(runtime),
    readNotificationConfig: (accountId) => readNotificationConfig(runtime, accountId),
    readMemberConsent: (accountId, userId) => readMemberConsent(runtime, accountId, userId),
    readLiveMember: (accountId, userId) => readLiveMember(runtime, accountId, userId),
    readNotificationStates: (accountId) => readNotificationStates(runtime, accountId),
    putNotificationState: (record) => putNotificationState(runtime, record),
    readPortfolio: (accountId) => readPortfolio(runtime, accountId),
    readWatchlist: (accountId) => readWatchlist(runtime, accountId),
    readSharedAnalysisCache: (ticker) => readSharedAnalysisCache(runtime, ticker),
    generateAnalysis: makeGenerateAnalysis(runtime),
    writeSharedAnalysisCache: (ticker, analysis) => writeSharedAnalysisCache(runtime, ticker, analysis),
    sendEmail: (recipient, transition) => sendNotificationEmail(runtime, recipient, transition),
    log: (message, context) => console.log(JSON.stringify({ message, ...context })),
  };
}

export async function handler(_event: ScheduledEvent) {
  const result = await runNotificationEngine(createDependencies());
  console.log(JSON.stringify({ event: 'stock-analyser-notification-engine-complete', result }));
  return result;
}
