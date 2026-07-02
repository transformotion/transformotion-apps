import type { ISODateTime } from './api';
import type { EntitledAppSlug } from './auth';

export type AiProviderId = 'claude' | 'openai';
export type AiConfigAppSlug = Extract<EntitledAppSlug, 'stock-analyser' | 'budget-tracker'>;
export type AiConfigSource = 'app_override' | 'platform_default' | 'environment_fallback';

export const AI_CONFIG_PK = 'AI_CONFIG' as const;
export const PLATFORM_DEFAULT_SK = 'PLATFORM#default' as const;
export const SUPPORTED_AI_CONFIG_APP_SLUGS = ['stock-analyser', 'budget-tracker'] as const satisfies readonly AiConfigAppSlug[];

export const AI_MODEL_ALLOWLIST = {
  claude: ['claude-sonnet-4-6', 'claude-opus-4-8', 'claude-haiku-4-5-20251001'],
  openai: ['gpt-5.4-mini', 'gpt-5.4', 'gpt-5.5', 'gpt-5.4-nano'],
} as const satisfies Record<AiProviderId, readonly string[]>;

/**
 * Environment fallback used when neither an app override nor a platform default
 * is configured. Provider credentials live only in the runtime environment;
 * this constant carries provider/model identifiers only, never secrets.
 */
export const AI_ENVIRONMENT_FALLBACK = {
  provider: 'claude',
  model: 'claude-sonnet-4-6',
} as const satisfies AiRuntimeConfigUpdate;

export interface AiRuntimeConfigRecord {
  pk: typeof AI_CONFIG_PK;
  sk: typeof PLATFORM_DEFAULT_SK | `APP#${AiConfigAppSlug}`;
  provider: AiProviderId;
  model: string;
  updatedAt: ISODateTime;
}

export interface AiRuntimeConfigUpdate {
  provider: AiProviderId;
  model: string;
}

export interface ResolvedAiRuntimeConfig {
  provider: AiProviderId;
  model: string;
  source: AiConfigSource;
}

export interface AiRuntimeConfigResponse {
  platformDefault: AiRuntimeConfigRecord | null;
  appOverrides: Record<AiConfigAppSlug, AiRuntimeConfigRecord | null>;
  effective: Record<AiConfigAppSlug, ResolvedAiRuntimeConfig>;
  supportedModels: Record<AiProviderId, readonly string[]>;
}

/**
 * App-scoped AI runtime config response (M15.1).
 *
 * Returned by each app's own AI config endpoint so an app can resolve and edit
 * its own override without depending on the Launchpad platform-wide response.
 * Effective resolution semantics are identical to the platform response:
 *   app_override -> platform_default -> environment_fallback
 *
 * `platformDefault` is exposed read-only here so an app can display the
 * inherited default it is overriding. Apps must never write the platform
 * default; that remains owned by Launchpad.
 */
export interface AppAiRuntimeConfigResponse {
  appSlug: AiConfigAppSlug;
  platformDefault: AiRuntimeConfigRecord | null;
  appOverride: AiRuntimeConfigRecord | null;
  effective: ResolvedAiRuntimeConfig;
  supportedModels: Record<AiProviderId, readonly string[]>;
}

/**
 * Pure resolver for an app's effective AI runtime config.
 * Shared so Launchpad, Budget Tracker, and Stock Analyser resolve identically.
 */
export function resolveEffectiveAiRuntimeConfig(input: {
  appOverride: AiRuntimeConfigRecord | null;
  platformDefault: AiRuntimeConfigRecord | null;
}): ResolvedAiRuntimeConfig {
  if (input.appOverride) {
    return {
      provider: input.appOverride.provider,
      model: input.appOverride.model,
      source: 'app_override',
    };
  }
  if (input.platformDefault) {
    return {
      provider: input.platformDefault.provider,
      model: input.platformDefault.model,
      source: 'platform_default',
    };
  }
  return {
    provider: AI_ENVIRONMENT_FALLBACK.provider,
    model: AI_ENVIRONMENT_FALLBACK.model,
    source: 'environment_fallback',
  };
}

export interface AiPromptRequest {
  prompt: string;
  systemPrompt?: string;
  model?: string;
  maxTokens?: number;
  webSearch?: boolean;
}

export interface AiProxyRequest extends AiPromptRequest {
  asyncMode?: boolean;
  connectionId?: string;
  appName?: AiConfigAppSlug;
}

export interface AiUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface AiTextResponse {
  content: string;
  model: string;
  provider: AiProviderId;
  usage?: AiUsage;
  stopReason?: string;
}

export interface AiAsyncStartResponse {
  jobId: string;
}

export interface AiErrorMessage {
  type: 'error';
  jobId?: string;
  message: string;
}

export const exampleAiRuntimeConfigResponse = {
  platformDefault: {
    pk: AI_CONFIG_PK,
    sk: PLATFORM_DEFAULT_SK,
    provider: 'claude',
    model: 'claude-sonnet-4-6',
    updatedAt: '2026-06-07T00:00:00.000Z',
  },
  appOverrides: {
    'stock-analyser': null,
    'budget-tracker': null,
  },
  effective: {
    'stock-analyser': {
      provider: 'claude',
      model: 'claude-sonnet-4-6',
      source: 'platform_default',
    },
    'budget-tracker': {
      provider: 'claude',
      model: 'claude-sonnet-4-6',
      source: 'platform_default',
    },
  },
  supportedModels: AI_MODEL_ALLOWLIST,
} as const satisfies AiRuntimeConfigResponse;

export const exampleAppAiRuntimeConfigResponse = {
  appSlug: 'budget-tracker',
  platformDefault: {
    pk: AI_CONFIG_PK,
    sk: PLATFORM_DEFAULT_SK,
    provider: 'claude',
    model: 'claude-sonnet-4-6',
    updatedAt: '2026-06-07T00:00:00.000Z',
  },
  appOverride: null,
  effective: {
    provider: 'claude',
    model: 'claude-sonnet-4-6',
    source: 'platform_default',
  },
  supportedModels: AI_MODEL_ALLOWLIST,
} as const satisfies AppAiRuntimeConfigResponse;
