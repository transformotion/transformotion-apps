/**
 * Launchpad Admin — Live View-Model & UI-Gating Layer
 * ===================================================
 * Runtime analog of the v0 prototype's `m11-mocks` helpers + `permissions.ts`.
 *
 * The M11 admin views were authored in v0 over a localStorage mock store
 * (`getStore()`). This module is the "swap the data source" seam: it provides
 * the SAME view-model TYPES and helper SIGNATURES the ported views consume, but
 * backed by the live auth token + control-plane endpoints — no mock store, no
 * local-store authority.
 *
 * The view JSX is ported VERBATIM; only its data imports repoint here. Where v0
 * read mock-store rows, the live views read:
 *   - the authenticated VIEWER from the auth token (`metadata.{siteAdmin,
 *     appAdmin, appAccess}` — groups-authoritative, M11/D11), and
 *   - other users' access from `GET /api/admin/users/access`
 *     (`UserAccessSummary[]`, the canonical contract shape).
 *
 * Authorization here is UI-GATING ONLY (offer vs. hide/disable). The server is
 * the authority on every mutation; these helpers never replace it.
 */

'use client'

import {
  appAccessGroup,
  appAdminGroup,
  deriveAppAdmin,
  deriveSiteAdmin,
  type AccountRole,
  type CognitoGroup,
  type EntitledAppSlug,
  type UserStatus,
} from '@transformotion/contracts/_shared/auth'
import type { UserAccessSummary as ContractUserAccessSummary, UserPendingInvitation } from '@transformotion/contracts/launchpad/invitations'

// ---------------------------------------------------------------------------
// View-model types (mirror the v0 prototype names the ported views import)
// ---------------------------------------------------------------------------

/**
 * The live analog of v0's `MockUser`. Built from the auth token (the viewer) or
 * from a `UserAccessSummary` row (directory users). Structurally matches the
 * fields the ported views read: `userId`, `email`, `displayName`, `status`,
 * `groups`. `groups` is reconstructed from the contract's `siteAdmin`/`appAdmin`
 * flags so `userIsSiteAdmin` / role rendering work unchanged.
 */
export interface AdminUser {
  userId: string
  email: string
  displayName?: string
  status: UserStatus
  /** Cognito groups — the authority for site-admin / app-access / app-admin. */
  groups: CognitoGroup[]
}

/** v0 `AccountAccess` — one account a user can access within an app. */
export interface AccountAccess {
  accountId: string
  accountName: string
  role: AccountRole
}

/** v0 `AppAccountAccess` — a user's access within a single app. */
export interface AppAccountAccess {
  appSlug: EntitledAppSlug
  appLabel: string
  appAdmin: boolean
  accounts: AccountAccess[]
}

/** v0 `UserAccessSummary` (NESTED view-model — note `.user`). */
export interface UserAccessSummary {
  user: AdminUser
  appAccess: AppAccountAccess[]
  pendingInvites: number
  /** Per-user pending-invitation rows (one per grant) for the detail list (M11).
   *  v0 derives these client-side; runtime carries the live contract list here. */
  pendingInvitations: UserPendingInvitation[]
}

// ---------------------------------------------------------------------------
// Labels & user helpers (ported from v0 m11-mocks, no store)
// ---------------------------------------------------------------------------

export const appLabelMap: Record<EntitledAppSlug, string> = {
  'stock-analyser': 'Stock Analyser',
  'budget-tracker': 'Budget Tracker',
}

export function appLabel(slug: EntitledAppSlug): string {
  return appLabelMap[slug] ?? slug
}

/** Human-facing label for a user (display-name → email local part → email). */
export function resolveUserLabel(user: Pick<AdminUser, 'displayName' | 'email'>): string {
  if (user.displayName && user.displayName.trim()) return user.displayName
  const localPart = user.email.split('@')[0]
  return localPart || user.email
}

/** Site-admin authority — SOLE source is the `site-admin` Cognito group. */
export function userIsSiteAdmin(user: Pick<AdminUser, 'groups'> | null | undefined): boolean {
  return !!user && deriveSiteAdmin(user.groups)
}

/** App slugs this user administers — the `{app}-app-admin` groups. */
export function appsAdministeredByUser(user: Pick<AdminUser, 'groups'>): EntitledAppSlug[] {
  return deriveAppAdmin(user.groups)
}

// ---------------------------------------------------------------------------
// Adapter: contract `UserAccessSummary` (flat) → v0 view-model (nested)
// ---------------------------------------------------------------------------

/**
 * Reconstruct the groups array from the contract's boolean/array flags so the
 * synthesized `AdminUser` drives the ported views' group-authoritative helpers
 * (`userIsSiteAdmin`, role badges) exactly as the mock `MockUser.groups` did.
 */
function groupsFromSummary(s: ContractUserAccessSummary): CognitoGroup[] {
  const groups: CognitoGroup[] = []
  if (s.siteAdmin) groups.push('site-admin')
  for (const app of s.appAccess) {
    groups.push(appAccessGroup(app.appSlug))
    if (app.appAdmin) groups.push(appAdminGroup(app.appSlug))
  }
  return groups
}

/** Map one live (flat) `UserAccessSummary` to the v0 (nested) view-model. */
export function toViewUserAccessSummary(s: ContractUserAccessSummary): UserAccessSummary {
  return {
    user: {
      userId: s.userId,
      email: s.email,
      displayName: s.displayName,
      status: s.status,
      groups: groupsFromSummary(s),
    },
    appAccess: s.appAccess.map((a) => ({
      appSlug: a.appSlug,
      appLabel: appLabel(a.appSlug),
      appAdmin: a.appAdmin,
      accounts: a.accounts.map((acct) => ({
        accountId: acct.accountId,
        accountName: acct.accountName,
        role: acct.role,
      })),
    })),
    pendingInvites: s.pendingInvites,
    pendingInvitations: s.pendingInvitations,
  }
}

// ---------------------------------------------------------------------------
// UI-gating policy (viewer-scoped; reads the viewer's groups, not a store)
// ---------------------------------------------------------------------------

/** May the viewer open the admin shell at all? Site-admin OR any app-admin. */
export function canEnterAdmin(viewer: AdminUser): boolean {
  return userIsSiteAdmin(viewer) || appsAdministeredByUser(viewer).length > 0
}

/** Users & Access (cross-account/cross-app directory) is site-admin only. */
export function canViewUsersAccess(viewer: AdminUser): boolean {
  return userIsSiteAdmin(viewer)
}

/**
 * Apps for which the viewer may grant app-access (app-grant): site-admin grants
 * for every entitled app; an app-admin grants only their administered apps.
 */
export function grantableAppsFor(viewer: AdminUser): EntitledAppSlug[] {
  if (userIsSiteAdmin(viewer)) return Object.keys(appLabelMap) as EntitledAppSlug[]
  return appsAdministeredByUser(viewer)
}
