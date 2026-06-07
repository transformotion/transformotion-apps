import { AiProviderError, type AiProvider, type AiProviderId, type AiProxyOptions } from './types';
import { ClaudeProvider } from './providers/claude';
import { OpenAIProvider } from './providers/openai';

export function createAiProvider(provider: AiProviderId, options: AiProxyOptions): AiProvider {
  if (provider === 'claude') {
    if (!options.anthropicSecretName) {
      throw new AiProviderError('configuration', 500, false, 'Anthropic secret name is required');
    }
    return new ClaudeProvider(options);
  }

  if (provider === 'openai') {
    if (!options.openaiSecretName) {
      throw new AiProviderError('configuration', 500, false, 'OpenAI secret name is required');
    }
    return new OpenAIProvider(options);
  }

  throw new AiProviderError('configuration', 500, false, `Unsupported AI provider: ${provider}`);
}

export function normaliseProviderError(
  provider: AiProviderId,
  status: number,
  message: string,
  providerErrorCode?: string,
): AiProviderError {
  if (status === 429) {
    return new AiProviderError('rate_limit', 429, true, 'RATE_LIMIT', providerErrorCode);
  }
  if (status === 401 || status === 403) {
    return new AiProviderError('authentication', 502, false, `${provider} API authentication failed`, providerErrorCode);
  }
  if (status >= 500) {
    return new AiProviderError('provider_unavailable', 502, true, `${provider} API unavailable: ${message}`, providerErrorCode);
  }
  if (status >= 400) {
    return new AiProviderError('provider_bad_response', 502, false, `${provider} API error: ${message}`, providerErrorCode);
  }
  return new AiProviderError('unknown', 502, true, `${provider} API error: ${message}`, providerErrorCode);
}
