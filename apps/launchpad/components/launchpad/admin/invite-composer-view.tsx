'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  UserPlus,
  Building2,
  KeyRound,
  Trash2,
  Plus,
  CheckCircle2,
  XCircle,
  Mail,
  Link2,
  Info,
  ShieldAlert,
  Search,
  ShieldCheck,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card, PrimaryButton, SecondaryButton, EmptyState } from '@/components/ui/design-system'
import { appLabel, grantableAppsFor, resolveUserLabel, userIsSiteAdmin, type AdminUser } from '@/lib/admin/view-model'
import {
  availableGrantKinds,
  describeViewerAuthorityForAccount,
  findSameAppGrantConflicts,
  invitableRolesForAccount,
  validateInvitationBundle,
  type InvitableAccount,
  type InviteeState,
  type SenderCapabilities,
} from '@/lib/admin/composer-engine'
import { getControlPlaneClient } from '@/lib/services/control-plane-client'
import { authService } from '@/lib/services/auth'
import { createInvitationBundle, type ComposeGrant } from '@/lib/services/invitations'
import type { AccountRole, EntitledAppSlug } from '@transformotion/contracts/_shared/auth'
import type {
  DiscoveredInvitee,
  InvitationGrant,
  InvitationGrantKind,
  InviteeSearchScope,
} from '@transformotion/contracts/launchpad/invitations'

let grantCounter = 0
function nextGrantId(): string {
  grantCounter += 1
  return `draft-grant-${grantCounter}`
}

/** A draft grant in the composer (loosely typed while the user fills it in). */
interface DraftGrant {
  grantId: string
  kind: InvitationGrantKind
  appSlug: EntitledAppSlug
  accountId: string // account-invite
  role: AccountRole // account-invite
}

/** First invitable account in a given app, if any. */
function firstAccountInApp(caps: SenderCapabilities, appSlug: EntitledAppSlug): string {
  return caps.invitableAccounts.find((a) => a.appSlug === appSlug)?.accountId ?? ''
}

/** Build a draft pre-filled with the sender's first authorized selection. */
function newDraft(caps: SenderCapabilities): DraftGrant {
  const kind = caps.kinds[0] ?? 'account-invite'
  if (kind === 'account-invite') {
    const appSlug = caps.invitableApps[0] ?? caps.grantableApps[0] ?? 'stock-analyser'
    return { grantId: nextGrantId(), kind, appSlug, accountId: firstAccountInApp(caps, appSlug), role: 'member' }
  }
  return { grantId: nextGrantId(), kind: 'app-grant', appSlug: caps.grantableApps[0] ?? 'stock-analyser', accountId: '', role: 'owner' }
}

/** Convert a draft into the InvitationGrant shape for validation. */
function toGrant(draft: DraftGrant): InvitationGrant | null {
  if (draft.kind === 'account-invite') {
    if (!draft.accountId) return null
    return { grantId: draft.grantId, kind: 'account-invite', appSlug: draft.appSlug, accountId: draft.accountId, role: draft.role }
  }
  return { grantId: draft.grantId, kind: 'app-grant', appSlug: draft.appSlug }
}

/** Map an InvitationGrant to the service's ComposeGrant shape (server assigns grantId). */
function toComposeGrant(grant: InvitationGrant): ComposeGrant {
  if (grant.kind === 'account-invite') {
    return { kind: 'account-invite', appSlug: grant.appSlug, accountId: grant.accountId, role: grant.role }
  }
  return { kind: 'app-grant', appSlug: grant.appSlug }
}

/** Presentation label/description for a search scope (the contract carries kind only). */
function describeSearchScope(scope: InviteeSearchScope): { label: string; description: string } {
  switch (scope.kind) {
    case 'site-admin':
      return { label: 'All users', description: 'As a site-admin you can search the full user directory.' }
    case 'app-admin':
      return {
        label: 'Users in this app',
        description: `You can search people known through ${scope.appSlugs.map(appLabel).join(' and ')}, which you administer.`,
      }
    case 'account-manager':
      return {
        label: 'People from accounts you manage',
        description: 'You can search people who are members of (or pending invitees to) accounts you own or manage.',
      }
    default:
      return { label: '', description: 'Account members and viewers cannot search known users for invitation purposes.' }
  }
}

