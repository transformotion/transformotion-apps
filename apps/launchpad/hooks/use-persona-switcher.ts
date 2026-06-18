'use client'

/**
 * Hooks for the dev persona switcher — the runtime equivalents of v0's
 * `useControlPlaneSession()` + `useImpersonator()` (transformotion-apps-b8
 * use-control-plane-store @ 0fbc9e3). The SURFACE is unchanged; only the data
 * source moves: the session is derived from the live auth store, and the
 * impersonator from the parked-session snapshot in localStorage.
 */

import { useEffect, useMemo, useState } from 'react'
import { useAuthStore } from '@/stores/auth/use-auth-store'
import { appLabel } from '@/lib/dev/persona-catalog'
import { getImpersonator, type ImpersonatorIdentity } from '@/lib/dev/persona-impersonation'

/** Session view-model the switcher surface renders (v0 `MockSession` parity). */
export interface PersonaSessionVM {
  /** Cognito sub (the live identity). */
  userId: string
  label: string
  displayName: string
  email: string
  siteAdmin: boolean
  /** App-admin app labels (e.g. "Stock Analyser"), for the chip line. */
  appAdmin: string[]
}

/**
 * The current authenticated session as a switcher view-model, or null when
 * signed out. Derived from the live auth store (NOT a mock store) — while
 * impersonating, the store already holds the persona, so this reflects them.
 */
export function usePersonaSession(): PersonaSessionVM | null {
  const user = useAuthStore((s) => s.user)
  return useMemo(() => {
    if (!user) return null
    const meta = (user.metadata ?? {}) as {
      siteAdmin?: boolean
      appAdmin?: string[]
    }
    return {
      userId: user.id,
      label: user.name,
      displayName: user.name,
      email: user.email,
      siteAdmin: Boolean(meta.siteAdmin),
      appAdmin: (meta.appAdmin ?? []).map(appLabel),
    }
  }, [user])
}

/**
 * The tester's OWN session while impersonating (null when acting as themselves).
 * Read client-side after mount (the value only changes via a reload-triggering
 * start/stop, so a one-shot read is correct and avoids an SSR hydration gap).
 */
export function useImpersonator(): ImpersonatorIdentity | null {
  const [impersonator, setImpersonator] = useState<ImpersonatorIdentity | null>(null)
  useEffect(() => {
    setImpersonator(getImpersonator())
  }, [])
  return impersonator
}
