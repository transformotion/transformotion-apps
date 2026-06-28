/* eslint-disable @typescript-eslint/no-explicit-any -- asserting dynamic provider request/response JSON bodies */
import { describe, expect, it, beforeEach } from 'vitest';
import { STRUCTURED_OUTPUT_NAME, toOpenAiStrictSchema, toAnthropicInputSchema } from './structured-output';
import { OpenAIProvider } from './providers/openai';
import { ClaudeProvider } from './providers/claude';
import { createAiProxyHandler } from './handler';
import { resetApiKeyCache } from './secrets';

function apiEvent(body: unknown) {
  return {
    headers: { 'X-Account-Id': 'account-1' },
    requestContext: {
      requestId: 'req-1',
      authorizer: {
        claims: {
          sub: 'user-1', email: 'u@e.com', 'cognito:groups': '',
          apps: JSON.stringify(['stock-analyser']),
          accounts: JSON.stringify({ 'stock-analyser': [{ accountId: 'account-1', role: 'member' }] }),
          site_admin: 'false',
        },
      },
    },
    body: JSON.stringify(body),
    isBase64Encoded: false,
  } as never;
}

function secretClient(secret: string) {
  return { send: async () => ({ SecretString: secret }) } as never;
}
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const sampleSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'x/y',
  title: 'T',
  type: 'object',
  properties: {
    a: { type: 'string', minLength: 1 },
    b: { type: 'number', minimum: 0, maximum: 100 },
    nested: { type: 'object', properties: { c: { type: 'string' } }, required: ['c'], additionalProperties: false },
  },
  required: ['a', 'b', 'nested'],
  additionalProperties: false,
} as const;

describe('structured-output schema shaping', () => {
  it('toOpenAiStrictSchema strips meta + unsupported keywords and forces required-all + additionalProperties:false', () => {
    const out = toOpenAiStrictSchema(sampleSchema) as Record<string, any>;
    expect(out.$schema).toBeUndefined();
    expect(out.$id).toBeUndefined();
    expect(out.title).toBeUndefined();
    expect(out.properties.a.minLength).toBeUndefined();      // unsupported keyword stripped
    expect(out.properties.b.minimum).toBeUndefined();
    expect(out.properties.b.maximum).toBeUndefined();
    expect(out.additionalProperties).toBe(false);
    expect(out.required).toEqual(['a', 'b', 'nested']);
    expect(out.properties.nested.additionalProperties).toBe(false); // recursive
    expect(out.properties.nested.required).toEqual(['c']);
    expect(out.properties.a.type).toBe('string');            // kept
  });

  it('toAnthropicInputSchema strips ONLY meta and keeps constraints', () => {
    const out = toAnthropicInputSchema(sampleSchema) as Record<string, any>;
    expect(out.$schema).toBeUndefined();
    expect(out.$id).toBeUndefined();
    expect(out.title).toBeUndefined();
    expect(out.properties.a.minLength).toBe(1);              // constraint preserved
    expect(out.properties.b.minimum).toBe(0);
    expect(out.required).toEqual(['a', 'b', 'nested']);
  });
});

describe('OpenAIProvider structured output', () => {
  beforeEach(() => resetApiKeyCache());

  it('sends text.format json_schema (strict) when responseSchema is present', async () => {
    let body: Record<string, any> | undefined;
    const provider = new OpenAIProvider({
      openaiSecretName: 'openai-secret',
      secretsManagerClient: secretClient('openai-key'),
      fetchImpl: async (_url, init) => {
        body = JSON.parse(String(init?.body));
        return jsonResponse({ output_text: '{"a":"x"}', model: 'gpt-5.5', usage: { input_tokens: 1, output_tokens: 1 } });
      },
    });
    const res = await provider.generate({ prompt: 'p', responseSchema: sampleSchema });
    expect(body!.text.format.type).toBe('json_schema');
    expect(body!.text.format.name).toBe(STRUCTURED_OUTPUT_NAME);
    expect(body!.text.format.strict).toBe(true);
    expect(body!.text.format.schema.required).toEqual(['a', 'b', 'nested']);
    expect(res.content).toBe('{"a":"x"}');
  });

  it('omits text.format when no responseSchema (back-compat free-text)', async () => {
    let body: Record<string, any> | undefined;
    const provider = new OpenAIProvider({
      openaiSecretName: 'openai-secret',
      secretsManagerClient: secretClient('openai-key'),
      fetchImpl: async (_url, init) => {
        body = JSON.parse(String(init?.body));
        return jsonResponse({ output_text: 'free text', model: 'gpt-5.5', usage: {} });
      },
    });
    await provider.generate({ prompt: 'p' });
    expect(body!.text).toBeUndefined();
  });
});

