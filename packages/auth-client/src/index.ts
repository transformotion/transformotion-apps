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
   *  - `appAdmin: string[]` — app slugs from the `app_admin` claim.
   * UI gates admin surfaces on these.
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
  signInWithRedirect(options?: { provider?: string }): Promise<void>
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
