import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
} from '@aws-sdk/lib-dynamodb';
import {
  badRequest,
  getPathParam,
  noContent,
  ok,
  parseBody,
  requireAppAdminForApp,
  requireSiteAdmin,
  withAuthOnly,
  type APIGatewayProxyEvent,
  type AuthClaims,
} from '@transformotion/lambda-middleware';
import {
  AI_CONFIG_PK,
  AI_MODEL_ALLOWLIST,
  PLATFORM_DEFAULT_SK,
  SUPPORTED_APP_SLUGS,
  appOverrideSk,
  assertValidAiConfig,
  isSupportedAiModel,
  isSupportedAiProvider,
  type AiConfigAppSlug,
  type AiRuntimeConfigRecord,
  type ResolvedAiRuntimeConfig,
} from '@transformotion/fn-ai-proxy-core';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const CONFIG_TABLE = process.env.AI_CONFIG_TABLE!;
const BUDGET_TRACKER_SETTINGS_TABLE = process.env.BUDGET_TRACKER_SETTINGS_TABLE;
const STOCK_ANALYSER_SETTINGS_TABLE = process.env.STOCK_ANALYSER_SETTINGS_TABLE;
const BUDGET_TRACKER_SETTING_KEY = 'AI_CONFIG#APP#budget-tracker';
const STOCK_ANALYSER_AI_RUNTIME_SK = 'APP#AI_RUNTIME';

interface Dependencies {
  client: DynamoDBDocumentClient;
  tableName: string;
  budgetTrackerSettingsTable?: string;
  stockAnalyserSettingsTable?: string;
  now: () => Date;
}

const defaultDependencies: Dependencies = {
  client: ddb,
  tableName: CONFIG_TABLE,
  budgetTrackerSettingsTable: BUDGET_TRACKER_SETTINGS_TABLE,
  stockAnalyserSettingsTable: STOCK_ANALYSER_SETTINGS_TABLE,
  now: () => new Date(),
};

interface UpdateConfigBody {
  provider: unknown;
  model: unknown;
}

function isAppSlug(value: string): value is AiConfigAppSlug {
  return (SUPPORTED_APP_SLUGS as readonly string[]).includes(value);
}

