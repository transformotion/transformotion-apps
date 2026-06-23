import { describe, expect, it, vi } from 'vitest';
import type { APIGatewayProxyEvent } from '@transformotion/lambda-middleware';
import { createHandler } from './index';

type HandlerDependencies = NonNullable<Parameters<typeof createHandler>[0]>;

vi.mock('@transformotion/fn-ai-proxy-core', () => ({
  AI_CONFIG_PK: 'AI_CONFIG',
  AI_MODEL_ALLOWLIST: { claude: ['claude-sonnet-4-6'], openai: ['gpt-5.4-mini'] },
  PLATFORM_DEFAULT_SK: 'PLATFORM#default',
  appOverrideSk: (appSlug: string) => `APP#${appSlug}`,
  assertValidAiConfig: () => undefined,
  isSupportedAiModel: () => true,
  isSupportedAiProvider: () => true,
  resolveEnvFallbackConfig: () => ({
    provider: 'claude',
    model: 'claude-sonnet-4-6',
    source: 'environment_fallback',
  }),
}));

function makeEvent(method: 'GET' | 'PATCH', body?: unknown): APIGatewayProxyEvent {
  return {
    httpMethod: method,
    resource: '/settings',
    headers: { 'X-Account-Id': 'acct-1' },
    body: body === undefined ? null : JSON.stringify(body),
    requestContext: {
      authorizer: {
        claims: {
          sub: 'user-1',
          email: 'user@example.com',
          apps: JSON.stringify(['stock-analyser']),
          accounts: JSON.stringify({
            'stock-analyser': [{ accountId: 'acct-1', role: 'viewer' }],
          }),
        },
      },
    },
  } as unknown as APIGatewayProxyEvent;
}

function createFakeDeps(initialItem?: Record<string, unknown>) {
  let item = initialItem;
  return {
    deps: {
      client: {
        async send(command: { input?: { Item?: Record<string, unknown> } }) {
          if (command.input?.Item) {
            item = command.input.Item;
            return {};
          }
          return item ? { Item: item } : {};
        },
      },
      settingsTable: 'settings',
      platformConfigTable: 'platform',
      now: () => new Date('2026-06-24T00:00:00.000Z'),
    } as unknown as HandlerDependencies,
    getItem: () => item,
  };
}

describe('Stock Analyser settings handler', () => {
  it('defaults defaultSearchMode to live when no preference exists', async () => {
    const { deps } = createFakeDeps();
    const res = await createHandler(deps)(makeEvent('GET'));

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({
      settings: {
        pk: 'SETTINGS',
        sk: 'APP#stock-analyser',
        explanatoryTextEnabled: true,
        defaultSearchMode: 'live',
        updatedAt: '2026-06-24T00:00:00.000Z',
      },
    });
  });

  it('patches defaultSearchMode without mutating explanatory text to an invalid value', async () => {
    const { deps, getItem } = createFakeDeps({
      pk: 'ACCOUNT#acct-1',
      sk: 'USER#user-1#PREFERENCES',
      explanatoryTextEnabled: false,
      defaultSearchMode: 'live',
      updatedAt: '2026-06-23T00:00:00.000Z',
    });

    const res = await createHandler(deps)(makeEvent('PATCH', { defaultSearchMode: 'fast' }));

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).settings).toMatchObject({
      explanatoryTextEnabled: false,
      defaultSearchMode: 'fast',
    });
    expect(getItem()).toMatchObject({
      explanatoryTextEnabled: false,
      defaultSearchMode: 'fast',
    });
  });

  it('rejects unsupported settings fields', async () => {
    const { deps } = createFakeDeps();
    const res = await createHandler(deps)(makeEvent('PATCH', { market: 'ASX' }));

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).message).toContain('Unsupported settings fields: market');
  });
});
