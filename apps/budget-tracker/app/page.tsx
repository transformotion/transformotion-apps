"use client"

import { BudgetTrackerApp } from "@/components/budget-tracker/budget-tracker-app"

export default function Page() {
  const handleSignOut = () => {
    // Platform auth sign-out — redirect to platform launchpad
    window.location.href = 'https://apps.transformotion.com.au'
  }

  const handleGoToLaunchpad = () => {
    window.location.href = 'https://apps.transformotion.com.au'
  }

  return (
    <BudgetTrackerApp
      onSignOut={handleSignOut}
      onGoToLaunchpad={handleGoToLaunchpad}
    />
  )
}
