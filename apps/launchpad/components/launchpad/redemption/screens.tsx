/**
 * Redemption screens (runtime)
 * ============================
 * Pure-presentation port of v0's redemption-screens — each renders one
 * `RedemptionEvaluation` outcome and re-implements NO logic (the machine decides
 * everything). The v0 mock EmailScreen/SignupScreen/ReadyToApplyScreen are NOT
 * ported: runtime authenticates via Cognito Hosted-UI (not a mock signup), and
 * the flow AUTO-applies `ready-to-apply` (no manual review screen).
 */

'use client'

import {
  Building2,
  KeyRound,
  MailOpen,
  CheckCircle2,
  XCircle,
  Clock,
  Ban,
  CopyCheck,
  Search,
  ArrowRight,
  ShieldCheck,
  ShieldAlert,
  UserCheck,
  Sparkles,
  RotateCcw,
} from 'lucide-react'
import type { ComponentType } from 'react'
import { cn } from '@/lib/utils'
import { Card, PrimaryButton, SecondaryButton } from '@/components/ui/design-system'
import type {
  AuthenticatedIdentity,
  RedemptionApplied,
  RedemptionBundlePreview,
  RedemptionEmailMismatch,
  RedemptionLinkInvalid,
  RedemptionLinkState,
  RedemptionNeedsVerification,
} from '@transformotion/contracts/launchpad/redemption'
import type { GrantRedemptionResult } from '@transformotion/contracts/launchpad/invitations'
import { idpLabel } from '@/lib/redemption/machine'

// ---------------------------------------------------------------------------
// Shared bits
// ---------------------------------------------------------------------------

function GrantIcon({ kind, className }: { kind: GrantRedemptionResult['kind']; className?: string }) {
  const Icon = kind === 'account-invite' ? Building2 : KeyRound
  return <Icon className={cn('shrink-0 text-muted-foreground', className)} />
}

function PreviewGrantRow({ grant }: { grant: RedemptionBundlePreview['grants'][number] }) {
  const headline = grant.kind === 'account-invite' ? `Join ${grant.target}` : `Get ${grant.target} access`
  const sub =
    grant.kind === 'account-invite'
      ? 'Added to an existing account'
      : "App access — you'll create your first account on arrival"
  return (
    <li className="flex items-start gap-2.5 rounded-lg border border-border bg-surface/40 p-3">
      <GrantIcon kind={grant.kind} className="mt-0.5 size-4" />
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground text-pretty">{headline}</p>
        <p className="text-[11px] text-muted-foreground">{sub}</p>
      </div>
    </li>
  )
}

export function BundlePreviewCard({ preview }: { preview: RedemptionBundlePreview }) {
  return (
    <ul className="space-y-2">
      {preview.grants.map((g) => (
        <PreviewGrantRow key={g.grantId} grant={g} />
      ))}
    </ul>
  )
}

