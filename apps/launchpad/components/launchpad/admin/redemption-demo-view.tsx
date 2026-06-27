'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  TicketCheck,
  Mail,
  MailOpen,
  Building2,
  KeyRound,
  Clock,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card, PrimaryButton, EmptyState } from '@/components/ui/design-system'
import { appLabel, resolveUserLabel, toViewUserAccessSummary, type UserAccessSummary } from '@/lib/admin/view-model'
import { getControlPlaneClient } from '@/lib/services/control-plane-client'
import type { InvitationBundle, InvitationGrant } from '@transformotion/contracts/launchpad/invitations'

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
 * Live redemption-demo data. v0 reads every seed/store bundle; the live source
 * is GET /api/invitations/bundles, where site-admin sees every bundle. Opening
 * an invitation launches the real /redeem?bundle=<id> invitee route instead of
 * the legacy inline redeem-as impersonation path.
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

  return { bundles, directory }
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
  onOpen,
}: {
  bundle: InvitationBundle
  senderName: string
  onOpen: () => void
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

        <PrimaryButton className="mt-5 w-full" icon={MailOpen} onClick={onOpen}>
          Open invitation link
        </PrimaryButton>
        <p className="mt-2 text-center text-[11px] text-muted-foreground">
          Opens the real invitee redemption route. If you&apos;re signed in as the wrong person, use
          the flow&apos;s switch-account step.
        </p>
      </div>
    </Card>
  )
}

function InviteeContext({ bundle, directory }: { bundle: InvitationBundle; directory: UserAccessSummary[] }) {
  const summary = directory.find((u) => u.user.email.toLowerCase() === bundle.email.toLowerCase())
  return (
    <Card>
      <h3 className="mb-2 text-sm font-semibold text-foreground">Who is the recipient?</h3>
      {!summary ? (
        <p className="text-xs text-muted-foreground">
          <span className="text-foreground">{bundle.email}</span> isn&apos;t a Transformotion user yet — they&apos;re
          brand new, so nothing here conflicts.
        </p>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            <span className="text-foreground">{resolveUserLabel(summary.user)}</span> already has access to:
          </p>
          <ul className="mt-2 space-y-1">
            {summary.appAccess.map((app) => (
              <li key={app.appSlug} className="text-[11px] text-muted-foreground">
                <span className="text-foreground">{app.appLabel}</span>
                {' — '}
                {app.accounts.length > 0
                  ? app.accounts.map((a) => `${a.accountName} (${a.role})`).join(', ')
                  : 'app-level only'}
              </li>
            ))}
            {summary.appAccess.length === 0 && <li className="text-[11px] text-muted-foreground">No current access.</li>}
          </ul>
          <p className="mt-2 text-[11px] text-muted-foreground text-pretty">
            That existing access is exactly why some items below may not apply.
          </p>
        </>
      )}
    </Card>
  )
}

export function RedemptionDemoView() {
  const router = useRouter()
  const { bundles, directory } = useRedemptionData()
  const [bundleId, setBundleId] = useState<string>('')

  const bundle = bundles?.find((b) => b.bundleId === bundleId) ?? bundles?.[0] ?? null

  function senderName(userId: string): string {
    const summary = directory.find((u) => u.user.userId === userId)
    return summary ? resolveUserLabel(summary.user) : userId
  }

  function openBundle(b: InvitationBundle) {
    router.push(`/redeem?bundle=${encodeURIComponent(b.bundleId)}`)
  }

  function selectBundle(id: string) {
    setBundleId(id)
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
        <InviteeContext bundle={bundle} directory={directory} />
      </div>

      <div className="lg:col-span-3">
        <InvitationEmail
          bundle={bundle}
          senderName={senderName(bundle.invitedBy)}
          onOpen={() => openBundle(bundle)}
        />
      </div>
    </div>
  )
}