const fieldClass =
  'w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-primary'
const labelClass = 'mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground'

const KIND_META: Record<InvitationGrantKind, { icon: typeof Building2; label: string; hint: string }> = {
  'account-invite': { icon: Building2, label: 'Invite to account', hint: 'Add to an account you own or manage' },
  'app-grant': { icon: KeyRound, label: 'Grant app access', hint: 'Access only — they set up their first account on arrival' },
}

/**
 * Live composer data. v0 read the mock store; the live sources are CONTRACTED:
 *   - capabilities: token `accounts` claim (owner/manager) + grantableApps; names
 *     via GET /accounts/{id}
 *   - directory: POST /api/invitations/invitee-search (scope + reasons)
 *   - invitee state (check 3): site-admin → GET /api/admin/users/access; else →
 *     managed accounts' members/detail (app-access state validated at send).
 */
function useComposerData(viewer: AdminUser) {
  const [caps, setCaps] = useState<SenderCapabilities | null>(null)
  const [scope, setScope] = useState<InviteeSearchScope | null>(null)
  const [knownUsers, setKnownUsers] = useState<DiscoveredInvitee[]>([])
  const [state, setState] = useState<InviteeState>({ isMemberOfAccount: () => false, hasAppAccess: () => false })

  const load = useCallback(async () => {
    const client = getControlPlaneClient()
    const apps: EntitledAppSlug[] = ['stock-analyser', 'budget-tracker']

    // Capabilities — owner/manager accounts from the token claim, names resolved.
    const invitableAccounts: InvitableAccount[] = []
    for (const slug of apps) {
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
          name = (await client.getAccount(r.accountId)).account?.name ?? r.accountId
        } catch {
          /* name falls back to id */
        }
        invitableAccounts.push({ accountId: r.accountId, appSlug: slug, name, role: r.role as AccountRole })
      }
    }
    const grantableApps = grantableAppsFor(viewer)
    const invitableApps = [...new Set(invitableAccounts.map((a) => a.appSlug))]
    setCaps({ kinds: availableGrantKinds({ invitableAccounts, grantableApps }), invitableAccounts, invitableApps, grantableApps })

    // Directory — full scoped set (client filters by query, like v0).
    try {
      const dir = await client.searchInvitees('')
      setScope(dir.scope)
      setKnownUsers(dir.results)
    } catch {
      setScope({ kind: 'none', appSlugs: [], accountIds: [] })
      setKnownUsers([])
    }

    // Invitee state (check 3), scoped to what the sender may see.
    if (userIsSiteAdmin(viewer)) {
      try {
        const ua = await client.getUserAccess()
        const memberAccounts = new Map<string, Set<string>>()
        const appAccess = new Map<string, Set<string>>()
        for (const u of ua.users) {
          const email = u.email.toLowerCase()
          const accts = new Set<string>()
          const slugs = new Set<string>()
          for (const app of u.appAccess) {
            slugs.add(app.appSlug)
            for (const a of app.accounts) accts.add(a.accountId)
          }
          memberAccounts.set(email, accts)
          appAccess.set(email, slugs)
        }
        setState({
          isMemberOfAccount: (email, accountId) => memberAccounts.get(email.toLowerCase())?.has(accountId) ?? false,
          hasAppAccess: (email, appSlug) => appAccess.get(email.toLowerCase())?.has(appSlug) ?? false,
        })
      } catch {
        /* keep the permissive default; the create endpoint validates at send */
      }
    } else {
      // Owner/manager: membership within managed accounts from members/detail.
      const memberAccounts = new Map<string, Set<string>>()
      await Promise.all(
        invitableAccounts.map(async (acct) => {
          try {
            const res = await client.getMembersDetail(acct.accountId)
            for (const m of res.members) {
              const email = m.email.toLowerCase()
              const set = memberAccounts.get(email) ?? new Set<string>()
              set.add(acct.accountId)
              memberAccounts.set(email, set)
            }
          } catch {
            /* skip */
          }
        }),
      )
      setState({
        isMemberOfAccount: (email, accountId) => memberAccounts.get(email.toLowerCase())?.has(accountId) ?? false,
        hasAppAccess: () => false,
      })
    }
  }, [viewer])

  useEffect(() => {
    void load()
  }, [load])

  const accountName = useCallback(
    (accountId: string) => caps?.invitableAccounts.find((a) => a.accountId === accountId)?.name ?? accountId,
    [caps],
  )

  return { caps, scope, knownUsers, state, accountName }
}

