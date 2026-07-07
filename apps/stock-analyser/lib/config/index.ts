/**
 * Application Configuration
 *
 * Centralised configuration loaded from environment variables.
 * Sensitive keys (API_KEY, ANTHROPIC_API_KEY) are server-side only.
 * Client-safe keys use NEXT_PUBLIC_ prefix.
 */

import {
  selectProvider,
  normaliseCrossAppUrl,
  createConfig,
  type APIConfig,
  type AuthConfig,
  type StorageConfig,
  type LoggingConfig,
  type ClaudeConfig,
  type FeaturesConfig,
  type AppsConfig,
} from '@transformotion/runtime-config'
import { resolveConcurrencyLimit } from '@/lib/util/map-with-concurrency'

export interface AIConfig {
  provider: 'mock' | 'claude'
  model: string
  wssUrl: string
  saWssUrl: string
}

export interface ConcurrencyConfig {
  /**
   * Max tickers enriched concurrently by `portfolioService.enrichHoldings`
   * (Portfolio / Watchlist / Home). Bounds the burst of per-ticker Lambda
   * invocations so a single user's refresh can't saturate the account-level
   * Lambda concurrency quota. Env: `NEXT_PUBLIC_ENRICH_CONCURRENCY` (default 4;
   * raised per stage, e.g. 10 for prod).
   */
  enrich: number
}

/** Default in-flight ticker limit when the env var is unset (dev). */
const DEFAULT_ENRICH_CONCURRENCY = 4

export interface ControlPlaneConfig {
  /** Launchpad control-plane API base URL (includes the API Gateway stage). */
  apiUrl: string
}

export interface AppConfig {
  api: APIConfig
  auth: AuthConfig
  ai: AIConfig
  storage: StorageConfig
  logging: LoggingConfig
  claude: ClaudeConfig
  features: FeaturesConfig
  apps: AppsConfig
  controlPlane: ControlPlaneConfig
  concurrency: ConcurrencyConfig
}

export type {
  APIConfig,
  AuthConfig,
  StorageConfig,
  LoggingConfig,
  ClaudeConfig,
  FeaturesConfig,
  AppsConfig,
}

function loadConfig(): AppConfig {
  return {
    api: {
      baseURL: process.env.NEXT_PUBLIC_API_URL || '',
      timeout: 30000,
    },
    auth: {
      provider: selectProvider({
        override: process.env.NEXT_PUBLIC_AUTH_OVERRIDE,
        profileDefaults: { mock: 'mock', live: 'cognito' },
        validValues: ['mock', 'cognito'] as const,
      }),
      cognitoUserPoolId: process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID,
      cognitoClientId: process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID,
      cognitoRegion: process.env.NEXT_PUBLIC_COGNITO_REGION,
    },
    ai: {
      provider: selectProvider({
        override: process.env.NEXT_PUBLIC_AI_OVERRIDE,
        profileDefaults: { mock: 'mock', live: 'claude' },
        validValues: ['mock', 'claude'] as const,
      }),
      model:    process.env.NEXT_PUBLIC_AI_MODEL || 'claude-3-sonnet',
      wssUrl:   process.env.NEXT_PUBLIC_SA_WSS_URL || '',
      saWssUrl: process.env.NEXT_PUBLIC_SA_WSS_URL || '',
    },
    storage: {
      provider: selectProvider({
        override: process.env.NEXT_PUBLIC_DATA_OVERRIDE,
        profileDefaults: { mock: 'local', live: 'dynamo' },
        validValues: ['local', 'dynamo'] as const,
      }),
      dynamoTablePrefix: process.env.DYNAMODB_TABLE_PREFIX,
      region: process.env.AWS_REGION,
    },
    logging: {
      provider: (process.env.NEXT_PUBLIC_LOG_PROVIDER as 'console' | 'cloudwatch') || 'console',
      level: (process.env.NEXT_PUBLIC_LOG_LEVEL as 'debug' | 'info' | 'warn' | 'error') || 'info',
      cloudwatchLogGroup: process.env.CLOUDWATCH_LOG_GROUP,
    },
    claude: {
      apiUrl: process.env.NEXT_PUBLIC_AI_API_URL || process.env.NEXT_PUBLIC_CLAUDE_API_URL || '/api/claude',
    },
    features: {
      debugMode: process.env.NEXT_PUBLIC_DEBUG_MODE === 'true',
    },
    apps: {
      signInUrl: normaliseCrossAppUrl(process.env.NEXT_PUBLIC_SIGNIN_URL, '/sign-in/'),
      signOutUrl: normaliseCrossAppUrl(process.env.NEXT_PUBLIC_SIGNOUT_URL, '/signed-out/'),
      peers: {
        'budget-tracker': normaliseCrossAppUrl(process.env.NEXT_PUBLIC_BUDGET_URL, '/budget-tracker/'),
      },
    },
    controlPlane: {
      apiUrl: process.env.NEXT_PUBLIC_LAUNCHPAD_CONTROL_PLANE_API_URL ?? '',
    },
    concurrency: {
      enrich: resolveConcurrencyLimit(
        process.env.NEXT_PUBLIC_ENRICH_CONCURRENCY,
        DEFAULT_ENRICH_CONCURRENCY,
      ),
    },
  }
}

export const { getConfig, resetConfig } = createConfig(loadConfig)
