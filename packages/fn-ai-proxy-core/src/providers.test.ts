import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { HttpError } from '@transformotion/lambda-middleware';
import { createAiProvider } from './provider';
import { AiProviderError } from './types';
import { createAiProxyHandler } from './handler';
import { executeAsyncJob } from './async-job';
import { AI_CONFIG_PK, PLATFORM_DEFAULT_SK, appOverrideSk } from './config';
import { ClaudeProvider, stripAnthropicCitations } from './providers/claude';
import { OpenAIProvider } from './providers/openai';
import { resetApiKeyCache } from './secrets';

function secretClient(secret: string) {
  return {
    send: async () => ({ SecretString: secret }),
  } as never;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function configClient(items: Record<string, Record<string, unknown>>) {
  return {
    send: async (command: { input?: { Key?: { sk?: string } } }) => {
      const sk = command.input?.Key?.sk;
      return sk ? { Item: items[sk] } : {};
    },
  } as never;
}

const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);
const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
type ConsoleSpy = typeof infoSpy | typeof warnSpy;

describe('ClaudeProvider', () => {
  beforeEach(() => {
    resetApiKeyCache();
  });

  it('maps Anthropic text and token usage into the provider contract', async () => {
    let requestBody: Record<string, unknown> | undefined;
    const provider = new ClaudeProvider({
      anthropicSecretName: 'anthropic-secret',
      secretsManagerClient: secretClient('anthropic-key'),
      fetchImpl: async (_url, init) => {
        requestBody = JSON.parse(String(init?.body));
        return jsonResponse({
          content: [{ type: 'text', text: 'Hello <cite>source</cite>' }],
          model: 'claude-sonnet-4-6',
          usage: { input_tokens: 11, output_tokens: 7 },
        });
      },
    });

    const result = await provider.generate({
      prompt: 'Say hi',
      system: 'Be brief',
      model: 'claude-sonnet-4-6',
      maxTokens: 100,
      webSearch: true,
    });

    expect(requestBody).toMatchObject({
      model: 'claude-sonnet-4-6',
      max_tokens: 100,
      system: 'Be brief',
      messages: [{ role: 'user', content: 'Say hi' }],
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
    });
    expect(result).toEqual({
      content: 'Hello source',
      provider: 'claude',
      model: 'claude-sonnet-4-6',
      inputTokens: 11,
      outputTokens: 7,
      totalTokens: 18,
    });
  });

  it('normalises Anthropic rate limits', async () => {
    const provider = new ClaudeProvider({
      anthropicSecretName: 'anthropic-secret',
      secretsManagerClient: secretClient('anthropic-key'),
      fetchImpl: async () => jsonResponse({
        error: { type: 'rate_limit_error', message: 'slow down' },
      }, 429),
    });

    await expect(provider.generate({
      prompt: 'Say hi',
      model: 'claude-sonnet-4-6',
      maxTokens: 100,
    })).rejects.toMatchObject({
      errorClass: 'rate_limit',
      statusCode: 429,
      retryable: true,
    });
  });

  it('rejects empty Anthropic text responses', async () => {
    const provider = new ClaudeProvider({
      anthropicSecretName: 'anthropic-secret',
      secretsManagerClient: secretClient('anthropic-key'),
      fetchImpl: async () => jsonResponse({
        content: [],
        model: 'claude-sonnet-4-6',
        usage: { input_tokens: 1, output_tokens: 0 },
      }),
    });

    await expect(provider.generate({
      prompt: 'Say hi',
      model: 'claude-sonnet-4-6',
      maxTokens: 100,
    })).rejects.toMatchObject({
      errorClass: 'provider_bad_response',
      statusCode: 502,
    });
  });

  it('strips Anthropic citation tags', () => {
    expect(stripAnthropicCitations('Alpha <cite data-x="1">Beta</cite>'))
      .toBe('Alpha Beta');
  });
});

