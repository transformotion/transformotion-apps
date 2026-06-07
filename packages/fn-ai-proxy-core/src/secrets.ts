import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { HttpError } from '@transformotion/lambda-middleware';

const cachedApiKeys = new Map<string, { value: string; expiresAt: number }>();

export interface ApiKeyOptions {
  secretName: string;
  client?: SecretsManagerClient;
  cacheTtlMs?: number;
}

export async function getSecretApiKey(options: ApiKeyOptions, label: string): Promise<string> {
  const now = Date.now();
  const cached = cachedApiKeys.get(options.secretName);
  if (cached && now < cached.expiresAt) {
    return cached.value;
  }

  const client = options.client ?? new SecretsManagerClient({});
  const res = await client.send(new GetSecretValueCommand({ SecretId: options.secretName }));

  if (!res.SecretString) {
    throw new HttpError(500, `${label} API key secret is empty`);
  }

  const value = res.SecretString.trim();
  cachedApiKeys.set(options.secretName, {
    value,
    expiresAt: now + (options.cacheTtlMs ?? 5 * 60 * 1000),
  });
  return value;
}

export async function getAnthropicApiKey(options: ApiKeyOptions): Promise<string> {
  return getSecretApiKey(options, 'Anthropic');
}

export async function getOpenAIApiKey(options: ApiKeyOptions): Promise<string> {
  return getSecretApiKey(options, 'OpenAI');
}

export function resetAnthropicApiKeyCache(): void {
  cachedApiKeys.clear();
}

export const resetApiKeyCache = resetAnthropicApiKeyCache;
