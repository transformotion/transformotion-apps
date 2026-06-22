'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { AuthHeroBand } from '@/components/auth/auth-hero-band'
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
      <AuthHeroBand
        title="Welcome back"
        subtitle="Sign in to access your workspace"
      />

      <main className="flex-1 flex justify-center px-4 pb-4">
        <div className="w-full max-w-md sm:max-w-lg -mt-8">
          <div className="rounded-2xl border border-border bg-card p-6 text-center shadow-xl shadow-black/5">
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
                <span className="text-sm">Signing in...</span>
              </div>
            )}
          </div>
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
