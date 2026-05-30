import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { HttpError } from '@transformotion/lambda-middleware';

let cachedApiKey: string | undefined;
let cacheExpiresAt = 0;

export interface ApiKeyOptions {
  secretName: string;
  client?: SecretsManagerClient;
  cacheTtlMs?: number;
}

export async function getAnthropicApiKey(options: ApiKeyOptions): Promise<string> {
  const now = Date.now();
  if (cachedApiKey && now < cacheExpiresAt) {
    return cachedApiKey;
  }

  const client = options.client ?? new SecretsManagerClient({});
  const res = await client.send(new GetSecretValueCommand({ SecretId: options.secretName }));

  if (!res.SecretString) {
    throw new HttpError(500, 'Anthropic API key secret is empty');
  }

  cachedApiKey = res.SecretString.trim();
  cacheExpiresAt = now + (options.cacheTtlMs ?? 5 * 60 * 1000);
  return cachedApiKey;
}

export function resetAnthropicApiKeyCache(): void {
  cachedApiKey = undefined;
  cacheExpiresAt = 0;
}
