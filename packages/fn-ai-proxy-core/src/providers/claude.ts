import { getAnthropicApiKey } from '../secrets';
import { normaliseProviderError } from '../provider';
import { STRUCTURED_OUTPUT_NAME, toAnthropicInputSchema } from '../structured-output';
import { AiProviderError, type AiProvider, type AiProviderRequest, type AiProviderResult, type AiProxyOptions, type AnthropicResponse } from '../types';

export function stripAnthropicCitations(content: string): string {
  return content.replace(/<cite[^>]*>([\s\S]*?)<\/cite>/g, '$1');
}

interface BuildBodyOptions {
  model: string;
  maxTokens: number;
  prompt: string;
  system?: string;
  webSearch?: boolean;
  /** When set, force a tool call whose input_schema is this canonical schema. */
  toolSchema?: unknown;
}

function lastText(data: AnthropicResponse): string {
  const textBlocks = data.content.filter(block => block.type === 'text' && block.text?.trim());
  return textBlocks.length ? stripAnthropicCitations(textBlocks[textBlocks.length - 1].text!) : '';
}

export class ClaudeProvider implements AiProvider {
  constructor(private readonly options: AiProxyOptions) {}

  private buildBody(opts: BuildBodyOptions): Record<string, unknown> {
    const body: Record<string, unknown> = {
      model: opts.model,
      max_tokens: opts.maxTokens,
      messages: [{ role: 'user', content: opts.prompt }],
    };
    if (opts.system) body['system'] = opts.system;
    if (opts.toolSchema) {
      // STRUCTURED OUTPUT: a forced tool call whose input_schema is the canonical
      // schema constrains the model's output to valid, schema-matching JSON.
      body['tools'] = [{
        name: STRUCTURED_OUTPUT_NAME,
        description: 'Return the analysis result strictly matching the provided input schema.',
        input_schema: toAnthropicInputSchema(opts.toolSchema),
      }];
      body['tool_choice'] = { type: 'tool', name: STRUCTURED_OUTPUT_NAME };
    } else if (opts.webSearch) {
      body['tools'] = [{ type: 'web_search_20250305', name: 'web_search' }];
    }
    return body;
  }

  private async send(apiKey: string, requestBody: Record<string, unknown>): Promise<AnthropicResponse> {
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
    return data;
  }

  async generate(request: AiProviderRequest): Promise<AiProviderResult> {
    const {
      prompt,
      system,
      model = this.options.model ?? this.options.anthropicModel ?? 'claude-sonnet-4-6',
      maxTokens = 4000,
      webSearch = false,
      responseSchema,
    } = request;

    if (!this.options.anthropicSecretName) {
      throw new AiProviderError('configuration', 500, false, 'Anthropic secret name is required');
    }
    const apiKey = await getAnthropicApiKey({
      secretName: this.options.anthropicSecretName,
      client: this.options.secretsManagerClient,
      cacheTtlMs: this.options.apiKeyCacheTtlMs,
    });

    // Free-text (no schema) — current behaviour, optionally with web search.
    if (!responseSchema) {
      const data = await this.send(apiKey, this.buildBody({ model, maxTokens, prompt, system, webSearch }));
      const text = lastText(data);
      if (!text) throw new AiProviderError('provider_bad_response', 502, false, 'No text content returned from the AI model');
      return this.toResult(data, text, 0, 0);
    }

    // STRUCTURED OUTPUT, no web search → single forced-tool pass.
    if (!webSearch) {
      const data = await this.send(apiKey, this.buildBody({ model, maxTokens, prompt, system, toolSchema: responseSchema }));
      return this.fromTool(data, 0, 0);
    }

    // STRUCTURED OUTPUT + web search → TWO-PASS: a grounded research pass (web
    // search, free text), then a strict forced-tool formatting pass (no search).
    // Claude cannot combine forced tool-use with web_search in one call.
    const research = await this.send(apiKey, this.buildBody({ model, maxTokens, prompt, system, webSearch: true }));
    const grounded = lastText(research);
    const formatPrompt =
      `Format the following analysis into the ${STRUCTURED_OUTPUT_NAME} tool. Use ONLY the information below; do not add, invent, or omit data.\n\n${grounded}`;
    const data = await this.send(apiKey, this.buildBody({ model, maxTokens, prompt: formatPrompt, system, toolSchema: responseSchema }));
    return this.fromTool(data, research.usage.input_tokens, research.usage.output_tokens);
  }

  /** Extract the forced tool_use input as the (schema-valid) JSON string. */
  private fromTool(data: AnthropicResponse, priorInputTokens: number, priorOutputTokens: number): AiProviderResult {
    const toolBlock = data.content.find(
      block => block.type === 'tool_use' && block.name === STRUCTURED_OUTPUT_NAME && block.input !== undefined,
    );
    const content = toolBlock ? JSON.stringify(toolBlock.input) : lastText(data);
    if (!content) throw new AiProviderError('provider_bad_response', 502, false, 'No structured content returned from the AI model');
    return this.toResult(data, content, priorInputTokens, priorOutputTokens);
  }

  private toResult(data: AnthropicResponse, content: string, priorInputTokens: number, priorOutputTokens: number): AiProviderResult {
    const inputTokens = data.usage.input_tokens + priorInputTokens;
    const outputTokens = data.usage.output_tokens + priorOutputTokens;
    return {
      content,
      provider: 'claude',
      model: data.model,
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
    };
  }
}

export async function callClaude(
  request: AiProviderRequest,
  options: AiProxyOptions,
): Promise<AiProviderResult> {
  return new ClaudeProvider(options).generate(request);
}
