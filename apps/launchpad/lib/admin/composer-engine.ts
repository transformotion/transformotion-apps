/**
 * Launchpad Admin — Invite Composer Engine (client capability + validation)
 * =========================================================================
 * Client-side port of v0 `m11-invitee-discovery` CAPABILITY + VALIDATION rules
 * (checks 2 & 3), parameterized by explicit sender capabilities and the invitee
 * STATE the sender is entitled to know — no mock store.
 *
 * Three separate checks (never conflated):
 *   1. invitee discovery — server (POST /api/invitations/invitee-search)
 *   2. grant authorization — pure, from the sender's capabilities (here)
 *   3. duplicate/validity — invitee state the sender may see (here)
 * The AUTHORITATIVE per-grant decision is re-made server-side at send time
 * (POST /api/invitations/bundles); this engine drives the live preview.
 */

import type { AccountRole, EntitledAppSlug } from '@transformotion/contracts/_shared/auth'
import type {
  InvitationGrant,
  InvitationGrantKind,
} from '@transformotion/contracts/launchpad/invitations'
import { appLabel } from './view-model'

/** An account the sender may invite into (owner/manager of each). */
export interface InvitableAccount {
  accountId: string
  appSlug: EntitledAppSlug
  name: string
  role: AccountRole
}

/** What the sender is statically authorized to do (offer only valid options). */
export interface SenderCapabilities {
  kinds: InvitationGrantKind[]
  invitableAccounts: InvitableAccount[]
  /** Apps with ≥1 invitable account. */
  invitableApps: EntitledAppSlug[]
  /** Apps the sender can grant access to (app-grant — access only). */
  grantableApps: EntitledAppSlug[]
}

/**
 * The invitee's existing state, scoped to what the sender may see. site-admin
 * builds this from the access directory; owner/manager from their managed
 * accounts' members. Lookups are by lowercased email.
 */
export interface InviteeState {
  /** Email is already a member of this account (within the sender's visibility). */
  isMemberOfAccount(email: string, accountId: string): boolean
  /** Email already holds access to this app (within the sender's visibility). */
  hasAppAccess(email: string, appSlug: EntitledAppSlug): boolean
}

export interface GrantDecision {
  allowed: boolean
  reason: string
}

// ---------------------------------------------------------------------------
// Capability helpers
// ---------------------------------------------------------------------------

export function availableGrantKinds(caps: Pick<SenderCapabilities, 'invitableAccounts' | 'grantableApps'>): InvitationGrantKind[] {
  const kinds: InvitationGrantKind[] = []
  if (caps.invitableAccounts.length > 0) kinds.push('account-invite')
  if (caps.grantableApps.length > 0) kinds.push('app-grant')
  return kinds
}

/**
 * Roles the sender may offer when inviting into an account. Owners offer any
 * role; managers may not offer owner (never grant authority above their own).
 */
export function invitableRolesForAccount(role: AccountRole | undefined): AccountRole[] {
  if (role === 'owner') return ['owner', 'manager', 'member', 'viewer']
  if (role === 'manager') return ['manager', 'member', 'viewer']
  return []
}

/** Human description of the sender's authority over a preset target account. */
export function describeViewerAuthorityForAccount(
  account: InvitableAccount | undefined,
  accountName: string,
): { role: AccountRole | null; summary: string } {
  if (account && (account.role === 'owner' || account.role === 'manager')) {
    return {
      role: account.role,
      summary: `You are ${account.role === 'owner' ? 'an owner' : 'a manager'} of ${accountName}, so you can invite people into it.`,
    }
  }
  return {
    role: null,
    summary: `You are not an owner or manager of ${accountName}, so you cannot invite people into it.`,
  }
}

// ---------------------------------------------------------------------------
// Check 2 — grant authorization (from capabilities only)
// ---------------------------------------------------------------------------

