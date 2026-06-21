'use client'

import { useEffect } from 'react'
import { idpHintToProvider } from '@transformotion/auth-client'
import { useAuthStore } from '@/stores/auth/use-auth-store'
import { authService } from '@/lib/services/auth'

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isInitialized, initialize } = useAuthStore()

  useEffect(() => {
    initialize()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (isInitialized && !isAuthenticated) {
      // Cross-app SSO hint (#490): the launchpad appends ?idp=<provider> when it
      // launches this app for a FEDERATED user. Passing it as the Hosted-UI
      // `provider` re-federates silently (identity_provider=<X>) instead of showing
      // the chooser. A native user arrives with no hint → undefined → normal silent
      // local-session SSO. Unknown hint → undefined → chooser (fail-open).
      const hint = typeof window !== 'undefined'
        ? new URLSearchParams(window.location.search).get('idp')
        : null
      const provider = idpHintToProvider(hint)
      authService.signInWithRedirect(provider ? { provider } : undefined)
    }
  }, [isAuthenticated, isInitialized])

  if (!isInitialized) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="size-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!isAuthenticated) return null

  return <>{children}</>
}
