'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Wordmark } from '@/components/brand/wordmark'
import { useAuthStore } from '@/stores/auth/use-auth-store'
import { authService } from '@/lib/services/auth'
import { redeemInvitationBundle, type GrantRedemptionResult } from '@/lib/services/invitations'
import { CheckCircle2, AlertCircle, ArrowRight, Loader2 } from 'lucide-react'

// M11 Chunk 3 #3 — redemption LANDING (the real invitee-only path; the email-link
// target, though SES delivery is a separate seam). The authenticated invitee
// redeems THEIR OWN bundle via A5 (invitee-only enforced server-side). After an
// app-grant they land here, then continue to the launchpad where the
// create-first-account tile (#1) awaits; after an account-invite they have an
// account. Static-export friendly: bundleId comes from `?bundle=<id>`.
function RedeemView() {
  const router = useRouter()
  const params = useSearchParams()
  const bundleId = params.get('bundle') ?? ''
  const { isInitialized, isAuthenticated, initialize } = useAuthStore()
  const [state, setState] = useState<'idle' | 'redeeming' | 'done' | 'error'>('idle')
  const [results, setResults] = useState<GrantRedemptionResult[]>([])
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => { initialize() }, [initialize])

  // Once authenticated, redeem the invitee's own bundle exactly once.
  useEffect(() => {
    if (!isInitialized) return
    if (!isAuthenticated) {
      // Send the invitee through sign-in, returning here afterwards.
      const back = `/invitations/redeem?bundle=${encodeURIComponent(bundleId)}`
      router.replace(`/sign-in?next=${encodeURIComponent(back)}`)
      return
    }
    if (!bundleId) { setState('error'); setMessage('This invitation link is missing its identifier.'); return }
    if (state !== 'idle') return

    setState('redeeming')
    ;(async () => {
      try {
        const idToken = await authService.getIdToken()
        if (!idToken) throw new Error('Not signed in')
        const res = await redeemInvitationBundle(idToken, bundleId)
        setResults(res.results)
        // The new groups/accounts land in the NEXT token — refresh before the
        // launchpad reads entitlement so the tile state is correct on arrival.
        await authService.refreshTokens().catch(() => {})
        setState('done')
      } catch (err) {
        console.error('[redeem] failed:', err)
        setState('error')
        setMessage('We could not redeem this invitation. It may have expired, already been used, or been sent to a different email.')
      }
    })()
  }, [isInitialized, isAuthenticated, bundleId, state, router])

  const accepted = results.filter((r) => r.outcome === 'accepted' || r.outcome === 'duplicate')

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl">
        <div className="mb-4"><Wordmark size="sm" /></div>

        {(state === 'idle' || state === 'redeeming') && (
          <div className="flex items-center gap-3 text-muted-foreground">
            <Loader2 className="size-5 animate-spin text-primary" />
            <p className="text-sm">Redeeming your invitation…</p>
          </div>
        )}

        {state === 'error' && (
          <div className="flex items-start gap-3">
            <AlertCircle className="size-5 text-signal-red shrink-0" />
            <div>
              <h1 className="text-base font-semibold text-foreground mb-1">Couldn&apos;t redeem</h1>
              <p className="text-sm text-muted-foreground">{message}</p>
            </div>
          </div>
        )}

        {state === 'done' && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle2 className="size-5 text-signal-green" />
              <h1 className="text-base font-semibold text-foreground">You&apos;re in</h1>
            </div>
            <ul className="space-y-1.5 mb-5">
              {results.map((r) => (
                <li key={r.grantId} className="text-sm text-muted-foreground">
                  {r.outcome === 'accepted' || r.outcome === 'duplicate' ? '✓' : '•'} {r.reason}
                </li>
              ))}
            </ul>
            <button
              onClick={() => router.replace('/')}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 w-full"
            >
              Continue to your apps <ArrowRight className="size-4" />
            </button>
            {accepted.length === 0 && (
              <p className="mt-3 text-xs text-muted-foreground">Nothing new was applied — you may already have this access.</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default function RedeemPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <RedeemView />
    </Suspense>
  )
}
