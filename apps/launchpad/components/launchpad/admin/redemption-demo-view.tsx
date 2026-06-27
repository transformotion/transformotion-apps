'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  TicketCheck,
  Mail,
  MailOpen,
  Building2,
  KeyRound,
  Sparkles,
  CheckCircle2,
  XCircle,
  Clock,
  CopyCheck,
  UserCog,
  ArrowRight,
  RotateCcw,
  ShieldCheck,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card, PrimaryButton, SecondaryButton, EmptyState } from '@/components/ui/design-system'
import { appLabel, resolveUserLabel, toViewUserAccessSummary, type UserAccessSummary } from '@/lib/admin/view-model'
import { getControlPlaneClient } from '@/lib/services/control-plane-client'
import { authService } from '@/lib/services/auth'
import { redeemBundleAsInvitee, type GrantRedemptionResult } from '@/lib/services/invitations'
import type { EntitledAppSlug } from '@transformotion/contracts/_shared/auth'
import type { InvitationBundle, InvitationGrant } from '@transformotion/contracts/launchpad/invitations'

type GrantOutcome = GrantRedemptionResult['outcome']

const OUTCOME_STYLES: Record<
  GrantOutcome,
  { label: string; chip: string; icon: typeof CheckCircle2 }
> = {
  accepted: { label: 'Added', chip: 'bg-signal-green/15 text-signal-green', icon: CheckCircle2 },
  rejected: { label: 'Skipped', chip: 'bg-signal-red/15 text-signal-red', icon: XCircle },
  expired: { label: 'Expired', chip: 'bg-signal-gold/15 text-signal-gold', icon: Clock },
  unauthorized: { label: 'Not allowed', chip: 'bg-signal-red/15 text-signal-red', icon: XCircle },
  duplicate: { label: 'No change', chip: 'bg-surface2 text-muted-foreground', icon: CopyCheck },
}

function grantHeadline(grant: InvitationGrant): string {
  if (grant.kind === 'account-invite') {
    return `Join an existing ${appLabel(grant.appSlug)} account as ${grant.role}`
  }
  return `Get ${appLabel(grant.appSlug)} access (set up your first account on arrival)`
}

function GrantIcon({ kind, className }: { kind: InvitationGrant['kind']; className?: string }) {
  const Icon = kind === 'account-invite' ? Building2 : KeyRound
  return <Icon className={cn('shrink-0 text-muted-foreground', className)} />
}

/**
 * Live redemption-demo data. v0 read seed bundles + the mock store; the live
 * sources are GET /api/invitations/bundles (inbox) and GET /api/admin/users/access
 * (sender/recipient labels + recipient context, site-admin). Accepting drives the
 * REAL redeem-as dev bypass (POST .../redeem-as), applying grants to the invitee
 * resolved from the bundle email instead of the signed-in admin.
 */
