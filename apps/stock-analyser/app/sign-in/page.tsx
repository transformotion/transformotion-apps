"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { SignIn } from "@/components/auth/sign-in"
import { useAuthStore } from "@/stores/auth/use-auth-store"

export default function SignInPage() {
  const router = useRouter()
  const { isAuthenticated, isInitialized, initialize } = useAuthStore()

  // On mount, check if already signed in and redirect to launchpad
  useEffect(() => {
    initialize().then(() => {
      if (useAuthStore.getState().isAuthenticated) {
        router.replace("/launchpad")
      }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // If already authenticated (persisted), redirect immediately
  useEffect(() => {
    if (isInitialized && isAuthenticated) {
      router.replace("/launchpad")
    }
  }, [isAuthenticated, isInitialized, router])

  const handleSignIn = () => {
    router.push("/launchpad")
  }

  return <SignIn onSignIn={handleSignIn} />
}
