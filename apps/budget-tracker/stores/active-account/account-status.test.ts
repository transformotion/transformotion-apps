import { describe, it, expect } from 'vitest'
import { resolveAccountState, type AccountOption } from './account-status'

const accounts = (...ids: string[]): AccountOption[] => ids.map(id => ({ accountId: id, role: 'member' }))

describe('resolveAccountState (BT) — error vs no-access must be distinct (#415 addition 2)', () => {
  it('control-plane FAILURE → error (retry), NEVER no-access', () => {
    const out = resolveAccountState(accounts(), { ok: false })
    expect(out.status).toBe('error')
    expect(out.activeAccountId).toBeNull()
    expect(out.error).toBeTruthy()
  })

  it('genuine zero membership (ok, empty) → no-access', () => {
    const out = resolveAccountState(accounts(), { ok: true, selections: [] })
    expect(out.status).toBe('no-access')
    expect(out.activeAccountId).toBeNull()
    expect(out.error).toBeNull()
  })

  it('selection present for budget-tracker → ready with that account', () => {
    const out = resolveAccountState(accounts('acc-1', 'acc-2'), {
      ok: true,
      selections: [
        { appSlug: 'stock-analyser', accountId: 'sa-1' },
        { appSlug: 'budget-tracker', accountId: 'acc-2' },
      ],
    })
    expect(out.status).toBe('ready')
    expect(out.activeAccountId).toBe('acc-2')
  })

  it('member but no stored selection → ready with the first account', () => {
    const out = resolveAccountState(accounts('acc-1', 'acc-2'), {
      ok: true,
      selections: [{ appSlug: 'stock-analyser', accountId: 'sa-1' }],
    })
    expect(out.status).toBe('ready')
    expect(out.activeAccountId).toBe('acc-1')
  })

  it('ignores a selection for another app (SA) → no-access for BT', () => {
    const out = resolveAccountState(accounts(), {
      ok: true,
      selections: [{ appSlug: 'stock-analyser', accountId: 'sa-1' }],
    })
    expect(out.status).toBe('no-access')
  })
})
