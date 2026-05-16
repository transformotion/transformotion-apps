"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { SignIn } from "@/components/auth/sign-in"
import { useAuthStore } from "@/stores/auth/use-auth-store"

export default function SignInPage() {
  const router = useRouter()
  const { isAuthenticated, isInitialized, initialize } = useAuthStore()

  useEffect(() => { initialize() }, [initialize])

  useEffect(() => {
    if (isInitialized && isAuthenticated) {
      router.replace("/launchpad")
    }
  }, [isAuthenticated, isInitialized, router])

  return <SignIn />
}
