import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DeleteCommand, DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import {
  badRequest,
  noContent,
  ok,
  parseBody,
  requireAccountAccess,
  requireAppAccess,
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

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const SETTINGS_TABLE = process.env.SETTINGS_TABLE!;
const PLATFORM_CONFIG_TABLE = process.env.PLATFORM_CONFIG_TABLE!;
const APP_SLUG = 'budget-tracker' as const;
const SETTING_KEY = 'AI_CONFIG#APP#budget-tracker';

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

function parseUpdateBody(event: APIGatewayProxyEvent) {
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
  const provider = item['provider'];
  const model = item['model'];
  const updatedAt = item['updatedAt'];
  const sk = item['sk'];
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
    Key: { accountId, settingKey: SETTING_KEY },
  }));
  return parseRecord(res.Item);
}

function response(platformDefault: AiRuntimeConfigRecord | null, appOverride: AiRuntimeConfigRecord | null): AppAiRuntimeConfigResponse {
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

async function readConfig(deps: Dependencies, accountId: string) {
  const [platformDefault, appOverride] = await Promise.all([
    readPlatformDefault(deps),
    readAppOverride(deps, accountId),
  ]);
  return ok(response(platformDefault, appOverride));
}

async function updateOverride(deps: Dependencies, event: APIGatewayProxyEvent, accountId: string) {
  const { provider, model } = parseUpdateBody(event);
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
      accountId,
      settingKey: SETTING_KEY,
      ...appOverride,
    },
  }));

  const platformDefault = await readPlatformDefault(deps);
  return ok(response(platformDefault, appOverride));
}

async function resetOverride(deps: Dependencies, accountId: string) {
  await deps.client.send(new DeleteCommand({
    TableName: deps.settingsTable,
    Key: { accountId, settingKey: SETTING_KEY },
  }));
  return noContent();
}

export function createHandler(deps: Dependencies = defaultDependencies) {
  return withAuth(async ({ auth, account, event }) => {
    requireAppAccess(auth, APP_SLUG);
    requireAccountAccess(auth, APP_SLUG, account.accountId);

    const resource = event.resource ?? '';
    if (resource === '/api/budget/v1/ai-config' && event.httpMethod === 'GET') {
      return readConfig(deps, account.accountId);
    }

    if (resource === '/api/budget/v1/ai-config/override' && event.httpMethod === 'PUT') {
      requireSiteAdmin(auth);
      return updateOverride(deps, event, account.accountId);
    }

    if (resource === '/api/budget/v1/ai-config/override' && event.httpMethod === 'DELETE') {
      requireSiteAdmin(auth);
      return resetOverride(deps, account.accountId);
    }

    throw badRequest(`Unrecognised route: ${event.httpMethod} ${resource}`);
  });
}

export const handler = createHandler();
