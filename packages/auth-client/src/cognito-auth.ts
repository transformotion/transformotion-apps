'use client'

import { Amplify } from 'aws-amplify'
import {
  signIn as amplifySignIn,
  signOut as amplifySignOut,
  signUp as amplifySignUp,
  signInWithRedirect as amplifySignInWithRedirect,
  getCurrentUser as amplifyGetCurrentUser,
  fetchAuthSession,
} from 'aws-amplify/auth'
import { parseCognitoGroups } from '@transformotion/contracts/cognito-groups'
import { deriveAppAdmin, deriveAppAccess, type CognitoGroup } from '@transformotion/contracts/_shared/auth'
import { composeDisplayName } from './display'
import type { AuthService, AuthSession, AuthTokens, User, Account, SignInCredentials, SignUpCredentials, FederatedProvider } from './index'

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
              redirectSignIn:  [process.env.NEXT_PUBLIC_CALLBACK_URL ?? `${process.env.NEXT_PUBLIC_APP_URL}/callback`],
              redirectSignOut: [process.env.NEXT_PUBLIC_SIGNOUT_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? ''],
              responseType:    'code' as const,
            },
          },
        },
      },
    })
  }

  async getCurrentUser(): Promise<User | null> {
    try {
      const [cognitoUser, session] = await Promise.all([
        amplifyGetCurrentUser(),
        fetchAuthSession(),
      ])
      if (!session.tokens?.idToken) return null
      const claims     = session.tokens.idToken.payload
      const email      = claims['email'] as string
      const givenName  = (claims['given_name'] as string | undefined)?.trim() || undefined
      const familyName = (claims['family_name'] as string | undefined)?.trim() || undefined
      // The OIDC `name` claim — a full display name some IdPs send when they do NOT
      // also map given/family (Microsoft + Facebook map only `name`; #494). Used as
      // the next-best full name so federated users without given/family still show a
      // real name (and a correct first name once split) rather than the email.
      const nameClaim  = (claims['name'] as string | undefined)?.trim() || undefined
      // The user's EXPLICITLY-set display name, projected from the control-plane
      // `launchpad-users.displayName` into this token claim by the pre-token trigger
      // (#501). Authoritative — the name set in Profile shows in every app.
      const displayName = (claims['display_name'] as string | undefined)?.trim() || undefined
      // M16 Phase 6 (D11): platform admin status comes from the `site-admin`
      // Cognito group. The earlier `site_admin` token claim was an unintended
      // projection of the same group and has been removed — the frontend now
      // consolidates on the group directly (read from `cognito:groups`). This is
      // artifact removal, not a behaviour change: the group is unchanged.
      const groups = parseCognitoGroups(claims['cognito:groups'] as string[] | string | undefined)
      const siteAdmin  = groups.includes('site-admin')
      // M11 groups-authoritative: app-admin status is derived from the
      // `{app}-app-admin` Cognito groups (`cognito:groups`), exactly like
      // `siteAdmin`. The former table-derived `app_admin` token claim was struck
      // (it duplicated group state); the group in the token is the sole signal.
      const appAdmin   = deriveAppAdmin(groups as CognitoGroup[])
      // M11 groups-authoritative: apps the user may ENTER come from the
      // `{app}-app-access` groups (the launchpad gate keys on this, not membership).
      const appAccess  = deriveAppAccess(groups as CognitoGroup[])
      // Name source order (#494/#501) — NEVER the full email; see composeDisplayName.
      const name       = composeDisplayName({ displayName, givenName, familyName, nameClaim, email })
      return { id: cognitoUser.userId, email, name, metadata: { siteAdmin, appAdmin, appAccess } }
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
    // global: true revokes the refresh token server-side AND redirects to the
    // Cognito logout endpoint, which clears the Hosted UI session cookie.
    // Without this, the cookie persists and sign-in pages that auto-trigger
    // signInWithRedirect silently re-authenticate the user.
    await amplifySignOut({ global: true })
  }

  async signInWithRedirect(options?: { provider?: FederatedProvider }): Promise<void> {
    // `provider` (built-in string OR `{ custom }`) becomes `identity_provider=<X>` on
    // /authorize → Cognito redirects silently to that IdP, skipping the chooser (#490).
    const args = options?.provider ? { provider: options.provider as never } : {}
    try {
      await amplifySignInWithRedirect(args)
    } catch (err) {
      const isAlreadyAuthenticated =
        err instanceof Error &&
        (err.name === 'UserAlreadyAuthenticatedException' ||
         err.message?.includes('already a signed in user'))
      if (!isAlreadyAuthenticated) throw err

      const session = await fetchAuthSession()
      if (session.tokens) {
        try {
          await amplifyGetCurrentUser()
          // Case 1: tokens belong to this client — user is genuinely authenticated.
          // The auth guard will pick up the authenticated state on next render.
          return
        } catch {
          // Case 2: tokens exist but getCurrentUser() failed — cross-client stale tokens
          // from another app (e.g. SA tokens in Launchpad's shared-origin localStorage).
          // Clear all Cognito storage and retry.
        }
      }
      // No tokens (stale inflightOAuth) or cross-client stale tokens — clear and retry.
      clearCognitoStorage()
      await amplifySignInWithRedirect(args)
    }
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

  async getAccountsForApp(appSlug: string): Promise<Array<{ accountId: string; role: string }>> {
    try {
      const session = await fetchAuthSession()
      const raw = session.tokens?.idToken?.payload?.['accounts'] as string | undefined
      if (!raw) return []
      const map = JSON.parse(raw) as Record<string, Array<{ accountId: string; role: string }>>
      return map[appSlug] ?? []
    } catch {
      return []
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

function clearCognitoStorage(): void {
  if (typeof window === 'undefined') return
  Object.keys(localStorage)
    .filter(k => k.startsWith('CognitoIdentityServiceProvider.') || k === 'amplify-signin-with-hostedUI')
    .forEach(k => localStorage.removeItem(k))
}