function GrantRow({
  draft,
  index,
  caps,
  onChange,
  onRemove,
}: {
  draft: DraftGrant
  index: number
  caps: SenderCapabilities
  onChange: (next: DraftGrant) => void
  onRemove: () => void
}) {
  const appOptions = draft.kind === 'account-invite' ? caps.invitableApps : caps.grantableApps
  const accountOptions = caps.invitableAccounts.filter((a) => a.appSlug === draft.appSlug)
  const roleOptions = draft.accountId
    ? invitableRolesForAccount(caps.invitableAccounts.find((a) => a.accountId === draft.accountId)?.role)
    : []

  function setKind(kind: InvitationGrantKind) {
    if (kind === draft.kind) return
    if (kind === 'account-invite') {
      const appSlug = caps.invitableApps.includes(draft.appSlug) ? draft.appSlug : caps.invitableApps[0] ?? draft.appSlug
      onChange({ ...draft, kind, appSlug, accountId: firstAccountInApp(caps, appSlug) })
    } else {
      const appSlug = caps.grantableApps.includes(draft.appSlug) ? draft.appSlug : caps.grantableApps[0] ?? draft.appSlug
      onChange({ ...draft, kind, appSlug })
    }
  }

  function setApp(appSlug: EntitledAppSlug) {
    if (draft.kind === 'account-invite') {
      onChange({ ...draft, appSlug, accountId: firstAccountInApp(caps, appSlug) })
    } else {
      onChange({ ...draft, appSlug })
    }
  }

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-2 text-sm font-semibold text-foreground">
          <span className="flex size-6 items-center justify-center rounded-full bg-surface2 text-xs text-muted-foreground">
            {index + 1}
          </span>
          Grant
        </span>
        <button
          onClick={onRemove}
          className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-surface2 hover:text-signal-red"
          aria-label={`Remove grant ${index + 1}`}
        >
          <Trash2 className="size-4" />
        </button>
      </div>

      {caps.kinds.length > 1 && (
        <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {caps.kinds.map((kind) => {
            const meta = KIND_META[kind]
            const Icon = meta.icon
            const active = draft.kind === kind
            return (
              <button
                key={kind}
                onClick={() => setKind(kind)}
                className={cn(
                  'flex items-start gap-2 rounded-lg border p-3 text-left transition-colors',
                  active ? 'border-primary bg-primary/10' : 'border-border bg-surface/40 hover:bg-surface2',
                )}
              >
                <Icon className={cn('mt-0.5 size-4 shrink-0', active ? 'text-primary' : 'text-muted-foreground')} />
                <span className="min-w-0">
                  <span className={cn('block text-sm font-medium', active ? 'text-primary' : 'text-foreground')}>
                    {meta.label}
                  </span>
                  <span className="block text-[11px] text-muted-foreground">{meta.hint}</span>
                </span>
              </button>
            )
          })}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className={labelClass}>App</label>
          <select className={fieldClass} value={draft.appSlug} onChange={(e) => setApp(e.target.value as EntitledAppSlug)}>
            {appOptions.map((slug) => (
              <option key={slug} value={slug}>
                {appLabel(slug)}
              </option>
            ))}
          </select>
        </div>

        {draft.kind === 'account-invite' ? (
          <>
            <div>
              <label className={labelClass}>Account</label>
              <select
                className={fieldClass}
                value={draft.accountId}
                onChange={(e) => onChange({ ...draft, accountId: e.target.value })}
              >
                {accountOptions.map((account) => (
                  <option key={account.accountId} value={account.accountId}>
                    {account.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Role</label>
              <select
                className={fieldClass}
                value={draft.role}
                onChange={(e) => onChange({ ...draft, role: e.target.value as AccountRole })}
              >
                {roleOptions.map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </select>
            </div>
          </>
        ) : (
          <div className="sm:col-span-1 sm:self-end">
            <div className="flex items-start gap-2 rounded-lg border border-border bg-surface/40 p-3 text-[11px] leading-relaxed text-muted-foreground">
              <KeyRound className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
              <span>
                Access only — no account is created. {"They'll"} land in {appLabel(draft.appSlug)} and set up their
                first account themselves, becoming its owner.
              </span>
            </div>
          </div>
        )}
      </div>
    </Card>
  )
}

function ValidationLine({ allowed, reason }: { allowed: boolean; reason: string }) {
  return (
    <div
      className={cn(
        'flex items-start gap-2 rounded-lg border p-3 text-xs',
        allowed
          ? 'border-signal-green/30 bg-signal-green/10 text-foreground'
          : 'border-signal-red/30 bg-signal-red/10 text-foreground',
      )}
    >
      {allowed ? (
        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-signal-green" />
      ) : (
        <XCircle className="mt-0.5 size-4 shrink-0 text-signal-red" />
      )}
      <span>{reason}</span>
    </div>
  )
}

export function InviteComposerView({ viewer }: { viewer: AdminUser }) {
  const { caps, scope, knownUsers, state, accountName } = useComposerData(viewer)

  const describeGrant = useCallback(
    (grant: InvitationGrant): string => {
      if (grant.kind === 'account-invite') {
        return `Join ${accountName(grant.accountId)} (${appLabel(grant.appSlug)}) as ${grant.role}`
      }
      return `Grant ${appLabel(grant.appSlug)} access (no account — sets up their own on arrival)`
    },
    [accountName],
  )

  const searchScope = useMemo(
    () => (scope ? describeSearchScope(scope) : { label: '', description: '' }),
    [scope],
  )

  const [query, setQuery] = useState('')
  const [selectedInvitee, setSelectedInvitee] = useState<DiscoveredInvitee | null>(null)
  const filteredUsers = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return knownUsers
    return knownUsers.filter(
      (k) => (k.displayName ?? '').toLowerCase().includes(q) || k.email.toLowerCase().includes(q),
    )
  }, [knownUsers, query])

  const searchParams = useSearchParams()
  const presetAccountId = searchParams.get('accountId')
  const presetAuthority = useMemo(() => {
    if (!presetAccountId || !caps) return null
    const acct = caps.invitableAccounts.find((a) => a.accountId === presetAccountId)
    return describeViewerAuthorityForAccount(acct, acct?.name ?? presetAccountId)
  }, [presetAccountId, caps])

  const [email, setEmail] = useState('')
  const [drafts, setDrafts] = useState<DraftGrant[]>([])

  // Initialise drafts once capabilities resolve (and re-apply account handoff).
  const [appliedKey, setAppliedKey] = useState<string | null>(null)
  useEffect(() => {
    if (!caps) return
    const key = `${caps.kinds.join(',')}|${presetAccountId ?? ''}`
    if (key === appliedKey) return
    setAppliedKey(key)
    if (caps.kinds.length === 0) {
      setDrafts([])
      return
    }
    const preset =
      presetAccountId &&
      caps.kinds.includes('account-invite') &&
      caps.invitableAccounts.find((a) => a.accountId === presetAccountId)
    if (preset) {
      setDrafts([{ grantId: nextGrantId(), kind: 'account-invite', appSlug: preset.appSlug, accountId: preset.accountId, role: 'member' }])
    } else {
      setDrafts([newDraft(caps)])
    }
  }, [caps, presetAccountId, appliedKey])

  const grants = useMemo(() => drafts.map((d) => ({ draft: d, grant: toGrant(d) })), [drafts])
  const completeGrants = useMemo(
    () => grants.map((g) => g.grant).filter((g): g is InvitationGrant => g !== null),
    [grants],
  )

  const bundle = useMemo(
    () => (caps ? validateInvitationBundle(caps, email, state, completeGrants) : null),
    [caps, email, state, completeGrants],
  )
  const conflictIds = useMemo(() => findSameAppGrantConflicts(completeGrants), [completeGrants])
  const hasConflict = conflictIds.size > 0
  const emailValid = /.+@.+\..+/.test(email.trim())

  const [sendState, setSendState] = useState<
    { kind: 'sent'; email: string; count: number } | { kind: 'error'; reason: string } | null
  >(null)
  const [sending, setSending] = useState(false)

  function updateDraft(next: DraftGrant) {
    setDrafts((prev) => prev.map((d) => (d.grantId === next.grantId ? next : d)))
    setSendState(null)
  }
  function removeDraft(grantId: string) {
    setDrafts((prev) => prev.filter((d) => d.grantId !== grantId))
    setSendState(null)
  }

  async function sendInvitation() {
    if (!caps || !bundle || !bundle.sendable || hasConflict || sending) return
    const allowed = bundle.perGrant.filter((p) => p.validation.allowed).map((p) => toComposeGrant(p.grant))
    setSending(true)
    try {
      const idToken = await authService.getIdToken()
      if (!idToken) throw new Error('Not signed in')
      const res = await createInvitationBundle(idToken, email.trim(), allowed)
      if (res.bundle) {
        setSendState({ kind: 'sent', email: email.trim(), count: res.bundle.grants.length })
        setEmail('')
        setSelectedInvitee(null)
        setQuery('')
        setDrafts(caps.kinds.length > 0 ? [newDraft(caps)] : [])
      } else {
        const reason = res.decisions.find((d) => !d.allowed)?.reason ?? 'No grants could be authorized.'
        setSendState({ kind: 'error', reason })
      }
    } catch (err) {
      setSendState({ kind: 'error', reason: err instanceof Error ? err.message : 'Could not send the invitation.' })
    } finally {
      setSending(false)
    }
  }

  if (!caps || !bundle) {
    return <p className="text-sm text-muted-foreground">Loading composer…</p>
  }

  if (caps.kinds.length === 0) {
    return (
      <EmptyState
        icon={ShieldAlert}
        title="No invitations available to you"
        description="You can only invite people into accounts you own or manage, or grant access to apps you administer. You don't currently hold either capability, so there's nothing to compose. Account members and viewers also cannot search known users for invitation purposes."
      />
    )
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
      {/* Composer */}
      <div className="space-y-4 lg:col-span-3">
        {presetAuthority && (
          <div
            className={cn(
              'flex items-start gap-2 rounded-lg border p-3 text-xs',
              presetAuthority.role === 'owner' || presetAuthority.role === 'manager'
                ? 'border-signal-green/30 bg-signal-green/10 text-foreground'
                : 'border-signal-red/30 bg-signal-red/10 text-foreground',
            )}
          >
            <ShieldCheck
              className={cn(
                'mt-0.5 size-4 shrink-0',
                presetAuthority.role === 'owner' || presetAuthority.role === 'manager'
                  ? 'text-signal-green'
                  : 'text-signal-red',
              )}
            />
            <span>{presetAuthority.summary}</span>
          </div>
        )}

        <Card>
          {scope && scope.kind !== 'none' && (
            <div className="mb-4">
              <label className={labelClass} htmlFor="invitee-search">
                {searchScope.label}
              </label>
              <div className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 focus-within:border-primary">
                <Search className="size-4 shrink-0 text-muted-foreground" />
                <input
                  id="invitee-search"
                  type="text"
                  className="w-full bg-transparent py-2 text-sm text-foreground outline-none"
                  placeholder="Search known users by name or email…"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value)
                    setSendState(null)
                  }}
                />
              </div>
              <p className="mt-1.5 text-[11px] text-muted-foreground">{searchScope.description}</p>

              {selectedInvitee ? (
                <div className="mt-2 flex items-start justify-between gap-2 rounded-lg border border-primary/30 bg-primary/10 p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">
                      {resolveUserLabel(selectedInvitee)}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{selectedInvitee.email}</p>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {selectedInvitee.reasons.slice(0, 3).map((reason) => (
                        <span key={reason} className="rounded-full bg-surface2 px-2 py-0.5 text-[10px] text-muted-foreground">
                          {reason}
                        </span>
                      ))}
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setSelectedInvitee(null)
                      setEmail('')
                    }}
                    className="flex size-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-surface2 hover:text-foreground"
                    aria-label="Clear selected invitee"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              ) : (
                query.trim() !== '' && (
                  <ul className="mt-2 max-h-56 space-y-1 overflow-y-auto" role="listbox" aria-label={searchScope.label}>
                    {filteredUsers.length === 0 ? (
                      <li className="rounded-lg border border-border bg-surface/40 p-3 text-xs text-muted-foreground">
                        No known users match &ldquo;{query}&rdquo;. You can still invite them by entering their email
                        below.
                      </li>
                    ) : (
                      filteredUsers.map((k) => (
                        <li key={k.userId}>
                          <button
                            className="w-full rounded-lg border border-border bg-surface/40 p-3 text-left transition-colors hover:border-primary/40 hover:bg-surface2"
                            onClick={() => {
                              setSelectedInvitee(k)
                              setEmail(k.email)
                              setSendState(null)
                            }}
                          >
                            <span className="block truncate text-sm font-medium text-foreground">
                              {resolveUserLabel(k)}
                            </span>
                            <span className="block truncate text-xs text-muted-foreground">{k.email}</span>
                            <span className="mt-1 flex flex-wrap gap-1">
                              {k.reasons.slice(0, 3).map((reason) => (
                                <span key={reason} className="rounded-full bg-surface2 px-2 py-0.5 text-[10px] text-muted-foreground">
                                  {reason}
                                </span>
                              ))}
                            </span>
                          </button>
                        </li>
                      ))
                    )}
                  </ul>
                )
              )}
            </div>
          )}

          <label className={labelClass} htmlFor="invite-email">
            Recipient email
          </label>
          <div className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 focus-within:border-primary">
            <Mail className="size-4 shrink-0 text-muted-foreground" />
            <input
              id="invite-email"
              type="email"
              className="w-full bg-transparent py-2 text-sm text-foreground outline-none"
              placeholder="person@example.com"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value)
                if (selectedInvitee && e.target.value !== selectedInvitee.email) {
                  setSelectedInvitee(null)
                }
              }}
            />
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            {scope?.kind === 'none'
              ? 'Manual email entry is available because you can create at least one invitation grant — even without permission to browse the user directory.'
              : 'One email, one redemption link. The recipient redeems all authorized grants together. Manual entry also works for people outside your search scope.'}
          </p>
        </Card>

        {drafts.length === 0 ? (
          <EmptyState icon={UserPlus} title="No grants yet" description="Add at least one grant to build an invitation bundle." />
        ) : (
          <div className="space-y-3">
            {drafts.map((draft, index) => (
              <GrantRow
                key={draft.grantId}
                draft={draft}
                index={index}
                caps={caps}
                onChange={updateDraft}
                onRemove={() => removeDraft(draft.grantId)}
              />
            ))}
          </div>
        )}

        <SecondaryButton icon={Plus} onClick={() => setDrafts((prev) => [...prev, newDraft(caps)])}>
          Add another grant
        </SecondaryButton>
      </div>

      {/* Preview / validation */}
      <div className="space-y-4 lg:col-span-2">
        <Card>
          <div className="mb-3 flex items-center gap-2">
            <Link2 className="size-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">Bundle preview</h3>
          </div>

          <dl className="space-y-1 text-xs">
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">Sender</dt>
              <dd className="truncate font-medium text-foreground">{resolveUserLabel(viewer)}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">Recipient</dt>
              <dd className={cn('truncate font-medium', emailValid ? 'text-foreground' : 'text-muted-foreground')}>
                {emailValid ? email : '—'}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">Grants</dt>
              <dd className="font-medium text-foreground">
                {bundle.allowedCount} ready
                {bundle.blockedCount > 0 && <span className="text-signal-red"> · {bundle.blockedCount} need attention</span>}
              </dd>
            </div>
          </dl>

          <div className="mt-3 space-y-2">
            {grants.length === 0 && <p className="text-xs text-muted-foreground">Add a grant to see authorization checks.</p>}
            {grants.map(({ draft, grant }, index) => {
              if (!grant) {
                return (
                  <div
                    key={draft.grantId}
                    className="flex items-start gap-2 rounded-lg border border-border bg-surface/40 p-3 text-xs text-muted-foreground"
                  >
                    <Info className="mt-0.5 size-4 shrink-0" />
                    <span>Grant {index + 1}: finish selecting the account to validate.</span>
                  </div>
                )
              }
              const result = bundle.perGrant.find((p) => p.grant.grantId === grant.grantId)
              return (
                <div key={draft.grantId} className="space-y-1">
                  <p className="text-xs font-medium text-foreground">{describeGrant(grant)}</p>
                  {result && <ValidationLine allowed={result.validation.allowed} reason={result.validation.reason} />}
                </div>
              )
            })}
          </div>

          <p className="mt-3 flex items-start gap-1.5 text-[11px] text-muted-foreground">
            <Info className="mt-0.5 size-3.5 shrink-0" />
            <span>
              You can only choose accounts you own or manage, and apps you administer. Any remaining warnings reflect the
              recipient&apos;s existing access — not your permissions.
            </span>
          </p>
        </Card>

        <Card className="bg-surface/40">
          <div className="mb-2 flex items-center gap-2">
            <Mail className="size-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold text-foreground">Email preview</h3>
          </div>
          <div className="rounded-lg border border-border bg-card p-3 text-xs">
            <p className="text-muted-foreground">To: {emailValid ? email : '—'}</p>
            <p className="mt-1 font-medium text-foreground">{resolveUserLabel(viewer)} invited you to Transformotion</p>
            <p className="mt-2 text-muted-foreground">You&apos;ve been granted:</p>
            <ul className="mt-1 list-inside list-disc text-foreground">
              {bundle.perGrant.filter((p) => p.validation.allowed).length === 0 ? (
                <li className="list-none text-muted-foreground">No ready grants yet.</li>
              ) : (
                bundle.perGrant
                  .filter((p) => p.validation.allowed)
                  .map((p) => <li key={p.grant.grantId}>{describeGrant(p.grant)}</li>)
              )}
            </ul>
            <div className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-primary/15 px-2.5 py-1.5 text-primary">
              <Link2 className="size-3.5" />
              <span className="font-medium">Accept invitation</span>
            </div>
            <p className="mt-2 text-[10px] text-muted-foreground">A single link redeems every authorized grant in one step.</p>
          </div>

          {hasConflict && (
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-signal-red/30 bg-signal-red/10 p-3 text-xs text-foreground">
              <ShieldAlert className="mt-0.5 size-4 shrink-0 text-signal-red" />
              <span>
                Same-app conflict: this bundle grants both app-access-only (no account) and an account in the same app.
                Those contradict — remove one side to continue.
              </span>
            </div>
          )}
          <PrimaryButton className="mt-3 w-full" icon={Mail} disabled={!bundle.sendable || hasConflict || sending} onClick={sendInvitation}>
            {hasConflict
              ? 'Resolve the same-app conflict to send'
              : bundle.sendable
                ? 'Send invitation'
                : 'Complete a grant to send'}
          </PrimaryButton>
          {!hasConflict && bundle.blockedCount > 0 && (
            <p className="mt-2 text-[11px] text-muted-foreground">
              Grants flagged for the recipient&apos;s existing access are excluded; only ready grants are sent.
            </p>
          )}
          {sendState?.kind === 'sent' && (
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-signal-green/30 bg-signal-green/10 p-3 text-xs text-foreground">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-signal-green" />
              <span>
                Invitation saved for <span className="font-medium">{sendState.email}</span> with {sendState.count} grant
                {sendState.count === 1 ? '' : 's'}. It now appears as a pending invitation across the Users, Accounts and
                Redemption surfaces.
              </span>
            </div>
          )}
          {sendState?.kind === 'error' && (
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-signal-red/30 bg-signal-red/10 p-3 text-xs text-foreground">
              <XCircle className="mt-0.5 size-4 shrink-0 text-signal-red" />
              <span>{sendState.reason}</span>
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
