'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Building2,
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  Clock,
  Info,
  Shield,
  ShieldCheck,
  UserMinus,
  UserPlus,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card, EmptyState } from '@/components/ui/design-system'
import {
  appLabel,
  appLabelMap,
  resolveUserLabel,
  userIsSiteAdmin,
  type AdminUser,
} from '@/lib/admin/view-model'
import {
  assignableRolesFor,
  canCancelInvitationGrant,
  canChangeMemberRole,
  canManageAccountMembers,
  canRemoveMember,
} from '@/lib/admin/account-policy'
import { getControlPlaneClient } from '@/lib/services/control-plane-client'
import { authService } from '@/lib/services/auth'
import type { AccountMemberRow, InvitationBundle } from '@transformotion/contracts/launchpad/invitations'
import type { AccountRole, EntitledAppSlug } from '@transformotion/contracts/_shared/auth'

/** Minimal account shape the view renders (accountId + appSlug + name). */
interface ManagedAccount {
  accountId: string
  appSlug: EntitledAppSlug
  name: string
}

/** v0 member view-model — adapt the flat contract row to `{ user, role, ... }`. */
interface MemberVM {
  user: AdminUser
  role: AccountRole
  isLastOwner: boolean
}

function toMemberVM(row: AccountMemberRow): MemberVM {
  return {
    // members/detail omits displayName/groups → label falls back to email, and
    // the site-admin shield (group-derived) is not shown on member rows.
    user: { userId: row.userId, email: row.email, displayName: undefined, status: row.status, groups: [] },
    role: row.role,
    isLastOwner: row.isLastOwner,
  }
}

/** v0 pending-invitation row shape — one row per account-invite grant. */
type PendingInviteVM = {
  bundleId: string
  grantId: string
  email: string
  status: string
  role: AccountRole
  createdAt: string
  expiresAt: number
}

/**
 * Flatten the contract's `pendingInvitations` (bundles, grants already scoped to
 * this account by the backend, #556) into v0's enriched row shape — exactly what
 * the v0 `listPendingInvitationsForAccount` returns (one row per account-invite
 * grant, carrying role + sent/expiry). Presentation is reproduced verbatim; only
 * the data source is live.
 */
function toPendingInviteVMs(bundles: InvitationBundle[]): PendingInviteVM[] {
  return bundles.flatMap((b) =>
    (b.grants ?? [])
      .filter((g) => g.kind === 'account-invite')
      .map((g) => ({
        bundleId: b.bundleId,
        grantId: g.grantId,
        email: b.email,
        status: b.status,
        role: (g as { role: AccountRole }).role,
        createdAt: b.createdAt,
        expiresAt: b.expiresAt,
      })),
  )
}

// Format helpers — ported verbatim from the v0 prototype
// (`components/launchpad/admin/account-management-view.tsx`).
/** Sent date — absolute date from an ISO timestamp. */
function formatSentDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

