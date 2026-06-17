/**
 * RedeemPageClient — invitee-facing chrome around the shared RedemptionFlow.
 * Resolves the REAL Cognito identity (the swap for v0's mock IdP session), drives
 * the Hosted-UI round-trip via the seam, and on a successful apply hands off to
 * the Launchpad (the invitee is already the signed-in Cognito user).
 */

'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { TicketCheck, ArrowRight, Loader2 } from 'lucide-react'
import { RedemptionFlow } from './redemption-flow'
import { Card, PrimaryButton } from '@/components/ui/design-system'
import {
  beginRedemptionSignIn,
  getRedemptionIdentity,
  switchRedemptionIdentity,
} from '@/lib/redemption/seam'
import type { AuthenticatedIdentity, RedemptionApplied } from '@transformotion/contracts/launchpad/redemption'

export function RedeemPageClient({ bundleId }: { bundleId: string }) {
  const router = useRouter()
  const [identity, setIdentity] = useState<AuthenticatedIdentity | null>(null)
  const [identityResolved, setIdentityResolved] = useState(false)
  const [applied, setApplied] = useState<RedemptionApplied | null>(null)

  // Resolve the session FIRST: a returning (already-signed-in) invitee must not
  // flash needs-auth (which auto-redirects back to Hosted-UI).
  useEffect(() => {
    let cancelled = false
    getRedemptionIdentity().then((id) => {
      if (!cancelled) {
        setIdentity(id)
        setIdentityResolved(true)
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <main className="flex min-h-screen flex-col items-center bg-background px-4 py-10 font-sans">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center gap-2.5">
          <span className="inline-flex size-9 items-center justify-center rounded-xl border border-border bg-surface">
            <TicketCheck className="size-5 text-primary" />
          </span>
          <div>
            <p className="text-sm font-semibold text-foreground">Transformotion</p>
            <p className="text-xs text-muted-foreground">Invitation</p>
          </div>
        </div>

        {!identityResolved ? (
          <Card className="flex items-center justify-center gap-3 py-10">
            <Loader2 className="size-5 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Opening your invitation…</p>
          </Card>
        ) : (
          <div className="flex flex-col gap-4">
            <RedemptionFlow
              bundleId={bundleId}
              identity={identity}
              onRequestSignup={() => {
                void beginRedemptionSignIn(bundleId)
              }}
              onSwitchIdentity={() => {
                void switchRedemptionIdentity(bundleId)
              }}
              onApplied={setApplied}
            />
            {applied ? (
              <PostRedemptionNext applied={applied} onGoToLaunchpad={() => router.push('/launchpad')} />
            ) : null}
          </div>
        )}
      </div>
    </main>
  )
}

/**
 * Post-redemption tail. A successful apply has already created/granted access,
 * so the only thing left is the hand-off to the Launchpad — which greets the
 * invitee and computes their entitlements (an app-grant lands them in
 * create-first-account; an account-invite shows the joined account).
 */
function PostRedemptionNext({
  applied,
  onGoToLaunchpad,
}: {
  applied: RedemptionApplied
  onGoToLaunchpad: () => void
}) {
  const anyApplied = applied.response.results.some(
    (r) => r.outcome === 'accepted' || r.outcome === 'duplicate',
  )
  return (
    <PrimaryButton icon={ArrowRight} onClick={onGoToLaunchpad} className="w-full">
      {anyApplied ? 'Continue to Launchpad' : 'Go to Launchpad'}
    </PrimaryButton>
  )
}
