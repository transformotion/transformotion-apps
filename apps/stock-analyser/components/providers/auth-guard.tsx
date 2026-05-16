'use client'

import { useEffect } from 'react'
import { useAuthStore } from '@/stores/auth/use-auth-store'
import { getConfig } from '@/lib/config'

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isInitialized, initialize } = useAuthStore()

  useEffect(() => {
    initialize()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (isInitialized && !isAuthenticated) {
      window.location.replace(getConfig().apps.signInUrl)
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
