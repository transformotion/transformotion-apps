'use client'

import { useCallback, useEffect, useState } from 'react'
import type { User } from '@transformotion/auth-client'
import { authService } from '@/lib/services/auth'
import { getConfig } from '@/lib/config'
import { getUserProfile, type UserProfile } from '@/lib/services/user-profile'
import { getActiveAccounts, type ActiveAccountSelection } from '@/lib/services/active-accounts'
import { getAccount } from '@/lib/services/account-admin'
import { LAUNCHPAD_APPS, entitledSlugsFromSelections, fallbackWarnings } from '@/lib/entitlement'

export interface LaunchpadData {
  loading: boolean
  profile: UserProfile | null
  /** App slugs the user is entitled to (holds ≥1 membership in). */
  entitledSlugs: Set<string>
  /** Active account per app (M16 D7); empty when unavailable. */
  selections: ActiveAccountSelection[]
  /**
   * Best-effort accountId → display name, used to label the profile chip with
   * real account names instead of raw GUIDs (#433). Populated asynchronously
   * after `selections`; an entry is absent when its name could not be read.
   */
  accountNames: Record<string, string>
  /** True when the live read failed and entitlement came from a claims fallback. */
  degraded: boolean
  /** Re-run the live profile/entitlement read (e.g. after the user edits their profile). */
  refresh: () => void
}

/** Internal state — the data without the `refresh` action (which the hook supplies). */
type LaunchpadDataState = Omit<LaunchpadData, 'refresh'>

const EMPTY: LaunchpadDataState = {
  loading: false,
  profile: null,
  entitledSlugs: new Set(),
  selections: [],
  accountNames: {},
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
  const [state, setState] = useState<LaunchpadDataState>({ ...EMPTY, loading: true })
  // Bumped to force a re-read (e.g. after the user saves their profile) — the live
  // read is otherwise keyed on the stable identity and won't refetch on a mutation.
  const [refreshNonce, setRefreshNonce] = useState(0)
  const refresh = useCallback(() => setRefreshNonce((n) => n + 1), [])

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
            accountNames: {},
            degraded: !tilesFromApi || !profileFromApi,
          })
        }

        // Best-effort: enrich the profile chip with real account names so it
        // shows "Steve's Portfolio" rather than a raw accountId GUID (#433).
        // Cosmetic only — failures leave the name absent and never affect
        // entitlement, the active selection, or access.
        if (idToken && selections.length > 0) {
          const named = await Promise.all(
            selections.map(async (s) => {
              try {
                const res = await getAccount(idToken, s.accountId, s.accountId)
                return [s.accountId, res.account?.name] as const
              } catch (err) {
                console.warn('[launchpad] account-name read failed:', s.accountId, err)
                return [s.accountId, undefined] as const
              }
            }),
          )
          if (!cancelled) {
            const accountNames: Record<string, string> = {}
            for (const [id, name] of named) if (name) accountNames[id] = name
            setState((prev) => ({ ...prev, accountNames }))
          }
        }
        return
      }

      // Mock / unconfigured control plane → claims-based entitlement.
      for (const msg of fallbackWarnings({ apiConfigured: false, tilesFromApi: false, profileFromApi: false })) {
        console.warn(msg)
      }
      const entitledSlugs = await deriveEntitlementFromClaims()
      if (!cancelled) {
        setState({ loading: false, profile: null, entitledSlugs, selections: [], accountNames: {}, degraded: true })
      }
    }

    load().catch(() => {
      if (!cancelled) setState({ ...EMPTY, loading: false, degraded: true })
    })

    return () => {
      cancelled = true
    }
    // Re-run when the authenticated identity changes, or when `refresh()` is called
    // (e.g. after a profile save) — NOT on every store update (the persisted user
    // object changes identity on each set()).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, refreshNonce])

  return { ...state, refresh }
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
