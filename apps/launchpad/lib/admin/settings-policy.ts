/**
 * Launchpad Admin — Scoped Settings Authorization (client UI-gating)
 * ==================================================================
 * Client-side port of v0 `permissions.ts` scoped-settings rules, parameterized
 * by explicit viewer facts (own role in the account, app-admin/site-admin) for
 * the Settings Permissions demonstration view. Pure, no store, no mutations —
 * the view itself is a read-only authorization demonstration.
 */

export interface PermissionDecision {
  allowed: boolean
  reason: string
}

/** User settings — editable only by the user who owns the profile. */
export function canEditUserSettings(viewerUserId: string, targetUserId: string): PermissionDecision {
  if (viewerUserId === targetUserId) {
    return { allowed: true, reason: 'Allowed: you are editing your own profile and preferences.' }
  }
  return {
    allowed: false,
    reason: 'User settings are personal. Only the owning user can edit their own profile.',
  }
}

/** Account settings — editable by an owner or manager of the account. */
export function canEditAccountSettings(
  viewerRoleInAccount: 'owner' | 'manager' | 'member' | 'viewer' | null,
): PermissionDecision {
  if (viewerRoleInAccount === 'owner' || viewerRoleInAccount === 'manager') {
    return {
      allowed: true,
      reason: `Allowed: you are ${viewerRoleInAccount === 'owner' ? 'an owner' : 'a manager'} of this account.`,
    }
  }
  return {
    allowed: false,
    reason:
      'Account settings are editable by an owner or manager of the account. Site/app-admin authority does not include private account settings.',
  }
}

/** App settings — editable by a site-admin or an app-admin for that app. */
export function canEditAppSettings(
  viewerIsSiteAdmin: boolean,
  viewerAdminsApp: boolean,
  appLabel: string,
): PermissionDecision {
  if (viewerIsSiteAdmin) {
    return { allowed: true, reason: `Allowed: site-admins can edit ${appLabel} app settings.` }
  }
  if (viewerAdminsApp) {
    return { allowed: true, reason: `Allowed: you are app-admin for ${appLabel}.` }
  }
  return {
    allowed: false,
    reason: `App settings for ${appLabel} require site-admin or app-admin for that app.`,
  }
}

/** Platform settings — editable by site-admins only. */
export function canEditPlatformSettings(viewerIsSiteAdmin: boolean): PermissionDecision {
  if (viewerIsSiteAdmin) {
    return { allowed: true, reason: 'Allowed: platform settings are editable by site-admins.' }
  }
  return { allowed: false, reason: 'Platform settings are restricted to site-admins only.' }
}
