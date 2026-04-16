"use client"

import { useRouter } from "next/navigation"
import { Launchpad } from "@/components/launchpad/launchpad"
import { AuthGuard } from "@/components/providers/auth-guard"
import { useAuthStore } from "@/stores/auth/use-auth-store"

function LaunchpadContent() {
  const router = useRouter()
  const { signOut } = useAuthStore()

  const handleLaunchStockSignal = () => {
    router.push("/stock-signal")
  }

  const handleLaunchBudgetTracker = () => {
    router.push("/budget-tracker")
  }

  const handleSignOut = async () => {
    await signOut()
    router.push("/sign-in")
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
