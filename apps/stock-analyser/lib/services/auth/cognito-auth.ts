'use client'

/**
 * Cognito Auth
 *
 * Thin wrapper around AWS Amplify v6 auth methods.
 * Amplify.configure() is called once at module load — importing this module
 * is enough to initialise Amplify (see AmplifyProvider).
 */

import { Amplify } from 'aws-amplify'
import {
  signIn,
  signOut,
  signUp,
  confirmSignUp,
  getCurrentUser,
  fetchAuthSession,
  fetchUserAttributes,
  resetPassword,
  confirmResetPassword,
  signInWithRedirect,
} from 'aws-amplify/auth'

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

export interface CognitoUser {
  id:         string
  email:      string
  givenName:  string
  familyName: string
  groups:     string[]
}

export const cognitoAuth = {
  async signIn(email: string, password: string) {
    try {
      return await signIn({ username: email, password })
    } catch (err) {
      // Amplify throws this if a session already exists (e.g. after a page refresh
      // where the sign-in page renders before initialize() completes).
      // Sign out the stale session and retry with the new credentials.
      if (err instanceof Error && err.message?.includes('already a signed in user')) {
        await signOut()
        return signIn({ username: email, password })
      }
      throw err
    }
  },

  async signOut() {
    await signOut()
  },

  async signUp(email: string, password: string, givenName: string) {
    return signUp({
      username: email,
      password,
      options: {
        userAttributes: { email, given_name: givenName },
      },
    })
  },

  async confirmSignUp(email: string, code: string) {
    return confirmSignUp({ username: email, confirmationCode: code })
  },

  async getCurrentUser(): Promise<CognitoUser | null> {
    try {
      const [user, attributes, session] = await Promise.all([
        getCurrentUser(),
        fetchUserAttributes(),
        fetchAuthSession(),
      ])
      return {
        id:         user.userId,
        email:      attributes.email      ?? '',
        givenName:  attributes.given_name ?? '',
        familyName: attributes.family_name ?? '',
        groups:     (session.tokens?.accessToken?.payload?.['cognito:groups'] as string[]) ?? [],
      }
    } catch {
      return null
    }
  },

  async getAccessToken(): Promise<string | null> {
    try {
      const session = await fetchAuthSession()
      return session.tokens?.accessToken?.toString() ?? null
    } catch {
      return null
    }
  },

  /**
   * ID token for API Gateway CognitoUserPoolsAuthorizer.
   * API Gateway validates the `aud` claim which is present on the ID token,
   * not the access token.
   */
  async getIdToken(): Promise<string | null> {
    try {
      const session = await fetchAuthSession()
      return session.tokens?.idToken?.toString() ?? null
    } catch {
      return null
    }
  },

  /**
   * Returns the first accountId for the given appSlug from the `accounts` JWT
   * claim injected by the pre-token generation Lambda.
   *
   * Returns null when the claim is absent, malformed, or the user has no account
   * for this app yet — callers should handle the missing-account state gracefully.
   *
   * TODO: single-account assumption — picks accounts[appSlug][0]. Revisit when
   * multi-account UI lands and the user can select an active account.
   */
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
  },

  async resetPassword(email: string) {
    return resetPassword({ username: email })
  },

  async confirmResetPassword(email: string, code: string, newPassword: string) {
    return confirmResetPassword({ username: email, confirmationCode: code, newPassword })
  },

  async signInWithGoogle() {
    await signInWithRedirect({ provider: 'Google' })
  },

  async signInWithMicrosoft() {
    await signInWithRedirect({ provider: { custom: 'Microsoft' } })
  },

  async signInWithFacebook() {
    await signInWithRedirect({ provider: 'Facebook' })
  },
}
