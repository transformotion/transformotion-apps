'use client'

import { useRouter } from 'next/navigation'
import { Launchpad } from '@/components/launchpad/launchpad'

const BUDGET_TRACKER_URL =
  process.env.NEXT_PUBLIC_BUDGET_URL ?? 'http://localhost:3002'

const STOCK_SIGNAL_URL =
  process.env.NEXT_PUBLIC_STOCK_URL ?? 'http://localhost:3000'

export default function LaunchpadPage() {
  const router = useRouter()

  const handleLaunchStockSignal = () => {
    window.location.href = STOCK_SIGNAL_URL
  }

  const handleLaunchBudgetTracker = () => {
    window.location.href = BUDGET_TRACKER_URL
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