describe('OpenAIProvider', () => {
  beforeEach(() => {
    resetApiKeyCache();
    warnSpy.mockClear();
  });

  it('maps OpenAI text and token usage into the provider contract', async () => {
    let requestBody: Record<string, unknown> | undefined;
    const provider = new OpenAIProvider({
      anthropicSecretName: 'unused',
      openaiSecretName: 'openai-secret',
      secretsManagerClient: secretClient('openai-key'),
      fetchImpl: async (_url, init) => {
        requestBody = JSON.parse(String(init?.body));
        return jsonResponse({
          output_text: 'Hello from OpenAI',
          model: 'gpt-5.4-mini',
          usage: { input_tokens: 5, output_tokens: 6, total_tokens: 11 },
        });
      },
    });

    const result = await provider.generate({
      prompt: 'Say hi',
      system: 'Be brief',
      model: 'gpt-5.4-mini',
      maxTokens: 100,
      webSearch: true,
    });

    expect(requestBody).toEqual({
      model: 'gpt-5.4-mini',
      input: [
        { role: 'system', content: 'Be brief' },
        { role: 'user', content: 'Say hi' },
      ],
      max_output_tokens: 100,
      tools: [{ type: 'web_search' }],
      tool_choice: 'required',
    });
    expect(result).toEqual({
      content: 'Hello from OpenAI',
      provider: 'openai',
      model: 'gpt-5.4-mini',
      inputTokens: 5,
      outputTokens: 6,
      totalTokens: 11,
    });
  });

  it('normalises OpenAI authentication errors', async () => {
    const provider = new OpenAIProvider({
      anthropicSecretName: 'unused',
      openaiSecretName: 'openai-secret',
      secretsManagerClient: secretClient('openai-key'),
      fetchImpl: async () => jsonResponse({
        error: { code: 'invalid_api_key', message: 'bad key' },
      }, 401),
    });

    await expect(provider.generate({
      prompt: 'Say hi',
      model: 'gpt-5.4-mini',
      maxTokens: 100,
    })).rejects.toMatchObject({
      errorClass: 'authentication',
      statusCode: 502,
      retryable: false,
    });
  });

  it('captures status, headers, and body prefix for non-JSON OpenAI HTTP responses', async () => {
    const provider = new OpenAIProvider({
      anthropicSecretName: 'unused',
      openaiSecretName: 'openai-secret',
      secretsManagerClient: secretClient('openai-key'),
      fetchImpl: async () => new Response('<!DOCTYPE html><title>Gateway error</title>', {
        status: 502,
        headers: { 'Content-Type': 'text/html', 'x-request-id': 'req-1' },
      }),
    });

    await expect(provider.generate({
      prompt: 'Say hi',
      model: 'gpt-5.5',
      maxTokens: 100,
    })).rejects.toMatchObject({
      name: 'AiProviderNonJsonError',
      diagnostics: {
        provider: 'openai',
        model: 'gpt-5.5',
        phase: 'provider_http_json_parse',
        httpStatus: 502,
        responseBodyPrefix: '<!DOCTYPE html><title>Gateway error</title>',
      },
    });

    const logged = JSON.parse(String(warnSpy.mock.calls.at(-1)?.[0])) as Record<string, unknown>;
    expect(logged).toMatchObject({
      eventName: 'ai_provider_non_json_response',
      provider: 'openai',
      model: 'gpt-5.5',
      phase: 'provider_http_json_parse',
      httpStatus: 502,
      responseBodyPrefix: '<!DOCTYPE html><title>Gateway error</title>',
    });
    expect(logged.responseHeaders).toMatchObject({
      'content-type': 'text/html',
      'x-request-id': 'req-1',
    });
  });

  it('rejects malformed OpenAI text responses', async () => {
    const provider = new OpenAIProvider({
      anthropicSecretName: 'unused',
      openaiSecretName: 'openai-secret',
      secretsManagerClient: secretClient('openai-key'),
      fetchImpl: async () => jsonResponse({
        output: [],
        model: 'gpt-5.4-mini',
        usage: { input_tokens: 5, output_tokens: 0, total_tokens: 5 },
      }),
    });

    await expect(provider.generate({
      prompt: 'Say hi',
      model: 'gpt-5.4-mini',
      maxTokens: 100,
    })).rejects.toMatchObject({
      errorClass: 'provider_bad_response',
      statusCode: 502,
    });
  });
});

