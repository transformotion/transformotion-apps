import { beforeEach, describe, expect, it, vi } from 'vitest'

// The seam reads NEXT_PUBLIC_COGNITO_CLIENT_ID (Amplify key prefix) and routes
// the mint through the control-plane URL — set both before importing anything
// that resolves config.
const CLIENT_ID = 'testclient'
process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID = CLIENT_ID
process.env.NEXT_PUBLIC_LAUNCHPAD_CONTROL_PLANE_API_URL = 'https://cp.example.test/dev/'

import {
  startImpersonation,
  stopImpersonation,
  getImpersonator,
  isImpersonating,
} from './persona-impersonation'

const PREFIX = `CognitoIdentityServiceProvider.${CLIENT_ID}`

/** Minimal unsigned JWT with the given claims (browser-style base64url). */
function jwt(claims: Record<string, unknown>): string {
  const part = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url')
  return `${part({ alg: 'none' })}.${part(claims)}.sig`
}

function seedTesterSession(): void {
  localStorage.clear()
  localStorage.setItem(`${PREFIX}.LastAuthUser`, 'steve-sub')
  localStorage.setItem(
    `${PREFIX}.steve-sub.idToken`,
    jwt({ email: 'steve@example.com', given_name: 'Steve', family_name: 'Moodie' }),
  )
  localStorage.setItem(`${PREFIX}.steve-sub.accessToken`, jwt({ username: 'steve-sub', sub: 'steve-sub' }))
  localStorage.setItem(`${PREFIX}.steve-sub.refreshToken`, 'r-steve')
  localStorage.setItem(`${PREFIX}.steve-sub.clockDrift`, '0')
}

function mintFor(sub: string, email: string, given: string, family: string) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      idToken: jwt({ email, given_name: given, family_name: family }),
      accessToken: jwt({ username: sub, sub }),
      refreshToken: `r-${sub}`,
    }),
  }
}

function lastAuthUser(): string | null {
  return localStorage.getItem(`${PREFIX}.LastAuthUser`)
}

beforeEach(() => {
  // Fresh in-memory localStorage backed by a Map.
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
  // window.location.reload is a no-op in the test; localStorage persists across a
  // real reload, so the post-reload state IS the mutated store — this models it.
  vi.stubGlobal('window', { location: { reload: vi.fn() } })
  seedTesterSession()
})

describe('persona impersonation seam', () => {
  it('preserves the ORIGINAL tester across persona hops (Steve→Priya→Marcus→back→Steve)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => mintFor('priya-sub', 'priya.nair@example.com', 'Priya', 'Nair')),
    )

    // Hop 1: Steve → Priya. Snapshot captures Steve; the live session is Priya.
    const r1 = await startImpersonation('priya')
    expect(r1).toEqual({ ok: true })
    expect(lastAuthUser()).toBe('priya-sub')
    expect(isImpersonating()).toBe(true)
    expect(getImpersonator()?.email).toBe('steve@example.com')
    expect(getImpersonator()?.label).toBe('Steve Moodie')

    // Hop 2: Priya → Marcus WITHOUT switching back. Snapshot must NOT be
    // overwritten — switch-back still returns to the original (Steve).
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => mintFor('marcus-sub', 'marcus.webb@example.com', 'Marcus', 'Webb')),
    )
    const r2 = await startImpersonation('marcus')
    expect(r2).toEqual({ ok: true })
    expect(lastAuthUser()).toBe('marcus-sub')
    expect(getImpersonator()?.email).toBe('steve@example.com') // still STEVE, not Priya

    // Switch back → restores the ORIGINAL tester, not the previous hop.
    stopImpersonation()
    expect(isImpersonating()).toBe(false)
    expect(getImpersonator()).toBeNull()
    expect(lastAuthUser()).toBe('steve-sub')
    expect(localStorage.getItem(`${PREFIX}.steve-sub.refreshToken`)).toBe('r-steve')
  })

  it('rejects a disabled/unknown persona (403) without mutating the session', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 403, json: async () => ({}) })))
    const r = await startImpersonation('leo')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/disabled/i)
    expect(isImpersonating()).toBe(false)
    expect(lastAuthUser()).toBe('steve-sub') // untouched
  })

  it('stopImpersonation is a no-op when not impersonating', () => {
    expect(isImpersonating()).toBe(false)
    stopImpersonation()
    expect(lastAuthUser()).toBe('steve-sub')
  })
})
