'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Launchpad } from '@/components/launchpad/launchpad'
import { useAuthStore } from '@/stores/auth/use-auth-store'
import { getConfig } from '@/lib/config'

const STOCK_ANALYSER_URL = process.env.NEXT_PUBLIC_STOCK_URL ?? 'http://localhost:3000/stock-analyser/'

export default function Page() {
  const router = useRouter()
  const { user, isAuthenticated, isInitialized, initialize, signOut } = useAuthStore()

  useEffect(() => {
    initialize()
  }, [initialize])

  useEffect(() => {
    if (isInitialized && !isAuthenticated) {
      router.replace('/sign-in')
    }
  }, [isAuthenticated, isInitialized, router])

  if (!isInitialized || !isAuthenticated) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="size-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const handleSignOut = async () => {
    await signOut()
    // For live profile, amplifySignOut navigates to Cognito logout then redirectSignOut.
    // For mock profile, navigate explicitly to the signed-out page.
    router.replace('/signed-out')
  }

  return (
    <Launchpad
      user={user}
      onLaunchApp={() => { window.location.href = STOCK_ANALYSER_URL }}
      onLaunchBudgetTracker={() => { window.location.assign(getConfig().apps.budgetTrackerUrl) }}
      onSignOut={handleSignOut}
    />
  )
}
