import type { AuthService, User, Account, AuthSession, AuthTokens, SignInCredentials, SignUpCredentials } from './index'

const STORAGE_KEY = 'transformotion-auth-session'

const MOCK_USER: User = {
  id: 'user-1',
  email: 'user@example.com',
  name: 'Demo User',
  avatarUrl: undefined,
  metadata: { apps: ['stock-analyser', 'budget-tracker'], siteAdmin: true },
}

const MOCK_ACCOUNTS: Account[] = [
  { id: 'acc-personal', name: 'Personal', type: 'personal', role: 'owner' },
  { id: 'acc-business', name: 'Business', type: 'business', role: 'owner' },
]

function generateMockTokens(): AuthTokens {
  const now = Date.now()
  return {
    accessToken: `mock-access-${now}`,
    idToken: `mock-id-${now}`,
    refreshToken: `mock-refresh-${now}`,
    expiresAt: now + 3600 * 1000,
  }
}

export class MockAuthService implements AuthService {
  private session: AuthSession | null = null
  private listeners: Set<(session: AuthSession | null) => void> = new Set()

  constructor() {
    this.loadSession()
    if (!this.session) {
      this.session = {
        user: MOCK_USER,
        tokens: generateMockTokens(),
        currentAccount: MOCK_ACCOUNTS[0],
      }
      this.saveSession()
    }
  }

  private loadSession(): void {
    if (typeof window === 'undefined') return
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        this.session = JSON.parse(stored)
      }
    } catch {
      this.session = null
    }
  }

  private saveSession(): void {
    if (typeof window === 'undefined') return
    try {
      if (this.session) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.session))
      } else {
        localStorage.removeItem(STORAGE_KEY)
      }
    } catch {}
  }

  private notifyListeners(): void {
    this.listeners.forEach(cb => cb(this.session))
  }

  async getCurrentUser(): Promise<User | null> {
    return this.session?.user ?? null
  }

  async getSession(): Promise<AuthSession | null> {
    return this.session
  }

  async signIn(_credentials: SignInCredentials): Promise<AuthSession> {
    this.session = {
      user: MOCK_USER,
      tokens: generateMockTokens(),
      currentAccount: MOCK_ACCOUNTS[0],
    }
    this.saveSession()
    this.notifyListeners()
    return this.session
  }

  async signUp(credentials: SignUpCredentials): Promise<AuthSession> {
    this.session = {
      user: { ...MOCK_USER, email: credentials.email, name: credentials.name },
      tokens: generateMockTokens(),
      currentAccount: MOCK_ACCOUNTS[0],
    }
    this.saveSession()
    this.notifyListeners()
    return this.session
  }

  async signOut(): Promise<void> {
    this.session = null
    this.saveSession()
    this.notifyListeners()
  }

  async signInWithRedirect(_options?: { provider?: string }): Promise<void> {
    // Mirrors Cognito's full-page-navigation UX: seed session then reload so
    // the calling page (sign-in) re-mounts as authenticated.
    this.session = {
      user: MOCK_USER,
      tokens: generateMockTokens(),
      currentAccount: MOCK_ACCOUNTS[0],
    }
    this.saveSession()
    this.notifyListeners()
    if (typeof window !== 'undefined') {
      window.location.reload()
    }
  }

  async getAccessToken(): Promise<string | null> {
    if (!this.session) return null
    if (this.isTokenExpired()) await this.refreshTokens()
    return this.session?.tokens.accessToken ?? null
  }

  async getIdToken(): Promise<string | null> {
    if (!this.session) return null
    if (this.isTokenExpired()) await this.refreshTokens()
    return this.session?.tokens.idToken ?? null
  }

  async refreshTokens(): Promise<AuthTokens> {
    if (!this.session) throw new Error('No session to refresh')
    this.session.tokens = generateMockTokens()
    this.saveSession()
    return this.session.tokens
  }

  isTokenExpired(): boolean {
    if (!this.session) return true
    return Date.now() >= this.session.tokens.expiresAt
  }

  async listAccounts(): Promise<Account[]> {
    return MOCK_ACCOUNTS
  }

  async switchAccount(accountId: string): Promise<AuthSession> {
    if (!this.session) throw new Error('Not authenticated')
    const account = MOCK_ACCOUNTS.find(a => a.id === accountId)
    if (!account) throw new Error('Account not found')
    this.session.currentAccount = account
    this.saveSession()
    this.notifyListeners()
    return this.session
  }

  onAuthStateChange(callback: (session: AuthSession | null) => void): () => void {
    this.listeners.add(callback)
    callback(this.session)
    return () => this.listeners.delete(callback)
  }

  async getAccountIdForApp(_appSlug: string): Promise<string | null> {
    return this.session?.currentAccount?.id ?? null
  }
}

let _instance: MockAuthService | null = null

export function createMockAuthService(): AuthService {
  if (!_instance) {
    _instance = new MockAuthService()
  }
  return _instance
}
