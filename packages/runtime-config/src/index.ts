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
 * @see CONTRIBUTING.md Section 5.8 for the canonical pattern documentation.
 */

export type RuntimeProfile = 'mock' | 'live'

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
