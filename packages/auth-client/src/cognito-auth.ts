'use client'

import { Amplify } from 'aws-amplify'
import {
  signIn as amplifySignIn,
  signOut as amplifySignOut,
  signUp as amplifySignUp,
  getCurrentUser,
  fetchAuthSession,
  fetchUserAttributes,
} from 'aws-amplify/auth'
import type { AuthService, AuthSession, AuthTokens, User, Account, SignInCredentials, SignUpCredentials } from './index'

export class CognitoAuthService implements AuthService {
  constructor(private readonly appSlug?: string) {
    Amplify.configure({
      Auth: {
        Cognito: {
          userPoolId:       process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID!,
          userPoolClientId: process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID!,
          loginWith: {
            oauth: {
              domain:          process.env.NEXT_PUBLIC_COGNITO_DOMAIN!,
              scopes:          ['openid', 'email', 'profile'],
              redirectSignIn:  [`${process.env.NEXT_PUBLIC_APP_URL}/callback`],
              redirectSignOut: [process.env.NEXT_PUBLIC_APP_URL!],
              responseType:    'code' as const,
            },
          },
        },
      },
    })
  }

  async getCurrentUser(): Promise<User | null> {
    try {
      const [cognitoUser, attributes] = await Promise.all([
        getCurrentUser(),
        fetchUserAttributes(),
      ])
      return {
        id:    cognitoUser.userId,
        email: attributes.email ?? '',
        name:  [attributes.given_name, attributes.family_name].filter(Boolean).join(' ')
               || attributes.email
               || '',
      }
    } catch {
      return null
    }
  }

  async getSession(): Promise<AuthSession | null> {
    try {
      const [user, amplifySession] = await Promise.all([
        this.getCurrentUser(),
        fetchAuthSession(),
      ])
      if (!user || !amplifySession.tokens) return null
      const tokens = this.buildTokens(amplifySession)
      const accountId = this.appSlug ? await this.getAccountIdForApp(this.appSlug) : null
      const currentAccount: Account = {
        id:   accountId ?? user.id,
        name: user.name,
        type: 'personal',
        role: 'owner',
      }
      return { user, tokens, currentAccount }
    } catch {
      return null
    }
  }

  async signIn(credentials: SignInCredentials): Promise<AuthSession> {
    try {
      const { isSignedIn, nextStep } = await amplifySignIn({
        username: credentials.email,
        password: credentials.password,
      })
      if (!isSignedIn) throw new Error(`Additional step required: ${nextStep.signInStep}`)
    } catch (err) {
      if (err instanceof Error && err.message?.includes('already a signed in user')) {
        await amplifySignOut()
        const { isSignedIn, nextStep } = await amplifySignIn({
          username: credentials.email,
          password: credentials.password,
        })
        if (!isSignedIn) throw new Error(`Additional step required: ${nextStep.signInStep}`)
      } else {
        throw err
      }
    }
    const session = await this.getSession()
    if (!session) throw new Error('Could not retrieve session after sign in')
    return session
  }

  async signUp(credentials: SignUpCredentials): Promise<AuthSession> {
    const parts     = credentials.name.trim().split(/\s+/)
    const givenName = parts[0] ?? credentials.name
    await amplifySignUp({
      username: credentials.email,
      password: credentials.password,
      options: {
        userAttributes: {
          email:       credentials.email,
          given_name:  givenName,
          ...(parts.length > 1 ? { family_name: parts.slice(1).join(' ') } : {}),
        },
      },
    })
    // Cognito requires email confirmation before sign-in. The caller should
    // catch this error and show a confirmation-code form.
    throw new Error('CONFIRM_SIGN_UP: check your email for a verification code')
  }

  async signOut(): Promise<void> {
    await amplifySignOut()
  }

  async getAccessToken(): Promise<string | null> {
    try {
      const session = await fetchAuthSession()
      return session.tokens?.accessToken?.toString() ?? null
    } catch {
      return null
    }
  }

  async getIdToken(): Promise<string | null> {
    try {
      const session = await fetchAuthSession()
      return session.tokens?.idToken?.toString() ?? null
    } catch {
      return null
    }
  }

  async refreshTokens(): Promise<AuthTokens> {
    const session = await fetchAuthSession({ forceRefresh: true })
    if (!session.tokens) throw new Error('Failed to refresh tokens')
    return this.buildTokens(session)
  }

  isTokenExpired(): boolean {
    // Amplify manages refresh transparently; always return false to delegate
    // to Amplify's internal expiry handling via fetchAuthSession.
    return false
  }

  async listAccounts(): Promise<Account[]> {
    if (!this.appSlug) return []
    const accountId = await this.getAccountIdForApp(this.appSlug)
    if (!accountId) return []
    const user = await this.getCurrentUser()
    return [{ id: accountId, name: user?.name ?? 'Account', type: 'personal', role: 'owner' }]
  }

  async switchAccount(_accountId: string): Promise<AuthSession> {
    const session = await this.getSession()
    if (!session) throw new Error('Not authenticated')
    return session
  }

  onAuthStateChange(callback: (session: AuthSession | null) => void): () => void {
    callback(null)
    return () => {}
  }

  async getAccountIdForApp(appSlug: string): Promise<string | null> {
    try {
      const session = await fetchAuthSession()
      const raw = session.tokens?.idToken?.payload?.['accounts'] as string | undefined
      if (!raw) return null
      const map = JSON.parse(raw) as Record<string, Array<{ accountId: string }>>
      return map[appSlug]?.[0]?.accountId ?? null
    } catch {
      return null
    }
  }

  private buildTokens(
    amplifySession: Awaited<ReturnType<typeof fetchAuthSession>>,
  ): AuthTokens {
    const accessToken = amplifySession.tokens?.accessToken
    const exp = (accessToken?.payload?.['exp'] as number | undefined) ?? 0
    return {
      accessToken:  accessToken?.toString()                          ?? '',
      idToken:      amplifySession.tokens?.idToken?.toString()       ?? '',
      refreshToken: '',
      expiresAt:    exp * 1000,
    }
  }
}