/** Expiry — absolute date from a Unix-seconds timestamp. */
function formatExpiry(expiresAt: number): string {
  const d = new Date(expiresAt * 1000)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

/** Past-expiry guard (Unix seconds vs now). */
function isInvitationExpired(expiresAt: number): boolean {
  return expiresAt * 1000 < Date.now()
}

/**
 * Live Account directory. v0 read the mock store via `useM11Store()`; the live
 * sources are CONTRACTED endpoints (no GET /accounts needed):
 *   - site-admin viewer → flatten GET /api/admin/users/access (all accounts)
 *   - owner/manager viewer → token `accounts` claim + GET /accounts/{id} (name)
 * Members per account come from GET /accounts/{id}/members/detail. Mutations
 * (role change, removal) write through the control-plane and refresh.
 */
function useAccountDirectory(viewer: AdminUser) {
  const [accounts, setAccounts] = useState<ManagedAccount[] | null>(null)
  const [membersByAccount, setMembersByAccount] = useState<Map<string, MemberVM[]>>(new Map())
  const [pendingByAccount, setPendingByAccount] = useState<Map<string, PendingInviteVM[]>>(new Map())
  const [viewerRoleByAccount, setViewerRoleByAccount] = useState<Map<string, AccountRole>>(new Map())

  const isSiteAdmin = userIsSiteAdmin(viewer)

  const loadMembers = useCallback(async (accts: ManagedAccount[]) => {
    const client = getControlPlaneClient()
    const map = new Map<string, MemberVM[]>()
    const pending = new Map<string, PendingInviteVM[]>()
    await Promise.all(
      accts.map(async (a) => {
        try {
          const res = await client.getMembersDetail(a.accountId)
          map.set(a.accountId, res.members.map(toMemberVM))
          pending.set(a.accountId, toPendingInviteVMs(res.pendingInvitations))
        } catch (err) {
          console.warn('[admin] members read failed:', a.accountId, err)
        }
      }),
    )
    setMembersByAccount(map)
    setPendingByAccount(pending)
  }, [])

  const load = useCallback(async () => {
    const client = getControlPlaneClient()
    const roleMap = new Map<string, AccountRole>()
    let accts: ManagedAccount[] = []

    if (isSiteAdmin) {
      // Site-admin: every account, flattened from the access directory.
      const res = await client.getUserAccess()
      const byId = new Map<string, ManagedAccount>()
      for (const u of res.users) {
        for (const app of u.appAccess) {
          for (const acct of app.accounts) {
            if (!byId.has(acct.accountId)) {
              byId.set(acct.accountId, { accountId: acct.accountId, appSlug: app.appSlug, name: acct.accountName })
            }
            if (u.userId === viewer.userId) roleMap.set(acct.accountId, acct.role)
          }
        }
      }
      accts = [...byId.values()]
    } else {
      // Owner/manager: accounts from the token's `accounts` claim, owner/manager only.
      for (const slug of Object.keys(appLabelMap) as EntitledAppSlug[]) {
        let rows: Array<{ accountId: string; role: string }> = []
        try {
          rows = await authService.getAccountsForApp(slug)
        } catch {
          rows = []
        }
        for (const r of rows) {
          if (r.role !== 'owner' && r.role !== 'manager') continue
          let name = r.accountId
          try {
            const acc = await client.getAccount(r.accountId)
            name = acc.account?.name ?? r.accountId
          } catch {
            /* name falls back to id */
          }
          accts.push({ accountId: r.accountId, appSlug: slug, name })
          roleMap.set(r.accountId, r.role as AccountRole)
        }
      }
    }

    setAccounts(accts)
    setViewerRoleByAccount(roleMap)
    await loadMembers(accts)
  }, [isSiteAdmin, viewer.userId, loadMembers])

  useEffect(() => {
    void load().catch((err) => {
      console.error('[admin] account directory load failed:', err)
      setAccounts([])
    })
  }, [load])

  const applyDetail = useCallback((accountId: string, res: { members: AccountMemberRow[]; pendingInvitations: InvitationBundle[] }) => {
    setMembersByAccount((prev) => new Map(prev).set(accountId, res.members.map(toMemberVM)))
    setPendingByAccount((prev) => new Map(prev).set(accountId, toPendingInviteVMs(res.pendingInvitations)))
  }, [])

  const updateRole = useCallback(async (accountId: string, userId: string, role: AccountRole) => {
    const res = await getControlPlaneClient().updateMemberRole(accountId, userId, role)
    applyDetail(accountId, res)
  }, [applyDetail])

  const removeMember = useCallback(async (accountId: string, userId: string) => {
    await getControlPlaneClient().removeMember(accountId, userId)
    const res = await getControlPlaneClient().getMembersDetail(accountId)
    applyDetail(accountId, res)
  }, [applyDetail])

  // M11 cancel-invitation (#558): revoke the grant, then refetch so the row
  // leaves the pending list (the server has removed it from the bundle).
  const cancelInvitation = useCallback(async (accountId: string, bundleId: string, grantId: string) => {
    await getControlPlaneClient().cancelInvitationGrant(bundleId, grantId)
    const res = await getControlPlaneClient().getMembersDetail(accountId)
    applyDetail(accountId, res)
  }, [applyDetail])

  return { accounts, membersByAccount, pendingByAccount, viewerRoleByAccount, updateRole, removeMember, cancelInvitation }
}

const ROLE_STYLES: Record<AccountRole, string> = {
  owner: 'bg-primary/15 text-primary',
  manager: 'bg-signal-green/15 text-signal-green',
  member: 'bg-surface2 text-foreground',
  viewer: 'bg-surface2 text-muted-foreground',
}

function RoleChip({ role }: { role: AccountRole }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
        ROLE_STYLES[role],
      )}
    >
      {role}
    </span>
  )
}