function canCreateGrant(caps: SenderCapabilities, grant: InvitationGrant): GrantDecision {
  if (grant.kind === 'account-invite') {
    const acct = caps.invitableAccounts.find((a) => a.accountId === grant.accountId)
    if (acct) {
      return {
        allowed: true,
        reason: `Authorized: you are ${acct.role === 'owner' ? 'an owner' : 'a manager'} of ${acct.name}.`,
      }
    }
    return { allowed: false, reason: 'Only an owner or manager of this account can invite into it.' }
  }
  if (caps.grantableApps.includes(grant.appSlug)) {
    return { allowed: true, reason: `Authorized: you can grant ${appLabel(grant.appSlug)} access.` }
  }
  return {
    allowed: false,
    reason: `Granting ${appLabel(grant.appSlug)} access requires site-admin or app-admin for that app.`,
  }
}

// ---------------------------------------------------------------------------
// Check 3 — duplicate / validity (invitee state the sender may see)
// ---------------------------------------------------------------------------

export function validateInvitationGrant(
  caps: SenderCapabilities,
  invitee: string,
  state: InviteeState,
  grant: InvitationGrant,
): GrantDecision {
  const auth = canCreateGrant(caps, grant)
  if (!auth.allowed) return auth

  if (grant.kind === 'account-invite') {
    if (invitee && state.isMemberOfAccount(invitee, grant.accountId)) {
      return {
        allowed: false,
        reason:
          'This user is already a member of this account. Manage their role from User Management instead of inviting them again.',
      }
    }
    return auth
  }
  // app-grant: redundant if the invitee already holds the access group.
  if (invitee && state.hasAppAccess(invitee, grant.appSlug)) {
    return {
      allowed: false,
      reason: `This person already has access to ${appLabel(grant.appSlug)}; an app-access grant would do nothing.`,
    }
  }
  return auth
}

/**
 * Same-app exclusivity (compose-time, structural): a bundle may NOT contain an
 * app-grant AND an account-invite for the SAME app. Returns the grantIds on BOTH
 * sides of any conflict so neither sends silently.
 */
export function findSameAppGrantConflicts(grants: InvitationGrant[]): Set<string> {
  const appGrantApps = new Set<EntitledAppSlug>()
  const accountScopedApps = new Set<EntitledAppSlug>()
  for (const g of grants) {
    if (g.kind === 'app-grant') appGrantApps.add(g.appSlug)
    else accountScopedApps.add(g.appSlug)
  }
  const conflictApps = new Set<EntitledAppSlug>()
  for (const slug of appGrantApps) if (accountScopedApps.has(slug)) conflictApps.add(slug)
  const conflicted = new Set<string>()
  if (conflictApps.size === 0) return conflicted
  for (const g of grants) if (conflictApps.has(g.appSlug)) conflicted.add(g.grantId)
  return conflicted
}

export interface BundleValidation {
  email: string
  perGrant: Array<{ grant: InvitationGrant; validation: GrantDecision }>
  allowedCount: number
  blockedCount: number
  sendable: boolean
}

export function validateInvitationBundle(
  caps: SenderCapabilities,
  email: string,
  state: InviteeState,
  grants: InvitationGrant[],
): BundleValidation {
  const conflictIds = findSameAppGrantConflicts(grants)
  const perGrant = grants.map((grant) => {
    if (conflictIds.has(grant.grantId)) {
      return {
        grant,
        validation: {
          allowed: false,
          reason: `Same-app conflict in ${appLabel(grant.appSlug)}: this bundle mixes an app-access grant (no account) with an account grant for the same app. Grant either app access alone OR an account — not both. Remove one to continue.`,
        } satisfies GrantDecision,
      }
    }
    return { grant, validation: validateInvitationGrant(caps, email, state, grant) }
  })
  const allowedCount = perGrant.filter((g) => g.validation.allowed).length
  return {
    email,
    perGrant,
    allowedCount,
    blockedCount: perGrant.length - allowedCount,
    sendable: /.+@.+\..+/.test(email.trim()) && allowedCount > 0,
  }
}
