import { getAnthropicApiKey } from '../secrets';
import { normaliseProviderError } from '../provider';
import {
  buildGroundedResearchPrompt,
  groundedResearchIsUnavailable,
  STRUCTURED_OUTPUT_NAME,
  toAnthropicStrictInputSchema,
} from '../structured-output';
import { AiProviderError, type AiProvider, type AiProviderRequest, type AiProviderResult, type AiProxyOptions, type AnthropicResponse } from '../types';

const MAX_STRUCTURED_FORMAT_ATTEMPTS = 2;
const UNKNOWN_SENTINELS = new Set(['<unknown>', 'unknown']);

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

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function invalidString(value: string): boolean {
  const normalised = value.trim().toLowerCase();
  return normalised.length === 0 || UNKNOWN_SENTINELS.has(normalised);
}

function validateAgainstSchema(schema: unknown, value: unknown, path = '$'): string[] {
  if (!isObject(schema)) return [];
  const issues: string[] = [];
  const type = schema['type'];

  if (type === 'object') {
    if (!isObject(value)) return [`${path} must be an object`];
    const properties = isObject(schema['properties']) ? schema['properties'] : {};
    const required = Array.isArray(schema['required']) ? schema['required'].filter((item): item is string => typeof item === 'string') : [];
    for (const key of required) {
      if (!(key in value)) issues.push(`${path}.${key} is required`);
    }
    if (schema['additionalProperties'] === false) {
      for (const key of Object.keys(value)) {
        if (!(key in properties)) issues.push(`${path}.${key} is not allowed`);
      }
    }
    for (const [key, propertySchema] of Object.entries(properties)) {
      if (key in value) issues.push(...validateAgainstSchema(propertySchema, value[key], `${path}.${key}`));
    }
    return issues;
  }

  if (type === 'array') {
    if (!Array.isArray(value)) return [`${path} must be an array`];
    const minItems = typeof schema['minItems'] === 'number' ? schema['minItems'] : undefined;
    if (minItems !== undefined && value.length < minItems) issues.push(`${path} must contain at least ${minItems} item(s)`);
    for (const [index, item] of value.entries()) issues.push(...validateAgainstSchema(schema['items'], item, `${path}[${index}]`));
    return issues;
  }

  if (type === 'string') {
    if (typeof value !== 'string') return [`${path} must be a string`];
    if (invalidString(value)) issues.push(`${path} must not be empty or <UNKNOWN>`);
    const minLength = typeof schema['minLength'] === 'number' ? schema['minLength'] : undefined;
    if (minLength !== undefined && value.trim().length < minLength) issues.push(`${path} must be at least ${minLength} character(s)`);
    const enumValues = Array.isArray(schema['enum']) ? schema['enum'] : undefined;
    if (enumValues && !enumValues.includes(value)) issues.push(`${path} must be one of ${enumValues.join(', ')}`);
    return issues;
  }

  if (type === 'number' || type === 'integer') {
    if (typeof value !== 'number' || !Number.isFinite(value)) return [`${path} must be a ${type}`];
    if (type === 'integer' && !Number.isInteger(value)) issues.push(`${path} must be an integer`);
    const minimum = typeof schema['minimum'] === 'number' ? schema['minimum'] : undefined;
    const maximum = typeof schema['maximum'] === 'number' ? schema['maximum'] : undefined;
    if (minimum !== undefined && value < minimum) issues.push(`${path} must be >= ${minimum}`);
    if (maximum !== undefined && value > maximum) issues.push(`${path} must be <= ${maximum}`);
    return issues;
  }

  if (type === 'boolean' && typeof value !== 'boolean') return [`${path} must be a boolean`];
  return issues;
}

