'use client'

/**
 * Dev persona impersonation seam — the LIVE "switch to persona" implementation
 * behind v0's prototyped surface (transformotion-apps-b8
 * components/launchpad/data/auth-service.ts @ 0fbc9e3:
 * startImpersonation / stopImpersonation / getImpersonator).
 *
 * v0 mocked the swap by flipping a mock store's `currentUserId`. The runtime does
 * the REAL thing: it mints a genuine Cognito session for the persona (the B2
 * dev-only POST /api/dev/persona-token endpoint) and SWAPS it into this tab by
 * replacing the Amplify token store in localStorage, then reloads so every
 * surface (launchpad tiles, admin views, every `authService.getIdToken()` API
 * call) re-reads auth and genuinely authenticates AS the persona. Same-tab
 * replace (v0 decision 2a).
 *
 * HOP-PRESERVE (behavioral conformance): the tester's ORIGINAL session is
 * snapshotted on the FIRST impersonation only and never overwritten on later
 * hops, so Steve → Priya → Ava → "switch back" returns to STEVE, not Priya.
 * `stopImpersonation` restores that first snapshot.
 *
 * SECURITY: dev-tool only. This is NOT a security boundary — it can only obtain
 * a persona session because the B2 endpoint exists (dev-only, stack-gated +
 * runtime-stage-gated + allow-listed) and mints from seeded persona passwords.
 * In prod the endpoint does not exist, so a swap cannot be minted.
 */

import { controlPlaneUrl } from '@/lib/services/control-plane'

/** localStorage key holding the tester's parked session during impersonation. */
const SNAPSHOT_KEY = 'launchpad.persona-switcher.impersonator.v1'

/** The tester's own identity, decoded for the banner ("you are Y"). */
export interface ImpersonatorIdentity {
  email: string
  label: string
}

interface Snapshot {
  /** The tester's original Amplify token-store entries (verbatim key→value). */
  amplifyKeys: Record<string, string>
  /** The tester's decoded identity (for the banner). */
  identity: ImpersonatorIdentity
}

/** One minted app-client session from the B2 endpoint (cross-app, #479). */
interface MintSession {
  app: string
  clientId: string
  idToken: string
  accessToken: string
  refreshToken: string
}

export type ImpersonationOutcome = { ok: true } | { ok: false; error: string }

// Root of EVERY Amplify v6 Cognito token-store key, across all app-clients
// (Launchpad, Stock Analyser, Budget Tracker) — they share this origin's
// localStorage, namespaced per clientId. Cross-app impersonation (#479) swaps
// and snapshots ALL of them, so a persona carries into SA/BT, not just LP.
const COGNITO_ROOT = 'CognitoIdentityServiceProvider.'

function hasWindow(): boolean {
  return typeof window !== 'undefined'
}

