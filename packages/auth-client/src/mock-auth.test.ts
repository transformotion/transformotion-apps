import { describe, it, expect, beforeEach } from 'vitest'
import { MockAuthService } from './mock-auth'

// MockAuthService guards all window/localStorage access with
// `typeof window === 'undefined'`, so tests run cleanly in Node.js:
// - loadSession() and saveSession() are no-ops (no persistence)
// - window.location.reload() is skipped
// These tests verify the in-memory session state machine only.

describe('MockAuthService', () => {
  let service: MockAuthService

  beforeEach(() => {
    service = new MockAuthService()
  })

  it('seeds session on construction', async () => {
    const session = await service.getSession()
    expect(session).not.toBeNull()
    expect(session?.user.email).toBe('user@example.com')
    expect(session?.currentAccount).toBeDefined()
  })

  it('getCurrentUser returns mock user', async () => {
    const user = await service.getCurrentUser()
    expect(user).not.toBeNull()
    expect(user?.id).toBe('user-1')
  })

  it('signOut clears session', async () => {
    await service.signOut()
    const session = await service.getSession()
    expect(session).toBeNull()
  })

  it('signInWithRedirect restores session after signOut', async () => {
    await service.signOut()
    expect(await service.getSession()).toBeNull()

    await service.signInWithRedirect()
    const session = await service.getSession()
    expect(session).not.toBeNull()
    expect(session?.user.email).toBe('user@example.com')
  })

  it('listAccounts returns two accounts', async () => {
    const accounts = await service.listAccounts()
    expect(accounts).toHaveLength(2)
    expect(accounts[0].id).toBe('acc-personal')
    expect(accounts[1].id).toBe('acc-business')
  })

  it('signOut notifies listeners', async () => {
    const received: unknown[] = []
    service.onAuthStateChange(session => received.push(session))
    // onAuthStateChange fires immediately with current session
    expect(received).toHaveLength(1)
    expect(received[0]).not.toBeNull()

    await service.signOut()
    expect(received).toHaveLength(2)
    expect(received[1]).toBeNull()
  })

  it('signInWithRedirect notifies listeners', async () => {
    await service.signOut()
    const received: unknown[] = []
    service.onAuthStateChange(session => received.push(session))

    await service.signInWithRedirect()
    expect(received).toHaveLength(2) // null (immediate) + session (after redirect)
    expect(received[1]).not.toBeNull()
  })

  it('getAccessToken returns token when session active', async () => {
    const token = await service.getAccessToken()
    expect(token).toMatch(/^mock-access-/)
  })

  it('getAccessToken returns null after signOut', async () => {
    await service.signOut()
    const token = await service.getAccessToken()
    expect(token).toBeNull()
  })
})
