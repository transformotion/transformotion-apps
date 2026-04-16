"use client"

import { useRouter } from "next/navigation"
import { BudgetTrackerApp } from "@/components/budget-tracker/budget-tracker-app"

export default function BudgetTrackerPage() {
  const router = useRouter()

  const handleSignOut = () => {
    router.push("/sign-in")
  }

  const handleGoToLaunchpad = () => {
    router.push("/launchpad")
  }

  return (
    <BudgetTrackerApp 
      onSignOut={handleSignOut}
      onGoToLaunchpad={handleGoToLaunchpad}
    />
  )
}
