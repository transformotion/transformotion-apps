import { create } from 'zustand'
import { ControlPlaneClient } from '@transformotion/api-client'
import { authService } from '@/lib/services/auth'
import { getConfig } from '@/lib/config'
import {
  APP_SLUG,
  resolveAccountState,
  type AccountAccessStatus,
  type AccountOption,
  type ActiveAccountsResult,
} from './account-status'

export type { AccountAccessStatus, AccountOption }

interface ActiveAccountState {
  status: AccountAccessStatus
  activeAccountId: string | null
  accounts: AccountOption[]
  error: string | null
  load: () => Promise<void>
  switchTo: (accountId: string) => Promise<void>
}

function controlPlane(): ControlPlaneClient | null {
  const baseUrl = getConfig().controlPlane.apiUrl
  if (!baseUrl) return null
  return new ControlPlaneClient({
    baseUrl,
    getToken: async () => (await authService.getIdToken()) ?? '',
  })
}

export const useActiveAccountStore = create<ActiveAccountState>((set, get) => ({
  status: 'idle',
  activeAccountId: null,
  accounts: [],
  error: null,

  load: async () => {
    if (get().status === 'loading') return
    set({ status: 'loading', error: null })

    // The full account list (for the selector) comes from the token claim — no
    // network, so it cannot throw a control-plane error.
    const accounts = await authService.getAccountsForApp(APP_SLUG)
    const cp = controlPlane()

    if (!cp) {
      // No control plane configured (mock/local dev): use the first token account
      // so dev works. Empty list ⇒ no-access; this path never hits the network,
      // so it is never the `error` state.
      const active = accounts[0]?.accountId ?? null
      set({ status: active ? 'ready' : 'no-access', accounts, activeAccountId: active })
      return
    }

    let result: ActiveAccountsResult
    let errMsg: string | undefined
    try {
      const res = await cp.getActiveAccounts()
      result = { ok: true, selections: res.selections ?? [] }
    } catch (err) {
      // Control-plane FAILURE → error/retry, never no-access (an outage must not
      // look like revocation).
      console.warn('[stock-analyser] active-account load failed:', err)
      result = { ok: false }
      errMsg = err instanceof Error ? err.message : undefined
    }

    const next = resolveAccountState(accounts, result)
    set({
      status: next.status,
      activeAccountId: next.activeAccountId,
      accounts: next.status === 'no-access' ? [] : accounts,
      error: next.status === 'error' ? (errMsg ?? next.error) : null,
    })
  },

  switchTo: async (accountId: string) => {
    const cp = controlPlane()
    const prev = get().activeAccountId
    set({ activeAccountId: accountId }) // optimistic
    if (!cp) return
    try {
      // Server fails closed on non-membership for this app.
      await cp.setActiveAccount(APP_SLUG, accountId)
    } catch (err) {
      console.warn('[stock-analyser] active-account switch failed:', err)
      set({ activeAccountId: prev }) // revert on failure
      throw err
    }
  },
}))

/** Synchronous accessor for the api-client getAccountId callback. */
export const getActiveAccountId = (): string | null =>
  useActiveAccountStore.getState().activeAccountId
