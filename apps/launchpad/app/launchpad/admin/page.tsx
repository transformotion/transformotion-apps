'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/** /launchpad/admin → the Users & Access landing (first admin section). */
export default function AdminIndexPage() {
  const router = useRouter()
  useEffect(() => {
    router.replace('/launchpad/admin/users')
  }, [router])
  return null
}
