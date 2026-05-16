import { CognitoAuthService } from './cognito-auth'
import { createMockAuthService } from './mock-auth'

export interface User {
  id: string
  email: string
  name: string
  avatarUrl?: string
  metadata?: Record<string, unknown>
}

export interface Account {
  id: string
  name: string
  type: 'personal' | 'business' | 'family'
  role: 'owner' | 'admin' | 'member'
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
