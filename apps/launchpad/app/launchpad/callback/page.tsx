'use client'

import { useEffect, useState } from 'react'
import { Hub } from 'aws-amplify/utils'
import { authService } from '@/lib/services/auth'
import { takeRedeemReturnTarget } from '@/lib/redemption/seam'

function sanitizeAmplifyOAuthState() {
  const keysToFix: string[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key?.endsWith('.oauthSignIn') && localStorage.getItem(key) === 'true,false') {
      keysToFix.push(key)
    }
  }
  keysToFix.forEach(key => localStorage.setItem(key, 'true'))
}

export default function CallbackPage() {
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // OAuth completion can surface via TWO triggers — the Hub 'signInWithRedirect'
    // event AND the getCurrentUser() fallback (for when the Hub event fired before
    // this listener attached). Navigate EXACTLY ONCE: takePostCallbackTarget()
    // destructively consumes the redeem-return key, so a double-invoke would let
    // the second read see an empty key and override the redemption return with `/`.
    // The guard makes the post-callback navigation idempotent. (#483)
    let navigated = false
    const go = () => {
      if (navigated) return
      navigated = true
      sanitizeAmplifyOAuthState()
      window.location.replace(takeRedeemReturnTarget())
    }

    const unsubscribe = Hub.listen('auth', ({ payload }) => {
      if (payload.event === 'signInWithRedirect') {
        go()
      }
      if (payload.event === 'signInWithRedirect_failure') {
        setError('Sign in failed. Please try again.')
      }
    })

    // If the Hub event already fired before the listener was set up, check
    // whether Amplify already has an authenticated user — same single navigation.
    authService.getCurrentUser().then((user) => {
      if (user) go()
    }).catch(() => {})

    return unsubscribe
  }, [])

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <p className="text-sm text-destructive">{error}</p>
          <a
            href="/sign-in/"
            className="inline-block px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
          >
            Back to sign in
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="flex items-center gap-3 text-muted-foreground">
        <div className="size-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        <span className="text-sm">Completing sign in…</span>
      </div>
    </div>
  )
}
