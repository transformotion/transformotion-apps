'use client'

import { useEffect, type ReactNode } from 'react'
import { Inbox, AlertTriangle } from 'lucide-react'
import { useActiveAccountStore } from '@/stores/active-account/use-active-account-store'

/**
 * Gates Stock Analyser private surfaces on app-account membership (M16 D7/D9).
 *
 * - membership present  → renders the app.
 * - zero membership     → "no access" terminal state. Admin claims (site_admin /
 *   app_admin) grant NOTHING here: data authority is membership-only (D9), so an
 *   admin without a Stock Analyser membership sees the same no-access state.
 * - control-plane error → an error/RETRY state, deliberately DISTINCT from
 *   no-access: an outage must never masquerade as revocation.
 *
 * No app-data requests fire until access is confirmed `ready` (the api-client
 * reads the active account from the store, which is only set on `ready`).
 */
export function AccountGate({ children }: { children: ReactNode }) {
  const status = useActiveAccountStore(s => s.status)
  const errorMsg = useActiveAccountStore(s => s.error)
  const load = useActiveAccountStore(s => s.load)

  useEffect(() => {
    void load()
  }, [load])

  if (status === 'idle' || status === 'loading') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="size-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="max-w-md text-center">
          <div className="size-14 rounded-xl bg-surface2 flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="size-7 text-signal-gold" />
          </div>
          <h1 className="text-lg font-semibold text-foreground mb-1">Couldn&apos;t determine your access</h1>
          <p className="text-sm text-muted-foreground mb-4">
            We couldn&apos;t reach the access service{errorMsg ? ` (${errorMsg})` : ''}. This is a
            temporary problem, not a change to your access — please retry.
          </p>
          <button
            onClick={() => void load()}
            className="inline-flex items-center px-4 py-2 rounded-lg bg-primary/15 text-primary text-sm font-medium hover:bg-primary/25 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  if (status === 'no-access') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="max-w-md text-center">
          <div className="size-14 rounded-xl bg-surface2 flex items-center justify-center mx-auto mb-4">
            <Inbox className="size-7 text-muted-foreground" />
          </div>
          <h1 className="text-lg font-semibold text-foreground mb-1">No access to Stock Analyser</h1>
          <p className="text-sm text-muted-foreground">
            You don&apos;t have access to any Stock Analyser account. Access arrives by invitation —
            once you&apos;re added to an account it will appear here.
          </p>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
