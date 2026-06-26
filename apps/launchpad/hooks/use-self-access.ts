'use client'

import { useEffect, useState } from 'react'
import type { User } from '@transformotion/auth-client'
import type {
  UserAccessSummary,
  UserAppAccess,
  UserAccountAccess,
} from '@transformotion/contracts/launchpad/invitations'
import type { AccountRole, EntitledAppSlug, UserStatus } from '@transformotion/contracts/_shared/auth'
import { authService } from '@/lib/services/auth'
import { getConfig } from '@/lib/config'
import { getAccount } from '@/lib/services/account-admin'
import { LAUNCHPAD_APPS } from '@/lib/entitlement'

const GATED_SLUGS = LAUNCHPAD_APPS.filter((a) => a.entitlementGated).map((a) => a.slug)

export interface SelfAccess {
  loading: boolean
  /** The signed-in user's own cross-app access, or null while loading / when signed out. */
  summary: UserAccessSummary | null
}

/**
 * The signed-in user's OWN cross-app access (#- Profile "Your apps & accounts").
 *
 * This is the self version of the admin Users & Access detail read: same canonical
 * `UserAccessSummary` shape, but derived CLIENT-SIDE from the caller's own token —
 * the `{app}-app-access` / `{app}-app-admin` / `site-admin` groups (which apps they
 * can enter and admin) plus the `accounts` claim (their accounts + role per app),
 * with account NAMES resolved via the control plane. No supervisory actions, no
 * site-admin gate — a user reads only their own access.
 *
 * `pendingInvites` is always 0 here: the "your pending invitations" sub-list needs a
 * self-pending-bundle read keyed on the authed identity, which has no contract yet and
 * is the same capability as #482 (on-sign-in reconciliation). It will be wired here
 * once #482's read is defined in v0 and implemented. See the disposition list.
 */
export function useSelfAccess(user: User | null): SelfAccess {
  const [state, setState] = useState<SelfAccess>({ loading: true, summary: null })

  useEffect(() => {
    let cancelled = false

    async function load() {
      if (!user) {
        if (!cancelled) setState({ loading: false, summary: null })
        return
      }

      const meta = user.metadata as
        | { siteAdmin?: boolean; appAdmin?: string[]; appAccess?: string[] }
        | undefined
      const siteAdmin = meta?.siteAdmin === true
      const appAdminSet = new Set(meta?.appAdmin ?? [])
      const appAccessSet = new Set(meta?.appAccess ?? [])

      const idToken = await authService.getIdToken().catch(() => null)
      const apiConfigured = Boolean(getConfig().controlPlane.apiUrl && idToken)

      // Apps the viewer can SEE: holds the access group OR admins the app (groups-authoritative).
      const slugs = GATED_SLUGS.filter((s) => appAccessSet.has(s) || appAdminSet.has(s))

      const appAccess: UserAppAccess[] = await Promise.all(
        slugs.map(async (slug) => {
          const memberships = await authService.getAccountsForApp(slug).catch(() => [])
          const accounts: UserAccountAccess[] = await Promise.all(
            memberships.map(async (m) => {
              let accountName = m.accountId
              if (apiConfigured) {
                try {
                  const res = await getAccount(idToken!, m.accountId, m.accountId)
                  accountName = res.account?.name ?? m.accountId
                } catch {
                  /* name unresolved — fall back to the id, never blocks the row */
                }
              }
              return { accountId: m.accountId, accountName, role: m.role as AccountRole }
            }),
          )
          return { appSlug: slug as EntitledAppSlug, appAdmin: appAdminSet.has(slug), accounts }
        }),
      )

      const summary: UserAccessSummary = {
        userId: user.id,
        email: user.email,
        status: 'active' as UserStatus,
        siteAdmin,
        appAccess,
        // Self-access is derived client-side from claims and has no invitation-store
        // read — the viewer's own pending invitations are out of scope here; keep
        // empty (invariant: pendingInvites === pendingInvitations.length).
        pendingInvitations: [],
        pendingInvites: 0,
      }

      if (!cancelled) setState({ loading: false, summary })
    }

    load().catch(() => {
      if (!cancelled) setState({ loading: false, summary: null })
    })

    return () => {
      cancelled = true
    }
    // Re-derive only when the authenticated identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])

  return state
}
