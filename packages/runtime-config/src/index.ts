/**
 * Runtime configuration: profile + override pattern.
 *
 * The platform selects between provider implementations across architectural
 * concerns (auth, data, AI, cache, email, file storage) using a profile
 * variable plus optional per-concern overrides.
 *
 * Profile is set via NEXT_PUBLIC_RUNTIME_PROFILE ('mock' or 'live'; defaults
 * to 'mock' if unset). Each concern resolves to a default based on the profile;
 * an optional NEXT_PUBLIC_<CONCERN>_OVERRIDE env var, if set with a valid value,
 * overrides the profile's default for that concern.
 *
 * Canonical concern → override env var mapping:
 *   auth  → NEXT_PUBLIC_AUTH_OVERRIDE   (values: 'mock' | 'cognito')
 *   data  → NEXT_PUBLIC_DATA_OVERRIDE   (values: 'mock' | 'dynamo')
 *   ai    → NEXT_PUBLIC_AI_OVERRIDE     (values: 'mock' | 'claude')
 *
 * @see CONTRIBUTING.md Section 5.8 for the canonical pattern documentation.
 */

export type RuntimeProfile = 'mock' | 'live'

// ── Shared config sub-types ───────────────────────────────────────────────────

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
  apiUrl: string
}

export interface FeaturesConfig {
  debugMode: boolean
}

/** Unified cross-app URL config. Use `peers[appSlug]` for peer app URLs. */
export interface AppsConfig {
  signInUrl: string
  signOutUrl: string
  peers: Record<string, string>
}

// ── Config factory ────────────────────────────────────────────────────────────

/**
 * Creates a lazy singleton config accessor.
 * Each call to createConfig() produces an independent cache slot.
 * resetConfig() clears the cached instance (test isolation).
 */
export function createConfig<T>(factory: () => T): {
  getConfig: () => T
  resetConfig: () => void
} {
  let _config: T | null = null
  return {
    getConfig() {
      if (_config === null) _config = factory()
      return _config
    },
    resetConfig() {
      _config = null
    },
  }
}

/**
 * Resolves the active runtime profile from the environment.
 * Defaults to 'mock' if NEXT_PUBLIC_RUNTIME_PROFILE is unset or invalid —
 * preserving v0/local development without explicit configuration.
 */
export function resolveProfile(): RuntimeProfile {
  const value = process.env.NEXT_PUBLIC_RUNTIME_PROFILE
  return value === 'live' ? 'live' : 'mock'
}

interface SelectProviderArgs<T extends string> {
  /** The override env var value (typically process.env.NEXT_PUBLIC_<CONCERN>_OVERRIDE). Pass undefined if not overriding. */
  override: string | undefined
  /** Per-profile defaults — what each profile resolves to when no override is set. */
  profileDefaults: { mock: T; live: T }
  /** Valid values; the override is only honoured if it appears in this list. */
  validValues: readonly T[]
}

/**
 * Resolves the active provider for a single concern.
 *
 * @example
 * const authProvider = selectProvider({
 *   override: process.env.NEXT_PUBLIC_AUTH_OVERRIDE,
 *   profileDefaults: { mock: 'mock', live: 'cognito' },
 *   validValues: ['mock', 'cognito'],
 * });
 */
export function selectProvider<T extends string>(args: SelectProviderArgs<T>): T {
  const { override, profileDefaults, validValues } = args

  if (override !== undefined && (validValues as readonly string[]).includes(override)) {
    return override as T
  }

  const profile = resolveProfile()
  return profileDefaults[profile]
}

/**
 * Normalises a cross-app URL by ensuring it ends with exactly one trailing slash.
 *
 * Cross-app navigation depends on URL shapes matching CloudFront behaviour
 * patterns (which require trailing-prefix patterns like /budget-tracker/*).
 * A URL like 'https://dev.apps.transformotion.com.au/budget-tracker' (no
 * trailing slash) won't match the /budget-tracker/* behaviour and falls
 * through to the SPA fallback, causing a SyntaxError in the wrong app's
 * runtime.
 *
 * @param envValue - The env var value (often process.env.NEXT_PUBLIC_X_URL)
 * @param fallback - The fallback URL when env var is unset (typically a
 *                   local path for local dev, e.g. '/budget-tracker/')
 * @returns A URL guaranteed to end with exactly one trailing slash
 *
 * @example
 * normaliseCrossAppUrl(process.env.NEXT_PUBLIC_BUDGET_URL, '/budget-tracker/')
 *   // → 'https://dev.apps.transformotion.com.au/budget-tracker/' (slash added)
 *   //   or '/budget-tracker/' if env var is unset
 */
export * from './apps'

export function normaliseCrossAppUrl(
  envValue: string | undefined,
  fallback: string
): string {
  return (envValue || fallback).replace(/\/*$/, '/')
}
