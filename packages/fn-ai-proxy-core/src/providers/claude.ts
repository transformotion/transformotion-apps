import { getAnthropicApiKey } from '../secrets';
import { normaliseProviderError } from '../provider';
import { AiProviderError, type AiProvider, type AiProviderRequest, type AiProviderResult, type AiProxyOptions, type AnthropicResponse } from '../types';

export function stripAnthropicCitations(content: string): string {
  return content.replace(/<cite[^>]*>([\s\S]*?)<\/cite>/g, '$1');
}

export class ClaudeProvider implements AiProvider {
  constructor(private readonly options: AiProxyOptions) {}

  async generate(request: AiProviderRequest): Promise<AiProviderResult> {
    const {
      prompt,
      system,
      model = this.options.model ?? this.options.anthropicModel ?? 'claude-sonnet-4-6',
      maxTokens = 4000,
      webSearch = false,
    } = request;

    if (!this.options.anthropicSecretName) {
      throw new AiProviderError('configuration', 500, false, 'Anthropic secret name is required');
    }

    const apiKey = await getAnthropicApiKey({
      secretName: this.options.anthropicSecretName,
      client: this.options.secretsManagerClient,
      cacheTtlMs: this.options.apiKeyCacheTtlMs,
    });

    const requestBody: Record<string, unknown> = {
      model,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    };

    if (system) {
      requestBody['system'] = system;
    }

    if (webSearch) {
      requestBody['tools'] = [{ type: 'web_search_20250305', name: 'web_search' }];
    }

    const fetchImpl = this.options.fetchImpl ?? fetch;
    const res = await fetchImpl('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(requestBody),
    });

    const data = await res.json() as AnthropicResponse;

    if (!res.ok) {
      throw normaliseProviderError('claude', res.status, data?.error?.message ?? String(res.status), data?.error?.type);
    }

    const textBlocks = data.content.filter(block => block.type === 'text' && block.text?.trim());
    if (!textBlocks.length) {
      throw new AiProviderError('provider_bad_response', 502, false, 'No text content returned from the AI model');
    }

    return {
      content: stripAnthropicCitations(textBlocks[textBlocks.length - 1].text!),
      provider: 'claude',
      model: data.model,
      inputTokens: data.usage.input_tokens,
      outputTokens: data.usage.output_tokens,
      totalTokens: data.usage.input_tokens + data.usage.output_tokens,
    };
  }
}

export async function callClaude(
  request: AiProviderRequest,
  options: AiProxyOptions,
): Promise<AiProviderResult> {
  return new ClaudeProvider(options).generate(request);
}
