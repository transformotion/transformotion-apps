/**
 * Authentication Service Interface
 * 
 * OIDC-compliant authentication abstraction.
 * Current: Mock implementation
 * Future: Cognito with OIDC tokens
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
  accessToken: string       // JWT for API authorization
  idToken: string          // JWT with user identity claims
  refreshToken: string     // For token refresh
  expiresAt: number        // Unix timestamp
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
  /**
   * Get current authenticated user, or null if not signed in.
   */
  getCurrentUser(): Promise<User | null>

  /**
   * Get current session including tokens.
   */
  getSession(): Promise<AuthSession | null>

  /**
   * Sign in with credentials.
   */
  signIn(credentials: SignInCredentials): Promise<AuthSession>

  /**
   * Sign up new user.
   */
  signUp(credentials: SignUpCredentials): Promise<AuthSession>

  /**
   * Sign out current user.
   */
  signOut(): Promise<void>

  /**
   * Get access token for API calls.
   * Returns null if not authenticated.
   */
  getAccessToken(): Promise<string | null>

  /**
   * Get ID token with user claims.
   * Returns null if not authenticated.
   */
  getIdToken(): Promise<string | null>

  /**
   * Refresh expired tokens.
   */
  refreshTokens(): Promise<AuthTokens>

  /**
   * Check if current access token is expired.
   */
  isTokenExpired(): boolean

  /**
   * Get available accounts for current user.
   */
  listAccounts(): Promise<Account[]>

  /**
   * Switch to a different account.
   */
  switchAccount(accountId: string): Promise<AuthSession>

  /**
   * Subscribe to auth state changes.
   */
  onAuthStateChange(callback: (session: AuthSession | null) => void): () => void
}

// Re-export the mock implementation as default
export { MockAuthService, createMockAuthService } from './mock-auth'
