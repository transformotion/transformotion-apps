import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DeleteCommand, DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import {
  badRequest,
  noContent,
  ok,
  parseBody,
  requireAccountData,
  requireAppAdminForApp,
  requireSiteAdmin,
  withAuth,
  type APIGatewayProxyEvent,
} from '@transformotion/lambda-middleware';
import {
  AI_CONFIG_PK,
  AI_MODEL_ALLOWLIST,
  PLATFORM_DEFAULT_SK,
  appOverrideSk,
  assertValidAiConfig,
  isSupportedAiModel,
  isSupportedAiProvider,
  resolveEnvFallbackConfig,
  type AiRuntimeConfigRecord,
  type AppAiRuntimeConfigResponse,
} from '@transformotion/fn-ai-proxy-core';
import type { StockAnalyserSettings } from '@transformotion/contracts/stock-analyser/types';
import type {
  PatchSettingsRequest,
  PutCacheFreshnessConfigRequest,
} from '@transformotion/contracts/stock-analyser/api';
import {
  defaultCacheFreshnessConfigRecord,
  isValidCacheFreshnessPolicy,
  isValidCacheFreshnessPreset,
  type CacheFreshnessConfigRecord,
} from '@transformotion/contracts/stock-analyser/cache-freshness';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const SETTINGS_TABLE = process.env.SETTINGS_TABLE!;
const PLATFORM_CONFIG_TABLE = process.env.PLATFORM_CONFIG_TABLE!;
const APP_SLUG = 'stock-analyser' as const;

interface Dependencies {
  client: DynamoDBDocumentClient;
  settingsTable: string;
  platformConfigTable: string;
  now: () => Date;
}

const defaultDependencies: Dependencies = {
  client: ddb,
  settingsTable: SETTINGS_TABLE,
  platformConfigTable: PLATFORM_CONFIG_TABLE,
  now: () => new Date(),
};

interface UpdateConfigBody {
  provider: unknown;
  model: unknown;
}

function accountPk(accountId: string) {
  return `ACCOUNT#${accountId}`;
}

function userPreferencesSk(userId: string) {
  return `USER#${userId}#PREFERENCES`;
}

const aiRuntimeSk = 'APP#AI_RUNTIME';
const cacheFreshnessKey = {
  pk: 'SETTINGS',
  sk: 'CACHE_FRESHNESS#stock-analyser',
} as const;

function parseAiUpdateBody(event: APIGatewayProxyEvent) {
  const body = parseBody<UpdateConfigBody & Record<string, unknown>>(event);
  const unexpected = Object.keys(body).filter(key => key !== 'provider' && key !== 'model');
  if (unexpected.length) {
    throw badRequest(`Unsupported AI config fields: ${unexpected.join(', ')}`);
  }

  try {
    assertValidAiConfig(body.provider, body.model);
  } catch (err) {
    throw badRequest(err instanceof Error ? err.message : 'Invalid AI provider/model config');
  }

  return { provider: body.provider, model: body.model as string };
}

function parseRecord(item: Record<string, unknown> | undefined): AiRuntimeConfigRecord | null {
  if (!item) return null;
  const source = typeof item['config'] === 'object' && item['config'] !== null
    ? item['config'] as Record<string, unknown>
    : item;
  const provider = source['provider'];
  const model = source['model'];
  const updatedAt = source['updatedAt'];
  const sk = source['sk'];
  if (
    !isSupportedAiProvider(provider) ||
    !isSupportedAiModel(provider, model) ||
    typeof updatedAt !== 'string' ||
    sk !== appOverrideSk(APP_SLUG) && sk !== PLATFORM_DEFAULT_SK
  ) {
    return null;
  }
  return { pk: AI_CONFIG_PK, sk, provider, model, updatedAt };
}

function parseCacheFreshnessConfig(
  item: Record<string, unknown> | undefined,
  now: Date,
): CacheFreshnessConfigRecord {
  if (!item) return defaultCacheFreshnessConfigRecord(now.toISOString());
  const activePolicy = item['activePolicy'];
  const presets = item['presets'];
  const updatedAt = item['updatedAt'];
  if (
    !isValidCacheFreshnessPolicy(activePolicy) ||
    !Array.isArray(presets) ||
    !presets.every(isValidCacheFreshnessPreset) ||
    typeof updatedAt !== 'string'
  ) {
    return defaultCacheFreshnessConfigRecord(now.toISOString());
  }
  return {
    ...cacheFreshnessKey,
    activePolicy,
    presets,
    updatedAt,
  };
}

async function readPlatformDefault(deps: Dependencies): Promise<AiRuntimeConfigRecord | null> {
  const res = await deps.client.send(new GetCommand({
    TableName: deps.platformConfigTable,
    Key: { pk: AI_CONFIG_PK, sk: PLATFORM_DEFAULT_SK },
  }));
  return parseRecord(res.Item);
}

async function readAppOverride(deps: Dependencies, accountId: string): Promise<AiRuntimeConfigRecord | null> {
  const res = await deps.client.send(new GetCommand({
    TableName: deps.settingsTable,
    Key: { pk: accountPk(accountId), sk: aiRuntimeSk },
  }));
  return parseRecord(res.Item);
}