function parseUpdateBody(event: APIGatewayProxyEvent): { provider: AiRuntimeConfigRecord['provider']; model: string } {
  const body = parseBody<UpdateConfigBody & Record<string, unknown>>(event);
  const keys = Object.keys(body);
  const unexpected = keys.filter(key => key !== 'provider' && key !== 'model');
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

function toRecord(
  sk: AiRuntimeConfigRecord['sk'],
  provider: AiRuntimeConfigRecord['provider'],
  model: string,
  updatedAt: string,
): AiRuntimeConfigRecord {
  return { pk: AI_CONFIG_PK, sk, provider, model, updatedAt };
}

async function readRecord(deps: Dependencies, sk: string): Promise<AiRuntimeConfigRecord | null> {
  const res = await deps.client.send(new GetCommand({
    TableName: deps.tableName,
    Key: { pk: AI_CONFIG_PK, sk },
  }));

  const item = res.Item;
  if (!item) return null;
  const provider = item['provider'];
  const model = item['model'];
  const updatedAt = item['updatedAt'];
  if (!isSupportedAiProvider(provider) || !isSupportedAiModel(provider, model) || typeof updatedAt !== 'string') {
    return null;
  }
  return toRecord(sk as AiRuntimeConfigRecord['sk'], provider, model, updatedAt);
}

function parseRecord(
  item: Record<string, unknown> | undefined,
  sk: AiRuntimeConfigRecord['sk'],
): AiRuntimeConfigRecord | null {
  if (!item) return null;
  const source = typeof item['config'] === 'object' && item['config'] !== null
    ? item['config'] as Record<string, unknown>
    : item;
  const provider = source['provider'];
  const model = source['model'];
  const updatedAt = source['updatedAt'];
  if (!isSupportedAiProvider(provider) || !isSupportedAiModel(provider, model) || typeof updatedAt !== 'string') {
    return null;
  }
  return toRecord(sk, provider, model, updatedAt);
}

function firstAccountId(auth: AuthClaims, appSlug: AiConfigAppSlug): string | null {
  const memberships = auth.accounts[appSlug] ?? [];
  return memberships[0]?.accountId ?? null;
}

async function readBudgetTrackerAppOverride(
  deps: Dependencies,
  auth: AuthClaims,
): Promise<AiRuntimeConfigRecord | null> {
  const accountId = firstAccountId(auth, 'budget-tracker');
  if (!deps.budgetTrackerSettingsTable || !accountId) return null;
  const res = await deps.client.send(new GetCommand({
    TableName: deps.budgetTrackerSettingsTable,
    Key: { accountId, settingKey: BUDGET_TRACKER_SETTING_KEY },
  }));
  return parseRecord(res.Item, appOverrideSk('budget-tracker'));
}

async function readStockAnalyserAppOverride(
  deps: Dependencies,
  auth: AuthClaims,
): Promise<AiRuntimeConfigRecord | null> {
  const accountId = firstAccountId(auth, 'stock-analyser');
  if (!deps.stockAnalyserSettingsTable || !accountId) return null;
  const res = await deps.client.send(new GetCommand({
    TableName: deps.stockAnalyserSettingsTable,
    Key: { pk: `ACCOUNT#${accountId}`, sk: STOCK_ANALYSER_AI_RUNTIME_SK },
  }));
  return parseRecord(res.Item, appOverrideSk('stock-analyser'));
}

async function readAppOwnedOverride(
  deps: Dependencies,
  auth: AuthClaims,
  appSlug: AiConfigAppSlug,
): Promise<AiRuntimeConfigRecord | null> {
  try {
    if (appSlug === 'budget-tracker') {
      return await readBudgetTrackerAppOverride(deps, auth);
    }
    if (appSlug === 'stock-analyser') {
      return await readStockAnalyserAppOverride(deps, auth);
    }
  } catch (err) {
    console.warn(`[launchpad-ai-runtime-config] App-owned AI override read failed for ${appSlug}:`, err);
  }
  return null;
}

async function putRecord(
  deps: Dependencies,
  sk: AiRuntimeConfigRecord['sk'],
  provider: AiRuntimeConfigRecord['provider'],
  model: string,
): Promise<AiRuntimeConfigRecord> {
  const item = toRecord(sk, provider, model, deps.now().toISOString());
  await deps.client.send(new PutCommand({
    TableName: deps.tableName,
    Item: item,
  }));
  return item;
}

function effectiveConfig(
  platformDefault: AiRuntimeConfigRecord | null,
  appOverride: AiRuntimeConfigRecord | null,
): ResolvedAiRuntimeConfig {
  if (appOverride) {
    return {
      provider: appOverride.provider,
      model: appOverride.model,
      source: 'app_override',
    };
  }
  if (platformDefault) {
    return {
      provider: platformDefault.provider,
      model: platformDefault.model,
      source: 'platform_default',
    };
  }
  return {
    provider: 'claude',
    model: 'claude-sonnet-4-6',
    source: 'environment_fallback',
  };
}

async function readConfig(deps: Dependencies, auth: AuthClaims) {
  const platformDefault = await readRecord(deps, PLATFORM_DEFAULT_SK);
  const overrides = await Promise.all(
    SUPPORTED_APP_SLUGS.map(async appSlug => [
      appSlug,
      await readAppOwnedOverride(deps, auth, appSlug) ?? await readRecord(deps, appOverrideSk(appSlug)),
    ] as const),
  );

  const appOverrides = Object.fromEntries(overrides) as Record<AiConfigAppSlug, AiRuntimeConfigRecord | null>;
  const effective = Object.fromEntries(
    SUPPORTED_APP_SLUGS.map(appSlug => [
      appSlug,
      effectiveConfig(platformDefault, appOverrides[appSlug]),
    ]),
  ) as Record<AiConfigAppSlug, ResolvedAiRuntimeConfig>;

  return ok({ platformDefault, appOverrides, effective, supportedModels: AI_MODEL_ALLOWLIST });
}

async function updatePlatformDefault(deps: Dependencies, event: APIGatewayProxyEvent) {
  const { provider, model } = parseUpdateBody(event);
  const record = await putRecord(deps, PLATFORM_DEFAULT_SK, provider, model);
  return ok(record);
}

// Deprecated M15.1 transition route: app-owned override writes now belong to
// each app's Settings API. Keep this route temporarily for rollback/old clients.
//
// D9 / M11 groups-authoritative: per-app config is an APP-ADMIN operation, not a
// site-admin one (site-admin override-write contradicted D9). Gate on the
// caller's `{app}-app-admin` group for THIS appSlug, resolved after the slug is
// validated. See route-classification-m16.md ("operational-config → app-admin").
async function updateAppOverride(deps: Dependencies, event: APIGatewayProxyEvent, auth: AuthClaims) {
  const appSlug = getPathParam(event, 'appSlug');
  if (!isAppSlug(appSlug)) {
    throw badRequest(`Unsupported appSlug: ${appSlug}`);
  }
  requireAppAdminForApp(auth, appSlug);
  const { provider, model } = parseUpdateBody(event);
  const record = await putRecord(deps, appOverrideSk(appSlug), provider, model);
  return ok({ appSlug, ...record });
}

// Deprecated M15.1 transition route: app-owned override resets now belong to
// each app's Settings API. Keep this route temporarily for rollback/old clients.
// App-admin-gated for the same D9 reason as updateAppOverride.
async function resetAppOverride(deps: Dependencies, event: APIGatewayProxyEvent, auth: AuthClaims) {
  const appSlug = getPathParam(event, 'appSlug');
  if (!isAppSlug(appSlug)) {
    throw badRequest(`Unsupported appSlug: ${appSlug}`);
  }
  requireAppAdminForApp(auth, appSlug);
  await deps.client.send(new DeleteCommand({
    TableName: deps.tableName,
    Key: { pk: AI_CONFIG_PK, sk: appOverrideSk(appSlug) },
  }));
  return noContent();
}

export function createHandler(deps: Dependencies = defaultDependencies) {
  return withAuthOnly(async ({ auth, event }) => {
    const resource = event.resource ?? '';

    // Per-route authorization (D9 / M11 groups-authoritative): the platform-scoped
    // read + default are SITE-ADMIN (supervisory); the per-app overrides are
    // APP-ADMIN for the target app (the override handlers gate themselves once the
    // appSlug is validated). See route-classification-m16.md.
    if (resource === '/api/admin/ai-runtime-config' && event.httpMethod === 'GET') {
      requireSiteAdmin(auth);
      return readConfig(deps, auth);
    }
    if (resource === '/api/admin/ai-runtime-config/platform-default' && event.httpMethod === 'PUT') {
      requireSiteAdmin(auth);
      return updatePlatformDefault(deps, event);
    }
    if (resource === '/api/admin/ai-runtime-config/apps/{appSlug}/override' && event.httpMethod === 'PUT') {
      return updateAppOverride(deps, event, auth);
    }
    if (resource === '/api/admin/ai-runtime-config/apps/{appSlug}/override' && event.httpMethod === 'DELETE') {
      return resetAppOverride(deps, event, auth);
    }

    throw badRequest(`Unrecognised route: ${event.httpMethod} ${resource}`);
  });
}

export const handler = createHandler();