describe('createAiProvider', () => {
  it('creates the requested provider', () => {
    expect(createAiProvider('claude', { anthropicSecretName: 'secret' }))
      .toBeInstanceOf(ClaudeProvider);
    expect(createAiProvider('openai', { anthropicSecretName: 'unused', openaiSecretName: 'secret' }))
      .toBeInstanceOf(OpenAIProvider);
  });

  it('fails when a required provider secret is absent', () => {
    expect(() => createAiProvider('claude', {}))
      .toThrow(AiProviderError);
    expect(() => createAiProvider('openai', { anthropicSecretName: 'unused' }))
      .toThrow(AiProviderError);
  });
});

describe('createAiProxyHandler', () => {
  beforeEach(() => {
    resetApiKeyCache();
    infoSpy.mockClear();
    warnSpy.mockClear();
  });

  afterEach(() => {
    infoSpy.mockClear();
    warnSpy.mockClear();
  });

  function apiEvent(body: unknown) {
    return {
      headers: { 'X-Account-Id': 'account-1' },
      requestContext: {
        requestId: 'request-123',
        authorizer: {
          claims: {
            sub: 'user-1',
            email: 'user@example.com',
            'cognito:groups': '',
            apps: JSON.stringify(['stock-analyser']),
            accounts: JSON.stringify({
              'stock-analyser': [{ accountId: 'account-1', role: 'member' }],
            }),
            site_admin: 'false',
          },
        },
      },
      body: JSON.stringify(body),
      isBase64Encoded: false,
    } as never;
  }

  function lastTelemetry(spy: ConsoleSpy) {
    const call = spy.mock.calls.at(-1);
    return JSON.parse(String(call?.[0])) as Record<string, unknown>;
  }

  it('preserves sync client response fields while adding provider metadata', async () => {
    const handler = createAiProxyHandler({
      provider: 'claude',
      anthropicSecretName: 'anthropic-secret',
      permittedApps: ['stock-analyser'],
      secretsManagerClient: secretClient('anthropic-key'),
      fetchImpl: async () => jsonResponse({
        content: [{ type: 'text', text: 'Hello' }],
        model: 'claude-sonnet-4-6',
        usage: { input_tokens: 3, output_tokens: 4 },
      }),
    });

    const response = await handler(apiEvent({
      prompt: 'Say hi',
      maxTokens: 100,
    })) as { statusCode: number; body: string };

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({
      content: 'Hello',
      provider: 'claude',
      model: 'claude-sonnet-4-6',
      usage: {
        inputTokens: 3,
        outputTokens: 4,
      },
    });

    expect(lastTelemetry(infoSpy)).toMatchObject({
      eventName: 'ai_runtime_execution',
      requestId: 'request-123',
      asyncMode: false,
      provider: 'claude',
      model: 'claude-sonnet-4-6',
      configurationSource: 'environment_fallback',
      success: true,
      inputTokens: 3,
      outputTokens: 4,
      totalTokens: 7,
    });
  });

  it('uses app override runtime config to select OpenAI for sync requests', async () => {
    let requestBody: Record<string, unknown> | undefined;
    const handler = createAiProxyHandler({
      appSlug: 'stock-analyser',
      aiConfigTableName: 'ai-config',
      anthropicSecretName: 'anthropic-secret',
      openaiSecretName: 'openai-secret',
      permittedApps: ['stock-analyser'],
      aiConfigClient: configClient({
        [appOverrideSk('stock-analyser')]: {
          pk: AI_CONFIG_PK,
          sk: appOverrideSk('stock-analyser'),
          provider: 'openai',
          model: 'gpt-5.4',
          updatedAt: '2026-06-04T00:00:00.000Z',
        },
      }),
      secretsManagerClient: secretClient('openai-key'),
      fetchImpl: async (_url, init) => {
        requestBody = JSON.parse(String(init?.body));
        return jsonResponse({
          output_text: 'OpenAI runtime response',
          model: 'gpt-5.4',
          usage: { input_tokens: 8, output_tokens: 9, total_tokens: 17 },
        });
      },
    });

    const response = await handler(apiEvent({
      prompt: 'Say hi',
      model: 'claude-sonnet-4-6',
      maxTokens: 100,
    })) as { statusCode: number; body: string };

    expect(response.statusCode).toBe(200);
    expect(requestBody).toMatchObject({ model: 'gpt-5.4' });
    expect(JSON.parse(response.body)).toMatchObject({
      content: 'OpenAI runtime response',
      provider: 'openai',
      model: 'gpt-5.4',
      configurationSource: 'app_override',
      usage: {
        inputTokens: 8,
        outputTokens: 9,
        totalTokens: 17,
      },
    });
  });

  it('uses platform default then env fallback when app runtime config is missing', async () => {
    const handler = createAiProxyHandler({
      appSlug: 'budget-tracker',
      aiConfigTableName: 'ai-config',
      anthropicSecretName: 'anthropic-secret',
      openaiSecretName: 'openai-secret',
      permittedApps: ['stock-analyser'],
      fallbackProvider: 'openai',
      fallbackModel: 'gpt-5.4-mini',
      aiConfigClient: configClient({
        [PLATFORM_DEFAULT_SK]: {
          pk: AI_CONFIG_PK,
          sk: PLATFORM_DEFAULT_SK,
          provider: 'claude',
          model: 'claude-sonnet-4-6',
          updatedAt: '2026-06-04T00:00:00.000Z',
        },
      }),
      secretsManagerClient: secretClient('anthropic-key'),
      fetchImpl: async () => jsonResponse({
        content: [{ type: 'text', text: 'Claude platform response' }],
        model: 'claude-sonnet-4-6',
        usage: { input_tokens: 1, output_tokens: 2 },
      }),
    });

    const response = await handler(apiEvent({
      prompt: 'Say hi',
      maxTokens: 100,
    })) as { statusCode: number; body: string };

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({
      provider: 'claude',
      model: 'claude-sonnet-4-6',
      configurationSource: 'platform_default',
    });
  });

  it('uses env fallback runtime config when no config table is available', async () => {
    const handler = createAiProxyHandler({
      appSlug: 'budget-tracker',
      anthropicSecretName: 'anthropic-secret',
      openaiSecretName: 'openai-secret',
      permittedApps: ['stock-analyser'],
      fallbackProvider: 'openai',
      fallbackModel: 'gpt-5.4-mini',
      secretsManagerClient: secretClient('openai-key'),
      fetchImpl: async () => jsonResponse({
        output_text: 'OpenAI fallback response',
        model: 'gpt-5.4-mini',
        usage: { input_tokens: 2, output_tokens: 3, total_tokens: 5 },
      }),
    });

    const response = await handler(apiEvent({
      prompt: 'Say hi',
      maxTokens: 100,
    })) as { statusCode: number; body: string };

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({
      provider: 'openai',
      model: 'gpt-5.4-mini',
      configurationSource: 'environment_fallback',
    });
  });

  it('captures resolved provider and model before invoking async jobs', async () => {
    const writes: Array<Record<string, unknown>> = [];
    let invokedPayload: Record<string, unknown> | undefined;
    const handler = createAiProxyHandler({
      appSlug: 'stock-analyser',
      aiConfigTableName: 'ai-config',
      anthropicSecretName: 'anthropic-secret',
      openaiSecretName: 'openai-secret',
      permittedApps: ['stock-analyser'],
      jobResultsTable: 'job-results',
      lambdaFunctionName: 'stock-analyser-ai-proxy-dev',
      aiConfigClient: configClient({
        [appOverrideSk('stock-analyser')]: {
          pk: AI_CONFIG_PK,
          sk: appOverrideSk('stock-analyser'),
          provider: 'openai',
          model: 'gpt-5.4-mini',
          updatedAt: '2026-06-04T00:00:00.000Z',
        },
      }),
      dynamoClient: {
        send: async (command: { input?: { Item?: Record<string, unknown> } }) => {
          if (command.input?.Item) {
            writes.push(command.input.Item);
          }
          return {};
        },
      } as never,
      lambdaClient: {
        send: async (command: { input?: { Payload?: Uint8Array } }) => {
          invokedPayload = JSON.parse(Buffer.from(command.input?.Payload ?? new Uint8Array()).toString());
          return {};
        },
      } as never,
    });

    const response = await handler(apiEvent({
      prompt: 'Run async',
      asyncMode: true,
      connectionId: 'connection-1',
    })) as { statusCode: number; body: string };

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({ status: 'pending' });
    expect(writes[0]).toMatchObject({
      data: {
        data: {
          status: 'pending',
          provider: 'openai',
          model: 'gpt-5.4-mini',
          configurationSource: 'app_override',
        },
      },
    });
    expect(invokedPayload).toMatchObject({
      __asyncJob: true,
      requestId: 'request-123',
      provider: 'openai',
      model: 'gpt-5.4-mini',
      configurationSource: 'app_override',
      connectionId: 'connection-1',
    });
  });

  it('preserves structured rate-limit responses', async () => {
    const handler = createAiProxyHandler({
      provider: 'claude',
      anthropicSecretName: 'anthropic-secret',
      permittedApps: ['stock-analyser'],
      secretsManagerClient: secretClient('anthropic-key'),
      fetchImpl: async () => jsonResponse({
        error: { type: 'rate_limit_error', message: 'slow down' },
      }, 429),
    });

    const response = await handler(apiEvent({
      prompt: 'Say hi',
      maxTokens: 100,
    })) as { statusCode: number; body: string };

    expect(response.statusCode).toBe(429);
    expect(JSON.parse(response.body)).toMatchObject({
      error: 'Too Many Requests',
      message: 'RATE_LIMIT',
    });

    expect(lastTelemetry(warnSpy)).toMatchObject({
      eventName: 'ai_runtime_execution',
      requestId: 'request-123',
      asyncMode: false,
      provider: 'claude',
      model: 'claude-sonnet-4-6',
      configurationSource: 'environment_fallback',
      success: false,
      errorClass: 'rate_limit',
      errorRetryable: true,
      providerErrorCode: 'rate_limit_error',
      httpStatusCode: 429,
    });
  });

  it('does not include prompt, response content, or account data in telemetry', async () => {
    const handler = createAiProxyHandler({
      appSlug: 'stock-analyser',
      anthropicSecretName: 'anthropic-secret',
      permittedApps: ['stock-analyser'],
      fallbackProvider: 'claude',
      fallbackModel: 'claude-sonnet-4-6',
      secretsManagerClient: secretClient('anthropic-key'),
      fetchImpl: async () => jsonResponse({
        content: [{ type: 'text', text: 'sensitive model response text' }],
        model: 'claude-sonnet-4-6',
        usage: { input_tokens: 3, output_tokens: 4 },
      }),
    });

    const response = await handler(apiEvent({
      prompt: 'sensitive prompt text',
      maxTokens: 100,
    })) as { statusCode: number; body: string };

    expect(response.statusCode).toBe(200);
    const serialized = JSON.stringify(lastTelemetry(infoSpy));
    expect(serialized).not.toContain('sensitive prompt text');
    expect(serialized).not.toContain('sensitive model response text');
    expect(serialized).not.toContain('anthropic-key');
    expect(serialized).not.toContain('account-1');
    expect(serialized).not.toContain('user@example.com');
  });
});

