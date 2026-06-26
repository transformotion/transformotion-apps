'use client'

import { Fragment, useCallback, useEffect, useState } from 'react'
import {
  Users,
  ShieldCheck,
  Shield,
  Ban,
  UserMinus,
  Info,
  Clock,
  CircleSlash,
  ChevronDown,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card, EmptyState } from '@/components/ui/design-system'
import {
  resolveUserLabel,
  toViewUserAccessSummary,
  userIsSiteAdmin,
  type AccountAccess,
  type AdminUser,
  type UserAccessSummary,
} from '@/lib/admin/view-model'
import { getControlPlaneClient } from '@/lib/services/control-plane-client'
import type { AccountRole } from '@transformotion/contracts/_shared/auth'

/**
 * Live Users & Access data. v0 read the mock store via `useM11Store()` +
 * `listUserAccess()`; the live source is `GET /api/admin/users/access`
 * (`UserAccessSummary[]`, site-admin only), mapped to the v0 nested view-model.
 * Mutations re-fetch so rows stay live (the v0 store-subscription analog).
 */
function useUserAccessDirectory() {
  const [summaries, setSummaries] = useState<UserAccessSummary[] | null>(null)

  const refresh = useCallback(async () => {
    try {
      const res = await getControlPlaneClient().getUserAccess()
      setSummaries(res.users.map(toViewUserAccessSummary))
    } catch (err) {
      console.error('[admin] users-access read failed:', err)
      setSummaries([])
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const removeFromAccount = useCallback(
    async (accountId: string, userId: string) => {
      try {
        await getControlPlaneClient().removeMember(accountId, userId)
        await refresh()
      } catch (err) {
        console.error('[admin] remove member failed:', err)
        alert(err instanceof Error ? err.message : 'Could not remove the member.')
      }
    },
    [refresh],
  )

  const setStatus = useCallback(
    async (userId: string, status: 'active' | 'disabled') => {
      try {
        await getControlPlaneClient().setUserStatus(userId, status)
        await refresh()
      } catch (err) {
        console.error('[admin] set user status failed:', err)
        alert(err instanceof Error ? err.message : 'Could not update the user.')
      }
    },
    [refresh],
  )

  return { summaries, removeFromAccount, setStatus }
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

function StatusChip({ status }: { status: AdminUser['status'] }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
        status === 'active'
          ? 'bg-signal-green/15 text-signal-green'
          : 'bg-signal-red/15 text-signal-red',
      )}
    >
      {status === 'disabled' && <CircleSlash className="size-3" />}
      {status}
    </span>
  )
}

function AccessIndicatorCell({ summary }: { summary: UserAccessSummary }) {
  if (summary.appAccess.length === 0) {
    return <span className="text-xs text-muted-foreground">No access</span>
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {summary.appAccess.map((app) => (
        <span
          key={app.appSlug}
          className="inline-flex items-center gap-1 rounded-md border border-border bg-surface2 px-2 py-0.5 text-[11px] font-medium text-foreground"
          title={
            app.appAdmin
              ? `${app.appLabel} · app-admin`
              : `${app.appLabel} · ${app.accounts.length} account${app.accounts.length === 1 ? '' : 's'}`
          }
        >
          {app.appAdmin && <Shield className="size-2.5 text-signal-gold" />}
          {app.appLabel}
        </span>
      ))}
    </div>
  )
}

function UserDetailPanel({
  viewer,
  summary,
  onRemoveFromAccount,
  onSetStatus,
}: {
  viewer: AdminUser
  summary: UserAccessSummary
  onRemoveFromAccount: (accountId: string, userId: string) => void
  onSetStatus: (userId: string, status: 'active' | 'disabled') => void
}) {
  const { user } = summary
  // M11: the per-user pending-invitation COUNT is now live (see the table badge,
  // `summary.pendingInvites`). This DETAIL LIST stays empty: `UserAccessSummary`
  // carries only the count, not a per-user pending LIST — wiring it needs a new
  // list field on the contract (v0-owned). Held until that v0 contract lands.
  const pendingInvites: Array<{ invitationId: string; accountId: string; status: string }> = []

  return (
    <div className="space-y-4" aria-label={`Access detail for ${resolveUserLabel(user)}`}>
          <div className="flex items-center gap-2">
            <StatusChip status={user.status} />
            {userIsSiteAdmin(user) && (
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
                <ShieldCheck className="size-3" />
                Site admin
              </span>
            )}
          </div>

          {user.status === 'disabled' && (
            <div className="flex items-start gap-2 rounded-lg border border-signal-red/30 bg-signal-red/10 p-3">
              <Ban className="mt-0.5 size-4 shrink-0 text-signal-red" />
              <p className="text-xs text-foreground">
                This user is disabled. Historical memberships are retained for audit, but the
                user is blocked from accessing any app.
              </p>
            </div>
          )}

          {/* App / account access */}
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              App &amp; account access
            </p>
            {summary.appAccess.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No app or account access on record.
              </p>
            ) : (
              <div className="space-y-3">
                {summary.appAccess.map((app) => (
                  <div key={app.appSlug} className="rounded-lg border border-border bg-surface/30 p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-foreground">{app.appLabel}</span>
                      {app.appAdmin && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-signal-gold/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-signal-gold">
                          <Shield className="size-3" />
                          app-admin
                        </span>
                      )}
                    </div>
                    {app.accounts.length === 0 ? (
                      <p className="text-xs text-muted-foreground">
                        App-level administration only (no account membership).
                      </p>
                    ) : (
                      <ul className="space-y-1.5">
                        {app.accounts.map((account) => (
                          <AccountAccessRow
                            key={account.accountId}
                            viewer={viewer}
                            account={account}
                            targetUser={user}
                            onRemoveFromAccount={onRemoveFromAccount}
                          />
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Pending invitations */}
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Pending invitations
            </p>
            {pendingInvites.length === 0 ? (
              <p className="text-sm text-muted-foreground">None.</p>
            ) : (
              <ul className="space-y-1.5">
                {pendingInvites.map((invite) => (
                  <li
                    key={invite.invitationId}
                    className="flex items-center gap-2 rounded-lg border border-border bg-surface/30 px-3 py-2"
                  >
                    <Clock className="size-3.5 shrink-0 text-signal-gold" />
                    <span className="text-xs text-foreground">{invite.accountId}</span>
                    <span className="ml-auto text-[10px] uppercase tracking-wider text-muted-foreground">
                      {invite.status}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Supervisory actions */}
          <div className="rounded-lg border border-border bg-surface/30 p-3">
            <div className="mb-2 flex items-center gap-1.5">
              <Info className="size-3.5 text-muted-foreground" />
              <p className="text-[11px] text-muted-foreground">
                Supervisory actions are authorized server-side and reflect live across every
                surface.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {user.status === 'disabled' ? (
                <button
                  disabled={!userIsSiteAdmin(viewer)}
                  onClick={() => onSetStatus(user.userId, 'active')}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface2 px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:text-signal-green disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <ShieldCheck className="size-3.5" />
                  Re-enable user
                </button>
              ) : (
                <button
                  disabled={!userIsSiteAdmin(viewer)}
                  onClick={() => onSetStatus(user.userId, 'disabled')}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface2 px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:text-signal-red disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Ban className="size-3.5" />
                  Disable user
                </button>
              )}
            </div>
          </div>

          {/* Visibility note */}
          <div className="flex items-start gap-2 rounded-lg border border-border bg-surface/30 p-3">
            <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">
              Site-admin visibility shows access mappings only. It does not grant access to the
              private data held inside these accounts.
            </p>
          </div>
    </div>
  )
}

function AccountAccessRow({
  viewer,
  account,
  targetUser,
  onRemoveFromAccount,
}: {
  viewer: AdminUser
  account: AccountAccess
  targetUser: AdminUser
  onRemoveFromAccount: (accountId: string, userId: string) => void
}) {
  // Users & Access is site-admin-gated, so the viewer here is always a
  // site-admin acting supervisorily; the server re-authorizes the removal.
  const canRemove = userIsSiteAdmin(viewer)
  // Per-account sole-owner state has no live source on this read; the server's
  // last-owner floor (409) is authoritative, so the guard defers to it here.
  const lastOwner = false

  return (
    <li className="flex items-center gap-2">
      <span className="truncate text-sm text-foreground">{account.accountName}</span>
      <RoleChip role={account.role} />
      <div className="ml-auto flex items-center gap-2">
        {lastOwner && (
          <span
            className="inline-flex items-center gap-1 rounded-full bg-signal-gold/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-signal-gold"
            title="This person is the only owner of this account. Assign another owner before they can be removed, so the account isn't left without an owner."
          >
            <Info className="size-2.5" />
            sole owner
          </span>
        )}
        <button
          disabled={!canRemove || lastOwner}
          onClick={() => {
            if (!canRemove || lastOwner) return
            onRemoveFromAccount(account.accountId, targetUser.userId)
          }}
          title={
            lastOwner
              ? 'This person is the only owner of this account. Assign another owner before removing them.'
              : canRemove
                ? 'Remove from account'
                : 'Requires owner/manager of this account or site-admin'
          }
          className="flex size-7 items-center justify-center rounded-md bg-surface2 text-muted-foreground transition-colors hover:text-signal-red disabled:cursor-not-allowed disabled:opacity-40"
          aria-label={`Remove ${resolveUserLabel(targetUser)} from ${account.accountName}`}
        >
          <UserMinus className="size-3.5" />
        </button>
      </div>
    </li>
  )
}

export function UsersAccessView({ viewer }: { viewer: AdminUser }) {
  const { summaries, removeFromAccount, setStatus } = useUserAccessDirectory()
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null)
  const toggleUser = (userId: string) =>
    setExpandedUserId((prev) => (prev === userId ? null : userId))

  if (summaries === null) {
    return <p className="text-sm text-muted-foreground">Loading directory…</p>
  }

  if (summaries.length === 0) {
    return (
      <EmptyState
        icon={Users}
        title="No users found"
        description="There are no users to display in this directory."
      />
    )
  }

  return (
    <>
      {/* Mobile cards */}
      <div className="space-y-3 md:hidden">
        {summaries.map((summary) => {
          const expanded = expandedUserId === summary.user.userId
          return (
            <Card key={summary.user.userId}>
              <button
                className="w-full text-left"
                onClick={() => toggleUser(summary.user.userId)}
                aria-expanded={expanded}
                aria-label={`${expanded ? 'Hide' : 'Show'} details for ${resolveUserLabel(summary.user)}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-medium text-foreground">
                        {resolveUserLabel(summary.user)}
                      </p>
                      {userIsSiteAdmin(summary.user) && <ShieldCheck className="size-3.5 text-primary" />}
                    </div>
                    <p className="truncate text-xs text-muted-foreground">{summary.user.email}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <StatusChip status={summary.user.status} />
                    <ChevronDown
                      className={cn(
                        'size-4 text-muted-foreground transition-transform',
                        expanded && 'rotate-180',
                      )}
                    />
                  </div>
                </div>
                <div className="mt-3">
                  <AccessIndicatorCell summary={summary} />
                </div>
              </button>
              {expanded && (
                <div className="mt-4 border-t border-border pt-4">
                  <UserDetailPanel
                    viewer={viewer}
                    summary={summary}
                    onRemoveFromAccount={removeFromAccount}
                    onSetStatus={setStatus}
                  />
                </div>
              )}
            </Card>
          )
        })}
      </div>

      {/* Desktop table */}
      <div className="hidden overflow-hidden rounded-xl border border-border md:block">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-border bg-surface/40">
              <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                User
              </th>
              <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Status
              </th>
              <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Platform
              </th>
              <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Access
              </th>
              <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Invites
              </th>
              <th className="w-10 px-4 py-3">
                <span className="sr-only">Expand</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {summaries.map((summary) => {
              const expanded = expandedUserId === summary.user.userId
              return (
                <Fragment key={summary.user.userId}>
                  <tr
                    onClick={() => toggleUser(summary.user.userId)}
                    aria-expanded={expanded}
                    className={cn(
                      'cursor-pointer border-b border-border transition-colors hover:bg-surface2/50',
                      expanded ? 'bg-surface2/30' : 'last:border-0',
                    )}
                  >
                    <td className="px-4 py-3">
                      <p className="font-medium text-foreground">{resolveUserLabel(summary.user)}</p>
                      <p className="text-xs text-muted-foreground">{summary.user.email}</p>
                    </td>
                    <td className="px-4 py-3">
                      <StatusChip status={summary.user.status} />
                    </td>
                    <td className="px-4 py-3">
                      {userIsSiteAdmin(summary.user) ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
                          <ShieldCheck className="size-3" />
                          site admin
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <AccessIndicatorCell summary={summary} />
                    </td>
                    <td className="px-4 py-3">
                      {summary.pendingInvites > 0 ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-signal-gold/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-signal-gold">
                          <Clock className="size-3" />
                          {summary.pendingInvites}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <ChevronDown
                        className={cn(
                          'size-4 text-muted-foreground transition-transform',
                          expanded && 'rotate-180',
                        )}
                      />
                    </td>
                  </tr>
                  {expanded && (
                    <tr className="border-b border-border bg-surface/20 last:border-0">
                      <td colSpan={6} className="px-4 py-4">
                        <div className="max-w-2xl">
                          <UserDetailPanel
                            viewer={viewer}
                            summary={summary}
                            onRemoveFromAccount={removeFromAccount}
                            onSetStatus={setStatus}
                          />
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </>
  )
}
