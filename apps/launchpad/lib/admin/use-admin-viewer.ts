/**
 * useAdminViewer — the live analog of v0's `useM11Viewer`.
 *
 * v0 resolved the admin "viewer" from a mock auth session / `?m11Viewer=`
 * deep-link. The live viewer is the AUTHENTICATED user, read once from the auth
 * token. Its `groups` are reconstructed from the token's groups-authoritative
 * metadata (`siteAdmin` boolean, `appAdmin[]`, `appAccess[]` — M11/D11) so the
 * ported admin shell + views gate exactly as they did over `MockUser.groups`.
 *
 * Returns `null` while resolving (pre-auth / SSR) — callers render a neutral
 * frame, never privileged content, until the viewer is known.
 */

'use client'

import { useEffect, useState } from 'react'
import { authService } from '@/lib/services/auth'
import {
  appAccessGroup,
  appAdminGroup,
  type CognitoGroup,
  type EntitledAppSlug,
} from '@transformotion/contracts/_shared/auth'
import type { AdminUser } from './view-model'

interface AdminMetadata {
  siteAdmin?: boolean
  appAdmin?: string[]
  appAccess?: string[]
}

/** Reconstruct the viewer's Cognito groups from token metadata. */
function groupsFromMetadata(meta: AdminMetadata): CognitoGroup[] {
  const groups: CognitoGroup[] = []
  if (meta.siteAdmin) groups.push('site-admin')
  for (const slug of meta.appAdmin ?? []) groups.push(appAdminGroup(slug as EntitledAppSlug))
  for (const slug of meta.appAccess ?? []) groups.push(appAccessGroup(slug as EntitledAppSlug))
  return groups
}

export function useAdminViewer(): AdminUser | null {
  const [viewer, setViewer] = useState<AdminUser | null>(null)

  useEffect(() => {
    let cancelled = false
    authService
      .getCurrentUser()
      .then((user) => {
        if (cancelled || !user) return
        const meta = (user.metadata ?? {}) as AdminMetadata
        // Skip a raw-email `name` (no given/family name) so the label chain falls
        // back to the email local part rather than rendering the full address.
        const displayName = user.name && user.name !== user.email ? user.name : undefined
        setViewer({
          userId: user.id,
          email: user.email,
          displayName,
          status: 'active',
          groups: groupsFromMetadata(meta),
        })
      })
      .catch(() => {
        /* unresolved viewer stays null — caller renders the neutral frame */
      })
    return () => {
      cancelled = true
    }
  }, [])

  return viewer
}
