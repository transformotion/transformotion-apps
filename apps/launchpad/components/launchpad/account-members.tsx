'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Building2, Check, ChevronDown, Info, Loader2, Pencil, RefreshCw, ShieldCheck, UserMinus, X,
} from 'lucide-react'
import { ApiError } from '@transformotion/api-client'
import type { AccountMemberRow } from '@transformotion/contracts/launchpad/invitations'
import type { AccountRole } from '@transformotion/contracts/_shared/auth'
import { getControlPlaneClient } from '@/lib/services/control-plane-client'
import { authService } from '@/lib/services/auth'
import { LAUNCHPAD_APPS } from '@/lib/entitlement'

// ---------------------------------------------------------------------------
// Manageable-account enumeration — owner/manager accounts from the token claim.
// (Site-admin supervisory across ALL accounts needs a directory endpoint that
// does not exist yet — see PR body. This screen scopes to accounts the signed-in
// user owns or manages.)
// ---------------------------------------------------------------------------

interface ManageableAccount {
  accountId: string
  appSlug: string
  appName: string
  viewerRole: AccountRole // 'owner' | 'manager'
  name: string
}

const GATED_SLUGS = LAUNCHPAD_APPS.filter((a) => a.entitlementGated)
const appNameFor = (slug: string) =>
  LAUNCHPAD_APPS.find((a) => a.slug === slug)?.name ?? slug

/** Owner/manager (accountId, appSlug, role) triples from the token `accounts` claim. */
async function ownerOrManagerAccounts(): Promise<Array<{ accountId: string; appSlug: string; role: AccountRole }>> {
  const perApp = await Promise.all(
    GATED_SLUGS.map(async (app) => {
      const rows = await authService.getAccountsForApp(app.slug).catch(() => [])
      return rows
        .filter((r) => r.role === 'owner' || r.role === 'manager')
        .map((r) => ({ accountId: r.accountId, appSlug: app.slug, role: r.role as AccountRole }))
    }),
  )
  return perApp.flat()
}

/**
 * Gate hook: does the signed-in user have any account they may manage members
 * for? True for a site-admin (supervisory) OR an owner/manager of ≥1 account.
 * Claim-only (no network) — cheap enough to drive the nav entry.
 */
export function useCanManageMembers(isSiteAdmin: boolean, userId: string | undefined): boolean {
  const [can, setCan] = useState(false)
  useEffect(() => {
    let cancelled = false
    if (isSiteAdmin) { setCan(true); return }
    ownerOrManagerAccounts()
      .then((a) => { if (!cancelled) setCan(a.length > 0) })
      .catch(() => { if (!cancelled) setCan(false) })
    return () => { cancelled = true }
  }, [isSiteAdmin, userId])
  return can
}

// ---------------------------------------------------------------------------
// Client-side remove gating (mirrors the backend decideRemoval + last-owner
// floor for UX; the server is authoritative and surfaces any rejection).
// ---------------------------------------------------------------------------

function removeDisposition(
  viewerRole: AccountRole,
  target: AccountMemberRow,
  isSelf: boolean,
): { allowed: boolean; reason: string } {
  if (target.isLastOwner) {
    return { allowed: false, reason: 'Only owner — assign another owner before removing them.' }
  }
  if (isSelf) return { allowed: true, reason: 'Remove yourself from this account' }
  if (viewerRole === 'owner') return { allowed: true, reason: `Remove ${target.email}` }
  // manager
  if (target.role === 'member' || target.role === 'viewer') {
    return { allowed: true, reason: `Remove ${target.email}` }
  }
  return { allowed: false, reason: 'Managers can remove members and viewers only.' }
}

function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message // server message (403/409/502 etc.)
  return 'Something went wrong. Please try again.'
}

const ROLE_STYLES: Record<AccountRole, string> = {
  owner: 'bg-primary/15 text-primary',
  manager: 'bg-signal-green/15 text-signal-green',
  member: 'bg-surface2 text-foreground',
  viewer: 'bg-surface2 text-muted-foreground',
}

