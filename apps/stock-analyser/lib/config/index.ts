/**
 * Application Configuration
 *
 * Centralised configuration loaded from environment variables.
 * Sensitive keys (API_KEY, ANTHROPIC_API_KEY) are server-side only.
 * Client-safe keys use NEXT_PUBLIC_ prefix.
 */

import { selectProvider, normaliseCrossAppUrl } from '@transformotion/runtime-config'

export interface APIConfig {
  baseURL: string
  timeout: number
}

export interface AuthConfig {
  provider: 'mock' | 'cognito'
  cognitoUserPoolId?: string
  cognitoClientId?: string
  cognitoRegion?: string
}

export interface AIConfig {
  provider: 'mock' | 'anthropic'
  model: string
}

export interface StorageConfig {
  provider: 'local' | 'dynamo'
  dynamoTablePrefix?: string
  region?: string
}

export interface LoggingConfig {
  provider: 'console' | 'cloudwatch'
  level: 'debug' | 'info' | 'warn' | 'error'
  cloudwatchLogGroup?: string
}

export interface ClaudeConfig {
  /** Base URL for Claude API proxy (AWS API Gateway) */
  apiUrl: string
  /** Base URL for polling job status (analysis-cache Lambda) */
  cacheUrl: string
  /** Polling interval in ms */
  pollInterval: number
  /** Max polling duration in ms */
  maxPollTime: number
}

export interface FeaturesConfig {
  /** Use mock data instead of real API calls */
  useMockData: boolean
  /** Enable debug logging */
  debugMode: boolean
}

export interface AppsConfig {
  /** URL for the Budget Tracker app (cross-app navigation requires full page load) */
  budgetTrackerUrl: string
  /** URL for the Launchpad sign-in page; unauthenticated users are redirected here */
  signInUrl: string
  /** URL for the signed-out landing page; used by mock-profile signOut handler */
  signOutUrl: string
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
}

/**
 * Load configuration from environment variables.
 * Called once at app startup.
 */
export function loadConfig(): AppConfig {
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
      provider: (process.env.NEXT_PUBLIC_AI_PROVIDER as 'mock' | 'anthropic') || 'mock',
      model: process.env.NEXT_PUBLIC_AI_MODEL || 'claude-3-sonnet',
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
      apiUrl: process.env.NEXT_PUBLIC_CLAUDE_API_URL || '/api/claude',
      cacheUrl: process.env.NEXT_PUBLIC_CLAUDE_CACHE_URL || '/analysis-cache',
      pollInterval: parseInt(process.env.NEXT_PUBLIC_CLAUDE_POLL_INTERVAL || '2500', 10),
      maxPollTime: parseInt(process.env.NEXT_PUBLIC_CLAUDE_MAX_POLL_TIME || '500000', 10),
    },
    features: {
      useMockData: process.env.NEXT_PUBLIC_USE_MOCK_DATA !== 'false', // Default to true for dev
      debugMode: process.env.NEXT_PUBLIC_DEBUG_MODE === 'true',
    },
    apps: {
      budgetTrackerUrl: normaliseCrossAppUrl(process.env.NEXT_PUBLIC_BUDGET_URL, '/budget-tracker/'),
      signInUrl: normaliseCrossAppUrl(process.env.NEXT_PUBLIC_SIGNIN_URL, '/launchpad/sign-in/'),
      signOutUrl: normaliseCrossAppUrl(process.env.NEXT_PUBLIC_SIGNOUT_URL, '/launchpad/signed-out/'),
    },
  }
}

// Singleton config instance
let _config: AppConfig | null = null

export function getConfig(): AppConfig {
  if (!_config) {
    _config = loadConfig()
  }
  return _config
}

// Reset config (useful for testing)
export function resetConfig(): void {
  _config = null
}
