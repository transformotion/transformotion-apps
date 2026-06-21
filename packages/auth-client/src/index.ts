import { CognitoAuthService } from './cognito-auth'
import { createMockAuthService } from './mock-auth'

export interface User {
  id: string
  email: string
  name: string
  avatarUrl?: string
  /**
   * Admin status (M16 Phase 6 / D11):
   *  - `siteAdmin: boolean` — from the `site-admin` Cognito group (`cognito:groups`).
   *    The `site_admin` token claim was removed (m16.2.0); the group is the sole source.
   *  - `appAdmin: string[]` — app slugs derived from the `{app}-app-admin` Cognito
   *    groups (`cognito:groups`). The `app_admin` token claim was struck (M11);
   *    the groups are the sole source, mirroring `siteAdmin`.
   *  - `appAccess: string[]` — app slugs the user may ENTER, derived from the
   *    `{app}-app-access` Cognito groups (`cognito:groups`). Groups-authoritative
   *    (M11): the launchpad gate keys on this, NOT membership — a user holding the
   *    access group with zero accounts is the valid "access, no accounts" state.
   * UI gates admin surfaces on siteAdmin/appAdmin, and the app tiles on appAccess.
   */
  metadata?: Record<string, unknown>
}

export interface Account {
  id: string
  name: string
  type: 'personal' | 'business' | 'family'
  /**
   * M16 account role vocabulary (D10): owner | manager | member | viewer.
   * Replaces the legacy `owner | admin | member`. Matches AccountRole in
   * @transformotion/contracts/_shared/auth (kept inline to avoid a contracts
   * dependency in this low-level package).
   */
  role: 'owner' | 'manager' | 'member' | 'viewer'
}

export interface AuthTokens {
  accessToken:  string   // JWT for API authorisation
  idToken:      string   // JWT with user identity claims
  refreshToken: string   // For token refresh
  expiresAt:    number   // Unix timestamp
}

export interface AuthSession {
  user:           User
  tokens:         AuthTokens
  currentAccount: Account
}

export interface SignInCredentials {
  email:    string
  password: string
}

export interface SignUpCredentials {
  email:    string
  password: string
  name:     string
}

/**
 * A federated IdP to send the Hosted UI straight to (skips the chooser) — Amplify's
 * `signInWithRedirect` `provider`. Built-in social providers are bare strings; a
 * CUSTOM OIDC/SAML provider (e.g. Microsoft, registered as a custom provider named
 * "Microsoft") must use the `{ custom }` form, or Amplify won't emit
 * `identity_provider=<name>` on `/authorize` (#490).
 */
export type FederatedProvider = 'Google' | 'Facebook' | 'Amazon' | 'Apple' | { custom: string }

/** Cross-app SSO hint: which IdP a user federated with (lowercase). */
export type IdpHint = 'google' | 'facebook' | 'microsoft'

export interface AuthService {
  /**
   * Stable session identity from the cached ID-token claims — the read-once
   * side of the #210 split (stable identity vs reactive account state). The
   * reactive, mutable per-app ACTIVE account is control-plane-owned (D7) and
   * lives in each app's account store, never here. `getAccountIdForApp` reads
   * the token's `accounts` claim (first membership) and is a legacy convenience
   * superseded by the control-plane active-account read in the app layer.
   */
  getCurrentUser():  Promise<User | null>
  getSession():      Promise<AuthSession | null>
  signIn(credentials: SignInCredentials):  Promise<AuthSession>
  signUp(credentials: SignUpCredentials):  Promise<AuthSession>
  signOut():         Promise<void>
  signInWithRedirect(options?: { provider?: FederatedProvider }): Promise<void>
  getAccessToken():  Promise<string | null>
  getIdToken():      Promise<string | null>
  refreshTokens():   Promise<AuthTokens>
  isTokenExpired():  boolean
  listAccounts():    Promise<Account[]>
  switchAccount(accountId: string):        Promise<AuthSession>
  onAuthStateChange(callback: (session: AuthSession | null) => void): () => void
  /** Returns the first accountId for the given appSlug from the `accounts` JWT claim. */
  getAccountIdForApp(appSlug: string):     Promise<string | null>
  /**
   * Returns ALL account memberships for the given appSlug from the `accounts`
   * JWT claim (lean triples — accountId + role). Used to populate per-app
   * account selectors; the ACTIVE selection still comes from the control plane.
   */
  getAccountsForApp(appSlug: string):      Promise<Array<{ accountId: string; role: string }>>
}

export { MockAuthService, createMockAuthService } from './mock-auth'
export { CognitoAuthService } from './cognito-auth'

export function createAuthService(
  appSlug?: string,
  options?: { provider: 'mock' | 'cognito' }
): AuthService {
  if (options?.provider === 'cognito') {
    return new CognitoAuthService(appSlug)
  }
  return createMockAuthService()
}

// ---------------------------------------------------------------------------
// Federated cross-app SSO hint (#490)
// ---------------------------------------------------------------------------
// Native (Cognito directory) users have a reusable Hosted-UI session, so crossing
// from one app-client to another SSOs silently. Federated users do NOT — Cognito
// shows the chooser unless `/authorize` names the IdP (`identity_provider=<X>`,
// which "redirects silently to your IdP"). The launchpad reads which IdP the user
// federated with and passes it to each app, which re-federates silently. These
// helpers are shared so launchpad + Stock Analyser + Budget Tracker map identically
// (no cross-app imports). Unknown/native → no hint → the chooser (today's behaviour).

/** Decode a JWT payload (browser-safe base64url). Returns {} on any failure. */
function decodeJwtPayload(token: string): Record<string, unknown> {
  try {
    const part = token.split('.')[1]
    if (!part) return {}
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/')
    const json = decodeURIComponent(
      atob(b64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join(''),
    )
    return JSON.parse(json) as Record<string, unknown>
  } catch {
    return {}
  }
}

/**
 * The IdP a user federated with, derived from the idToken `identities` claim — or
 * `null` for a NATIVE (Cognito directory) user, who has no `identities` claim. A
 * native user therefore gets NO hint and keeps silent local-session SSO untouched.
 */
export function providerHintFromIdToken(idToken: string | null | undefined): IdpHint | null {
  if (!idToken) return null
  const raw = decodeJwtPayload(idToken)['identities']
  let providerName = ''
  try {
    const identities = typeof raw === 'string' ? JSON.parse(raw) : raw
    if (Array.isArray(identities) && identities[0] && typeof identities[0] === 'object') {
      providerName = String((identities[0] as { providerName?: string }).providerName ?? '')
    }
  } catch {
    /* native — no identities */
  }
  const p = providerName.toLowerCase()
  if (p.includes('google')) return 'google'
  if (p.includes('facebook')) return 'facebook'
  if (p.includes('microsoft') || p.includes('azure')) return 'microsoft'
  return null
}

/**
 * Map a cross-app `?idp=` hint to the Amplify `provider` that sends Cognito straight
 * to that IdP. Unknown/absent → `undefined` (fall back to the chooser — fail-open).
 * Microsoft is a CUSTOM provider, so it uses `{ custom: 'Microsoft' }` (the Cognito
 * provider name) — a bare string would NOT produce `identity_provider=Microsoft`.
 */
export function idpHintToProvider(hint: string | null | undefined): FederatedProvider | undefined {
  switch ((hint ?? '').toLowerCase()) {
    case 'google':
      return 'Google'
    case 'facebook':
      return 'Facebook'
    case 'microsoft':
      return { custom: 'Microsoft' }
    default:
      return undefined
  }
}