function RoleChip({ role }: { role: string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${ROLE_STYLES[role as AccountRole] ?? 'bg-surface2 text-foreground'}`}>
      {role}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Member list for one account (loads on expand via getMembersDetail)
// ---------------------------------------------------------------------------

function MemberList({ account, viewerUserId }: { account: ManageableAccount; viewerUserId: string }) {
  const cp = getControlPlaneClient()
  const [state, setState] = useState<
    | { status: 'loading' }
    | { status: 'error'; message: string }
    | { status: 'loaded'; members: AccountMemberRow[] }
  >({ status: 'loading' })
  const [busy, setBusy] = useState<string | null>(null) // userId being removed
  const [rowError, setRowError] = useState<string | null>(null)

  const load = useCallback(() => {
    setState({ status: 'loading' })
    cp.getMembersDetail(account.accountId)
      .then((res) => setState({ status: 'loaded', members: res.members }))
      .catch((err) => setState({ status: 'error', message: errorMessage(err) }))
  }, [cp, account.accountId])

  useEffect(load, [load])

  async function remove(target: AccountMemberRow) {
    setRowError(null)
    setBusy(target.userId)
    try {
      await cp.removeMember(account.accountId, target.userId)
      load()
    } catch (err) {
      setRowError(errorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  if (state.status === 'loading') {
    return <div className="flex items-center gap-2 py-3 text-xs text-muted-foreground"><Loader2 className="size-3.5 animate-spin" /> Loading members…</div>
  }
  if (state.status === 'error') {
    return (
      <div className="flex items-center justify-between gap-2 rounded-lg border border-signal-red/30 bg-signal-red/10 px-3 py-2">
        <span className="text-xs text-signal-red">{state.message}</span>
        <button onClick={load} className="inline-flex items-center gap-1 rounded-md bg-surface2 px-2 py-1 text-xs text-foreground hover:bg-surface">
          <RefreshCw className="size-3" /> Retry
        </button>
      </div>
    )
  }

  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Members ({state.members.length})
      </p>
      {rowError && (
        <div className="mb-2 rounded-lg border border-signal-red/30 bg-signal-red/10 px-3 py-2 text-xs text-signal-red">{rowError}</div>
      )}
      <ul className="space-y-2">
        {state.members.map((m) => {
          const isSelf = m.userId === viewerUserId
          const disp = removeDisposition(account.viewerRole, m, isSelf)
          return (
            <li key={m.userId} className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface/30 px-3 py-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <p className="truncate text-sm font-medium text-foreground">{m.displayName ?? m.email}</p>
                  {m.status === 'disabled' && (
                    <span className="rounded-full bg-signal-red/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-signal-red">disabled</span>
                  )}
                </div>
                <p className="truncate text-xs text-muted-foreground">{m.email}</p>
              </div>
              {m.isLastOwner && (
                <span className="inline-flex items-center gap-1 rounded-full bg-signal-gold/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-signal-gold" title="Only owner — assign another owner first.">
                  <Info className="size-2.5" /> sole owner
                </span>
              )}
              <RoleChip role={m.role} />
              <button
                disabled={!disp.allowed || busy === m.userId}
                onClick={() => disp.allowed && remove(m)}
                title={disp.reason}
                aria-label={`Remove ${m.email} from ${account.name}`}
                className="flex size-7 shrink-0 items-center justify-center rounded-md bg-surface2 text-muted-foreground transition-colors hover:text-signal-red disabled:cursor-not-allowed disabled:opacity-40"
              >
                {busy === m.userId ? <Loader2 className="size-3.5 animate-spin" /> : <UserMinus className="size-3.5" />}
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Account card — rename (inline) + expandable member list
// ---------------------------------------------------------------------------

function AccountCard({ account, viewerUserId, onRenamed }: {
  account: ManageableAccount
  viewerUserId: string
  onRenamed: (accountId: string, name: string) => void
}) {
  const cp = getControlPlaneClient()
  const [expanded, setExpanded] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(account.name)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    const name = draft.trim()
    if (!name) { setError('Name is required.'); return }
    setSaving(true); setError(null)
    try {
      const res = await cp.updateAccount(account.accountId, { name })
      onRenamed(account.accountId, res.account.name)
      setEditing(false)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-xl border border-border bg-surface">
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-surface2 text-muted-foreground">
          <Building2 className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          {editing ? (
            <div className="flex items-center gap-2">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { setEditing(false); setDraft(account.name) } }}
                autoFocus
                aria-label="Account name"
                className="min-w-0 flex-1 rounded-md border border-primary/40 bg-surface2 px-2 py-1 text-sm text-foreground outline-none"
              />
              <button onClick={save} disabled={saving} aria-label="Save name" className="flex size-7 items-center justify-center rounded-md bg-primary/15 text-primary hover:bg-primary/25 disabled:opacity-40">
                {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
              </button>
              <button onClick={() => { setEditing(false); setDraft(account.name); setError(null) }} aria-label="Cancel rename" className="flex size-7 items-center justify-center rounded-md bg-surface2 text-muted-foreground hover:text-foreground">
                <X className="size-3.5" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <p className="truncate text-sm font-medium text-foreground">{account.name}</p>
              <button onClick={() => { setDraft(account.name); setEditing(true) }} aria-label={`Rename ${account.name}`} className="shrink-0 text-muted-foreground hover:text-foreground">
                <Pencil className="size-3" />
              </button>
              <span className="ml-1 truncate text-xs text-muted-foreground">· {account.appName}</span>
            </div>
          )}
        </div>
        <RoleChip role={account.viewerRole} />
        <button onClick={() => setExpanded((v) => !v)} aria-expanded={expanded} aria-label={`${expanded ? 'Hide' : 'Show'} members of ${account.name}`} className="shrink-0 text-muted-foreground">
          <ChevronDown className={`size-4 transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </button>
      </div>
      {error && <div className="mx-4 mb-2 rounded-lg border border-signal-red/30 bg-signal-red/10 px-3 py-2 text-xs text-signal-red">{error}</div>}
      {expanded && (
        <div className="border-t border-border px-4 py-3">
          <MemberList account={account} viewerUserId={viewerUserId} />
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// The modal
// ---------------------------------------------------------------------------

export function AccountMembersModal({
  isOpen, onClose, viewerUserId,
}: { isOpen: boolean; onClose: () => void; viewerUserId: string }) {
  const cp = getControlPlaneClient()
  const [state, setState] = useState<
    | { status: 'loading' }
    | { status: 'error'; message: string }
    | { status: 'loaded'; accounts: ManageableAccount[] }
  >({ status: 'loading' })

  const load = useCallback(() => {
    setState({ status: 'loading' })
    ;(async () => {
      const triples = await ownerOrManagerAccounts()
      const named = await Promise.all(
        triples.map(async (t) => {
          let name = t.accountId
          try {
            const res = await cp.getAccount(t.accountId)
            name = res.account?.name ?? t.accountId
          } catch { /* name best-effort; row still manageable */ }
          return { accountId: t.accountId, appSlug: t.appSlug, appName: appNameFor(t.appSlug), viewerRole: t.role, name } as ManageableAccount
        }),
      )
      setState({ status: 'loaded', accounts: named })
    })().catch((err) => setState({ status: 'error', message: errorMessage(err) }))
  }, [cp])

  useEffect(() => { if (isOpen) load() }, [isOpen, load])

  const onRenamed = useCallback((accountId: string, name: string) => {
    setState((prev) => prev.status === 'loaded'
      ? { status: 'loaded', accounts: prev.accounts.map((a) => a.accountId === accountId ? { ...a, name } : a) }
      : prev)
  }, [])

  const grouped = useMemo(() => {
    if (state.status !== 'loaded') return []
    const map = new Map<string, ManageableAccount[]>()
    for (const a of state.accounts) {
      const list = map.get(a.appName) ?? []
      list.push(a); map.set(a.appName, list)
    }
    return [...map.entries()]
  }, [state])

  if (!isOpen) return null

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/50" onClick={onClose} />
      <div role="dialog" aria-label="Account members" className="fixed left-1/2 top-1/2 z-50 max-h-[85vh] w-[min(40rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-border bg-background p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-5 text-primary" />
            <h2 className="text-base font-semibold text-foreground">Account members</h2>
          </div>
          <button onClick={onClose} aria-label="Close" className="flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-surface2 hover:text-foreground">
            <X className="size-4" />
          </button>
        </div>

        {state.status === 'loading' && (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Loading your accounts…
          </div>
        )}

        {state.status === 'error' && (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-signal-red/30 bg-signal-red/10 px-4 py-10 text-center">
            <p className="text-sm text-signal-red">Couldn&apos;t load your accounts.</p>
            <p className="text-xs text-muted-foreground">{state.message}</p>
            <button onClick={load} className="inline-flex items-center gap-1.5 rounded-lg bg-surface2 px-3 py-1.5 text-xs font-medium text-foreground hover:bg-surface">
              <RefreshCw className="size-3.5" /> Retry
            </button>
          </div>
        )}

        {state.status === 'loaded' && state.accounts.length === 0 && (
          <div className="flex flex-col items-center gap-2 px-4 py-12 text-center">
            <Building2 className="size-8 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">No manageable accounts</p>
            <p className="max-w-sm text-xs text-muted-foreground">You are not an owner or manager of any account. Member management is available to account owners and managers.</p>
          </div>
        )}

        {state.status === 'loaded' && state.accounts.length > 0 && (
          <div className="space-y-5">
            {grouped.map(([appName, list]) => (
              <div key={appName}>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{appName}</p>
                <div className="space-y-2">
                  {list.map((a) => (
                    <AccountCard key={a.accountId} account={a} viewerUserId={viewerUserId} onRenamed={onRenamed} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
