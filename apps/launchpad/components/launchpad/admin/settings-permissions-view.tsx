'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Building2,
  Globe,
  Lock,
  Pencil,
  ShieldCheck,
  SlidersHorizontal,
  User,
  Users,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  appLabel,
  appsAdministeredByUser,
  resolveUserLabel,
  toViewUserAccessSummary,
  userIsSiteAdmin,
  type AdminUser,
  type UserAccessSummary,
} from '@/lib/admin/view-model'
import {
  canEditAccountSettings,
  canEditAppSettings,
  canEditPlatformSettings,
  canEditUserSettings,
  type PermissionDecision,
} from '@/lib/admin/settings-policy'
import { getControlPlaneClient } from '@/lib/services/control-plane-client'
import type { EntitledAppSlug } from '@transformotion/contracts/_shared/auth'

type SettingsScope = 'user' | 'account' | 'app' | 'platform'

const SCOPE_META: Record<
  SettingsScope,
  { label: string; icon: React.ComponentType<{ className?: string }>; blurb: string }
> = {
  user: {
    label: 'User',
    icon: User,
    blurb: 'Personal profile and preferences — editable only by the owning user.',
  },
  account: {
    label: 'Account',
    icon: Building2,
    blurb: 'Account-level configuration — editable by an owner or manager of the account.',
  },
  app: {
    label: 'App',
    icon: SlidersHorizontal,
    blurb: "App-wide configuration — editable by a site-admin or the app's app-admin.",
  },
  platform: {
    label: 'Platform',
    icon: Globe,
    blurb: 'Cross-app platform configuration — editable by site-admins only.',
  },
}

/**
 * Placeholder example settings used ONLY to demonstrate scoped authorization.
 * These are deliberately neutral labels — they are not committed Transformotion
 * product requirements. The two AI rows reference the M15.1 app-owned AI
 * override / Launchpad-owned platform AI default architecture decisions.
 */
const EXAMPLE_SETTINGS: Record<SettingsScope, string[]> = {
  user: ['Notification preferences', 'Display preference (example)'],
  account: ['Account name', 'Account-level preference (example)'],
  app: ['App AI model override (M15.1)', 'App-level preference (example)'],
  platform: ['Platform AI default (M15.1)', 'Platform-level preference (example)'],
}

function DecisionPill({ decision }: { decision: PermissionDecision }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
        decision.allowed
          ? 'bg-signal-green/15 text-signal-green'
          : 'bg-surface2 text-muted-foreground',
      )}
    >
      {decision.allowed ? <Pencil className="size-2.5" /> : <Lock className="size-2.5" />}
      {decision.allowed ? 'Editable' : 'Read-only'}
    </span>
  )
}

function ScopeCard({
  scope,
  contextLabel,
  decision,
  settings,
}: {
  scope: SettingsScope
  contextLabel: string
  decision: PermissionDecision
  settings: string[]
}) {
  const meta = SCOPE_META[scope]
  const Icon = meta.icon

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-start gap-3">
        <div
          className={cn(
            'flex size-10 shrink-0 items-center justify-center rounded-lg',
            decision.allowed ? 'bg-signal-green/15 text-signal-green' : 'bg-surface2 text-muted-foreground',
          )}
        >
          <Icon className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground">
                {meta.label} settings
              </p>
              <p className="truncate text-xs text-muted-foreground">{contextLabel}</p>
            </div>
            <DecisionPill decision={decision} />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">{meta.blurb}</p>
        </div>
      </div>

      {/* Example settings rows */}
      <ul className="mt-3 space-y-1.5">
        {settings.map((setting) => (
          <li
            key={setting}
            className="flex items-center justify-between gap-2 rounded-lg border border-border bg-surface/30 px-3 py-2"
          >
            <span className="truncate text-sm text-foreground">{setting}</span>
            <button
              disabled={!decision.allowed}
              title={decision.reason}
              className={cn(
                'inline-flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                decision.allowed
                  ? 'bg-surface2 text-foreground hover:bg-surface3'
                  : 'bg-surface2 text-muted-foreground cursor-not-allowed opacity-60',
              )}
            >
              {decision.allowed ? <Pencil className="size-3" /> : <Lock className="size-3" />}
              {decision.allowed ? 'Edit' : 'Locked'}
            </button>
          </li>
        ))}
      </ul>

      {/* Rationale */}
      <div className="mt-3 flex items-start gap-2 rounded-lg border border-border bg-surface/30 p-3">
        {decision.allowed ? (
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-signal-green" />
        ) : (
          <Lock className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        )}
        <p className="text-xs text-foreground">{decision.reason}</p>
      </div>
    </div>
  )
}

