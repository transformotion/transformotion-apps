import { describe, it, expect } from 'vitest'
import { composeDisplayName, userFirstName, userInitials } from './index'

describe('composeDisplayName — token claims → User.name (#494)', () => {
  it('prefers given + family (a Google / native user)', () => {
    expect(composeDisplayName({ givenName: 'Steve', familyName: 'Moodie', email: 'x@y.com' }))
      .toBe('Steve Moodie')
  })

  it('uses the OIDC `name` claim when given/family are absent (Microsoft / Facebook before mapping)', () => {
    // The load-bearing case: MS/FB mapped only `name`. Without this the result was
    // the full email; here it is a real name that splits to "Steve".
    expect(composeDisplayName({ nameClaim: 'Steve Moodie', email: 'stevemoodie@hotmail.com' }))
      .toBe('Steve Moodie')
  })

  it('uses given alone when there is no family and no name claim', () => {
    expect(composeDisplayName({ givenName: 'Steve', email: 'steve@y.com' })).toBe('Steve')
  })

  it('falls back to the email LOCAL part — NEVER the full email — when no name is present', () => {
    expect(composeDisplayName({ email: 'stevemoodie70@gmail.com' })).toBe('stevemoodie70')
  })

  it('ignores whitespace-only claims', () => {
    expect(composeDisplayName({ givenName: '  ', nameClaim: '  ', email: 'carol@example.com' }))
      .toBe('carol')
  })

  it('returns the email only when there is no usable local part (malformed)', () => {
    expect(composeDisplayName({ email: '@example.com' })).toBe('@example.com')
  })

  it('returns empty string defensively when nothing is available', () => {
    expect(composeDisplayName({})).toBe('')
  })
})

describe('userFirstName / userInitials (#494)', () => {
  it('first name is the first whitespace token', () => {
    expect(userFirstName({ name: 'Steve Moodie' })).toBe('Steve')
    expect(userFirstName({ name: 'Steve' })).toBe('Steve')
  })

  it('first name of an email-local-part fallback is the local part (never a full email)', () => {
    expect(userFirstName({ name: 'stevemoodie70' })).toBe('stevemoodie70')
  })

  it('is null/undefined safe', () => {
    expect(userFirstName(null)).toBe('')
    expect(userFirstName(undefined)).toBe('')
    expect(userFirstName({ name: '' })).toBe('')
  })

  it('initials are up to two UPPERCASE letters', () => {
    expect(userInitials({ name: 'Steve Moodie' })).toBe('SM')
    expect(userInitials({ name: 'Steve Andrew Moodie' })).toBe('SA')
    expect(userInitials({ name: 'stevemoodie70' })).toBe('S')
    expect(userInitials(null)).toBe('')
  })
})
