'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { providerHintFromIdToken } from '@transformotion/auth-client'
import { Launchpad } from '@/components/launchpad/launchpad'
import { useAuthStore } from '@/stores/auth/use-auth-store'
import { authService } from '@/lib/services/auth'
import { getConfig } from '@/lib/config'

const STOCK_ANALYSER_URL = process.env.NEXT_PUBLIC_STOCK_URL ?? 'http://localhost:3000/stock-analyser/'

/**
 * Append the federated-IdP hint (`?idp=google|facebook|microsoft`) when launching
 * another app, so that app can re-federate silently instead of showing the Cognito
 * chooser (#490). A NATIVE user has no `identities` claim → no hint → the app keeps
 * its silent local-session SSO. Fail-open: if the token can't be read, just launch
 * without a hint (today's behaviour).
 */
async function appUrlWithIdpHint(baseUrl: string): Promise<string> {
  const idToken = await authService.getIdToken().catch(() => null)
  const hint = providerHintFromIdToken(idToken)
  if (!hint) return baseUrl
  try {
    const url = new URL(baseUrl)
    url.searchParams.set('idp', hint)
    return url.toString()
  } catch {
    return baseUrl
  }
}

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
      onLaunchApp={async () => { window.location.href = await appUrlWithIdpHint(STOCK_ANALYSER_URL) }}
      onLaunchBudgetTracker={async () => { window.location.assign(await appUrlWithIdpHint(getConfig().apps.budgetTrackerUrl)) }}
      onSignOut={handleSignOut}
    />
  )
}