function initials(label: string): string {
  return label
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

// ---------------------------------------------------------------------------
// Member row — role change + removal, each gated with a rationale
// ---------------------------------------------------------------------------

function MemberRow({
  viewerRole,
  viewerIsSiteAdmin,
  account,
  member,
  onUpdateRole,
  onRemoveMember,
}: {
  viewerRole: AccountRole | null
  viewerIsSiteAdmin: boolean
  account: ManagedAccount
  member: MemberVM
  onUpdateRole: (accountId: string, userId: string, role: AccountRole) => Promise<void>
  onRemoveMember: (accountId: string, userId: string) => Promise<void>
}) {
  const assignable = assignableRolesFor(viewerRole)
  const removal = canRemoveMember(viewerRole, member.role, member.isLastOwner, viewerIsSiteAdmin)
  const soleOwner = member.role === 'owner' && member.isLastOwner

  // A select is only meaningful if the actor can manage members AND there is at
  // least one *other* role they're permitted to assign to this specific member.
  const roleOptions = assignable.filter((role) => {
    if (role === member.role) return true
    return canChangeMemberRole(viewerRole, member.role, role, member.isLastOwner).allowed
  })
  const canEditRole = assignable.length > 0 && roleOptions.length > 1

  return (
    <li className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface/30 px-3 py-2">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[11px] font-semibold text-primary">
        {initials(resolveUserLabel(member.user))}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="truncate text-sm font-medium text-foreground">
            {resolveUserLabel(member.user)}
          </p>
          {userIsSiteAdmin(member.user) && <ShieldCheck className="size-3.5 shrink-0 text-primary" />}
          {member.user.status === 'disabled' && (
            <span className="rounded-full bg-signal-red/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-signal-red">
              disabled
            </span>
          )}
        </div>
        <p className="truncate text-xs text-muted-foreground">{member.user.email}</p>
      </div>

      {soleOwner && (
        <span
          className="inline-flex items-center gap-1 rounded-full bg-signal-gold/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-signal-gold"
          title="This person is the only owner. Assign another owner before changing or removing them."
        >
          <Info className="size-2.5" />
          sole owner
        </span>
      )}

      {canEditRole ? (
        <label className="sr-only" htmlFor={`role-${account.accountId}-${member.user.userId}`}>
          Role for {resolveUserLabel(member.user)}
        </label>
      ) : null}
      {canEditRole ? (
        <select
          id={`role-${account.accountId}-${member.user.userId}`}
          defaultValue={member.role}
          onChange={async (e) => {
            const select = e.target
            const newRole = select.value as AccountRole
            try {
              await onUpdateRole(account.accountId, member.user.userId, newRole)
            } catch (err) {
              // Revert the select on a rejected change.
              select.value = member.role
              alert(err instanceof Error ? err.message : 'Could not change the role.')
            }
          }}
          className="rounded-md border border-border bg-surface2 px-2 py-1 text-xs font-medium text-foreground outline-none focus:border-primary/40"
          title="Change role"
        >
          {roleOptions.map((role) => (
            <option key={role} value={role}>
              {role}
            </option>
          ))}
        </select>
      ) : (
        <RoleChip role={member.role} />
      )}

      <button
        disabled={!removal.allowed}
        onClick={async () => {
          if (!removal.allowed) return
          try {
            await onRemoveMember(account.accountId, member.user.userId)
          } catch (err) {
            alert(err instanceof Error ? err.message : 'Could not remove the member.')
          }
        }}
        title={removal.reason}
        className="flex size-7 shrink-0 items-center justify-center rounded-md bg-surface2 text-muted-foreground transition-colors hover:text-signal-red disabled:cursor-not-allowed disabled:opacity-40"
        aria-label={`Remove ${resolveUserLabel(member.user)} from ${account.name}`}
      >
        <UserMinus className="size-3.5" />
      </button>
    </li>
  )
}

// ---------------------------------------------------------------------------
// Account detail panel (renders inline below the account row when expanded)
// ---------------------------------------------------------------------------

function AccountDetailPanel({
  viewerRole,
  viewerIsSiteAdmin,
  account,
  members,
  invitations,
  onUpdateRole,
  onRemoveMember,
  onCancelInvitation,
}: {
  viewerRole: AccountRole | null
  viewerIsSiteAdmin: boolean
  account: ManagedAccount
  members: MemberVM[]
  invitations: PendingInviteVM[]
  onUpdateRole: (accountId: string, userId: string, role: AccountRole) => Promise<void>
  onRemoveMember: (accountId: string, userId: string) => Promise<void>
  onCancelInvitation: (bundleId: string, grantId: string) => Promise<void>
}) {
  const router = useRouter()
  // M11: real account-scoped pending invitations from GET …/members/detail
  // (#556). The cancel-X has no server endpoint yet → stays inert (separate item).
  const manages = canManageAccountMembers(viewerRole)
  const supervisory = !manages && viewerIsSiteAdmin

  return (
    <div className="space-y-4" aria-label={`Member management for ${account.name}`}>
          {/* Authority banner */}
          <div
            className={cn(
              'flex items-start gap-2 rounded-lg border p-3',
              manages
                ? 'border-signal-green/30 bg-signal-green/10'
                : supervisory
                  ? 'border-primary/30 bg-primary/10'
                  : 'border-border bg-surface/30',
            )}
          >
            {manages ? (
              <Shield className="mt-0.5 size-4 shrink-0 text-signal-green" />
            ) : supervisory ? (
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
            ) : (
              <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            )}
            <p className="text-xs text-foreground">
              {manages
                ? `You are ${viewerRole === 'owner' ? 'an owner' : 'a manager'} of this account and can manage its members and invitations.`
                : supervisory
                  ? "Site-admin supervisory access: you can remove members and cancel invitations, but you cannot change roles or read the account's private data."
                  : 'You can view this account but cannot manage its members.'}
            </p>
          </div>

          {/* Members */}
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Members ({members.length})
            </p>
            {members.length === 0 ? (
              <p className="text-sm text-muted-foreground">No members on record.</p>
            ) : (
              <ul className="space-y-2">
                {members.map((member) => (
                  <MemberRow
                    key={member.user.userId}
                    viewerRole={viewerRole}
                    viewerIsSiteAdmin={viewerIsSiteAdmin}
                    account={account}
                    member={member}
                    onUpdateRole={onUpdateRole}
                    onRemoveMember={onRemoveMember}
                  />
                ))}
              </ul>
            )}
          </div>

          {/* Invite entry point (account-invite is owner/manager only) */}
          {manages ? (
            <button
              onClick={() => {
                // Pass ONLY this account as handoff context — never carry over
                // stale query params that could shadow the intended target.
                router.push(`/launchpad/admin/invite?accountId=${account.accountId}`)
              }}
              className="flex w-full items-center gap-2 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2.5 text-sm font-medium text-primary transition-colors hover:bg-primary/15"
            >
              <UserPlus className="size-4 shrink-0" />
              <span className="min-w-0 flex-1 text-left truncate">Invite someone to {account.name}</span>
              <ChevronRight className="size-4 shrink-0" />
            </button>
          ) : supervisory ? (
            <div className="flex items-start gap-2 rounded-lg border border-border bg-surface/30 p-3">
              <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">
                Inviting people into a private account is reserved for its owners and managers. As a
                site-admin you have supervisory controls (remove member, cancel invitation) but are
                not automatically authorized to add members.
              </p>
            </div>
          ) : null}

          {/* Pending invitations */}
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Pending invitations ({invitations.length})
            </p>
            {invitations.length === 0 ? (
              <p className="text-sm text-muted-foreground">None.</p>
            ) : (
              <ul className="space-y-2">
                {invitations.map((invite) => {
                  const cancel = canCancelInvitationGrant(viewerRole, viewerIsSiteAdmin)
                  const expired = isInvitationExpired(invite.expiresAt)
                  return (
                    <li
                      key={invite.grantId}
                      className="flex items-start gap-2 rounded-lg border border-border bg-surface/30 px-3 py-2"
                    >
                      <Clock className="mt-0.5 size-3.5 shrink-0 text-signal-gold" />
                      <div className="min-w-0 flex-1">
                        {/* Invited email + role/grant */}
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="min-w-0 truncate text-xs font-medium text-foreground">
                            {invite.email}
                          </span>
                          <RoleChip role={invite.role} />
                        </div>
                        {/* Sent date + expiry */}
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          Sent {formatSentDate(invite.createdAt)}
                          {' · '}
                          <span className={cn(expired && 'text-signal-red')}>
                            {expired ? 'Expired ' : 'Expires '}
                            {formatExpiry(invite.expiresAt)}
                          </span>
                        </p>
                      </div>
                      <span
                        className={cn(
                          'shrink-0 rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider',
                          expired
                            ? 'bg-signal-red/15 text-signal-red'
                            : 'bg-signal-gold/15 text-signal-gold',
                        )}
                      >
                        {expired ? 'expired' : invite.status}
                      </span>
                      {/* Cancel control (#558): revoke this grant → DELETE
                          .../grants/{grantId}; the row leaves the pending list. */}
                      <button
                        disabled={!cancel.allowed}
                        onClick={() => {
                          if (!cancel.allowed) return
                          void onCancelInvitation(invite.bundleId, invite.grantId)
                        }}
                        title={cancel.reason}
                        className="flex size-7 shrink-0 items-center justify-center rounded-md bg-surface2 text-muted-foreground transition-colors hover:text-signal-red disabled:cursor-not-allowed disabled:opacity-40"
                        aria-label={`Cancel invitation for ${invite.email}`}
                      >
                        <X className="size-3.5" />
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          {/* Note */}
          <div className="flex items-start gap-2 rounded-lg border border-border bg-surface/30 p-3">
            <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">
              Role changes and removals are authorized server-side and update live across every
              surface. Disabled controls show the authorization rationale on hover.
            </p>
          </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Account list (grouped by app)
// ---------------------------------------------------------------------------

export function AccountManagementView({ viewer }: { viewer: AdminUser }) {
  const { accounts, membersByAccount, pendingByAccount, viewerRoleByAccount, updateRole, removeMember, cancelInvitation } =
    useAccountDirectory(viewer)
  const viewerIsSiteAdmin = userIsSiteAdmin(viewer)
  // Multiple accounts can stay expanded at once; "Collapse all" clears them.
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const toggleAccount = (accountId: string) =>
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(accountId)) next.delete(accountId)
      else next.add(accountId)
      return next
    })

  const grouped = useMemo(() => {
    const map = new Map<EntitledAppSlug, ManagedAccount[]>()
    for (const account of accounts ?? []) {
      const slug = account.appSlug
      const list = map.get(slug) ?? []
      list.push(account)
      map.set(slug, list)
    }
    return [...map.entries()]
  }, [accounts])

  if (accounts === null) {
    return <p className="text-sm text-muted-foreground">Loading accounts…</p>
  }

  if (accounts.length === 0) {
    return (
      <EmptyState
        icon={Building2}
        title="No manageable accounts"
        description="You are not an owner or manager of any account. Account member management is available to account owners/managers and to site-admins."
      />
    )
  }

  return (
    <div className="space-y-6">
      {/* Collapse all — shown only when at least one account is expanded */}
      {expandedIds.size > 0 && (
        <div className="flex justify-end">
          <button
            onClick={() => setExpandedIds(new Set())}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-surface2 hover:text-foreground"
          >
            <ChevronsDownUp className="size-3.5" />
            Collapse all
          </button>
        </div>
      )}

      {grouped.map(([slug, list]) => (
        <div key={slug}>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {appLabel(slug)}
          </p>
          <div className="space-y-2">
            {list.map((account) => {
              const members = membersByAccount.get(account.accountId) ?? []
              const invitations = pendingByAccount.get(account.accountId) ?? []
              const memberCount = members.length
              const role = viewerRoleByAccount.get(account.accountId) ?? null
              const expanded = expandedIds.has(account.accountId)
              return (
                <Card key={account.accountId}>
                  <button
                    className="w-full text-left"
                    onClick={() => toggleAccount(account.accountId)}
                    aria-expanded={expanded}
                    aria-label={`${expanded ? 'Hide' : 'Show'} details for ${account.name}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-surface2 text-muted-foreground">
                        <Building2 className="size-4.5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">
                          {account.name}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {memberCount} member{memberCount === 1 ? '' : 's'}
                        </p>
                      </div>
                      {role ? (
                        <RoleChip role={role} />
                      ) : (
                        <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
                          site-admin
                        </span>
                      )}
                      <ChevronDown
                        className={cn(
                          'size-4 shrink-0 text-muted-foreground transition-transform',
                          expanded && 'rotate-180',
                        )}
                      />
                    </div>
                  </button>
                  {expanded && (
                    <div className="mt-4 border-t border-border pt-4">
                      <AccountDetailPanel
                        viewerRole={role}
                        viewerIsSiteAdmin={viewerIsSiteAdmin}
                        account={account}
                        members={members}
                        invitations={invitations}
                        onUpdateRole={updateRole}
                        onRemoveMember={removeMember}
                        onCancelInvitation={async (bundleId, grantId) => {
                          try {
                            await cancelInvitation(account.accountId, bundleId, grantId)
                          } catch (err) {
                            alert(err instanceof Error ? err.message : 'Could not cancel the invitation.')
                          }
                        }}
                      />
                    </div>
                  )}
                </Card>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
