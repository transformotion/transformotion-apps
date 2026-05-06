'use client'

import { useRouter } from 'next/navigation'
import { Launchpad } from '@/components/launchpad/launchpad'
import { getConfig } from '@/lib/config'

const STOCK_SIGNAL_URL =
  process.env.NEXT_PUBLIC_STOCK_URL ?? 'http://localhost:3000'

export default function LaunchpadPage() {
  const router = useRouter()

  const handleLaunchStockSignal = () => {
    window.location.href = STOCK_SIGNAL_URL
  }

  const handleLaunchBudgetTracker = () => {
    window.location.assign(getConfig().apps.budgetTrackerUrl)
  }

  const handleSignOut = () => {
    router.push('/sign-in')
  }

  return (
    <Launchpad
      onLaunchApp={handleLaunchStockSignal}
      onLaunchBudgetTracker={handleLaunchBudgetTracker}
      onSignOut={handleSignOut}
    />
  )
}
