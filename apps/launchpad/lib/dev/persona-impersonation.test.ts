import { beforeEach, describe, expect, it, vi } from 'vitest'

// The seam routes the mint through the control-plane URL — set it before
// importing anything that resolves config. (Client ids now come from the mint
// response per app-client, not from env — cross-app, #479.)
process.env.NEXT_PUBLIC_LAUNCHPAD_CONTROL_PLANE_API_URL = 'https://cp.example.test/dev/'

import {
  startImpersonation,
  stopImpersonation,
  getImpersonator,
  isImpersonating,
} from './persona-impersonation'

// Three app-clients in the one pool (Launchpad, Stock Analyser, Budget Tracker).
const LP = 'lpclient'
const SA = 'saclient'
const BT = 'btclient'
const prefix = (clientId: string) => `CognitoIdentityServiceProvider.${clientId}`

/** Minimal unsigned JWT with the given claims (browser-style base64url). */
function jwt(claims: Record<string, unknown>): string {
  const part = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url')
  return `${part({ alg: 'none' })}.${part(claims)}.sig`
}

/** Seed a tester session for one app-client namespace. */
function seedSession(clientId: string, sub: string, email: string, given: string, family: string): void {
  const base = `${prefix(clientId)}.${sub}`
  localStorage.setItem(`${prefix(clientId)}.LastAuthUser`, sub)
  localStorage.setItem(`${base}.idToken`, jwt({ email, given_name: given, family_name: family }))
  localStorage.setItem(`${base}.accessToken`, jwt({ username: sub, sub }))
  localStorage.setItem(`${base}.refreshToken`, `r-${sub}`)
  localStorage.setItem(`${base}.clockDrift`, '0')
}

/** A B2 mint response: one session per app-client for the persona. */
function mintResponse(sub: string, email: string, given: string, family: string) {
  const session = (app: string, clientId: string) => ({
    app,
    clientId,
    idToken: jwt({ email, given_name: given, family_name: family }),
    accessToken: jwt({ username: sub, sub }),
    refreshToken: `r-${sub}`,
  })
  return {
    ok: true,
    status: 200,
    json: async () => ({
      personaId: email.split('.')[0],
      email,
      sessions: [session('launchpad', LP), session('stock-analyser', SA), session('budget-tracker', BT)],
    }),
  }
}

const lastUser = (clientId: string) => localStorage.getItem(`${prefix(clientId)}.LastAuthUser`)

beforeEach(() => {
  const store = new Map<string, string>()
  const mock = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() {
      return store.size
    },
  }
  vi.stubGlobal('localStorage', mock)
  vi.stubGlobal('window', { location: { reload: vi.fn() } })
  // Tester (Steve) is signed into Launchpad AND Stock Analyser; has never opened
  // Budget Tracker (its namespace is empty).
  seedSession(LP, 'steve-sub', 'steve@example.com', 'Steve', 'Moodie')
  seedSession(SA, 'steve-sub', 'steve@example.com', 'Steve', 'Moodie')
})

describe('cross-app persona impersonation seam (#479)', () => {
  it('swaps EVERY app-client namespace and preserves the original tester across hops', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => mintResponse('priya-sub', 'priya.nair@example.com', 'Priya', 'Nair')))

    // Hop 1: Steve → Priya. All three app-clients now hold Priya (so SA/BT also
    // see her on navigation), and the tester (Steve) is parked.
    const r1 = await startImpersonation('priya')
    expect(r1).toEqual({ ok: true })
    expect(lastUser(LP)).toBe('priya-sub')
    expect(lastUser(SA)).toBe('priya-sub') // ← the cross-app fix: SA is Priya, not Steve
    expect(lastUser(BT)).toBe('priya-sub')
    expect(isImpersonating()).toBe(true)
    expect(getImpersonator()?.email).toBe('steve@example.com')

    // Hop 2: Priya → Marcus WITHOUT switching back — snapshot must NOT be overwritten.
    vi.stubGlobal('fetch', vi.fn(async () => mintResponse('marcus-sub', 'marcus.webb@example.com', 'Marcus', 'Webb')))
    const r2 = await startImpersonation('marcus')
    expect(r2).toEqual({ ok: true })
    expect(lastUser(LP)).toBe('marcus-sub')
    expect(lastUser(SA)).toBe('marcus-sub')
    expect(getImpersonator()?.email).toBe('steve@example.com') // still STEVE, not Priya

    // Switch back → restores the ORIGINAL tester across the apps he had, and the
    // app he never opened (BT) goes back to empty (no stale persona session).
    stopImpersonation()
    expect(isImpersonating()).toBe(false)
    expect(getImpersonator()).toBeNull()
    expect(lastUser(LP)).toBe('steve-sub')
    expect(lastUser(SA)).toBe('steve-sub')
    expect(lastUser(BT)).toBeNull() // never seeded → cleared, not left as Marcus
    expect(localStorage.getItem(`${prefix(LP)}.steve-sub.refreshToken`)).toBe('r-steve-sub')
  })

  it('rejects a disabled/unknown persona (403) without mutating any session', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 403, json: async () => ({}) })))
    const r = await startImpersonation('leo')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/disabled/i)
    expect(isImpersonating()).toBe(false)
    expect(lastUser(LP)).toBe('steve-sub')
    expect(lastUser(SA)).toBe('steve-sub')
  })

  it('stopImpersonation is a no-op when not impersonating', () => {
    expect(isImpersonating()).toBe(false)
    stopImpersonation()
    expect(lastUser(LP)).toBe('steve-sub')
  })
})
