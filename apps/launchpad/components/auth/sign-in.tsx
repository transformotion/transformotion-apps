'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { Wordmark } from '@/components/brand/wordmark'
import { Spinner } from '@/components/ui/spinner'
import { authService } from '@/lib/services/auth'

export function SignIn() {
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    authService.signInWithRedirect().catch(err => {
      setError(err instanceof Error ? err.message : 'Sign in failed. Please try again.')
    })
  }, [])

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="absolute top-0 left-0 right-0 h-64 bg-gradient-to-b from-primary/5 to-transparent pointer-events-none" />

      <main className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-md text-center">
          <div className="flex justify-center mb-10">
            <Wordmark size="xl" />
          </div>

          {error ? (
            <div className="space-y-4">
              <p className="text-sm text-destructive">{error}</p>
              <button
                onClick={() => {
                  setError(null)
                  authService.signInWithRedirect().catch(err => {
                    setError(err instanceof Error ? err.message : 'Sign in failed.')
                  })
                }}
                className={cn(
                  'px-6 h-10 rounded-xl font-medium text-sm transition-all',
                  'bg-primary text-primary-foreground hover:bg-primary/90',
                )}
              >
                Try again
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-center gap-3 text-muted-foreground">
              <Spinner className="size-5" />
              <span className="text-sm">Signing in…</span>
            </div>
          )}
        </div>
      </main>

      <footer className="py-6 text-center">
        <p className="text-xs text-muted-foreground">
          Putting your business transformation into motion
        </p>
      </footer>
    </div>
  )
}
