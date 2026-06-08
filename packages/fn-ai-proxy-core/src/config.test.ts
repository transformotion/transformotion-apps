import { describe, expect, it } from 'vitest';
import {
  AI_CONFIG_PK,
  PLATFORM_DEFAULT_SK,
  appOverrideSk,
  assertValidAiConfig,
  resolveAiRuntimeConfig,
  resolveEnvFallbackConfig,
} from './config';

function configClient(records: Record<string, Record<string, unknown>>, fail = false) {
  return {
    send: async (command: { input?: { Key?: Record<string, string> } }) => {
      if (fail) throw new Error('DynamoDB unavailable');
      const key = command.input?.Key;
      if (!key) return { Item: undefined };
      const compositeKey = Object.entries(key).map(([k, v]) => `${k}=${v}`).join('|');
      return { Item: records[compositeKey] ?? (key.sk ? records[key.sk] : undefined) };
    },
  } as never;
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

describe('AI runtime config validation', () => {
  it('accepts supported provider/model pairs', () => {
    expect(() => assertValidAiConfig('claude', 'claude-sonnet-4-6')).not.toThrow();
    expect(() => assertValidAiConfig('claude', 'claude-opus-4-8')).not.toThrow();
    expect(() => assertValidAiConfig('claude', 'claude-haiku-4-5-20251001')).not.toThrow();
    expect(() => assertValidAiConfig('openai', 'gpt-5.5')).not.toThrow();
    expect(() => assertValidAiConfig('openai', 'gpt-5.4')).not.toThrow();
    expect(() => assertValidAiConfig('openai', 'gpt-5.4-mini')).not.toThrow();
    expect(() => assertValidAiConfig('openai', 'gpt-5.4-nano')).not.toThrow();
  });

  it('rejects unsupported providers and models', () => {
    expect(() => assertValidAiConfig('anthropic', 'claude-sonnet-4-6')).toThrow();
    expect(() => assertValidAiConfig('claude', 'gpt-5.4')).toThrow();
    expect(() => assertValidAiConfig('openai', 'gpt-4.1')).toThrow();
  });
});

describe('resolveEnvFallbackConfig', () => {
  it('uses valid env fallback values', () => {
    expect(resolveEnvFallbackConfig({
      fallbackProvider: 'openai',
      fallbackModel: 'gpt-5.4-mini',
    })).toEqual({
      provider: 'openai',
      model: 'gpt-5.4-mini',
      source: 'environment_fallback',
    });
  });

  it('falls back safely to current Claude behavior when env fallback is invalid', () => {
    expect(resolveEnvFallbackConfig({
      fallbackProvider: 'invalid',
      fallbackModel: 'invalid',
    })).toEqual({
      provider: 'claude',
      model: 'claude-sonnet-4-6',
      source: 'environment_fallback',
    });
  });
});

describe('resolveAiRuntimeConfig', () => {
  it('prefers app override over platform default', async () => {
    await expect(resolveAiRuntimeConfig({
      appSlug: 'stock-analyser',
      tableName: 'launchpad-ai-runtime-config-dev',
      fallbackProvider: 'claude',
      fallbackModel: 'claude-sonnet-4-6',
      client: configClient({
        [appOverrideSk('stock-analyser')]: record(appOverrideSk('stock-analyser'), 'openai', 'gpt-5.4'),
        [PLATFORM_DEFAULT_SK]: record(PLATFORM_DEFAULT_SK, 'claude', 'claude-sonnet-4-6'),
      }),
    })).resolves.toEqual({
      provider: 'openai',
      model: 'gpt-5.4',
      source: 'app_override',
    });
  });

  it('prefers an app-owned override table over the platform config table app override', async () => {
    await expect(resolveAiRuntimeConfig({
      appSlug: 'budget-tracker',
      tableName: 'launchpad-ai-runtime-config-dev',
      appOverrideTableName: 'budget-tracker.settings-dev',
      appOverrideKey: { accountId: 'acct-123', settingKey: 'AI_CONFIG#APP#budget-tracker' },
      fallbackProvider: 'claude',
      fallbackModel: 'claude-sonnet-4-6',
      client: configClient({
        'accountId=acct-123|settingKey=AI_CONFIG#APP#budget-tracker': record(appOverrideSk('budget-tracker'), 'openai', 'gpt-5.4'),
        [appOverrideSk('budget-tracker')]: record(appOverrideSk('budget-tracker'), 'claude', 'claude-haiku-4-5-20251001'),
        [PLATFORM_DEFAULT_SK]: record(PLATFORM_DEFAULT_SK, 'claude', 'claude-sonnet-4-6'),
      }),
    })).resolves.toEqual({
      provider: 'openai',
      model: 'gpt-5.4',
      source: 'app_override',
    });
  });

  it('supports nested canonical config records in app-owned settings rows', async () => {
    await expect(resolveAiRuntimeConfig({
      appSlug: 'stock-analyser',
      tableName: 'launchpad-ai-runtime-config-dev',
      appOverrideTableName: 'stock-analyser.settings-dev',
      appOverrideKey: { pk: 'ACCOUNT#acct-123', sk: 'APP#AI_RUNTIME' },
      fallbackProvider: 'claude',
      fallbackModel: 'claude-sonnet-4-6',
      client: configClient({
        'pk=ACCOUNT#acct-123|sk=APP#AI_RUNTIME': {
          pk: 'ACCOUNT#acct-123',
          sk: 'APP#AI_RUNTIME',
          config: record(appOverrideSk('stock-analyser'), 'openai', 'gpt-5.4-mini'),
        },
        [PLATFORM_DEFAULT_SK]: record(PLATFORM_DEFAULT_SK, 'claude', 'claude-sonnet-4-6'),
      }),
    })).resolves.toEqual({
      provider: 'openai',
      model: 'gpt-5.4-mini',
      source: 'app_override',
    });
  });

  it('uses platform default when app override is missing', async () => {
    await expect(resolveAiRuntimeConfig({
      appSlug: 'budget-tracker',
      tableName: 'launchpad-ai-runtime-config-dev',
      fallbackProvider: 'claude',
      fallbackModel: 'claude-sonnet-4-6',
      client: configClient({
        [PLATFORM_DEFAULT_SK]: record(PLATFORM_DEFAULT_SK, 'openai', 'gpt-5.4-mini'),
      }),
    })).resolves.toEqual({
      provider: 'openai',
      model: 'gpt-5.4-mini',
      source: 'platform_default',
    });
  });

  it('ignores invalid records and uses env fallback', async () => {
    await expect(resolveAiRuntimeConfig({
      appSlug: 'budget-tracker',
      tableName: 'launchpad-ai-runtime-config-dev',
      fallbackProvider: 'claude',
      fallbackModel: 'claude-sonnet-4-6',
      client: configClient({
        [appOverrideSk('budget-tracker')]: record(appOverrideSk('budget-tracker'), 'openai', 'unknown-model'),
        [PLATFORM_DEFAULT_SK]: record(PLATFORM_DEFAULT_SK, 'claude', 'unknown-model'),
      }),
    })).resolves.toEqual({
      provider: 'claude',
      model: 'claude-sonnet-4-6',
      source: 'environment_fallback',
    });
  });

  it('uses env fallback when the config table is unreadable', async () => {
    await expect(resolveAiRuntimeConfig({
      appSlug: 'stock-analyser',
      tableName: 'launchpad-ai-runtime-config-dev',
      fallbackProvider: 'openai',
      fallbackModel: 'gpt-5.4',
      client: configClient({}, true),
    })).resolves.toEqual({
      provider: 'openai',
      model: 'gpt-5.4',
      source: 'environment_fallback',
    });
  });
});
