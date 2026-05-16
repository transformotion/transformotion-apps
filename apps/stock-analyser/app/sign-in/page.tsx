'use client'

import { useEffect } from 'react'
import { getConfig } from '@/lib/config'

// SA does not initiate OAuth. Redirect to Launchpad's canonical /sign-in.
export default function SignInPage() {
  useEffect(() => {
    window.location.replace(getConfig().apps.signInUrl)
  }, [])
  return null
}
