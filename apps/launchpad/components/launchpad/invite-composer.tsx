'use client'

import { useMemo, useState } from 'react'
import { X, Plus, Trash2, Send, UserPlus, KeyRound } from 'lucide-react'
import { authService } from '@/lib/services/auth'
import {
  createInvitationBundle,
  type ComposeGrant,
  type CreateBundleResult,
} from '@/lib/services/invitations'
import { LAUNCHPAD_APPS } from '@/lib/entitlement'

const ROLES = ['owner', 'manager', 'member', 'viewer'] as const

function appLabel(slug: string): string {
  return LAUNCHPAD_APPS.find((a) => a.slug === slug)?.name ?? slug
}

/**
 * Invitation composer (v0 two-kind design; app-provision retired). An admin builds
 * a bundle of grants for one invitee email:
 *   - app-grant      — person + app only, ROLELESS (access, no account).
 *   - account-invite — join an existing account at a role.
 * Same-app conflict (app-grant + account-invite for one app) is blocked at compose;
 * the server enforces it again. Wired to the real POST /api/invitations/bundles.
 */
export function InviteComposer({
  grantableApps,
  isOpen,
  onClose,
}: {
  /** App slugs this admin may grant (site-admin → all; app-admin → their apps). */
  grantableApps: string[]
  isOpen: boolean
  onClose: () => void
}) {
  const [email, setEmail] = useState('')
  const [grants, setGrants] = useState<ComposeGrant[]>([])
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<CreateBundleResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const firstApp = grantableApps[0] ?? ''

  // Apps already carrying a grant of each kind — used to enforce the same-app
  // conflict client-side (you cannot mix app-grant + account-invite for one app).
  const conflicted = useMemo(() => {
    const kindsByApp = new Map<string, Set<string>>()
    for (const g of grants) {
      if (!kindsByApp.has(g.appSlug)) kindsByApp.set(g.appSlug, new Set())
      kindsByApp.get(g.appSlug)!.add(g.kind)
    }
    return kindsByApp
  }, [grants])

  if (!isOpen) return null

  const canAddAppGrant = (slug: string) => !conflicted.get(slug)?.has('account-invite')
  const canAddAccountInvite = (slug: string) => !conflicted.get(slug)?.has('app-grant')

  const addAppGrant = () => {
    if (!firstApp || !canAddAppGrant(firstApp)) return
    setGrants((g) => [...g, { kind: 'app-grant', appSlug: firstApp }])
  }
  const addAccountInvite = () => {
    if (!firstApp || !canAddAccountInvite(firstApp)) return
    setGrants((g) => [...g, { kind: 'account-invite', appSlug: firstApp, accountId: '', role: 'member' }])
  }
  const removeGrant = (i: number) => setGrants((g) => g.filter((_, idx) => idx !== i))
  const updateGrant = (i: number, patch: Partial<ComposeGrant>) =>
    setGrants((g) => g.map((x, idx) => (idx === i ? ({ ...x, ...patch } as ComposeGrant) : x)))

  const emailValid = /\S+@\S+\.\S+/.test(email.trim())
  const grantsValid =
    grants.length > 0 &&
    grants.every((g) => (g.kind === 'account-invite' ? g.accountId.trim().length > 0 : true))
  const canSubmit = emailValid && grantsValid && !busy

  const submit = async () => {
    if (!canSubmit) return
    setBusy(true)
    setError(null)
    setResult(null)
    try {
      const idToken = await authService.getIdToken()
      if (!idToken) throw new Error('Not signed in')
      const res = await createInvitationBundle(idToken, email.trim(), grants)
      setResult(res)
      if (res.bundle) setGrants([]) // created — keep the result visible
    } catch (err) {
      console.error('[invite-composer] create failed:', err)
      setError('Could not create the invitation. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-50" onClick={busy ? undefined : onClose} />
      <div className="fixed left-1/2 top-1/2 z-50 w-[min(34rem,calc(100vw-2rem))] max-h-[calc(100vh-4rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-border bg-card shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-lg flex items-center justify-center bg-primary/15 text-primary">
              <Send className="size-5" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-foreground">Invite someone</h2>
              <p className="text-xs text-muted-foreground">Grant app access or invite to an account</p>
            </div>
          </div>
          <button onClick={onClose} disabled={busy} className="size-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-surface2 disabled:opacity-50" aria-label="Close">
            <X className="size-4" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div>
            <label htmlFor="invite-email" className="block text-xs font-medium text-muted-foreground mb-1.5">Invitee email</label>
            <input
              id="invite-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="invitee@example.com"
              className="w-full h-10 rounded-lg border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Grants</p>
            {grants.length === 0 ? (
              <p className="text-xs text-muted-foreground/80">No grants yet — add app access or an account invite below.</p>
            ) : (
              grants.map((g, i) => (
                <div key={i} className="rounded-lg border border-border bg-surface2/40 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-foreground">
                      {g.kind === 'app-grant' ? <KeyRound className="size-3.5 text-primary" /> : <UserPlus className="size-3.5 text-signal-green" />}
                      {g.kind === 'app-grant' ? 'App access' : 'Account invite'}
                    </span>
                    <button onClick={() => removeGrant(i)} className="text-muted-foreground hover:text-signal-red" aria-label="Remove grant">
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <select
                      value={g.appSlug}
                      onChange={(e) => updateGrant(i, { appSlug: e.target.value })}
                      className="h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground"
                    >
                      {grantableApps.map((slug) => (
                        <option key={slug} value={slug}>{appLabel(slug)}</option>
                      ))}
                    </select>
                    {g.kind === 'account-invite' && (
                      <>
                        <input
                          value={g.accountId}
                          onChange={(e) => updateGrant(i, { accountId: e.target.value })}
                          placeholder="account id"
                          className="h-8 w-40 rounded-md border border-border bg-background px-2 text-xs text-foreground placeholder:text-muted-foreground/70"
                        />
                        <select
                          value={g.role}
                          onChange={(e) => updateGrant(i, { role: e.target.value })}
                          className="h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground"
                        >
                          {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                        </select>
                      </>
                    )}
                    {conflicted.get(g.appSlug) && conflicted.get(g.appSlug)!.size > 1 && (
                      <span className="text-xs text-signal-red">Same-app conflict — app access and account invite can&apos;t both target one app.</span>
                    )}
                  </div>
                </div>
              ))
            )}
            <div className="flex flex-wrap gap-2 pt-1">
              <button onClick={addAppGrant} disabled={!firstApp || !canAddAppGrant(firstApp)} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-surface2 disabled:opacity-40">
                <Plus className="size-3.5" /> App access
              </button>
              <button onClick={addAccountInvite} disabled={!firstApp || !canAddAccountInvite(firstApp)} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-surface2 disabled:opacity-40">
                <Plus className="size-3.5" /> Account invite
              </button>
            </div>
          </div>

          {result && (
            <div className="rounded-lg border border-border bg-surface2/40 p-3 text-xs">
              {result.bundle ? (
                <p className="text-foreground">Invitation created (<span className="font-mono">{result.bundle.bundleId}</span>). {result.bundle.grants.length} grant(s).</p>
              ) : (
                <p className="text-signal-red">No grants could be authorized.</p>
              )}
              <ul className="mt-1 space-y-0.5 text-muted-foreground">
                {result.decisions.map((d) => (
                  <li key={d.index}>Grant {d.index + 1}: {d.allowed ? '✓' : '✗'} {d.reason}</li>
                ))}
              </ul>
            </div>
          )}
          {error ? <p className="text-xs text-signal-red">{error}</p> : null}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button onClick={onClose} disabled={busy} className="rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-surface2 disabled:opacity-50">Close</button>
            <button onClick={submit} disabled={!canSubmit} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50">
              <Send className="size-4" /> {busy ? 'Sending…' : 'Send invitation'}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