function aiConfigResponse(
  platformDefault: AiRuntimeConfigRecord | null,
  appOverride: AiRuntimeConfigRecord | null,
): AppAiRuntimeConfigResponse {
  return {
    appSlug: APP_SLUG,
    platformDefault,
    appOverride,
    effective: appOverride
      ? { provider: appOverride.provider, model: appOverride.model, source: 'app_override' }
      : platformDefault
        ? { provider: platformDefault.provider, model: platformDefault.model, source: 'platform_default' }
        : resolveEnvFallbackConfig({ fallbackProvider: 'claude', fallbackModel: 'claude-sonnet-4-6' }),
    supportedModels: AI_MODEL_ALLOWLIST,
  };
}

async function readSettings(deps: Dependencies, accountId: string, userId: string) {
  const res = await deps.client.send(new GetCommand({
    TableName: deps.settingsTable,
    Key: { pk: accountPk(accountId), sk: userPreferencesSk(userId) },
  }));
  const explanatoryTextEnabled = typeof res.Item?.['explanatoryTextEnabled'] === 'boolean'
    ? res.Item['explanatoryTextEnabled'] as boolean
    : true;
  const defaultSearchMode = res.Item?.['defaultSearchMode'] === 'fast' || res.Item?.['defaultSearchMode'] === 'live'
    ? res.Item['defaultSearchMode'] as StockAnalyserSettings['defaultSearchMode']
    : 'live';
  const updatedAt = typeof res.Item?.['updatedAt'] === 'string'
    ? res.Item['updatedAt'] as string
    : deps.now().toISOString();
  const settings: StockAnalyserSettings = {
    pk: 'SETTINGS',
    sk: 'APP#stock-analyser',
    explanatoryTextEnabled,
    defaultSearchMode,
    updatedAt,
  };
  return ok({ settings });
}

async function patchSettings(deps: Dependencies, event: APIGatewayProxyEvent, accountId: string, userId: string) {
  const body = parseBody<PatchSettingsRequest & Record<string, unknown>>(event);
  const unexpected = Object.keys(body).filter(key => key !== 'explanatoryTextEnabled' && key !== 'defaultSearchMode');
  if (unexpected.length) {
    throw badRequest(`Unsupported settings fields: ${unexpected.join(', ')}`);
  }
  if (body.explanatoryTextEnabled !== undefined && typeof body.explanatoryTextEnabled !== 'boolean') {
    throw badRequest('explanatoryTextEnabled must be a boolean');
  }
  if (
    body.defaultSearchMode !== undefined &&
    body.defaultSearchMode !== 'fast' &&
    body.defaultSearchMode !== 'live'
  ) {
    throw badRequest('defaultSearchMode must be "live" or "fast"');
  }
  if (body.explanatoryTextEnabled === undefined && body.defaultSearchMode === undefined) {
    throw badRequest('At least one supported settings field is required');
  }

  const existing = await deps.client.send(new GetCommand({
    TableName: deps.settingsTable,
    Key: { pk: accountPk(accountId), sk: userPreferencesSk(userId) },
  }));
  const explanatoryTextEnabled = body.explanatoryTextEnabled ?? (
    typeof existing.Item?.['explanatoryTextEnabled'] === 'boolean'
      ? existing.Item['explanatoryTextEnabled'] as boolean
      : true
  );
  const defaultSearchMode = body.defaultSearchMode ?? (
    existing.Item?.['defaultSearchMode'] === 'fast' || existing.Item?.['defaultSearchMode'] === 'live'
      ? existing.Item['defaultSearchMode'] as StockAnalyserSettings['defaultSearchMode']
      : 'live'
  );
  const updatedAt = deps.now().toISOString();
  await deps.client.send(new PutCommand({
    TableName: deps.settingsTable,
    Item: {
      pk: accountPk(accountId),
      sk: userPreferencesSk(userId),
      explanatoryTextEnabled,
      defaultSearchMode,
      updatedAt,
    },
  }));
  const settings: StockAnalyserSettings = {
    pk: 'SETTINGS',
    sk: 'APP#stock-analyser',
    explanatoryTextEnabled,
    defaultSearchMode,
    updatedAt,
  };
  return ok({ settings });
}

async function readAiConfig(deps: Dependencies, accountId: string) {
  const [platformDefault, appOverride] = await Promise.all([
    readPlatformDefault(deps),
    readAppOverride(deps, accountId),
  ]);
  return ok(aiConfigResponse(platformDefault, appOverride));
}

async function readCacheFreshnessConfig(deps: Dependencies) {
  const res = await deps.client.send(new GetCommand({
    TableName: deps.settingsTable,
    Key: cacheFreshnessKey,
  }));
  return ok({ config: parseCacheFreshnessConfig(res.Item, deps.now()) });
}

