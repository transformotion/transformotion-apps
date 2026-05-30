import { HttpError } from '@transformotion/lambda-middleware';
import { getAnthropicApiKey } from './secrets';
import type {
  AnthropicResponse,
  ClaudeInvocationRequest,
  ClaudeInvocationResult,
  ClaudeProxyOptions,
} from './types';

export function stripAnthropicCitations(content: string): string {
  return content.replace(/<cite[^>]*>([\s\S]*?)<\/cite>/g, '$1');
}

export async function callClaude(
  request: ClaudeInvocationRequest,
  options: ClaudeProxyOptions,
): Promise<ClaudeInvocationResult> {
  const {
    prompt,
    system,
    model = options.anthropicModel ?? 'claude-sonnet-4-20250514',
    maxTokens = 4000,
    webSearch = false,
  } = request;

  const apiKey = await getAnthropicApiKey({
    secretName: options.anthropicSecretName,
    client: options.secretsManagerClient,
    cacheTtlMs: options.apiKeyCacheTtlMs,
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

  const fetchImpl = options.fetchImpl ?? fetch;
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
    if (res.status === 429) {
      throw new HttpError(429, 'RATE_LIMIT');
    }
    if (res.status === 401) {
      throw new HttpError(502, 'Upstream API authentication failed - check the API key secret.');
    }
    throw new HttpError(502, `Upstream API error: ${data?.error?.message ?? res.status}`);
  }

  const textBlocks = data.content.filter(block => block.type === 'text' && block.text?.trim());
  if (!textBlocks.length) {
    throw new HttpError(502, 'No text content returned from the AI model');
  }

  return {
    content: stripAnthropicCitations(textBlocks[textBlocks.length - 1].text!),
    model: data.model,
    inputTokens: data.usage.input_tokens,
    outputTokens: data.usage.output_tokens,
  };
}
