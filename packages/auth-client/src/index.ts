/**
 * @transformotion/auth-client
 *
 * Shared authentication interfaces used by all Transformotion apps.
 * Apps import these types and implement them via Cognito (production)
 * or a mock (local/v0 preview).
 *
 * Real implementation lives in apps/<app>/lib/services/auth/cognito-auth.ts
 * Mock implementation lives in apps/<app>/lib/services/auth/mock-auth.ts
 */

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
  accessToken: string       // JWT for API authorisation
  idToken: string           // JWT with user identity claims
  refreshToken: string      // For token refresh
  expiresAt: number         // Unix timestamp
}

export interface AuthSession {
  user: User
  tokens: AuthTokens
  currentAccount: Account
}

export interface SignInCredentials {
  email: string
  password: string
}

export interface SignUpCredentials {
  email: string
  password: string
  name: string
}

export interface AuthService {
  getCurrentUser(): Promise<User | null>
  getSession(): Promise<AuthSession | null>
  signIn(credentials: SignInCredentials): Promise<AuthSession>
  signUp(credentials: SignUpCredentials): Promise<AuthSession>
  signOut(): Promise<void>
  getAccessToken(): Promise<string | null>
  getIdToken(): Promise<string | null>
  refreshTokens(): Promise<AuthTokens>
  isTokenExpired(): boolean
  listAccounts(): Promise<Account[]>
  switchAccount(accountId: string): Promise<AuthSession>
  onAuthStateChange(callback: (session: AuthSession | null) => void): () => void
}
