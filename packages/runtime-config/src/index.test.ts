import { describe, it, expect, beforeEach } from 'vitest'
import { selectProvider, resolveProfile } from './index'

describe('resolveProfile', () => {
  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_RUNTIME_PROFILE
  })

  it('defaults to mock when unset', () => {
    expect(resolveProfile()).toBe('mock')
  })

  it('returns live when set to live', () => {
    process.env.NEXT_PUBLIC_RUNTIME_PROFILE = 'live'
    expect(resolveProfile()).toBe('live')
  })

  it('returns mock for invalid values', () => {
    process.env.NEXT_PUBLIC_RUNTIME_PROFILE = 'production'
    expect(resolveProfile()).toBe('mock')
  })
})

describe('selectProvider', () => {
  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_RUNTIME_PROFILE
  })

  const args = {
    profileDefaults: { mock: 'foo', live: 'bar' } as const,
    validValues: ['foo', 'bar'] as const,
  }

  it('uses mock profile default when profile unset', () => {
    expect(selectProvider({ ...args, override: undefined })).toBe('foo')
  })

  it('uses live profile default when profile is live', () => {
    process.env.NEXT_PUBLIC_RUNTIME_PROFILE = 'live'
    expect(selectProvider({ ...args, override: undefined })).toBe('bar')
  })

  it('honours valid override', () => {
    expect(selectProvider({ ...args, override: 'bar' })).toBe('bar')
  })

  it('ignores invalid override and falls back to profile', () => {
    expect(selectProvider({ ...args, override: 'invalid' })).toBe('foo')
  })
})
