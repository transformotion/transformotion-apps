'use client'

import { useEffect, useState } from 'react'
import type { User } from '@transformotion/auth-client'
import { authService } from '@/lib/services/auth'
import { getConfig } from '@/lib/config'
import { getUserProfile, type UserProfile } from '@/lib/services/user-profile'
import { getActiveAccounts, type ActiveAccountSelection } from '@/lib/services/active-accounts'
import { LAUNCHPAD_APPS, entitledSlugsFromSelections, fallbackWarnings } from '@/lib/entitlement'

export interface LaunchpadData {
  loading: boolean
  profile: UserProfile | null
  /** App slugs the user is entitled to (holds ≥1 membership in). */
  entitledSlugs: Set<string>
  /** Active account per app (M16 D7); empty when unavailable. */
  selections: ActiveAccountSelection[]
  /** True when the live read failed and entitlement came from a claims fallback. */
  degraded: boolean
}

const EMPTY: LaunchpadData = {
  loading: false,
  profile: null,
  entitledSlugs: new Set(),
  selections: [],
  degraded: false,
}

/**
 * Loads the current user's entitlement + profile for the Launchpad home view
 * (M16 Phase 3, read-only).
 *
 * Live path: GET /api/user/active-accounts (entitlement + active account per
 * app) and GET /api/user/profile (displayName/profileComplete). When the
 * control-plane API is unavailable (mock dev) or a read fails, it degrades to a
 * claims-based entitlement probe — never crashes, never blank-crashes a tile.
 */
export function useLaunchpadData(user: User | null): LaunchpadData {
  const [state, setState] = useState<LaunchpadData>({ ...EMPTY, loading: true })

  useEffect(() => {
    let cancelled = false

    async function load() {
      if (!user) {
        if (!cancelled) setState({ ...EMPTY, loading: false })
        return
      }

      const apiUrl = getConfig().controlPlane.apiUrl
      const idToken = await authService.getIdToken().catch(() => null)

      if (idToken && apiUrl) {
        const [profileRes, activeRes] = await Promise.allSettled([
          getUserProfile(idToken),
          getActiveAccounts(idToken),
        ])
        const profile = profileRes.status === 'fulfilled' ? profileRes.value : null
        const tilesFromApi = activeRes.status === 'fulfilled'
        const profileFromApi = profileRes.status === 'fulfilled'

        // Surface the discarded fetch errors so a failed read is not invisible (#423).
        if (profileRes.status === 'rejected') {
          console.warn('[launchpad] profile read error:', profileRes.reason)
        }
        if (activeRes.status === 'rejected') {
          console.warn('[launchpad] active-accounts read error:', activeRes.reason)
        }
        for (const msg of fallbackWarnings({ apiConfigured: true, tilesFromApi, profileFromApi })) {
          console.warn(msg)
        }

        // Entitlement from the API when available, else the claims fallback.
        const selections = tilesFromApi ? activeRes.value.selections ?? [] : []
        const entitledSlugs = tilesFromApi
          ? entitledSlugsFromSelections(selections)
          : await deriveEntitlementFromClaims()

        if (!cancelled) {
          setState({
            loading: false,
            profile,
            entitledSlugs,
            selections,
            degraded: !tilesFromApi || !profileFromApi,
          })
        }
        return
      }

      // Mock / unconfigured control plane → claims-based entitlement.
      for (const msg of fallbackWarnings({ apiConfigured: false, tilesFromApi: false, profileFromApi: false })) {
        console.warn(msg)
      }
      const entitledSlugs = await deriveEntitlementFromClaims()
      if (!cancelled) {
        setState({ loading: false, profile: null, entitledSlugs, selections: [], degraded: true })
      }
    }

    load().catch(() => {
      if (!cancelled) setState({ ...EMPTY, loading: false, degraded: true })
    })

    return () => {
      cancelled = true
    }
    // Re-run only when the authenticated identity changes, not on every store
    // update (the persisted user object changes identity on each set()).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])

  return state
}

/**
 * Resilience/mock fallback: probe per-app membership via the auth-client's
 * accounts-claim accessor (implemented by both mock and cognito providers).
 */
async function deriveEntitlementFromClaims(): Promise<Set<string>> {
  const gated = LAUNCHPAD_APPS.filter((a) => a.entitlementGated).map((a) => a.slug)
  const results = await Promise.all(
    gated.map(async (slug) => {
      try {
        return (await authService.getAccountIdForApp(slug)) ? slug : null
      } catch {
        return null
      }
    }),
  )
  return new Set(results.filter((s): s is string => s !== null))
}
