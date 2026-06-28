import { getOpenAIApiKey } from '../secrets';
import { normaliseProviderError } from '../provider';
import {
  AiProviderError,
  AiProviderNonJsonError,
  type AiProvider,
  type AiProviderRequest,
  type AiProviderResult,
  type AiProxyOptions,
  type OpenAIResponse,
} from '../types';

const RESPONSE_BODY_LOG_PREFIX_CHARS = 1000;

function extractOpenAIText(data: OpenAIResponse): string | undefined {
  if (data.output_text?.trim()) {
    return data.output_text;
  }

  for (const item of data.output ?? []) {
    for (const content of item.content ?? []) {
      if ((content.type === 'output_text' || content.type === 'text') && content.text?.trim()) {
        return content.text;
      }
    }
  }

  return undefined;
}

function responseHeaders(headers: Headers): Record<string, string> {
  return Object.fromEntries(headers.entries());
}

function bodyPrefix(body: string): string {
  return body.slice(0, RESPONSE_BODY_LOG_PREFIX_CHARS);
}

export class OpenAIProvider implements AiProvider {
  constructor(private readonly options: AiProxyOptions) {}

  async generate(request: AiProviderRequest): Promise<AiProviderResult> {
    const {
      prompt,
      system,
      model = this.options.model ?? 'gpt-5.4-mini',
      maxTokens = 4000,
    } = request;

    const apiKey = await getOpenAIApiKey({
      secretName: this.options.openaiSecretName!,
      client: this.options.secretsManagerClient,
      cacheTtlMs: this.options.apiKeyCacheTtlMs,
    });

    const input = system
      ? [
          { role: 'system', content: system },
          { role: 'user', content: prompt },
        ]
      : [{ role: 'user', content: prompt }];

    const fetchImpl = this.options.fetchImpl ?? fetch;
    const res = await fetchImpl('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        input,
        max_output_tokens: maxTokens,
      }),
    });

    const rawBody = await res.text();
    let data: OpenAIResponse;
    try {
      data = JSON.parse(rawBody) as OpenAIResponse;
    } catch (err) {
      const diagnostics = {
        provider: 'openai' as const,
        model,
        phase: 'provider_http_json_parse' as const,
        httpStatus: res.status,
        responseHeaders: responseHeaders(res.headers),
        responseBodyPrefix: bodyPrefix(rawBody),
      };
      console.warn(JSON.stringify({
        eventName: 'ai_provider_non_json_response',
        ...diagnostics,
        err: err instanceof Error ? err.message : String(err),
      }));
      throw new AiProviderNonJsonError('OpenAI provider returned a non-JSON HTTP response', diagnostics);
    }

    if (!res.ok) {
      throw normaliseProviderError('openai', res.status, data?.error?.message ?? String(res.status), data?.error?.code ?? data?.error?.type);
    }

    const content = extractOpenAIText(data);
    if (!content) {
      throw new AiProviderError('provider_bad_response', 502, false, 'No text content returned from the AI model');
    }

    return {
      content,
      provider: 'openai',
      model: data.model ?? model,
      inputTokens: data.usage?.input_tokens ?? 0,
      outputTokens: data.usage?.output_tokens ?? 0,
      totalTokens: data.usage?.total_tokens,
    };
  }
}
