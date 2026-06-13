import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DeleteCommand, DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import {
  badRequest,
  noContent,
  ok,
  parseBody,
  requireAccountData,
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
  const updatedAt = typeof res.Item?.['updatedAt'] === 'string'
    ? res.Item['updatedAt'] as string
    : deps.now().toISOString();
  const settings: StockAnalyserSettings = {
    pk: 'SETTINGS',
    sk: 'APP#stock-analyser',
    explanatoryTextEnabled,
    updatedAt,
  };
  return ok({ settings });
}

async function patchSettings(deps: Dependencies, event: APIGatewayProxyEvent, accountId: string, userId: string) {
  const body = parseBody<{ explanatoryTextEnabled?: unknown } & Record<string, unknown>>(event);
  const unexpected = Object.keys(body).filter(key => key !== 'explanatoryTextEnabled');
  if (unexpected.length) {
    throw badRequest(`Unsupported settings fields: ${unexpected.join(', ')}`);
  }
  if (typeof body.explanatoryTextEnabled !== 'boolean') {
    throw badRequest('explanatoryTextEnabled must be a boolean');
  }
  const updatedAt = deps.now().toISOString();
  await deps.client.send(new PutCommand({
    TableName: deps.settingsTable,
    Item: {
      pk: accountPk(accountId),
      sk: userPreferencesSk(userId),
      explanatoryTextEnabled: body.explanatoryTextEnabled,
      updatedAt,
    },
  }));
  const settings: StockAnalyserSettings = {
    pk: 'SETTINGS',
    sk: 'APP#stock-analyser',
    explanatoryTextEnabled: body.explanatoryTextEnabled,
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
