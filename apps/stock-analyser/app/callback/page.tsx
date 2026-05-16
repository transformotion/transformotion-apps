'use client'

import { useEffect, useState } from 'react'
import { Hub } from 'aws-amplify/utils'
import { authService } from '@/lib/services/auth'

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
    const unsubscribe = Hub.listen('auth', ({ payload }) => {
      if (payload.event === 'signInWithRedirect') {
        sanitizeAmplifyOAuthState()
        window.location.replace('/stock-signal/')
      }
      if (payload.event === 'signInWithRedirect_failure') {
        setError('Sign in failed. Please try again.')
      }
    })

    authService.getCurrentUser().then((user) => {
      if (user) window.location.replace('/stock-signal/')
    }).catch(() => {})

    return unsubscribe
  }, [])

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <p className="text-sm text-red-400">{error}</p>
          <a
            href="/sign-in"
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
