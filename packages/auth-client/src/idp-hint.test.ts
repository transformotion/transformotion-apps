import { describe, it, expect } from 'vitest'
import { idpHintToProvider, providerHintFromIdToken } from './index'

/** Minimal unsigned JWT carrying the given claims (browser-style base64url). */
function jwt(claims: Record<string, unknown>): string {
  const part = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url')
  return `${part({ alg: 'none' })}.${part(claims)}.sig`
}

describe('idpHintToProvider — hint → Amplify provider (#490)', () => {
  it('maps the built-in social providers to bare strings', () => {
    expect(idpHintToProvider('google')).toBe('Google')
    expect(idpHintToProvider('facebook')).toBe('Facebook')
  })

  it('maps Microsoft to the CUSTOM provider shape (the load-bearing catch)', () => {
    // A bare string 'Microsoft' would NOT produce identity_provider=Microsoft on
    // /authorize — Microsoft is a custom OIDC provider, so it must be {custom}.
    expect(idpHintToProvider('microsoft')).toEqual({ custom: 'Microsoft' })
  })

  it('is case-insensitive', () => {
    expect(idpHintToProvider('GOOGLE')).toBe('Google')
    expect(idpHintToProvider('Microsoft')).toEqual({ custom: 'Microsoft' })
  })

  it('fails OPEN for unknown/absent hints → undefined (→ chooser, today behaviour)', () => {
    expect(idpHintToProvider('xyz')).toBeUndefined()
    expect(idpHintToProvider('')).toBeUndefined()
    expect(idpHintToProvider(null)).toBeUndefined()
    expect(idpHintToProvider(undefined)).toBeUndefined()
  })
})

describe('providerHintFromIdToken — idToken → hint (#490)', () => {
  it('returns the IdP for a federated user (identities claim)', () => {
    expect(providerHintFromIdToken(jwt({ identities: [{ providerName: 'Google' }] }))).toBe('google')
    expect(providerHintFromIdToken(jwt({ identities: [{ providerName: 'Facebook' }] }))).toBe('facebook')
    expect(providerHintFromIdToken(jwt({ identities: [{ providerName: 'Microsoft' }] }))).toBe('microsoft')
  })

  it('handles the identities claim arriving as a JSON STRING (Cognito variant)', () => {
    expect(providerHintFromIdToken(jwt({ identities: JSON.stringify([{ providerName: 'Google' }]) }))).toBe('google')
  })

  it('returns NULL for a NATIVE user (no identities claim) → no hint, native untouched', () => {
    expect(providerHintFromIdToken(jwt({ email: 'a@b.com', 'cognito:username': 'abc' }))).toBeNull()
  })

  it('returns null for missing/garbage tokens (defensive)', () => {
    expect(providerHintFromIdToken(null)).toBeNull()
    expect(providerHintFromIdToken(undefined)).toBeNull()
    expect(providerHintFromIdToken('not.a.jwt')).toBeNull()
  })

  it('round-trips: a federated idToken → hint → provider', () => {
    const hint = providerHintFromIdToken(jwt({ identities: [{ providerName: 'Microsoft' }] }))
    expect(idpHintToProvider(hint)).toEqual({ custom: 'Microsoft' })
  })
})
