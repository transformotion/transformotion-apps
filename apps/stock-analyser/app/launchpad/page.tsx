"use client"

import { useRouter } from "next/navigation"
import { Launchpad } from "@/components/launchpad/launchpad"
import { AuthGuard } from "@/components/providers/auth-guard"
import { useAuthStore } from "@/stores/auth/use-auth-store"
import { getConfig } from "@/lib/config"

function LaunchpadContent() {
  const router = useRouter()
  const { signOut } = useAuthStore()

  const handleLaunchStockSignal = () => {
    router.push("/stock-signal")
  }

  const handleLaunchBudgetTracker = () => {
    window.location.assign(getConfig().apps.budgetTrackerUrl)
  }

  const handleSignOut = async () => {
    await signOut()
    window.location.assign(getConfig().apps.signOutUrl)
  }

  return (
    <Launchpad
      onLaunchApp={handleLaunchStockSignal}
      onLaunchBudgetTracker={handleLaunchBudgetTracker}
      onSignOut={handleSignOut}
    />
  )
}

export default function LaunchpadPage() {
  return (
    <AuthGuard>
      <LaunchpadContent />
    </AuthGuard>
  )
}
