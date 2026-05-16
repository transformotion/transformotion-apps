'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Hub } from 'aws-amplify/utils'
import { authService } from '@/lib/services/auth'

export default function CallbackPage() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // Ensure Amplify is configured (authService import triggers this) then
    // subscribe to the OAuth code exchange completion event.
    const unsubscribe = Hub.listen('auth', ({ payload }) => {
      if (payload.event === 'signInWithRedirect') {
        router.replace('/')
      }
      if (payload.event === 'signInWithRedirect_failure') {
        setError('Sign in failed. Please try again.')
      }
    })

    // If the Hub event already fired before the listener was set up, check
    // whether Amplify already has an authenticated user.
    authService.getCurrentUser().then((user) => {
      if (user) router.replace('/')
    }).catch(() => {})

    return unsubscribe
  }, [router])

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <p className="text-sm text-destructive">{error}</p>
          <a
            href="/launchpad/sign-in/"
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
