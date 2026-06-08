import { describe, expect, it } from 'vitest';
import { AI_CONFIG_PK, PLATFORM_DEFAULT_SK, appOverrideSk } from '@transformotion/fn-ai-proxy-core';
import { createHandler } from './index';

type StoredItem = Record<string, unknown>;

function makeClient(seed: Record<string, StoredItem> = {}) {
  const items = new Map<string, StoredItem>(Object.entries(seed));
  return {
    items,
    client: {
      send: async (command: { constructor: { name: string }; input?: { TableName?: string; Key?: Record<string, string>; Item?: StoredItem } }) => {
        const name = command.constructor.name;
        if (name === 'GetCommand') {
          const tableName = command.input?.TableName;
          const key = command.input?.Key;
          if (!key) return { Item: undefined };
          const compositeKey = Object.entries(key).map(([k, v]) => `${k}=${v}`).join('|');
          return {
            Item: (tableName ? items.get(`${tableName}|${compositeKey}`) : undefined)
              ?? items.get(compositeKey)
              ?? (key.sk ? items.get(key.sk) : undefined),
          };
        }
        if (name === 'PutCommand') {
          const item = command.input?.Item;
          if (!item || typeof item['sk'] !== 'string') throw new Error('missing item');
          items.set(item['sk'], item);
          return {};
        }
        if (name === 'DeleteCommand') {
          const sk = command.input?.Key?.sk;
          if (sk) items.delete(sk);
          return {};
        }
        throw new Error(`Unexpected command: ${name}`);
      },
    } as never,
  };
}

function event(
  resource: string,
  method: string,
  body?: unknown,
  siteAdmin = true,
  appSlug?: string,
  accounts: Record<string, Array<{ accountId: string; role: string }>> = {},
) {
  return {
    resource,
    httpMethod: method,
    pathParameters: appSlug ? { appSlug } : null,
    headers: {},
    requestContext: {
      authorizer: {
        claims: {
          sub: 'admin-user',
          email: 'admin@example.com',
          'cognito:groups': '',
          apps: JSON.stringify([]),
          accounts: JSON.stringify(accounts),
          site_admin: String(siteAdmin),
        },
      },
    },
    body: body === undefined ? null : JSON.stringify(body),
    isBase64Encoded: false,
  } as never;
}

function responseBody(response: { body: string }) {
  return response.body ? JSON.parse(response.body) : null;
}

function record(sk: string, provider: string, model: string) {
  return {
    pk: AI_CONFIG_PK,
    sk,
    provider,
    model,
    updatedAt: '2026-06-04T00:00:00.000Z',
  };
}