class ClaudeStructuredOutputValidationError extends Error {
  constructor(public readonly issues: string[]) {
    super(`Claude structured output failed schema validation: ${issues.join('; ')}`);
    this.name = 'ClaudeStructuredOutputValidationError';
  }
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
        input_schema: toAnthropicStrictInputSchema(opts.toolSchema),
        strict: true,
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
      try {
        return this.fromTool(data, 0, 0, responseSchema);
      } catch (err) {
        if (err instanceof ClaudeStructuredOutputValidationError) {
          throw new AiProviderError(
            'provider_bad_response',
            502,
            false,
            `Claude structured output failed validation: ${err.issues.slice(0, 8).join('; ')}`,
          );
        }
        throw err;
      }
    }

    // STRUCTURED OUTPUT + web search → TWO-PASS: a grounded research pass (web
    // search, free text), then a strict forced-tool formatting pass (no search).
    // Claude cannot combine forced tool-use with web_search in one call.
    const research = await this.send(apiKey, this.buildBody({ model, maxTokens, prompt: buildGroundedResearchPrompt(prompt), system, webSearch: true }));
    const grounded = lastText(research);
    if (!grounded) {
      throw new AiProviderError('provider_bad_response', 502, false, 'No grounded research returned from the AI model');
    }
    if (groundedResearchIsUnavailable(grounded)) {
      throw new AiProviderError('provider_bad_response', 502, false, 'Claude grounded research did not contain enough verifiable data for structured output');
    }
    let formatPrompt = this.buildFormatPrompt(prompt, grounded);
    let lastIssues: string[] = [];
    for (let attempt = 1; attempt <= MAX_STRUCTURED_FORMAT_ATTEMPTS; attempt += 1) {
      const data = await this.send(apiKey, this.buildBody({ model, maxTokens, prompt: formatPrompt, system, toolSchema: responseSchema }));
      try {
        return this.fromTool(data, research.usage.input_tokens, research.usage.output_tokens, responseSchema);
      } catch (err) {
        if (!(err instanceof ClaudeStructuredOutputValidationError)) throw err;
        lastIssues = err.issues;
        if (attempt === MAX_STRUCTURED_FORMAT_ATTEMPTS) break;
        formatPrompt = this.buildFormatPrompt(prompt, grounded, lastIssues);
      }
    }
    throw new AiProviderError(
      'provider_bad_response',
      502,
      false,
      `Claude structured output failed validation after retry: ${lastIssues.slice(0, 8).join('; ')}`,
    );
  }

  private buildFormatPrompt(originalPrompt: string, grounded: string, validationIssues: string[] = []): string {
    const correction =
      validationIssues.length > 0
        ? `\n\nPrevious tool input was rejected for these reasons:\n- ${validationIssues.slice(0, 12).join('\n- ')}\nCorrect those fields from the grounded research.`
        : '';
    return (
      `Format the grounded research below into the ${STRUCTURED_OUTPUT_NAME} tool. ` +
      'Use the grounded research as the factual source of truth; do not add or invent data. ' +
      'Every required field must be populated with a correctly typed value from the grounded research. ' +
      'Never return <UNKNOWN>, UNKNOWN, null, empty strings, or strings for numeric fields.' +
      `${correction}\n\nOriginal request:\n${originalPrompt}\n\nGrounded research:\n${grounded}`
    );
  }

  /** Extract the forced tool_use input as the (schema-valid) JSON string. */
  private fromTool(data: AnthropicResponse, priorInputTokens: number, priorOutputTokens: number, schema: unknown): AiProviderResult {
    const toolBlock = data.content.find(
      block => block.type === 'tool_use' && block.name === STRUCTURED_OUTPUT_NAME && block.input !== undefined,
    );
    if (!toolBlock) {
      if (!lastText(data)) throw new AiProviderError('provider_bad_response', 502, false, 'No structured content returned from the AI model');
      throw new ClaudeStructuredOutputValidationError(['forced tool call was missing']);
    }
    const issues = validateAgainstSchema(schema, toolBlock.input);
    if (issues.length > 0) throw new ClaudeStructuredOutputValidationError(issues);
    const content = JSON.stringify(toolBlock.input);
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