/** Decode a JWT payload (browser-safe base64url). Returns {} on any failure. */
function decodeJwt(token: string): Record<string, unknown> {
  try {
    const part = token.split('.')[1]
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

/** Read ALL Amplify token-store entries across every app-client (the live sessions). */
function readAmplifyKeys(): Record<string, string> {
  const out: Record<string, string> = {}
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (k && k.startsWith(COGNITO_ROOT)) {
      const v = localStorage.getItem(k)
      if (v !== null) out[k] = v
    }
  }
  return out
}

/** Remove ALL Amplify token-store entries across every app-client. */
function clearAmplifyKeys(): void {
  // Collect first (removing during the index walk would shift indices). Uses the
  // canonical indexed Storage API, matching readAmplifyKeys.
  const toRemove: string[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (k && k.startsWith(COGNITO_ROOT)) toRemove.push(k)
  }
  toRemove.forEach((k) => localStorage.removeItem(k))
}

/** Write a verbatim Amplify key set back into the token store. */
function writeAmplifyKeys(keys: Record<string, string>): void {
  for (const [k, v] of Object.entries(keys)) localStorage.setItem(k, v)
}

/** Identity from a minted/stored idToken, for the parked-session banner. */
function identityFromIdToken(idToken: string): ImpersonatorIdentity {
  const claims = decodeJwt(idToken)
  const email = (claims['email'] as string) ?? ''
  const given = claims['given_name'] as string | undefined
  const family = claims['family_name'] as string | undefined
  const label = given && family ? `${given} ${family}` : (given ?? email)
  return { email, label }
}

/**
 * Write one minted app-client session into its Amplify token-store namespace.
 * Cognito (this pool) uses an email alias, so the access token's `username`
 * equals the sub; Amplify keys are namespaced by clientId then username, with
 * `LastAuthUser` pointing at it.
 *
 * ⚠ COUPLING: this writes Amplify v6's localStorage token-store format directly
 * (`CognitoIdentityServiceProvider.<clientId>.<user>.{idToken,accessToken,
 * refreshToken,clockDrift}` + `.LastAuthUser`) so the swap is a CONSISTENT
 * same-tab replace — every surface that reads Amplify (not just authService)
 * sees the persona. It BREAKS if Amplify changes this storage format on upgrade;
 * if so, update the key shape HERE. Dev-only — blast radius is the persona
 * switcher only, never prod or real auth.
 */
function writeSession(session: MintSession): void {
  const access = decodeJwt(session.accessToken)
  const username =
    (access['username'] as string) ??
    (access['sub'] as string) ??
    (decodeJwt(session.idToken)['cognito:username'] as string) ??
    (decodeJwt(session.idToken)['sub'] as string) ??
    ''
  const prefix = `${COGNITO_ROOT}${session.clientId}`
  const base = `${prefix}.${username}`
  localStorage.setItem(`${prefix}.LastAuthUser`, username)
  localStorage.setItem(`${base}.idToken`, session.idToken)
  localStorage.setItem(`${base}.accessToken`, session.accessToken)
  localStorage.setItem(`${base}.refreshToken`, session.refreshToken)
  localStorage.setItem(`${base}.clockDrift`, '0')
}

/**
 * Replace EVERY app-client's token store with the minted persona sessions, so
 * the persona is active in Launchpad AND Stock Analyser / Budget Tracker on the
 * next navigation (#479). Clears all namespaces first (the snapshot already holds
 * the tester's originals) so no stale tester session lingers in any app.
 */
function writePersonaSessions(sessions: MintSession[]): void {
  clearAmplifyKeys()
  for (const session of sessions) writeSession(session)
}

function readSnapshot(): Snapshot | null {
  try {
    const raw = localStorage.getItem(SNAPSHOT_KEY)
    if (!raw) return null
    return JSON.parse(raw) as Snapshot
  } catch {
    return null
  }
}

/** Are we currently viewing-as a persona (a parked tester session exists)? */
export function isImpersonating(): boolean {
  if (!hasWindow()) return false
  return localStorage.getItem(SNAPSHOT_KEY) !== null
}

/**
 * The tester's OWN identity while impersonating (who "switch back" returns to),
 * or null when acting as themselves. Drives the "you are Y" banner.
 */
export function getImpersonator(): ImpersonatorIdentity | null {
  if (!hasWindow()) return null
  return readSnapshot()?.identity ?? null
}

/**
 * Begin impersonating a persona: mint a real session and swap it into this tab.
 * The tester's original session is captured on the FIRST hop only (preserved
 * across consecutive persona hops). Reloads on success. Disabled personas are
 * rejected (the server also refuses them).
 */
export async function startImpersonation(personaId: string): Promise<ImpersonationOutcome> {
  if (!hasWindow()) return { ok: false, error: 'Unavailable.' }

  let sessions: MintSession[]
  try {
    const res = await fetch(controlPlaneUrl('/api/dev/persona-token'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ personaId }),
    })
    if (!res.ok) {
      // 403 → disabled/unknown persona; 404 → endpoint not in this env (prod).
      const msg =
        res.status === 403
          ? 'That persona is disabled and cannot be minted a session.'
          : res.status === 404
            ? 'Persona mint endpoint is not available in this environment.'
            : `Mint failed (${res.status}).`
      return { ok: false, error: msg }
    }
    const body = (await res.json()) as { sessions?: MintSession[] }
    sessions = (body.sessions ?? []).filter(
      (s) => s && s.clientId && s.idToken && s.accessToken && s.refreshToken,
    )
    if (sessions.length === 0) {
      return { ok: false, error: 'Mint returned no usable sessions.' }
    }
  } catch {
    return { ok: false, error: 'Could not reach the persona mint endpoint.' }
  }

  // Capture the tester's ORIGINAL sessions (all app-clients) ONCE — never
  // overwrite across hops, so "switch back" returns to the FIRST tester.
  if (!isImpersonating()) {
    const amplifyKeys = readAmplifyKeys()
    const idTokenEntry = Object.entries(amplifyKeys).find(([k]) => k.endsWith('.idToken'))
    const identity = idTokenEntry ? identityFromIdToken(idTokenEntry[1]) : { email: '', label: 'your session' }
    const snapshot: Snapshot = { amplifyKeys, identity }
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snapshot))
  }

  writePersonaSessions(sessions)
  window.location.reload()
  return { ok: true }
}

/**
 * Stop impersonating and restore the tester's OWN session (the first snapshot).
 * No-op when not impersonating. Reloads so the app re-reads the restored session.
 */
export function stopImpersonation(): void {
  if (!hasWindow()) return
  const snapshot = readSnapshot()
  if (!snapshot) return
  clearAmplifyKeys()
  writeAmplifyKeys(snapshot.amplifyKeys)
  localStorage.removeItem(SNAPSHOT_KEY)
  window.location.reload()
}
