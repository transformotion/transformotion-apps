/**
 * Cognito Hosted-UI redemption seam (A4)
 * ======================================
 * The runtime replacement for v0's MOCK IdP seam. Builds the contract
 * `AuthenticatedIdentity` from the REAL Cognito session, and owns the sign-in
 * round-trip:
 *   onRequestSignup → stash the bundleId → signInWithRedirect() (Hosted UI, which
 *   offers ALL configured providers: native/google/facebook/microsoft) →
 *   /launchpad/callback (reused, allow-listed) → return to /redeem?bundle=<id> →
 *   getRedemptionIdentity() reads the now-present session.
 *
 * The bundleId survives the OAuth round-trip via sessionStorage (same-tab,
 * same-origin) — no new Cognito callback URL is needed (reuse decision).
 */

'use client'

import { authService } from '@/lib/services/auth'
import type { AuthenticatedIdentity, IdpProvider } from '@transformotion/contracts/launchpad/redemption'

/** Key the callback reads to know it should return to a redemption, not `/`. */
export const REDEEM_RETURN_KEY = 'launchpad.redeem-return.v1'

/**
 * Consume the stashed redeem-return after the Hosted-UI round-trip: returns
 * `/redeem?bundle=<id>` when a redemption sign-in is in flight (clearing the key
 * so it is used once), else `/` (normal sign-in → Launchpad home).
 *
 * ⚠ DESTRUCTIVE — it removeItem's the key, so it must be invoked exactly once per
 * callback. The callback guards its two completion triggers (Hub event +
 * getCurrentUser fallback) so the key cannot be double-consumed (#483).
 */
export function takeRedeemReturnTarget(): string {
  try {
    const bundleId = window.sessionStorage.getItem(REDEEM_RETURN_KEY)
    if (bundleId) {
      window.sessionStorage.removeItem(REDEEM_RETURN_KEY)
      return `/redeem?bundle=${encodeURIComponent(bundleId)}`
    }
  } catch {
    /* no sessionStorage — fall through to home */
  }
  return '/'
}

/** Decode a JWT payload (no verification — claims are read for display only). */
function parseJwtPayload(token: string): Record<string, unknown> {
  try {
    const part = token.split('.')[1]
    if (!part) return {}
    const json = atob(part.replace(/-/g, '+').replace(/_/g, '/'))
    return JSON.parse(json) as Record<string, unknown>
  } catch {
    return {}
  }
}

/** Map the Cognito `identities` claim (federated) to our IdpProvider; else native. */
function providerFromClaims(claims: Record<string, unknown>): IdpProvider {
  const raw = claims['identities']
  let providerName = ''
  try {
    const identities = typeof raw === 'string' ? JSON.parse(raw) : raw
    if (Array.isArray(identities) && identities[0] && typeof identities[0] === 'object') {
      providerName = String((identities[0] as { providerName?: string }).providerName ?? '')
    }
  } catch {
    /* native (no identities) */
  }
  const p = providerName.toLowerCase()
  if (p.includes('google')) return 'google'
  if (p.includes('facebook')) return 'facebook'
  if (p.includes('microsoft') || p.includes('azure')) return 'microsoft'
  return 'native'
}

/**
 * Build the AuthenticatedIdentity from the current Cognito session, or null when
 * no one is signed in. The runtime swap-point for v0's mock `getMockIdpSession`.
 */
export async function getRedemptionIdentity(): Promise<AuthenticatedIdentity | null> {
  const user = await authService.getCurrentUser()
  if (!user) return null
  const idToken = await authService.getIdToken().catch(() => null)
  const claims = idToken ? parseJwtPayload(idToken) : {}
  const emailVerified = claims['email_verified'] === true || claims['email_verified'] === 'true'
  return {
    provider: providerFromClaims(claims),
    email: user.email,
    emailVerified,
    // Skip a raw-email `name` so display falls back to the email rather than
    // rendering it twice.
    displayName: user.name && user.name !== user.email ? user.name : undefined,
  }
}

/**
 * Begin sign-in for redemption: stash the bundle so the reused /launchpad/callback
 * returns here, then redirect to the Cognito Hosted UI (its chooser offers every
 * configured provider). Runtime swap-point for v0's mock signup navigation.
 */
export async function beginRedemptionSignIn(bundleId: string): Promise<void> {
  if (typeof window !== 'undefined') {
    window.sessionStorage.setItem(REDEEM_RETURN_KEY, bundleId)
  }
  await authService.signInWithRedirect()
}

/** Sign out (Option-D "use a different account") so the invitee can re-auth. */
export async function switchRedemptionIdentity(bundleId: string): Promise<void> {
  if (typeof window !== 'undefined') {
    window.sessionStorage.setItem(REDEEM_RETURN_KEY, bundleId)
  }
  await authService.signOut()
}
