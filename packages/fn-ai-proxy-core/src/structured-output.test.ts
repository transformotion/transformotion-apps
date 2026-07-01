/* eslint-disable @typescript-eslint/no-explicit-any -- asserting dynamic provider request/response JSON bodies */
import { describe, expect, it, beforeEach } from 'vitest';
import {
  GROUNDED_RESEARCH_AVAILABLE,
  GROUNDED_RESEARCH_UNAVAILABLE,
  STRUCTURED_OUTPUT_NAME,
  buildGroundedResearchPrompt,
  toOpenAiStrictSchema,
  toAnthropicInputSchema,
  toAnthropicStrictInputSchema,
} from './structured-output';
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

  it('toAnthropicStrictInputSchema strips strict-mode unsupported validation keywords', () => {
    const out = toAnthropicStrictInputSchema(sampleSchema) as Record<string, any>;
    expect(out.$schema).toBeUndefined();
    expect(out.properties.a.minLength).toBeUndefined();
    expect(out.properties.b.minimum).toBeUndefined();
    expect(out.properties.b.maximum).toBeUndefined();
    expect(out.required).toEqual(['a', 'b', 'nested']);
    expect(out.additionalProperties).toBe(false);
    expect(out.properties.a.type).toBe('string');
  });

  it('detects unavailable grounded research in text-line or JSON status forms', async () => {
    const { groundedResearchIsUnavailable } = await import('./structured-output');
    expect(groundedResearchIsUnavailable(`${GROUNDED_RESEARCH_UNAVAILABLE}\nNo data.`)).toBe(true);
    expect(groundedResearchIsUnavailable('{"DATA_STATUS":"UNAVAILABLE","reason":"No data"}')).toBe(true);
    expect(groundedResearchIsUnavailable(`${GROUNDED_RESEARCH_AVAILABLE}\nGrounded data.`)).toBe(false);
  });

  it('buildGroundedResearchPrompt uses the ticker rubric by default and the region rubric for market (#601)', () => {
    const security = buildGroundedResearchPrompt('Analyse AAPL');
    expect(security).toContain('verified active tradable instrument');
    expect(security).toContain('DATA_STATUS');
    expect(security).toContain('Analyse AAPL');

    const market = buildGroundedResearchPrompt('Analyse the Australia market', 'market');
    // Region rubric: macro + per-sector, explicitly NOT gated on tradable-instrument/RSI.
    expect(market).toContain('MARKET/REGION analysis');
    expect(market).toContain('per-sector read');
    expect(market).toContain('Do NOT require a tradable instrument');
    expect(market).not.toContain('verified active tradable instrument');
    // Supplied sector data is treated as authoritative.
    expect(market).toContain('SUPPLIED sector price data');
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

  it('Fast (no web search) sends one strict schema pass without web-search tools', async () => {
    const bodies: Record<string, any>[] = [];
    const provider = new OpenAIProvider({
      openaiSecretName: 'openai-secret',
      secretsManagerClient: secretClient('openai-key'),
      fetchImpl: async (_url, init) => {
        bodies.push(JSON.parse(String(init?.body)));
        return jsonResponse({
          output_text: '{"a":"fast","b":1,"nested":{"c":"x"}}',
          model: 'gpt-5.5',
          usage: { input_tokens: 2, output_tokens: 3, total_tokens: 5 },
        });
      },
    });
    const res = await provider.generate({ prompt: 'p', responseSchema: sampleSchema, webSearch: false });
    expect(bodies.length).toBe(1);
    expect(bodies[0].text.format.name).toBe(STRUCTURED_OUTPUT_NAME);
    expect(bodies[0].tools).toBeUndefined();
    expect(bodies[0].tool_choice).toBeUndefined();
    expect(JSON.parse(res.content)).toEqual({ a: 'fast', b: 1, nested: { c: 'x' } });
  });

  it('Live (web search) uses TWO-PASS: web-search research then strict schema format', async () => {
    const bodies: Record<string, any>[] = [];
    const provider = new OpenAIProvider({
      openaiSecretName: 'openai-secret',
      secretsManagerClient: secretClient('openai-key'),
      fetchImpl: async (_url, init) => {
        const body = JSON.parse(String(init?.body));
        bodies.push(body);
        if (bodies.length === 1) {
          return jsonResponse({
            output_text: `${GROUNDED_RESEARCH_AVAILABLE}\ngrounded current research about SpaceX being listed as SPCX`,
            model: 'gpt-5.5',
            usage: { input_tokens: 10, output_tokens: 20, total_tokens: 30 },
          });
        }
        return jsonResponse({
          output_text: '{"a":"grounded","b":2,"nested":{"c":"spcx"}}',
          model: 'gpt-5.5',
          usage: { input_tokens: 4, output_tokens: 6, total_tokens: 10 },
        });
      },
    });
    const res = await provider.generate({ prompt: 'Analyse SpaceX', responseSchema: sampleSchema, webSearch: true });
    expect(bodies.length).toBe(2);
    expect(bodies[0].tools).toEqual([{ type: 'web_search' }]);
    expect(bodies[0].tool_choice).toBe('required');
    expect(bodies[0].text).toBeUndefined();
    expect(String(bodies[0].input[0].content)).toContain('DATA_STATUS');
    expect(bodies[1].tools).toBeUndefined();
    expect(bodies[1].tool_choice).toBeUndefined();
    expect(bodies[1].text.format.name).toBe(STRUCTURED_OUTPUT_NAME);
    expect(String(bodies[1].input[0].content)).toContain('Analyse SpaceX');
    expect(String(bodies[1].input[0].content)).toContain('grounded current research');
    expect(JSON.parse(res.content)).toEqual({ a: 'grounded', b: 2, nested: { c: 'spcx' } });
    expect(res.inputTokens).toBe(14);
    expect(res.outputTokens).toBe(26);
    expect(res.totalTokens).toBe(40);
  });

  it('Live DEGRADES to a Fast strict pass (no hard-fail) when OpenAI grounded research is unavailable (#601/market)', async () => {
    const bodies: Record<string, any>[] = [];
    const provider = new OpenAIProvider({
      openaiSecretName: 'openai-secret',
      secretsManagerClient: secretClient('openai-key'),
      fetchImpl: async (_url, init) => {
        const body = JSON.parse(String(init?.body));
        bodies.push(body);
        if (bodies.length === 1) {
          return jsonResponse({
            output_text: `${GROUNDED_RESEARCH_UNAVAILABLE}\nWeb search thin, but supplied sector data is present.`,
            model: 'gpt-5.5',
            usage: { input_tokens: 10, output_tokens: 20, total_tokens: 30 },
          });
        }
        return jsonResponse({
          output_text: '{"a":"degraded","b":3,"nested":{"c":"fast"}}',
          model: 'gpt-5.5',
          usage: { input_tokens: 4, output_tokens: 6, total_tokens: 10 },
        });
      },
    });
    const res = await provider.generate({ prompt: 'Analyse the Australia market', responseSchema: sampleSchema, webSearch: true, groundingKind: 'market' });
    // Two passes: research (web search) then a DEGRADE Fast strict pass over the ORIGINAL prompt.
    expect(bodies.length).toBe(2);
    expect(bodies[0].tools).toEqual([{ type: 'web_search' }]);
    // Research prompt carried the region rubric.
    expect(String(bodies[0].input[0].content)).toContain('MARKET/REGION analysis');
    // Fast fallback: strict schema, NO web search, ORIGINAL prompt (carries supplied sector data).
    expect(bodies[1].tools).toBeUndefined();
    expect(bodies[1].tool_choice).toBeUndefined();
    expect(bodies[1].text.format.name).toBe(STRUCTURED_OUTPUT_NAME);
    expect(String(bodies[1].input[0].content)).toContain('Analyse the Australia market');
    expect(String(bodies[1].input[0].content)).not.toContain('DATA_STATUS');
    expect(JSON.parse(res.content)).toEqual({ a: 'degraded', b: 3, nested: { c: 'fast' } });
    // Prior research-pass tokens are still accounted for.
    expect(res.inputTokens).toBe(14);
    expect(res.outputTokens).toBe(26);
  });

  it('Live still HARD-FAILS for SECURITY grounding when research is unavailable (#601 guard preserved)', async () => {
    const bodies: Record<string, any>[] = [];
    const provider = new OpenAIProvider({
      openaiSecretName: 'openai-secret',
      secretsManagerClient: secretClient('openai-key'),
      fetchImpl: async (_url, init) => {
        bodies.push(JSON.parse(String(init?.body)));
        return jsonResponse({
          output_text: `${GROUNDED_RESEARCH_UNAVAILABLE}\nNo active public security could be verified.`,
          model: 'gpt-5.5',
          usage: { input_tokens: 10, output_tokens: 20, total_tokens: 30 },
        });
      },
    });
    // Default groundingKind is 'security' → no supplied fallback → must hard-fail, not fabricate.
    await expect(provider.generate({ prompt: 'Analyse ZZZZQX', responseSchema: sampleSchema, webSearch: true }))
      .rejects.toMatchObject({ errorClass: 'provider_bad_response', statusCode: 502 });
    expect(bodies.length).toBe(1);                            // no degrade pass ran
    expect(bodies[0].tools).toEqual([{ type: 'web_search' }]);
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
          content: [{ type: 'tool_use', name: STRUCTURED_OUTPUT_NAME, input: { a: 'x', b: 1, nested: { c: 'z' } } }],
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
    expect(body!.tools[0].strict).toBe(true);
    expect(JSON.parse(res.content)).toEqual({ a: 'x', b: 1, nested: { c: 'z' } });
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
          return jsonResponse({ content: [{ type: 'text', text: `${GROUNDED_RESEARCH_AVAILABLE}\ngrounded research` }], model: 'claude-sonnet-4-6', usage: { input_tokens: 10, output_tokens: 20 } });
        }
        return jsonResponse({ content: [{ type: 'tool_use', name: STRUCTURED_OUTPUT_NAME, input: { a: 'y', b: 2, nested: { c: 'q' } } }], model: 'claude-sonnet-4-6', usage: { input_tokens: 4, output_tokens: 6 } });
      },
    });
    const res = await provider.generate({ prompt: 'p', responseSchema: sampleSchema, webSearch: true });
    expect(bodies.length).toBe(2);
    // Pass 1 = web search, NOT forced tool.
    expect(bodies[0].tools[0].type).toBe('web_search_20250305');
    expect(bodies[0].tool_choice).toBeUndefined();
    expect(String(bodies[0].messages[0].content)).toContain('DATA_STATUS');
    // Pass 2 = forced tool, NO web search; prompt carries the grounded text.
    expect(bodies[1].tool_choice).toEqual({ type: 'tool', name: STRUCTURED_OUTPUT_NAME });
    expect(bodies[1].tools[0].strict).toBe(true);
    expect(String(bodies[1].messages[0].content)).toContain('grounded research');
    expect(JSON.parse(res.content)).toEqual({ a: 'y', b: 2, nested: { c: 'q' } });
    expect(res.inputTokens).toBe(14);                        // tokens summed across passes
    expect(res.outputTokens).toBe(26);
  });

  it('Live retries Claude format pass when forced-tool output punts with <UNKNOWN> or wrong types', async () => {
    const bodies: Record<string, any>[] = [];
    const provider = new ClaudeProvider({
      anthropicSecretName: 'anthropic-secret',
      secretsManagerClient: secretClient('anthropic-key'),
      fetchImpl: async (_url, init) => {
        const b = JSON.parse(String(init?.body));
        bodies.push(b);
        if (bodies.length === 1) {
          return jsonResponse({ content: [{ type: 'text', text: `${GROUNDED_RESEARCH_AVAILABLE}\ngrounded research includes a=Alpha, b=42, nested c=Gamma` }], model: 'claude-sonnet-4-6', usage: { input_tokens: 10, output_tokens: 20 } });
        }
        if (bodies.length === 2) {
          return jsonResponse({ content: [{ type: 'tool_use', name: STRUCTURED_OUTPUT_NAME, input: { a: '<UNKNOWN>', b: '42', nested: { c: 'Gamma' } } }], model: 'claude-sonnet-4-6', usage: { input_tokens: 4, output_tokens: 6 } });
        }
        return jsonResponse({ content: [{ type: 'tool_use', name: STRUCTURED_OUTPUT_NAME, input: { a: 'Alpha', b: 42, nested: { c: 'Gamma' } } }], model: 'claude-sonnet-4-6', usage: { input_tokens: 5, output_tokens: 7 } });
      },
    });
    const res = await provider.generate({ prompt: 'p', responseSchema: sampleSchema, webSearch: true });
    expect(bodies.length).toBe(3);
    expect(String(bodies[2].messages[0].content)).toContain('$.a must not be empty or <UNKNOWN>');
    expect(String(bodies[2].messages[0].content)).toContain('$.b must be a number');
    expect(JSON.parse(res.content)).toEqual({ a: 'Alpha', b: 42, nested: { c: 'Gamma' } });
    expect(res.inputTokens).toBe(15);
    expect(res.outputTokens).toBe(27);
  });

  it('Live DEGRADES to a forced-tool Fast pass (no hard-fail) when Claude grounded research is unavailable (#601/market)', async () => {
    const bodies: Record<string, any>[] = [];
    const provider = new ClaudeProvider({
      anthropicSecretName: 'anthropic-secret',
      secretsManagerClient: secretClient('anthropic-key'),
      fetchImpl: async (_url, init) => {
        const b = JSON.parse(String(init?.body));
        bodies.push(b);
        if (bodies.length === 1) {
          return jsonResponse({
            content: [{ type: 'text', text: `${GROUNDED_RESEARCH_UNAVAILABLE}\nWeb search thin, but supplied sector data is present.` }],
            model: 'claude-sonnet-4-6',
            usage: { input_tokens: 10, output_tokens: 20 },
          });
        }
        return jsonResponse({
          content: [{ type: 'tool_use', name: STRUCTURED_OUTPUT_NAME, input: { a: 'degraded', b: 3, nested: { c: 'fast' } } }],
          model: 'claude-sonnet-4-6',
          usage: { input_tokens: 4, output_tokens: 6 },
        });
      },
    });
    const res = await provider.generate({ prompt: 'Analyse the Australia market', responseSchema: sampleSchema, webSearch: true, groundingKind: 'market' });
    // Two passes: research (web search) then a DEGRADE forced-tool Fast pass over the ORIGINAL prompt.
    expect(bodies.length).toBe(2);
    expect(bodies[0].tools[0].type).toBe('web_search_20250305');
    expect(String(bodies[0].messages[0].content)).toContain('MARKET/REGION analysis');
    // Fast fallback: forced tool, NO web search, ORIGINAL prompt (carries supplied sector data).
    expect(bodies[1].tool_choice).toEqual({ type: 'tool', name: STRUCTURED_OUTPUT_NAME });
    expect(bodies[1].tools.some((t: any) => t.type === 'web_search_20250305')).toBe(false);
    expect(String(bodies[1].messages[0].content)).toContain('Analyse the Australia market');
    expect(String(bodies[1].messages[0].content)).not.toContain('DATA_STATUS');
    expect(JSON.parse(res.content)).toEqual({ a: 'degraded', b: 3, nested: { c: 'fast' } });
    expect(res.inputTokens).toBe(14);
    expect(res.outputTokens).toBe(26);
  });

  it('Live still HARD-FAILS for SECURITY grounding when research is unavailable (#601 guard preserved)', async () => {
    const bodies: Record<string, any>[] = [];
    const provider = new ClaudeProvider({
      anthropicSecretName: 'anthropic-secret',
      secretsManagerClient: secretClient('anthropic-key'),
      fetchImpl: async (_url, init) => {
        bodies.push(JSON.parse(String(init?.body)));
        return jsonResponse({
          content: [{ type: 'text', text: `${GROUNDED_RESEARCH_UNAVAILABLE}\nNo active public security could be verified.` }],
          model: 'claude-sonnet-4-6',
          usage: { input_tokens: 10, output_tokens: 20 },
        });
      },
    });
    // Default groundingKind is 'security' → no supplied fallback → must hard-fail, not fabricate.
    await expect(provider.generate({ prompt: 'Analyse ZZZZQX', responseSchema: sampleSchema, webSearch: true }))
      .rejects.toMatchObject({ errorClass: 'provider_bad_response', statusCode: 502 });
    expect(bodies.length).toBe(1);                            // no degrade pass ran
    expect(bodies[0].tools[0].type).toBe('web_search_20250305');
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
          content: [{ type: 'tool_use', name: STRUCTURED_OUTPUT_NAME, input: { a: 'x', b: 1, nested: { c: 'z' } } }],
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
    expect(JSON.parse(JSON.parse(res.body).content)).toEqual({ a: 'x', b: 1, nested: { c: 'z' } });
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
