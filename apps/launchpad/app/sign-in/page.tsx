'use client'

import { useRouter } from 'next/navigation'
import { SignIn } from '@/components/auth/sign-in'

export default function SignInPage() {
  const router = useRouter()

  const handleSignIn = () => {
    router.push('/launchpad')
  }

  return <SignIn onSignIn={handleSignIn} />
}
