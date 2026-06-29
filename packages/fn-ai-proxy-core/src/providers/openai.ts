import { getOpenAIApiKey } from '../secrets';
import { normaliseProviderError } from '../provider';
import {
  buildGroundedResearchPrompt,
  groundedResearchIsUnavailable,
  STRUCTURED_OUTPUT_NAME,
  toOpenAiStrictSchema,
} from '../structured-output';
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

  private async send(apiKey: string, model: string, requestBody: Record<string, unknown>): Promise<OpenAIResponse> {
    const fetchImpl = this.options.fetchImpl ?? fetch;
    const res = await fetchImpl('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
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

    return data;
  }

  private toResult(
    data: OpenAIResponse,
    content: string,
    model: string,
    priorInputTokens = 0,
    priorOutputTokens = 0,
  ): AiProviderResult {
    const inputTokens = (data.usage?.input_tokens ?? 0) + priorInputTokens;
    const outputTokens = (data.usage?.output_tokens ?? 0) + priorOutputTokens;
    return {
      content,
      provider: 'openai',
      model: data.model ?? model,
      inputTokens,
      outputTokens,
      totalTokens: data.usage?.total_tokens !== undefined
        ? data.usage.total_tokens + priorInputTokens + priorOutputTokens
        : inputTokens + outputTokens,
    };
  }

  async generate(request: AiProviderRequest): Promise<AiProviderResult> {
    const {
      prompt,
      system,
      model = this.options.model ?? 'gpt-5.4-mini',
      maxTokens = 4000,
      webSearch = false,
      responseSchema,
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

    const buildRequestBody = (requestInput: unknown, schema?: unknown): Record<string, unknown> => {
      const requestBody: Record<string, unknown> = {
        model,
        input: requestInput,
        max_output_tokens: maxTokens,
      };
      if (schema) {
        requestBody['text'] = {
          format: {
            type: 'json_schema',
            name: STRUCTURED_OUTPUT_NAME,
            schema: toOpenAiStrictSchema(schema),
            strict: true,
          },
        };
      }
      return requestBody;
    };

    const withWebSearch = (requestBody: Record<string, unknown>): Record<string, unknown> => ({
      ...requestBody,
      // #609: cap web-search context to 'low'. Measurement (N=5/tier on Recs) showed
      // 'medium' gave NO saving vs unset (~+5.5%, within noise), while 'low' averaged
      // ~13% (median ~16%) fewer input tokens AND capped the expensive tail — with
      // grounding intact (the SPCX recent-fact probe still returned correct current
      // data at 'low'). `tool_choice` stays 'required': the dominant cost is search
      // VOLUME, not per-search context, and lowering tool_choice risks the #601
      // staleness regression (a separate lever, deliberately out of scope).
      tools: [{ type: 'web_search', search_context_size: 'low' }],
      tool_choice: 'required',
    });

    // Free-text output keeps the existing single pass, but Live must actually
    // ground the answer with the hosted web-search tool.
    if (!responseSchema) {
      const data = await this.send(apiKey, model, webSearch ? withWebSearch(buildRequestBody(input)) : buildRequestBody(input));
      const content = extractOpenAIText(data);
      if (!content) {
        throw new AiProviderError('provider_bad_response', 502, false, 'No text content returned from the AI model');
      }
      return this.toResult(data, content, model);
    }

    // Fast structured output: single strict schema pass, no web search.
    if (!webSearch) {
      const data = await this.send(apiKey, model, buildRequestBody(input, responseSchema));
      const content = extractOpenAIText(data);
      if (!content) {
        throw new AiProviderError('provider_bad_response', 502, false, 'No text content returned from the AI model');
      }
      return this.toResult(data, content, model);
    }

    // Live structured output: two-pass. Pass 1 performs real hosted web search
    // for current grounding; pass 2 formats that grounded content into the
    // strict schema without another search.
    const researchInput = system
      ? [
          { role: 'system', content: system },
          { role: 'user', content: buildGroundedResearchPrompt(prompt) },
        ]
      : [{ role: 'user', content: buildGroundedResearchPrompt(prompt) }];
    const research = await this.send(apiKey, model, withWebSearch(buildRequestBody(researchInput)));
    const grounded = extractOpenAIText(research);
    if (!grounded) {
      throw new AiProviderError('provider_bad_response', 502, false, 'No grounded research returned from the AI model');
    }
    if (groundedResearchIsUnavailable(grounded)) {
      throw new AiProviderError('provider_bad_response', 502, false, 'OpenAI grounded research did not contain enough verifiable data for structured output');
    }

    const formatPrompt =
      `Format the grounded research below into the ${STRUCTURED_OUTPUT_NAME} JSON schema. ` +
      'Use the grounded research as the factual source of truth; do not add, invent, or omit data.\n\n' +
      `Original request:\n${prompt}\n\nGrounded research:\n${grounded}`;
    const formatInput = system
      ? [
          { role: 'system', content: system },
          { role: 'user', content: formatPrompt },
        ]
      : [{ role: 'user', content: formatPrompt }];
    const data = await this.send(apiKey, model, buildRequestBody(formatInput, responseSchema));
    const content = extractOpenAIText(data);
    if (!content) {
      throw new AiProviderError('provider_bad_response', 502, false, 'No text content returned from the AI model');
    }

    return this.toResult(data, content, model, research.usage?.input_tokens ?? 0, research.usage?.output_tokens ?? 0);
  }
}