function requireCacheFreshnessAdmin(auth: Parameters<typeof requireSiteAdmin>[0]) {
  if (auth.siteAdmin) {
    requireSiteAdmin(auth);
    return;
  }
  requireAppAdminForApp(auth, APP_SLUG);
}

async function updateCacheFreshnessConfig(deps: Dependencies, event: APIGatewayProxyEvent) {
  const body = parseBody<PutCacheFreshnessConfigRequest & Record<string, unknown>>(event);
  const unexpected = Object.keys(body).filter(key => key !== 'activePolicy' && key !== 'presets');
  if (unexpected.length) {
    throw badRequest(`Unsupported cache freshness fields: ${unexpected.join(', ')}`);
  }
  if (body.activePolicy !== undefined && !isValidCacheFreshnessPolicy(body.activePolicy)) {
    throw badRequest('Invalid cache freshness policy');
  }
  if (
    body.presets !== undefined &&
    (!Array.isArray(body.presets) || !body.presets.every(isValidCacheFreshnessPreset))
  ) {
    throw badRequest('Invalid cache freshness presets');
  }
  if (body.activePolicy === undefined && body.presets === undefined) {
    throw badRequest('At least one cache freshness field is required');
  }

  const existing = await deps.client.send(new GetCommand({
    TableName: deps.settingsTable,
    Key: cacheFreshnessKey,
  }));
  const previous = parseCacheFreshnessConfig(existing.Item, deps.now());
  const updatedAt = deps.now().toISOString();
  const config: CacheFreshnessConfigRecord = {
    ...cacheFreshnessKey,
    activePolicy: body.activePolicy ?? previous.activePolicy,
    presets: body.presets ?? previous.presets,
    updatedAt,
  };

  await deps.client.send(new PutCommand({
    TableName: deps.settingsTable,
    Item: config,
  }));
  return ok({ config });
}

async function updateOverride(deps: Dependencies, event: APIGatewayProxyEvent, accountId: string) {
  const { provider, model } = parseAiUpdateBody(event);
  const appOverride: AiRuntimeConfigRecord = {
    pk: AI_CONFIG_PK,
    sk: appOverrideSk(APP_SLUG),
    provider,
    model,
    updatedAt: deps.now().toISOString(),
  };
  await deps.client.send(new PutCommand({
    TableName: deps.settingsTable,
    Item: {
      pk: accountPk(accountId),
      sk: aiRuntimeSk,
      config: appOverride,
      updatedAt: appOverride.updatedAt,
    },
  }));
  const platformDefault = await readPlatformDefault(deps);
  return ok(aiConfigResponse(platformDefault, appOverride));
}

async function resetOverride(deps: Dependencies, accountId: string) {
  await deps.client.send(new DeleteCommand({
    TableName: deps.settingsTable,
    Key: { pk: accountPk(accountId), sk: aiRuntimeSk },
  }));
  return noContent();
}

// D9 data-tier gate (no site-admin branch). Settings rows are D12 user-scoped
// (SK=USER#{userId}#PREFERENCES): a viewer MAY read AND write their OWN prefs,
// so both /settings GET and PATCH use .read (membership) — the handler keys by
// auth.userId, enforcing the SK-owner match by construction.
const saData = requireAccountData(APP_SLUG);

export function createHandler(deps: Dependencies = defaultDependencies) {
  return withAuth(async ({ auth, account, event }) => {
    const resource = event.resource ?? '';
    if (resource === '/settings' && event.httpMethod === 'GET') {
      saData.read(auth, account.accountId);
      return readSettings(deps, account.accountId, auth.userId);
    }
    if (resource === '/settings' && event.httpMethod === 'PATCH') {
      saData.read(auth, account.accountId); // D12 user-scoped own-prefs write — viewer permitted
      return patchSettings(deps, event, account.accountId, auth.userId);
    }
    if (resource === '/ai-config' && event.httpMethod === 'GET') {
      saData.read(auth, account.accountId);
      return readAiConfig(deps, account.accountId);
    }
    if (resource === '/cache-freshness' && event.httpMethod === 'GET') {
      saData.read(auth, account.accountId);
      return readCacheFreshnessConfig(deps);
    }
    if (resource === '/cache-freshness' && event.httpMethod === 'PUT') {
      saData.read(auth, account.accountId);
      requireCacheFreshnessAdmin(auth);
      return updateCacheFreshnessConfig(deps, event);
    }
    // /ai-config/override is operational-config (D9) — site-admin write of an
    // account-shared config row. Interim: preserve current behaviour (member +
    // site-admin). PR-C rehomes this to app-level config gated by app-admin.
    if (resource === '/ai-config/override' && event.httpMethod === 'PUT') {
      saData.read(auth, account.accountId);
      requireSiteAdmin(auth);
      return updateOverride(deps, event, account.accountId);
    }
    if (resource === '/ai-config/override' && event.httpMethod === 'DELETE') {
      saData.read(auth, account.accountId);
      requireSiteAdmin(auth);
      return resetOverride(deps, account.accountId);
    }

    throw badRequest(`Unrecognised route: ${event.httpMethod} ${resource}`);
  });
}

export const handler = createHandler();