describe('ClaudeProvider structured output', () => {
  beforeEach(() => resetApiKeyCache());

  it('Fast (no web search) → single forced-tool pass; returns the tool input as JSON', async () => {
    let body: Record<string, any> | undefined;
    let calls = 0;
    const provider = new ClaudeProvider({
      anthropicSecretName: 'anthropic-secret',
      secretsManagerClient: secretClient('anthropic-key'),
      fetchImpl: async (_url, init) => {
        calls += 1;
        body = JSON.parse(String(init?.body));
        return jsonResponse({
          content: [{ type: 'tool_use', name: STRUCTURED_OUTPUT_NAME, input: { a: 'x', b: 1 } }],
          model: 'claude-sonnet-4-6',
          usage: { input_tokens: 5, output_tokens: 3 },
        });
      },
    });
    const res = await provider.generate({ prompt: 'p', responseSchema: sampleSchema });
    expect(calls).toBe(1);                                   // single pass
    expect(body!.tool_choice).toEqual({ type: 'tool', name: STRUCTURED_OUTPUT_NAME });
    expect(body!.tools[0].name).toBe(STRUCTURED_OUTPUT_NAME);
    expect(body!.tools[0].input_schema.required).toEqual(['a', 'b', 'nested']);
    expect(JSON.parse(res.content)).toEqual({ a: 'x', b: 1 });
  });

  it('Live (web search) → TWO-PASS: research (web_search) then forced-tool format', async () => {
    const bodies: Record<string, any>[] = [];
    const provider = new ClaudeProvider({
      anthropicSecretName: 'anthropic-secret',
      secretsManagerClient: secretClient('anthropic-key'),
      fetchImpl: async (_url, init) => {
        const b = JSON.parse(String(init?.body));
        bodies.push(b);
        if (bodies.length === 1) {
          return jsonResponse({ content: [{ type: 'text', text: 'grounded research' }], model: 'claude-sonnet-4-6', usage: { input_tokens: 10, output_tokens: 20 } });
        }
        return jsonResponse({ content: [{ type: 'tool_use', name: STRUCTURED_OUTPUT_NAME, input: { a: 'y' } }], model: 'claude-sonnet-4-6', usage: { input_tokens: 4, output_tokens: 6 } });
      },
    });
    const res = await provider.generate({ prompt: 'p', responseSchema: sampleSchema, webSearch: true });
    expect(bodies.length).toBe(2);
    // Pass 1 = web search, NOT forced tool.
    expect(bodies[0].tools[0].type).toBe('web_search_20250305');
    expect(bodies[0].tool_choice).toBeUndefined();
    // Pass 2 = forced tool, NO web search; prompt carries the grounded text.
    expect(bodies[1].tool_choice).toEqual({ type: 'tool', name: STRUCTURED_OUTPUT_NAME });
    expect(String(bodies[1].messages[0].content)).toContain('grounded research');
    expect(JSON.parse(res.content)).toEqual({ a: 'y' });
    expect(res.inputTokens).toBe(14);                        // tokens summed across passes
    expect(res.outputTokens).toBe(26);
  });
});

describe('createAiProxyHandler surface → schema resolution', () => {
  beforeEach(() => resetApiKeyCache());

  it('resolves a registered surface to its schema and constrains provider output', async () => {
    let body: Record<string, any> | undefined;
    const handler = createAiProxyHandler({
      provider: 'claude',
      anthropicSecretName: 'anthropic-secret',
      permittedApps: ['stock-analyser'],
      secretsManagerClient: secretClient('anthropic-key'),
      structuredOutputSchemas: { analyser: sampleSchema },
      fetchImpl: async (_url, init) => {
        body = JSON.parse(String(init?.body));
        return jsonResponse({
          content: [{ type: 'tool_use', name: STRUCTURED_OUTPUT_NAME, input: { a: 'x', b: 1 } }],
          model: 'claude-sonnet-4-6',
          usage: { input_tokens: 1, output_tokens: 1 },
        });
      },
    });

    const res = (await handler(apiEvent({ prompt: 'p', surface: 'analyser', maxTokens: 100 }))) as {
      statusCode: number;
      body: string;
    };

    expect(res.statusCode).toBe(200);
    // The handler resolved surface='analyser' → schema → forced-tool structured output.
    expect(body!.tool_choice).toEqual({ type: 'tool', name: STRUCTURED_OUTPUT_NAME });
    expect(body!.tools[0].name).toBe(STRUCTURED_OUTPUT_NAME);
    expect(JSON.parse(JSON.parse(res.body).content)).toEqual({ a: 'x', b: 1 });
  });

  it('does NOT constrain when the surface has no registered schema (free-text back-compat)', async () => {
    let body: Record<string, any> | undefined;
    const handler = createAiProxyHandler({
      provider: 'claude',
      anthropicSecretName: 'anthropic-secret',
      permittedApps: ['stock-analyser'],
      secretsManagerClient: secretClient('anthropic-key'),
      structuredOutputSchemas: { analyser: sampleSchema },
      fetchImpl: async (_url, init) => {
        body = JSON.parse(String(init?.body));
        return jsonResponse({
          content: [{ type: 'text', text: 'free text' }],
          model: 'claude-sonnet-4-6',
          usage: { input_tokens: 1, output_tokens: 1 },
        });
      },
    });

    const res = (await handler(apiEvent({ prompt: 'p', surface: 'unregistered', maxTokens: 100 }))) as {
      statusCode: number;
      body: string;
    };

    expect(res.statusCode).toBe(200);
    expect(body!.tool_choice).toBeUndefined();               // free-text, no forced tool
    expect(JSON.parse(res.body).content).toBe('free text');
  });
});