describe('ai-runtime-config handler', () => {
  it('allows site-admin to read config', async () => {
    const { client } = makeClient({
      [PLATFORM_DEFAULT_SK]: record(PLATFORM_DEFAULT_SK, 'claude', 'claude-sonnet-4-6'),
      [appOverrideSk('stock-analyser')]: record(appOverrideSk('stock-analyser'), 'openai', 'gpt-5.4'),
    });
    const handler = createHandler({
      client,
      tableName: 'launchpad-ai-runtime-config-dev',
      now: () => new Date('2026-06-04T01:00:00.000Z'),
    });

    const response = await handler(event('/api/admin/ai-runtime-config', 'GET')) as { statusCode: number; body: string };

    expect(response.statusCode).toBe(200);
    expect(responseBody(response)).toMatchObject({
      platformDefault: {
        provider: 'claude',
        model: 'claude-sonnet-4-6',
      },
      appOverrides: {
        'stock-analyser': {
          provider: 'openai',
          model: 'gpt-5.4',
        },
        'budget-tracker': null,
      },
      effective: {
        'stock-analyser': {
          provider: 'openai',
          model: 'gpt-5.4',
          source: 'app_override',
        },
        'budget-tracker': {
          provider: 'claude',
          model: 'claude-sonnet-4-6',
          source: 'platform_default',
        },
      },
      supportedModels: {
        claude: ['claude-sonnet-4-6', 'claude-opus-4-8', 'claude-haiku-4-5-20251001'],
        openai: ['gpt-5.4-mini', 'gpt-5.4', 'gpt-5.5', 'gpt-5.4-nano'],
      },
    });
  });

  it('reads app-owned override summaries for the first account membership per app', async () => {
    const { client } = makeClient({
      [PLATFORM_DEFAULT_SK]: record(PLATFORM_DEFAULT_SK, 'claude', 'claude-sonnet-4-6'),
      [appOverrideSk('stock-analyser')]: record(appOverrideSk('stock-analyser'), 'claude', 'claude-haiku-4-5-20251001'),
      'budget-tracker.settings-dev|accountId=bt-account|settingKey=AI_CONFIG#APP#budget-tracker': record(appOverrideSk('budget-tracker'), 'openai', 'gpt-5.4-mini'),
      'stock-analyser.settings-dev|pk=ACCOUNT#sa-account|sk=APP#AI_RUNTIME': {
        pk: 'ACCOUNT#sa-account',
        sk: 'APP#AI_RUNTIME',
        config: record(appOverrideSk('stock-analyser'), 'openai', 'gpt-5.5'),
      },
    });
    const handler = createHandler({
      client,
      tableName: 'launchpad-ai-runtime-config-dev',
      budgetTrackerSettingsTable: 'budget-tracker.settings-dev',
      stockAnalyserSettingsTable: 'stock-analyser.settings-dev',
      now: () => new Date('2026-06-04T01:00:00.000Z'),
    });

    const response = await handler(event(
      '/api/admin/ai-runtime-config',
      'GET',
      undefined,
      true,
      undefined,
      {
        'budget-tracker': [{ accountId: 'bt-account', role: 'owner' }],
        'stock-analyser': [{ accountId: 'sa-account', role: 'owner' }],
      },
    )) as { statusCode: number; body: string };

    expect(response.statusCode).toBe(200);
    expect(responseBody(response)).toMatchObject({
      appOverrides: {
        'budget-tracker': {
          provider: 'openai',
          model: 'gpt-5.4-mini',
        },
        'stock-analyser': {
          provider: 'openai',
          model: 'gpt-5.5',
        },
      },
      effective: {
        'budget-tracker': {
          provider: 'openai',
          model: 'gpt-5.4-mini',
          source: 'app_override',
        },
        'stock-analyser': {
          provider: 'openai',
          model: 'gpt-5.5',
          source: 'app_override',
        },
      },
    });
  });

  it('denies non-site-admin callers', async () => {
    const { client } = makeClient();
    const handler = createHandler({
      client,
      tableName: 'launchpad-ai-runtime-config-dev',
      now: () => new Date('2026-06-04T01:00:00.000Z'),
    });

    const response = await handler(event('/api/admin/ai-runtime-config', 'GET', undefined, false)) as { statusCode: number; body: string };

    expect(response.statusCode).toBe(403);
  });

  it('updates platform default with provider/model only', async () => {
    const { client, items } = makeClient();
    const handler = createHandler({
      client,
      tableName: 'launchpad-ai-runtime-config-dev',
      now: () => new Date('2026-06-04T01:00:00.000Z'),
    });

    const response = await handler(event(
      '/api/admin/ai-runtime-config/platform-default',
      'PUT',
      { provider: 'openai', model: 'gpt-5.4-mini' },
    )) as { statusCode: number; body: string };

    expect(response.statusCode).toBe(200);
    expect(items.get(PLATFORM_DEFAULT_SK)).toEqual({
      pk: AI_CONFIG_PK,
      sk: PLATFORM_DEFAULT_SK,
      provider: 'openai',
      model: 'gpt-5.4-mini',
      updatedAt: '2026-06-04T01:00:00.000Z',
    });
  });

  it('updates and resets app override', async () => {
    const { client, items } = makeClient();
    const handler = createHandler({
      client,
      tableName: 'launchpad-ai-runtime-config-dev',
      now: () => new Date('2026-06-04T01:00:00.000Z'),
    });

    const putResponse = await handler(event(
      '/api/admin/ai-runtime-config/apps/{appSlug}/override',
      'PUT',
      { provider: 'openai', model: 'gpt-5.4' },
      true,
      'budget-tracker',
    )) as { statusCode: number; body: string };

    expect(putResponse.statusCode).toBe(200);
    expect(items.get(appOverrideSk('budget-tracker'))).toMatchObject({
      provider: 'openai',
      model: 'gpt-5.4',
    });

    const deleteResponse = await handler(event(
      '/api/admin/ai-runtime-config/apps/{appSlug}/override',
      'DELETE',
      undefined,
      true,
      'budget-tracker',
    )) as { statusCode: number; body: string };

    expect(deleteResponse.statusCode).toBe(204);
    expect(items.has(appOverrideSk('budget-tracker'))).toBe(false);
  });

  it('rejects unsupported provider/model and secret-like fields', async () => {
    const { client } = makeClient();
    const handler = createHandler({
      client,
      tableName: 'launchpad-ai-runtime-config-dev',
      now: () => new Date('2026-06-04T01:00:00.000Z'),
    });

    const invalidModel = await handler(event(
      '/api/admin/ai-runtime-config/platform-default',
      'PUT',
      { provider: 'claude', model: 'gpt-5.4' },
    )) as { statusCode: number; body: string };
    expect(invalidModel.statusCode).toBe(400);

    const secretField = await handler(event(
      '/api/admin/ai-runtime-config/platform-default',
      'PUT',
      { provider: 'claude', model: 'claude-sonnet-4-6', apiKey: 'nope' },
    )) as { statusCode: number; body: string };
    expect(secretField.statusCode).toBe(400);
  });
});