/**
 * Live directory for the demo. v0 iterated `mockUsers`; the live source is
 * GET /api/admin/users/access (site-admin). For a non-site-admin viewer the
 * read 403s — the demo degrades to the viewer alone (still illustrates scope).
 */
function useSettingsDirectory(viewer: AdminUser) {
  const [users, setUsers] = useState<UserAccessSummary[] | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await getControlPlaneClient().getUserAccess()
      setUsers(res.users.map(toViewUserAccessSummary))
    } catch {
      // Non-site-admin (or read failure): fall back to the viewer alone.
      setUsers([{ user: viewer, appAccess: [], pendingInvites: 0 }])
    }
  }, [viewer])

  useEffect(() => {
    void load()
  }, [load])

  return users
}

export function SettingsPermissionsView({ viewer }: { viewer: AdminUser }) {
  const users = useSettingsDirectory(viewer)

  // Cascading context: user -> app (apps the user can access) -> account
  // (accounts the user belongs to within that app). Selecting a user resets the
  // available apps; selecting an app resets the available accounts.
  const [targetUserId, setTargetUserId] = useState<string>(viewer.userId)
  const [appSlugSel, setAppSlugSel] = useState<EntitledAppSlug | ''>('')
  const [accountIdSel, setAccountIdSel] = useState<string>('')

  const viewerIsSiteAdmin = userIsSiteAdmin(viewer)
  const viewerAdminApps = useMemo(() => appsAdministeredByUser(viewer), [viewer])

  const targetSummary = users?.find((u) => u.user.userId === targetUserId)
  const viewerSummary = users?.find((u) => u.user.userId === viewer.userId)

  // Apps the selected user can access (membership or app-admin authority).
  const appAccess = useMemo(() => targetSummary?.appAccess ?? [], [targetSummary])

  // Effective app: honor the selection if still valid for this user, else fall
  // back to the user's first accessible app.
  const appSlug: EntitledAppSlug | undefined = useMemo(() => {
    if (appSlugSel && appAccess.some((a) => a.appSlug === appSlugSel)) return appSlugSel
    return appAccess[0]?.appSlug
  }, [appSlugSel, appAccess])

  const selectedAppAccess = useMemo(
    () => appAccess.find((a) => a.appSlug === appSlug),
    [appAccess, appSlug],
  )
  const appAccounts = useMemo(() => selectedAppAccess?.accounts ?? [], [selectedAppAccess])

  // Effective account: honor selection if still valid for the chosen app, else
  // fall back to the first account the user has within that app.
  const accountId: string | undefined = useMemo(() => {
    if (accountIdSel && appAccounts.some((a) => a.accountId === accountIdSel)) return accountIdSel
    return appAccounts[0]?.accountId
  }, [accountIdSel, appAccounts])

  const account = appAccounts.find((a) => a.accountId === accountId)

  /** The VIEWER's role in a given account (from the viewer's own summary). */
  const viewerRoleForAccount = (id: string | undefined) => {
    if (!id) return null
    for (const app of viewerSummary?.appAccess ?? []) {
      const acct = app.accounts.find((a) => a.accountId === id)
      if (acct) return acct.role
    }
    return null
  }

  const userDecision = useMemo(
    () => canEditUserSettings(viewer.userId, targetUserId),
    [viewer.userId, targetUserId],
  )
  const accountDecision = useMemo(
    () =>
      accountId
        ? canEditAccountSettings(viewerRoleForAccount(accountId))
        : {
            allowed: false,
            reason: 'This user has no account in the selected app, so there is nothing to edit.',
          },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [accountId, viewerSummary],
  )
  const appDecision = useMemo(
    () =>
      appSlug
        ? canEditAppSettings(viewerIsSiteAdmin, viewerAdminApps.includes(appSlug), appLabel(appSlug))
        : {
            allowed: false,
            reason: 'This user has no app access, so there is nothing to edit.',
          },
    [appSlug, viewerIsSiteAdmin, viewerAdminApps],
  )
  const platformDecision = useMemo(
    () => canEditPlatformSettings(viewerIsSiteAdmin),
    [viewerIsSiteAdmin],
  )

  const selectClass =
    'rounded-md border border-border bg-surface2 px-2 py-1 text-xs font-medium text-foreground outline-none focus:border-primary/40'

  if (users === null) {
    return <p className="text-sm text-muted-foreground">Loading…</p>
  }

  return (
    <div className="space-y-5">
      {/* Intro */}
      <div className="flex items-start gap-2 rounded-xl border border-border bg-surface/30 p-4">
        <Users className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">Permissions prototype.</span> This page
            demonstrates how user, account, app and platform settings authorization changes with
            scope and role — it is not a product settings roadmap. The same setting can be editable
            or read-only depending on its scope and your role. Switch the target user, app or
            account below to see how authorization changes. All edits are mock-only and do not
            persist.
          </p>
          <p className="rounded-lg border border-border bg-surface2/50 px-3 py-2 text-[11px] italic text-muted-foreground">
            Example settings are placeholders for demonstrating scoped authorization. They are not
            committed product requirements unless explicitly documented elsewhere.
          </p>
        </div>
      </div>

      {/* Context selectors — cascade: user -> app -> account */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Target user
          </span>
          <select
            value={targetUserId}
            onChange={(e) => {
              setTargetUserId(e.target.value)
              // Reset downstream selections; effective values recompute for the new user.
              setAppSlugSel('')
              setAccountIdSel('')
            }}
            className={selectClass}
          >
            {users.map((u) => (
              <option key={u.user.userId} value={u.user.userId}>
                {resolveUserLabel(u.user)}
                {u.user.userId === viewer.userId ? ' (you)' : ''}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Target app
          </span>
          <select
            value={appSlug ?? ''}
            disabled={appAccess.length === 0}
            onChange={(e) => {
              setAppSlugSel(e.target.value as EntitledAppSlug)
              setAccountIdSel('')
            }}
            className={selectClass}
          >
            {appAccess.length === 0 ? (
              <option value="">No app access</option>
            ) : (
              appAccess.map((app) => (
                <option key={app.appSlug} value={app.appSlug}>
                  {app.appLabel}
                  {app.appAdmin ? ' · app-admin' : ''}
                </option>
              ))
            )}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Target account
          </span>
          <select
            value={accountId ?? ''}
            disabled={appAccounts.length === 0}
            onChange={(e) => setAccountIdSel(e.target.value)}
            className={selectClass}
          >
            {appAccounts.length === 0 ? (
              <option value="">No account in this app</option>
            ) : (
              appAccounts.map((acct) => (
                <option key={acct.accountId} value={acct.accountId}>
                  {acct.accountName} · {acct.role}
                </option>
              ))
            )}
          </select>
        </label>
      </div>

      {/* Scope cards */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <ScopeCard
          scope="user"
          contextLabel={targetSummary ? resolveUserLabel(targetSummary.user) : '—'}
          decision={userDecision}
          settings={EXAMPLE_SETTINGS.user}
        />
        <ScopeCard
          scope="account"
          contextLabel={account?.accountName ?? '—'}
          decision={accountDecision}
          settings={EXAMPLE_SETTINGS.account}
        />
        <ScopeCard
          scope="app"
          contextLabel={selectedAppAccess?.appLabel ?? '—'}
          decision={appDecision}
          settings={EXAMPLE_SETTINGS.app}
        />
        <ScopeCard
          scope="platform"
          contextLabel="All apps"
          decision={platformDecision}
          settings={EXAMPLE_SETTINGS.platform}
        />
      </div>
    </div>
  )
}