function useRedemptionData() {
  const [bundles, setBundles] = useState<InvitationBundle[] | null>(null)
  const [directory, setDirectory] = useState<UserAccessSummary[]>([])

  const refresh = useCallback(async () => {
    const client = getControlPlaneClient()
    const [bundlesRes, dirRes] = await Promise.allSettled([
      client.listInvitationBundles(),
      client.getUserAccess(),
    ])
    setBundles(bundlesRes.status === 'fulfilled' ? bundlesRes.value.bundles : [])
    setDirectory(dirRes.status === 'fulfilled' ? dirRes.value.users.map(toViewUserAccessSummary) : [])
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return { bundles, directory, refresh }
}

function Inbox({
  bundles,
  selectedId,
  onSelect,
}: {
  bundles: InvitationBundle[]
  selectedId: string
  onSelect: (id: string) => void
}) {
  return (
    <Card>
      <h3 className="mb-1 text-sm font-semibold text-foreground">Inbox</h3>
      <p className="mb-3 text-xs text-muted-foreground">
        Each row is an invitation email sent to a different person. Open one to see what they&apos;d
        experience when they click the link.
      </p>
      <ul className="space-y-1.5">
        {bundles.map((b) => {
          const active = b.bundleId === selectedId
          return (
            <li key={b.bundleId}>
              <button
                onClick={() => onSelect(b.bundleId)}
                className={cn(
                  'w-full rounded-lg border px-3 py-2.5 text-left transition-colors',
                  active ? 'border-primary bg-primary/10' : 'border-border bg-surface/40 hover:bg-surface2',
                )}
              >
                <div className="flex items-center gap-2">
                  <Mail className={cn('size-3.5 shrink-0', active ? 'text-primary' : 'text-muted-foreground')} />
                  <span className="truncate text-xs font-medium text-foreground">{b.email}</span>
                  {b.status === 'expired' && (
                    <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-signal-gold/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-signal-gold">
                      <Clock className="size-2.5" />
                      expired
                    </span>
                  )}
                </div>
                <p className="mt-1 line-clamp-1 text-[11px] text-muted-foreground">
                  {b.grants.length} grant{b.grants.length === 1 ? '' : 's'} · {b.status}
                </p>
              </button>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}

function InvitationEmail({
  bundle,
  senderName,
  onAccept,
  busy,
  canApply,
}: {
  bundle: InvitationBundle
  senderName: string
  onAccept: () => void
  busy: boolean
  canApply: boolean
}) {
  const expired = bundle.status === 'expired'
  return (
    <Card className="overflow-hidden p-0">
      <div className="border-b border-border bg-surface2/60 px-5 py-4">
        <p className="text-sm font-semibold text-foreground text-pretty">You&apos;ve been invited to Transformotion</p>
        <div className="mt-2 space-y-0.5 text-[11px] text-muted-foreground">
          <p>
            <span className="text-foreground">From:</span> {senderName} via Transformotion
          </p>
          <p>
            <span className="text-foreground">To:</span> {bundle.email}
          </p>
        </div>
      </div>

      <div className="px-5 py-5">
        <p className="text-sm text-foreground text-pretty">
          {senderName} has invited you to Transformotion. Accepting this single invitation grants you
          everything listed below:
        </p>

        <ul className="mt-4 space-y-2">
          {bundle.grants.map((grant) => (
            <li key={grant.grantId} className="flex items-start gap-2.5 rounded-lg border border-border bg-surface/40 p-3">
              <GrantIcon kind={grant.kind} className="mt-0.5 size-4" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">{grantHeadline(grant)}</p>
                <p className="text-[11px] text-muted-foreground">{appLabel(grant.appSlug)}</p>
              </div>
            </li>
          ))}
        </ul>

        {expired ? (
          <div className="mt-5 flex items-center gap-2 rounded-lg border border-signal-gold/30 bg-signal-gold/10 px-3 py-2.5 text-xs text-signal-gold">
            <Clock className="size-4 shrink-0" />
            This invitation link has expired. Accepting it will decline every item.
          </div>
        ) : null}

        <PrimaryButton className="mt-5 w-full" icon={MailOpen} onClick={onAccept} disabled={busy || !canApply}>
          {busy ? 'Accepting…' : 'Accept invite for recipient'}
        </PrimaryButton>
        <p className="mt-2 text-center text-[11px] text-muted-foreground">
          Applies this bundle to the invited user server-side. The admin session is not granted access.
        </p>
      </div>
    </Card>
  )
}

function OutcomeRow({ result }: { result: GrantRedemptionResult }) {
  const style = OUTCOME_STYLES[result.outcome]
  const Icon = style.icon
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border border-border bg-surface/40 p-3">
      <div className="flex items-start gap-2.5 min-w-0">
        <GrantIcon kind={result.kind as InvitationGrant['kind']} className="mt-0.5 size-4" />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">{result.target}</p>
          <p className="text-[11px] text-muted-foreground">{appLabel(result.appSlug as EntitledAppSlug)}</p>
          <p className="mt-1 text-xs text-muted-foreground text-pretty">{result.reason}</p>
          {result.outcome === 'duplicate' && (
            <span className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-surface2 px-2.5 py-1 text-[11px] font-medium text-foreground">
              <UserCog className="size-3.5" />
              Manage role in User Management
              <ArrowRight className="size-3" />
            </span>
          )}
          {result.outcome === 'accepted' && result.kind === 'app-grant' && (
            <span className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary">
              <Sparkles className="size-3.5" />
              Create your first account on the launchpad
              <ArrowRight className="size-3" />
            </span>
          )}
        </div>
      </div>
      <span
        className={cn(
          'inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
          style.chip,
        )}
      >
        <Icon className="size-3" />
        {style.label}
      </span>
    </div>
  )
}

function RedemptionResult({
  bundle,
  results,
  onReset,
}: {
  bundle: InvitationBundle
  results: GrantRedemptionResult[]
  onReset: () => void
}) {
  const added = results.filter((r) => r.outcome === 'accepted').length
  const total = results.length
  const allGood = added === total
  const noneGood = added === 0

  const banner = allGood
    ? { tone: 'bg-signal-green/15 text-signal-green border-signal-green/30', icon: CheckCircle2 }
    : noneGood
      ? { tone: 'bg-signal-red/15 text-signal-red border-signal-red/30', icon: XCircle }
      : { tone: 'bg-signal-gold/15 text-signal-gold border-signal-gold/30', icon: ShieldCheck }
  const BannerIcon = banner.icon

  const headline = allGood ? "You're all set" : noneGood ? 'Nothing was added' : 'Partly added to your account'

  return (
    <Card className="overflow-hidden p-0">
      <div className={cn('flex items-center gap-3 border-b px-5 py-4', banner.tone)}>
        <BannerIcon className="size-6 shrink-0" />
        <div>
          <p className="text-sm font-semibold">{headline}</p>
          <p className="text-xs opacity-90">
            {added} of {total} {total === 1 ? 'item' : 'items'} added to {bundle.email}
          </p>
        </div>
      </div>

      <div className="px-5 py-5">
        <h3 className="mb-2 text-sm font-semibold text-foreground">What happened to each item</h3>
        <div className="space-y-2">
          {results.map((result) => (
            <OutcomeRow key={result.grantId} result={result} />
          ))}
        </div>

        <SecondaryButton className="mt-5 w-full" icon={RotateCcw} onClick={onReset}>
          Back to the invitation
        </SecondaryButton>
      </div>
    </Card>
  )
}

function findInvitee(bundle: InvitationBundle, directory: UserAccessSummary[]): UserAccessSummary | undefined {
  return directory.find((u) => u.user.email.toLowerCase() === bundle.email.toLowerCase())
}

function InviteeContext({ bundle, invitee }: { bundle: InvitationBundle; invitee: UserAccessSummary | undefined }) {
  return (
    <Card>
      <h3 className="mb-2 text-sm font-semibold text-foreground">Who is the recipient?</h3>
      {!invitee ? (
        <p className="text-xs text-muted-foreground">
          <span className="text-foreground">{bundle.email}</span> is not yet a Transformotion user. This admin
          harness cannot pre-attach access by email alone; the invitee needs a Cognito user before the demo can
          apply grants on their behalf.
        </p>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            <span className="text-foreground">{resolveUserLabel(invitee.user)}</span> already has access to:
          </p>
          <ul className="mt-2 space-y-1">
            {invitee.appAccess.map((app) => (
              <li key={app.appSlug} className="text-[11px] text-muted-foreground">
                <span className="text-foreground">{app.appLabel}</span>
                {' — '}
                {app.accounts.length > 0
                  ? app.accounts.map((a) => `${a.accountName} (${a.role})`).join(', ')
                  : 'app-level only'}
              </li>
            ))}
            {invitee.appAccess.length === 0 && <li className="text-[11px] text-muted-foreground">No current access.</li>}
          </ul>
          <p className="mt-2 text-[11px] text-muted-foreground text-pretty">
            The demo applies accepted grants to this resolved invitee record, not to the signed-in admin.
          </p>
        </>
      )}
    </Card>
  )
}

export function RedemptionDemoView() {
  const { bundles, directory, refresh } = useRedemptionData()
  const [bundleId, setBundleId] = useState<string>('')
  const [results, setResults] = useState<GrantRedemptionResult[] | null>(null)
  const [busy, setBusy] = useState(false)

  const bundle = bundles?.find((b) => b.bundleId === bundleId) ?? bundles?.[0] ?? null
  const invitee = bundle ? findInvitee(bundle, directory) : undefined

  function senderName(userId: string): string {
    const summary = directory.find((u) => u.user.userId === userId)
    return summary ? resolveUserLabel(summary.user) : userId
  }

  async function acceptBundle(b: InvitationBundle) {
    setBusy(true)
    try {
      const idToken = await authService.getIdToken()
      if (!idToken) throw new Error('Not signed in')
      const res = await redeemBundleAsInvitee(idToken, b.bundleId)
      setResults(res.results)
      void refresh()
    } catch (err) {
      setResults(
        b.grants.map((g) => ({
          grantId: g.grantId,
          kind: g.kind,
          appSlug: g.appSlug,
          target: g.kind === 'account-invite' ? g.accountId : appLabel(g.appSlug),
          outcome: 'rejected' as const,
          reason: err instanceof Error ? err.message : 'Redemption failed.',
        })),
      )
    } finally {
      setBusy(false)
    }
  }

  function selectBundle(id: string) {
    setBundleId(id)
    setResults(null)
  }

  if (bundles === null) {
    return <p className="text-sm text-muted-foreground">Loading inbox…</p>
  }

  if (!bundle) {
    return (
      <EmptyState
        icon={TicketCheck}
        title="No invitations available"
        description="There are no invitation bundles to open. Create one from Invite User, then return here to walk the accept experience."
      />
    )
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
      <div className="space-y-4 lg:col-span-2">
        <Inbox bundles={bundles} selectedId={bundle.bundleId} onSelect={selectBundle} />
        <InviteeContext bundle={bundle} invitee={invitee} />
      </div>

      <div className="lg:col-span-3">
        {results ? (
          <RedemptionResult bundle={bundle} results={results} onReset={() => setResults(null)} />
        ) : (
          <InvitationEmail
            bundle={bundle}
            senderName={senderName(bundle.invitedBy)}
            onAccept={() => acceptBundle(bundle)}
            busy={busy}
            canApply={!!invitee}
          />
        )}
      </div>
    </div>
  )
}
