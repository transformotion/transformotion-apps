import { beforeEach, describe, expect, it, vi } from 'vitest'
import { REDEEM_RETURN_KEY, takeRedeemReturnTarget } from './seam'

// seam.ts reads window.sessionStorage — shim a Map-backed one (node env).
beforeEach(() => {
  const store = new Map<string, string>()
  const sessionStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
  }
  vi.stubGlobal('window', { sessionStorage })
})

describe('takeRedeemReturnTarget (#483 — destructive, call-once)', () => {
  it('returns the redeem target AND consumes the key (so a second read cannot reuse it)', () => {
    window.sessionStorage.setItem(REDEEM_RETURN_KEY, 'e0bb2b06-d794-431c-9a28-e99b2fb62bf6')

    // First call (the single guarded navigation) → redeem target, key cleared.
    expect(takeRedeemReturnTarget()).toBe('/redeem?bundle=e0bb2b06-d794-431c-9a28-e99b2fb62bf6')
    expect(window.sessionStorage.getItem(REDEEM_RETURN_KEY)).toBeNull()

    // ★ The bug: a SECOND read (the un-guarded double-trigger) now sees an empty
    // key and returns `/`. The callback's navigatedRef guard prevents this second
    // call from happening at all; this asserts WHY the guard is required.
    expect(takeRedeemReturnTarget()).toBe('/')
  })

  it('returns `/` for a normal (non-redemption) sign-in with no stashed bundle', () => {
    expect(takeRedeemReturnTarget()).toBe('/')
  })

  it('url-encodes the bundle id', () => {
    window.sessionStorage.setItem(REDEEM_RETURN_KEY, 'a b/c&d')
    expect(takeRedeemReturnTarget()).toBe('/redeem?bundle=a%20b%2Fc%26d')
  })
})
