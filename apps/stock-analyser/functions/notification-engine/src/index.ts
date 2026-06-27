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
  createAiProvider,
  resolveAiRuntimeConfig,
  type AiProvider,
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
  type MemberRow,
  type NotificationEngineDeps,
  type NotificationStateRecord,
  type NotificationTransition,
  type SendLogRun,
} from './engine';
import { SEND_LOG_TTL_SECONDS, writeSendLog } from './send-log';

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
  return async (ticker: string): Promise<StockAnalysisResult> => {
    const { provider, config } = await providerFactory();
    const result = await provider.generate({
      prompt: createStockAnalysisPrompt(ticker),
      system: STOCK_ANALYSIS_SYSTEM_PROMPT,
      model: config.model,
      webSearch: true,
    });
    return normaliseStockAnalysisSignals(JSON.parse(stripCodeFences(result.content)) as StockAnalysisResult);
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

export function createDependencies(runtime: RuntimeEnv = env()): NotificationEngineDeps {
  return {
    today: todayUtc,
    nowEpochSeconds: () => Math.floor(Date.now() / 1000),
    newRunId: () => randomUUID(),
    readEngineEnabled: () => readEngineEnabled(runtime),
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