function IdentityChip({ identity }: { identity: AuthenticatedIdentity }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-surface/40 px-3 py-2">
      <UserCheck className="size-4 shrink-0 text-primary" />
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-foreground">
          {identity.displayName ?? identity.email}
        </p>
        <p className="truncate text-[11px] text-muted-foreground">
          {identity.email} · via {idpLabel(identity.provider)}
          {identity.emailVerified ? ' · verified' : ' · unverified'}
        </p>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// 1. Link invalid
// ---------------------------------------------------------------------------

const LINK_INVALID_COPY: Record<
  Exclude<RedemptionLinkState, 'valid'>,
  { icon: ComponentType<{ className?: string }>; title: string; body: string; tone: string }
> = {
  expired: {
    icon: Clock,
    title: 'This invitation has expired',
    body: 'The link is past its expiry date. Ask whoever invited you to send a fresh invitation.',
    tone: 'bg-signal-gold/15 text-signal-gold border-signal-gold/30',
  },
  revoked: {
    icon: Ban,
    title: 'This invitation was withdrawn',
    body: "Every item on this invitation has been cancelled, so there's nothing left to accept. Ask the sender to invite you again.",
    tone: 'bg-signal-red/15 text-signal-red border-signal-red/30',
  },
  'already-redeemed': {
    icon: CopyCheck,
    title: 'This invitation was already accepted',
    body: "You've already redeemed this link — your access is in place. Opening it again won't change anything.",
    tone: 'bg-surface2 text-foreground border-border',
  },
  'not-found': {
    icon: Search,
    title: "We couldn't find this invitation",
    body: "This link doesn't match any invitation. Check you've used the full link from your email, or ask the sender to resend it.",
    tone: 'bg-signal-red/15 text-signal-red border-signal-red/30',
  },
}

export function LinkInvalidScreen({ evaluation }: { evaluation: RedemptionLinkInvalid }) {
  const copy = LINK_INVALID_COPY[evaluation.linkState]
  const Icon = copy.icon
  return (
    <Card className="overflow-hidden p-0">
      <div className={cn('flex items-center gap-3 border-b px-5 py-4', copy.tone)}>
        <Icon className="size-6 shrink-0" />
        <p className="text-sm font-semibold">{copy.title}</p>
      </div>
      <div className="px-5 py-5">
        <p className="text-sm text-muted-foreground text-pretty">{copy.body}</p>
      </div>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// 2. Email mismatch (Option D) — CONFIRM, not block
// ---------------------------------------------------------------------------

export function EmailMismatchScreen({
  evaluation,
  onContinueAndBind,
  onSwitchIdentity,
}: {
  evaluation: RedemptionEmailMismatch
  onContinueAndBind: () => void
  onSwitchIdentity: () => void
}) {
  const { identity, invitedEmail } = evaluation
  return (
    <Card className="overflow-hidden p-0">
      <div className="flex items-center gap-3 border-b border-primary/30 bg-primary/10 px-5 py-4 text-primary">
        <ShieldAlert className="size-6 shrink-0" />
        <div>
          <p className="text-sm font-semibold">This invitation was addressed to a different email</p>
          <p className="text-xs opacity-90">You can still accept it with the account you&apos;re signed in as.</p>
        </div>
      </div>
      <div className="px-5 py-5">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div className="rounded-lg border border-border bg-surface/40 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Invited</p>
            <p className="mt-1 truncate text-sm text-foreground">{invitedEmail}</p>
          </div>
          <div className="rounded-lg border border-border bg-surface/40 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Signed in as</p>
            <p className="mt-1 truncate text-sm text-foreground">{identity.email}</p>
          </div>
        </div>

        <div className="mt-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">You&apos;ll get</p>
          <BundlePreviewCard preview={evaluation.preview} />
        </div>

        <PrimaryButton className="mt-5 w-full" icon={ArrowRight} onClick={onContinueAndBind}>
          Continue as {identity.email}
        </PrimaryButton>
        <p className="mt-1.5 text-center text-[11px] text-muted-foreground text-pretty">
          This binds the invitation to the account you&apos;re signed in as.
        </p>

        <SecondaryButton className="mt-3 w-full" icon={RotateCcw} onClick={onSwitchIdentity}>
          Use a different account
        </SecondaryButton>
      </div>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// 3. Needs verification (stricter-MVP)
// ---------------------------------------------------------------------------

export function NeedsVerificationScreen({
  evaluation,
  onResend,
}: {
  evaluation: RedemptionNeedsVerification
  onResend?: () => void
}) {
  return (
    <Card className="overflow-hidden p-0">
      <div className="flex items-center gap-3 border-b border-signal-gold/30 bg-signal-gold/10 px-5 py-4 text-signal-gold">
        <ShieldAlert className="size-6 shrink-0" />
        <p className="text-sm font-semibold">Verify your email to continue</p>
      </div>
      <div className="px-5 py-5">
        <IdentityChip identity={evaluation.identity} />
        <p className="mt-3 text-sm text-muted-foreground text-pretty">
          For this invitation we need a verified email address. Check{' '}
          <span className="text-foreground">{evaluation.identity.email}</span> for a verification link, then reopen
          this invitation.
        </p>
        {onResend ? (
          <SecondaryButton className="mt-4 w-full" icon={MailOpen} onClick={onResend}>
            Resend verification email
          </SecondaryButton>
        ) : null}
      </div>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// 4. Applied — routed PER GRANT KIND
// ---------------------------------------------------------------------------

const OUTCOME_STYLES: Record<
  GrantRedemptionResult['outcome'],
  { label: string; chip: string; icon: ComponentType<{ className?: string }> }
> = {
  accepted: { label: 'Added', chip: 'bg-signal-green/15 text-signal-green', icon: CheckCircle2 },
  rejected: { label: 'Skipped', chip: 'bg-signal-red/15 text-signal-red', icon: XCircle },
  expired: { label: 'Expired', chip: 'bg-signal-gold/15 text-signal-gold', icon: Clock },
  unauthorized: { label: 'Not allowed', chip: 'bg-signal-red/15 text-signal-red', icon: XCircle },
  duplicate: { label: 'No change', chip: 'bg-surface2 text-muted-foreground', icon: CopyCheck },
}

function AppliedOutcomeRow({ result }: { result: GrantRedemptionResult }) {
  const style = OUTCOME_STYLES[result.outcome]
  const Icon = style.icon
  const accepted = result.outcome === 'accepted'
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border border-border bg-surface/40 p-3">
      <div className="flex min-w-0 items-start gap-2.5">
        <GrantIcon kind={result.kind} className="mt-0.5 size-4" />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">{result.target}</p>
          <p className="mt-1 text-xs text-muted-foreground text-pretty">{result.reason}</p>
          {accepted && result.kind === 'app-grant' ? (
            <span className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary">
              <Sparkles className="size-3.5" />
              You&apos;ll create your first {result.target} account from the Launchpad
            </span>
          ) : null}
          {accepted && result.kind === 'account-invite' ? (
            <span className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-signal-green/10 px-2.5 py-1 text-[11px] font-medium text-signal-green">
              <Building2 className="size-3.5" />
              You&apos;ve joined {result.target}
            </span>
          ) : null}
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

export function AppliedScreen({
  evaluation,
  onReset,
  resetLabel = 'Back to the invitation',
}: {
  evaluation: RedemptionApplied
  onReset?: () => void
  resetLabel?: string
}) {
  const results = evaluation.response.results
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
  const headline = allGood ? "You're all set" : noneGood ? 'Nothing was added' : 'Partly added'

  return (
    <Card className="overflow-hidden p-0">
      <div className={cn('flex items-center gap-3 border-b px-5 py-4', banner.tone)}>
        <BannerIcon className="size-6 shrink-0" />
        <div>
          <p className="text-sm font-semibold">{headline}</p>
          <p className="text-xs opacity-90">
            {added} of {total} {total === 1 ? 'item' : 'items'} added for {evaluation.identity.email}
          </p>
        </div>
      </div>
      <div className="px-5 py-5">
        <h3 className="mb-2 text-sm font-semibold text-foreground">What happened to each item</h3>
        <div className="space-y-2">
          {results.map((r) => (
            <AppliedOutcomeRow key={r.grantId} result={r} />
          ))}
        </div>
        {onReset ? (
          <SecondaryButton className="mt-5 w-full" icon={RotateCcw} onClick={onReset}>
            {resetLabel}
          </SecondaryButton>
        ) : null}
      </div>
    </Card>
  )
}
