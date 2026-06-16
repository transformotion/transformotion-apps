'use client'

import { useEffect, useState } from 'react'
import { notFound, useRouter } from 'next/navigation'
import { Wordmark } from '@/components/brand/wordmark'
import { useAuthStore } from '@/stores/auth/use-auth-store'
import { authService } from '@/lib/services/auth'
import { devToolsEnabled } from '@/lib/dev-tools'
import { redeemBundleAsInvitee, type GrantRedemptionResult } from '@/lib/services/invitations'
import { FlaskConical, AlertTriangle, ArrowRight, Loader2, ShieldAlert } from 'lucide-react'

// M11 Chunk 3 #6 — the Redemption Demo harness. A DEV-ONLY tool that DRIVES THE
// REAL A5 redemption handler (the redeem-as bypass): it impersonates a bundle's
// invitee and redeems on their behalf, so the real flow can be tested in dev
// before SES email delivery exists.
//
// TWO guards:
//   • CLIENT (here): dev-tools-gated — notFound() when NEXT_PUBLIC_DEV_TOOLS=false
//     (one of the three-fold enforcements: gated route → notFound).
//   • SERVER (the real boundary): the bypass is refused in prod by the
//     invitation-redemption STAGE guard — the client flag is NOT a security
//     boundary; the server env is.
export default function RedemptionDemoPage() {
  // Three-fold enforcement (gated route): structurally 404 when dev-tools are off.
  if (!devToolsEnabled()) notFound()
  return <RedemptionDemo />
}

function RedemptionDemo() {
  const router = useRouter()
  const { user, isInitialized, isAuthenticated, initialize } = useAuthStore()
  const [bundleId, setBundleId] = useState('')
  const [busy, setBusy] = useState(false)
  const [results, setResults] = useState<GrantRedemptionResult[] | null>(null)
  const [redeemedUserId, setRedeemedUserId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { initialize() }, [initialize])

  const isSiteAdmin = (user?.metadata as { siteAdmin?: boolean } | undefined)?.siteAdmin === true

  const run = async () => {
    if (!bundleId.trim() || busy) return
    setBusy(true); setError(null); setResults(null); setRedeemedUserId(null)
    try {
      const idToken = await authService.getIdToken()
      if (!idToken) throw new Error('Not signed in')
      const res = await redeemBundleAsInvitee(idToken, bundleId.trim())
      setResults(res.results)
      setRedeemedUserId(res.userId)
    } catch (err) {
      console.error('[redemption-demo] failed:', err)
      setError('Bypass refused or failed. It is dev-only (refused server-side in prod), site-admin-only, and the invitee must have signed in once.')
    } finally {
      setBusy(false)
    }
  }

  if (!isInitialized) {
    return <div className="min-h-screen bg-background flex items-center justify-center"><Loader2 className="size-5 animate-spin text-primary" /></div>
  }
  if (!isAuthenticated || !isSiteAdmin) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="max-w-md rounded-2xl border border-border bg-card p-6 text-center">
          <ShieldAlert className="size-6 text-signal-red mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">The redemption demo is site-admin only.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <Wordmark size="sm" />
          <span className="inline-flex items-center gap-1.5 rounded-full bg-signal-gold/15 px-2.5 py-1 text-xs font-medium text-signal-gold">
            <FlaskConical className="size-3.5" /> Dev tool
          </span>
        </div>

        <h1 className="text-base font-semibold text-foreground mb-1">Redemption demo (bypass)</h1>
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-signal-gold/30 bg-signal-gold/5 p-3">
          <AlertTriangle className="size-4 text-signal-gold shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground leading-relaxed">
            Impersonates the bundle&apos;s invitee and redeems on their behalf via the <strong>real A5 handler</strong>,
            without their email link. Dev-only — <strong>refused server-side in prod</strong> (env-guarded, not the
            client flag). The invitee must have signed in at least once.
          </p>
        </div>

        <label htmlFor="demo-bundle" className="block text-xs font-medium text-muted-foreground mb-1.5">Bundle id</label>
        <input
          id="demo-bundle"
          value={bundleId}
          onChange={(e) => setBundleId(e.target.value)}
          placeholder="bundle id from the composer"
          className="w-full h-10 rounded-lg border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-primary/40 font-mono"
        />

        <button
          onClick={run}
          disabled={!bundleId.trim() || busy}
          className="mt-4 inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50 w-full"
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}
          {busy ? 'Redeeming…' : 'Redeem as invitee (bypass)'}
        </button>

        {error ? <p className="mt-3 text-xs text-signal-red">{error}</p> : null}
        {results && (
          <div className="mt-4 rounded-lg border border-border bg-surface2/40 p-3 text-xs">
            <p className="text-foreground mb-1">Redeemed for invitee <span className="font-mono">{redeemedUserId}</span>:</p>
            <ul className="space-y-0.5 text-muted-foreground">
              {results.map((r) => (
                <li key={r.grantId}>{r.outcome === 'accepted' || r.outcome === 'duplicate' ? '✓' : '✗'} [{r.outcome}] {r.reason}</li>
              ))}
            </ul>
          </div>
        )}

        <button onClick={() => router.replace('/')} className="mt-4 text-xs text-muted-foreground hover:text-foreground">← Back to launchpad</button>
      </div>
    </div>
  )
}
