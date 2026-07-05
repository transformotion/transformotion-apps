import { getOpenAIApiKey } from '../secrets';
import { normaliseProviderError } from '../provider';
import {
  buildGroundedResearchPrompt,
  groundedResearchIsUnavailable,
  GROUNDING_UNAVAILABLE_ERROR_CODE,
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
      groundingKind,
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
      tools: [{ type: 'web_search' }],
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
    const researchPrompt = buildGroundedResearchPrompt(prompt, groundingKind);
    const researchInput = system
      ? [
          { role: 'system', content: system },
          { role: 'user', content: researchPrompt },
        ]
      : [{ role: 'user', content: researchPrompt }];
    const research = await this.send(apiKey, model, withWebSearch(buildRequestBody(researchInput)));
    const grounded = extractOpenAIText(research);
    if (!grounded || groundedResearchIsUnavailable(grounded)) {
      // DEGRADE, don't hard-fail — MARKET only (#601/market): a region carries SUPPLIED
      // sector OHLCV, so a Fast structured pass over the ORIGINAL prompt still has real
      // data. Market Live grounds when it can, returns a structured result when it can't,
      // never hard-errors. For security/ticker grounding the #601 guard MUST still
      // hard-fail — an ungroundable instrument has no supplied fallback, and degrading
      // would fabricate analysis of a non-verifiable ticker (what the guard exists to stop).
      if (groundingKind === 'market') {
        // Observability (#601/market): mark when market Live degraded to the Fast pass, so
        // "did this fall back?" is answerable from CloudWatch (the response looks normal).
        console.warn(JSON.stringify({
          eventName: 'ai_market_grounding_degraded',
          provider: 'openai',
          model,
          reason: grounded ? 'research_unavailable' : 'research_empty',
        }));
        const fast = await this.send(apiKey, model, buildRequestBody(input, responseSchema));
        const fastContent = extractOpenAIText(fast);
        if (!fastContent) {
          throw new AiProviderError('provider_bad_response', 502, false, 'No text content returned from the AI model');
        }
        return this.toResult(fast, fastContent, model, research.usage?.input_tokens ?? 0, research.usage?.output_tokens ?? 0);
      }
      // #603: keep the #601 hard-fail (never fabricate) but STAMP it so the app can
      // distinguish a newly-listed/thin-data ticker and degrade honestly, not 502.
      throw new AiProviderError('provider_bad_response', 502, false, 'OpenAI grounded research did not contain enough verifiable data for structured output', GROUNDING_UNAVAILABLE_ERROR_CODE);
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
