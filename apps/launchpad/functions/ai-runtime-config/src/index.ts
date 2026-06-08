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
  requireSiteAdmin,
  withAuthOnly,
  type APIGatewayProxyEvent,
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

interface Dependencies {
  client: DynamoDBDocumentClient;
  tableName: string;
  now: () => Date;
}

const defaultDependencies: Dependencies = {
  client: ddb,
  tableName: CONFIG_TABLE,
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

async function readConfig(deps: Dependencies) {
  const platformDefault = await readRecord(deps, PLATFORM_DEFAULT_SK);
  const overrides = await Promise.all(
    SUPPORTED_APP_SLUGS.map(async appSlug => [appSlug, await readRecord(deps, appOverrideSk(appSlug))] as const),
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
async function updateAppOverride(deps: Dependencies, event: APIGatewayProxyEvent) {
  const appSlug = getPathParam(event, 'appSlug');
  if (!isAppSlug(appSlug)) {
    throw badRequest(`Unsupported appSlug: ${appSlug}`);
  }
  const { provider, model } = parseUpdateBody(event);
  const record = await putRecord(deps, appOverrideSk(appSlug), provider, model);
  return ok({ appSlug, ...record });
}

// Deprecated M15.1 transition route: app-owned override resets now belong to
// each app's Settings API. Keep this route temporarily for rollback/old clients.
async function resetAppOverride(deps: Dependencies, event: APIGatewayProxyEvent) {
  const appSlug = getPathParam(event, 'appSlug');
  if (!isAppSlug(appSlug)) {
    throw badRequest(`Unsupported appSlug: ${appSlug}`);
  }
  await deps.client.send(new DeleteCommand({
    TableName: deps.tableName,
    Key: { pk: AI_CONFIG_PK, sk: appOverrideSk(appSlug) },
  }));
  return noContent();
}

export function createHandler(deps: Dependencies = defaultDependencies) {
  return withAuthOnly(async ({ auth, event }) => {
    requireSiteAdmin(auth);
    const resource = event.resource ?? '';

    if (resource === '/api/admin/ai-runtime-config' && event.httpMethod === 'GET') {
      return readConfig(deps);
    }
    if (resource === '/api/admin/ai-runtime-config/platform-default' && event.httpMethod === 'PUT') {
      return updatePlatformDefault(deps, event);
    }
    if (resource === '/api/admin/ai-runtime-config/apps/{appSlug}/override' && event.httpMethod === 'PUT') {
      return updateAppOverride(deps, event);
    }
    if (resource === '/api/admin/ai-runtime-config/apps/{appSlug}/override' && event.httpMethod === 'DELETE') {
      return resetAppOverride(deps, event);
    }

    throw badRequest(`Unrecognised route: ${event.httpMethod} ${resource}`);
  });
}

export const handler = createHandler();
