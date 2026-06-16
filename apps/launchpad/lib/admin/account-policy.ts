/**
 * Launchpad Admin — Account Member-Management Policy (client UI-gating)
 * ====================================================================
 * Client-side port of v0 `permissions.ts` account-member rules, parameterized
 * by EXPLICIT roles (the viewer's role in the account, the target's role, the
 * sole-owner flag) instead of mock-store lookups. Used by the ported Account
 * Management view to OFFER only authorized controls and show rationale.
 *
 * UI-GATING ONLY. The server (accounts handler: decideRoleChange / decideRemoval
 * / decideLastOwnerGuard) is the authority on every mutation; these mirror the
 * same rules so the UI doesn't present actions the server will reject.
 */

import type { AccountRole } from '@transformotion/contracts/_shared/auth'

export interface PermissionDecision {
  allowed: boolean
  reason: string
}

const ACCOUNT_ROLE_RANK: Record<AccountRole, number> = {
  viewer: 0,
  member: 1,
  manager: 2,
  owner: 3,
}

/** Roles a MANAGER may assign (never owner, never above manager). */
export const MANAGER_ASSIGNABLE_ROLES: AccountRole[] = ['viewer', 'member', 'manager']
/** Roles an OWNER may assign. */
export const OWNER_ASSIGNABLE_ROLES: AccountRole[] = ['viewer', 'member', 'manager', 'owner']

export function isAccountOwnerOrManager(role: AccountRole | null): boolean {
  return role === 'owner' || role === 'manager'
}

/** Can the actor manage members (role changes, removals) of this account? */
export function canManageAccountMembers(actorRole: AccountRole | null): boolean {
  return isAccountOwnerOrManager(actorRole)
}

/** Roles the actor may assign, given their own role. Empty if they can't manage. */
export function assignableRolesFor(actorRole: AccountRole | null): AccountRole[] {
  if (actorRole === 'owner') return OWNER_ASSIGNABLE_ROLES
  if (actorRole === 'manager') return MANAGER_ASSIGNABLE_ROLES
  return []
}

/**
 * Change a member's role. Owners may assign any role (subject to the last-owner
 * guard on demotion). Managers may only assign viewer/member/manager, may not
 * touch an owner, and may not promote to owner. Mirrors v0 canChangeMemberRole.
 */
export function canChangeMemberRole(
  actorRole: AccountRole | null,
  targetRole: AccountRole | null,
  newRole: AccountRole,
  targetIsLastOwner: boolean,
): PermissionDecision {
  if (actorRole !== 'owner' && actorRole !== 'manager') {
    return {
      allowed: false,
      reason:
        'Only an owner or manager of this account can change member roles. Site-admin supervisory authority does not include account role management.',
    }
  }
  if (!targetRole) {
    return { allowed: false, reason: 'This person is not a member of this account.' }
  }
  if (actorRole === 'manager') {
    if (targetRole === 'owner') {
      return { allowed: false, reason: 'Managers cannot modify an owner of the account.' }
    }
    if (newRole === 'owner') {
      return { allowed: false, reason: 'Managers cannot promote anyone to owner.' }
    }
    if (ACCOUNT_ROLE_RANK[newRole] > ACCOUNT_ROLE_RANK.manager) {
      return { allowed: false, reason: 'Managers cannot grant a role higher than manager.' }
    }
  }
  if (targetRole === 'owner' && newRole !== 'owner' && targetIsLastOwner) {
    return {
      allowed: false,
      reason:
        "This person is the only owner. Assign another owner before changing their role, so the account isn't left without an owner.",
    }
  }
  if (newRole === targetRole) {
    return { allowed: false, reason: 'This member already has that role.' }
  }
  return { allowed: true, reason: `Allowed: change role to ${newRole}.` }
}

/**
 * Remove a member. Owners remove anyone; managers remove members/viewers only
 * (not owners); site-admins remove as a supervisory action. The last-owner guard
 * applies to everyone. Mirrors v0 canRemoveMember.
 */
export function canRemoveMember(
  actorRole: AccountRole | null,
  targetRole: AccountRole | null,
  targetIsLastOwner: boolean,
  viewerIsSiteAdmin: boolean,
): PermissionDecision {
  if (!targetRole) {
    return { allowed: false, reason: 'This person is not a member of this account.' }
  }
  if (targetRole === 'owner' && targetIsLastOwner) {
    return {
      allowed: false,
      reason:
        "This person is the only owner. Assign another owner before removing them, so the account isn't left without an owner.",
    }
  }
  if (actorRole === 'owner') {
    return { allowed: true, reason: 'Allowed: owners can remove members.' }
  }
  if (actorRole === 'manager') {
    if (targetRole === 'owner') {
      return { allowed: false, reason: 'Managers cannot remove an owner of the account.' }
    }
    return { allowed: true, reason: 'Allowed: managers can remove members and viewers.' }
  }
  if (viewerIsSiteAdmin) {
    return {
      allowed: true,
      reason:
        "Allowed as a site-admin supervisory access-control action. This removes access only and does not grant you the account's private data.",
    }
  }
  return {
    allowed: false,
    reason: 'Requires an owner/manager of this account, or site-admin supervisory authority.',
  }
}

/**
 * Cancel a PENDING account invitation. Owner/manager of the account, or
 * site-admin supervisory. Mirrors v0 canCancelInvitationGrant.
 */
export function canCancelInvitationGrant(
  actorRole: AccountRole | null,
  viewerIsSiteAdmin: boolean,
): PermissionDecision {
  if (isAccountOwnerOrManager(actorRole)) {
    return { allowed: true, reason: 'Allowed: you are an owner/manager of this account.' }
  }
  if (viewerIsSiteAdmin) {
    return { allowed: true, reason: 'Allowed: site-admin supervisory action.' }
  }
  return {
    allowed: false,
    reason: 'Requires an owner/manager of this account, or site-admin supervisory authority.',
  }
}