describe('executeAsyncJob telemetry', () => {
  beforeEach(() => {
    resetApiKeyCache();
    infoSpy.mockClear();
    warnSpy.mockClear();
  });

  afterEach(() => {
    infoSpy.mockClear();
    warnSpy.mockClear();
  });

  function lastTelemetry(spy: ConsoleSpy) {
    const call = spy.mock.calls.at(-1);
    return JSON.parse(String(call?.[0])) as Record<string, unknown>;
  }

  it('emits the same safe structured fields for async success', async () => {
    const writes: Array<Record<string, unknown>> = [];

    await executeAsyncJob({
      __asyncJob: true,
      jobId: 'job-1',
      accountId: 'account-1',
      requestId: 'request-async-1',
      prompt: 'sensitive async prompt text',
      provider: 'claude',
      model: 'claude-sonnet-4-6',
      configurationSource: 'app_override',
      maxTokens: 100,
    }, {
      appSlug: 'stock-analyser',
      jobResultsTable: 'job-results',
      anthropicSecretName: 'anthropic-secret',
      secretsManagerClient: secretClient('anthropic-key'),
      dynamoClient: {
        send: async (command: { input?: { Item?: Record<string, unknown> } }) => {
          if (command.input?.Item) {
            writes.push(command.input.Item);
          }
          return {};
        },
      } as never,
      fetchImpl: async () => jsonResponse({
        content: [{ type: 'text', text: 'sensitive async response text' }],
        model: 'claude-sonnet-4-6',
        usage: { input_tokens: 5, output_tokens: 6 },
      }),
    });

    expect(writes[0]).toMatchObject({
      data: {
        data: {
          status: 'complete',
          provider: 'claude',
          model: 'claude-sonnet-4-6',
          configurationSource: 'app_override',
        },
      },
    });
    const telemetry = lastTelemetry(infoSpy);
    expect(telemetry).toMatchObject({
      eventName: 'ai_runtime_execution',
      appSlug: 'stock-analyser',
      requestId: 'request-async-1',
      asyncMode: true,
      provider: 'claude',
      model: 'claude-sonnet-4-6',
      configurationSource: 'app_override',
      success: true,
      inputTokens: 5,
      outputTokens: 6,
      totalTokens: 11,
    });
    const serialized = JSON.stringify(telemetry);
    expect(serialized).not.toContain('sensitive async prompt text');
    expect(serialized).not.toContain('sensitive async response text');
    expect(serialized).not.toContain('anthropic-key');
    expect(serialized).not.toContain('account-1');
  });

  it('notifies the client over WSS on FAILURE so it does not hang (#607)', async () => {
    const writes: Array<Record<string, unknown>> = [];
    const wssPushes: Array<{ ConnectionId?: string; Data?: Uint8Array }> = [];

    await executeAsyncJob({
      __asyncJob: true,
      jobId: 'job-err',
      accountId: 'account-1',
      requestId: 'request-async-err',
      prompt: 'p',
      provider: 'claude',
      model: 'claude-sonnet-4-6',
      configurationSource: 'app_override',
      maxTokens: 100,
      connectionId: 'conn-1',
    }, {
      appSlug: 'stock-analyser',
      jobResultsTable: 'job-results',
      wsApiEndpoint: 'https://wss.example/dev',
      anthropicSecretName: 'anthropic-secret',
      secretsManagerClient: secretClient('anthropic-key'),
      dynamoClient: {
        send: async (command: { input?: { Item?: Record<string, unknown> } }) => {
          if (command.input?.Item) writes.push(command.input.Item);
          return {};
        },
      } as never,
      apiGatewayManagementClient: {
        send: async (command: { input?: { ConnectionId?: string; Data?: Uint8Array } }) => {
          if (command.input) wssPushes.push(command.input);
          return {};
        },
      } as never,
      // Non-429 provider failure → straight to the error branch (no retry).
      fetchImpl: async () => jsonResponse({ error: { message: 'boom', type: 'server_error' } }, 500),
    });

    // The error status is written...
    expect(writes.at(-1)).toMatchObject({ data: { data: { status: 'error' } } });
    // ...AND the client is notified so it wakes and reads the error (not a 10-min hang).
    expect(wssPushes.length).toBe(1);
    expect(wssPushes[0].ConnectionId).toBe('conn-1');
    const pushed = JSON.parse(Buffer.from(wssPushes[0].Data!).toString('utf8'));
    expect(pushed).toEqual({ type: 'job_complete', jobId: 'job-err' });
  });
});

describe('secret cache compatibility', () => {
  beforeEach(() => {
    resetApiKeyCache();
  });

  it('still throws HttpError for empty secrets', async () => {
    const provider = new ClaudeProvider({
      anthropicSecretName: 'anthropic-secret',
      secretsManagerClient: secretClient(''),
      fetchImpl: async () => jsonResponse({}),
    });

    await expect(provider.generate({
      prompt: 'Say hi',
      model: 'claude-sonnet-4-6',
      maxTokens: 100,
    })).rejects.toBeInstanceOf(HttpError);
  });
});
