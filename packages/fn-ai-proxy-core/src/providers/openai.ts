import { getOpenAIApiKey } from '../secrets';
import { normaliseProviderError } from '../provider';
import { AiProviderError, type AiProvider, type AiProviderRequest, type AiProviderResult, type AiProxyOptions, type OpenAIResponse } from '../types';

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

    const data = await res.json() as OpenAIResponse;

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
