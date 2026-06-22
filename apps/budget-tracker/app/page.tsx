"use client"

import { useAuthStore } from "@/stores/auth/use-auth-store"
import { BudgetTrackerApp } from "@/components/budget-tracker/budget-tracker-app"
import { BudgetTrackerThemeScope } from "@/components/budget-tracker/budget-tracker-theme-scope"
import { getConfig } from "@/lib/config"

export default function Page() {
  const { signOut } = useAuthStore()

  const handleGoToLaunchpad = () => {
    window.location.assign(getConfig().apps.peers['launchpad'])
  }

  const handleSignOut = async () => {
    await signOut()
    window.location.assign(getConfig().apps.signOutUrl)
  }

  return (
    <BudgetTrackerThemeScope>
      <BudgetTrackerApp
        onSignOut={handleSignOut}
        onGoToLaunchpad={handleGoToLaunchpad}
      />
    </BudgetTrackerThemeScope>
  )
}
