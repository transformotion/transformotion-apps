/**
 * RedemptionFlow (runtime) — shared stateful controller
 * =====================================================
 * Auth-agnostic driver of the redemption experience. The authenticated identity
 * is owned by the PARENT (the real route reads it from the Cognito session after
 * Hosted-UI returns). Adapted from v0 for the real backend:
 *   - AUTH-FIRST: the bundle is resolved via the auth-only GET only AFTER an
 *     identity exists (a brief "Loading your invitation…" while it fetches).
 *   - apply is async (the real A5 redeem).
 * Collapsed transitions are preserved: needs-auth auto-forwards to sign-in,
 * ready-to-apply auto-applies; mismatch/verification are explicit gates.
 */

'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import type {
  AuthenticatedIdentity,
  RedemptionApplied,
  RedemptionPolicy,
} from '@transformotion/contracts/launchpad/redemption'
import type { InvitationBundle } from '@transformotion/contracts/launchpad/invitations'
import { applyRedemption, evaluateRedemption, resolveBundle } from '@/lib/redemption/machine'
import { Card } from '@/components/ui/design-system'
import {
  AppliedScreen,
  EmailMismatchScreen,
  LinkInvalidScreen,
  NeedsVerificationScreen,
} from './screens'

export interface RedemptionFlowProps {
  bundleId: string
  /** Authenticated identity, or null if the invitee hasn't signed in yet. */
  identity: AuthenticatedIdentity | null
  policy?: RedemptionPolicy
  /** needs-auth → forward to Cognito Hosted-UI (the parent owns the redirect). */
  onRequestSignup: () => void
  /** mismatch "use a different account" → parent clears the session + re-auths. */
  onSwitchIdentity: () => void
  onApplied?: (applied: RedemptionApplied) => void
}

export function RedemptionFlow({
  bundleId,
  identity,
  policy,
  onRequestSignup,
  onSwitchIdentity,
  onApplied,
}: RedemptionFlowProps) {
  const [confirmedMismatchBind, setConfirmedMismatchBind] = useState(false)
  const [applied, setApplied] = useState<RedemptionApplied | null>(null)
  const [applying, setApplying] = useState(false)
  // The bundle is resolved POST-auth (GET {bundleId} is auth-only). null until
  // fetched; `bundleLoaded` distinguishes "still loading" from a real not-found.
  const [bundle, setBundle] = useState<InvitationBundle | null>(null)
  const [bundleLoaded, setBundleLoaded] = useState(false)
  const autoHandledRef = useRef(false)

  useEffect(() => {
    let cancelled = false
    if (!identity) {
      setBundle(null)
      setBundleLoaded(false)
      return
    }
    setBundleLoaded(false)
    resolveBundle(bundleId).then((b) => {
      if (!cancelled) {
        setBundle(b)
        setBundleLoaded(true)
      }
    })
    return () => {
      cancelled = true
    }
  }, [identity, bundleId])

  const evaluation = useMemo(
    () => evaluateRedemption({ bundleId, bundle, identity, policy, confirmedMismatchBind }),
    [bundleId, bundle, identity, policy, confirmedMismatchBind],
  )

  function handleSwitchIdentity() {
    setConfirmedMismatchBind(false)
    onSwitchIdentity()
  }

  const handleApply = useCallback(async () => {
    if (!identity) return
    setApplying(true)
    const result = await applyRedemption(bundleId, identity)
    setApplying(false)
    if (result.status === 'applied') {
      setApplied(result)
      onApplied?.(result)
    }
  }, [identity, bundleId, onApplied])

  useEffect(() => {
    if (applied || applying) return
    if (evaluation.status === 'needs-auth') {
      if (autoHandledRef.current) return
      autoHandledRef.current = true
      onRequestSignup()
    } else if (evaluation.status === 'ready-to-apply') {
      if (autoHandledRef.current) return
      autoHandledRef.current = true
      void handleApply()
    } else {
      autoHandledRef.current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [evaluation.status, applied, applying])

  if (applied) return <AppliedScreen evaluation={applied} />

  // Authenticated but the bundle hasn't resolved yet → loading (NOT not-found).
  if (identity && !bundleLoaded) return <TransitionCard label="Loading your invitation…" />

  switch (evaluation.status) {
    case 'link-invalid':
      return <LinkInvalidScreen evaluation={evaluation} />
    case 'needs-auth':
      return <TransitionCard label="Taking you to sign-in…" />
    case 'email-mismatch':
      return (
        <EmailMismatchScreen
          evaluation={evaluation}
          onContinueAndBind={() => setConfirmedMismatchBind(true)}
          onSwitchIdentity={handleSwitchIdentity}
        />
      )
    case 'needs-verification':
      return <NeedsVerificationScreen evaluation={evaluation} />
    case 'ready-to-apply':
      return <TransitionCard label="Applying your invitation…" />
    case 'applied':
      return <AppliedScreen evaluation={evaluation} />
  }
}

function TransitionCard({ label }: { label: string }) {
  return (
    <Card className="flex items-center justify-center gap-3 py-10">
      <Loader2 className="size-5 animate-spin text-primary" />
      <p className="text-sm text-muted-foreground">{label}</p>
    </Card>
  )
}
