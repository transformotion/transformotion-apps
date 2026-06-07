import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import {
  AI_CONFIG_PK,
  AI_MODEL_ALLOWLIST,
  PLATFORM_DEFAULT_SK,
  SUPPORTED_AI_CONFIG_APP_SLUGS,
  type AiConfigAppSlug,
  type AiProviderId,
  type AiRuntimeConfigRecord,
  type ResolvedAiRuntimeConfig,
} from '@transformotion/contracts/_shared/ai-runtime';

export {
  AI_CONFIG_PK,
  AI_MODEL_ALLOWLIST,
  PLATFORM_DEFAULT_SK,
  type AiConfigAppSlug,
  type AiConfigSource,
  type AiRuntimeConfigRecord,
  type ResolvedAiRuntimeConfig,
} from '@transformotion/contracts/_shared/ai-runtime';

export const SUPPORTED_APP_SLUGS = SUPPORTED_AI_CONFIG_APP_SLUGS;

export interface AiRuntimeConfigResolverOptions {
  appSlug: AiConfigAppSlug;
  tableName?: string;
  fallbackProvider?: string;
  fallbackModel?: string;
  client?: DynamoDBDocumentClient;
}

export function isSupportedAiProvider(value: unknown): value is AiProviderId {
  return value === 'claude' || value === 'openai';
}

export function isSupportedAiModel(provider: AiProviderId, model: unknown): model is string {
  return typeof model === 'string' && (AI_MODEL_ALLOWLIST[provider] as readonly string[]).includes(model);
}

export function assertValidAiConfig(provider: unknown, model: unknown): asserts provider is AiProviderId {
  if (!isSupportedAiProvider(provider)) {
    throw new Error(`Unsupported AI provider: ${String(provider)}`);
  }
  if (!isSupportedAiModel(provider, model)) {
    throw new Error(`Unsupported AI model for ${provider}: ${String(model)}`);
  }
}

export function appOverrideSk(appSlug: AiConfigAppSlug): `APP#${AiConfigAppSlug}` {
  return `APP#${appSlug}`;
}

export function resolveEnvFallbackConfig(options: Pick<AiRuntimeConfigResolverOptions, 'fallbackProvider' | 'fallbackModel'>): ResolvedAiRuntimeConfig {
  const provider = isSupportedAiProvider(options.fallbackProvider) ? options.fallbackProvider : 'claude';
  const requestedModel = options.fallbackModel;
  const model = isSupportedAiModel(provider, requestedModel)
    ? requestedModel
    : AI_MODEL_ALLOWLIST[provider][0];
  return { provider, model, source: 'environment_fallback' };
}

function parseRecord(item: Record<string, unknown> | undefined): AiRuntimeConfigRecord | undefined {
  if (!item) return undefined;
  const provider = item['provider'];
  const model = item['model'];
  if (!isSupportedAiProvider(provider) || !isSupportedAiModel(provider, model)) {
    return undefined;
  }
  if (typeof item['updatedAt'] !== 'string') {
    return undefined;
  }
  return {
    pk: AI_CONFIG_PK,
    sk: item['sk'] as AiRuntimeConfigRecord['sk'],
    provider,
    model,
    updatedAt: item['updatedAt'],
  };
}

async function readConfigRecord(
  client: DynamoDBDocumentClient,
  tableName: string,
  sk: string,
): Promise<AiRuntimeConfigRecord | undefined> {
  const res = await client.send(new GetCommand({
    TableName: tableName,
    Key: { pk: AI_CONFIG_PK, sk },
  }));
  return parseRecord(res.Item);
}

export async function resolveAiRuntimeConfig(options: AiRuntimeConfigResolverOptions): Promise<ResolvedAiRuntimeConfig> {
  const fallback = resolveEnvFallbackConfig(options);
  if (!options.tableName) {
    return fallback;
  }

  const client = options.client ?? DynamoDBDocumentClient.from(new DynamoDBClient({}));

  try {
    const appOverride = await readConfigRecord(client, options.tableName, appOverrideSk(options.appSlug));
    if (appOverride) {
      return {
        provider: appOverride.provider,
        model: appOverride.model,
        source: 'app_override',
      };
    }

    const platformDefault = await readConfigRecord(client, options.tableName, PLATFORM_DEFAULT_SK);
    if (platformDefault) {
      return {
        provider: platformDefault.provider,
        model: platformDefault.model,
        source: 'platform_default',
      };
    }
  } catch (err) {
    console.warn('[fn-ai-proxy-core] AI runtime config read failed; using env fallback:', err);
  }

  return fallback;
}
