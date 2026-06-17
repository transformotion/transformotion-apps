'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { Loader2, Search } from 'lucide-react'
import { RedeemPageClient } from '@/components/launchpad/redemption/redeem-page-client'
import { Card } from '@/components/ui/design-system'

// Static-export friendly: a single /redeem page that reads the bundle id from a
// query param (?bundle=<id>) — a dynamic /redeem/[bundleId] segment can't be
// pre-generated for arbitrary unguessable ids under `output: 'export'`. The
// redemption link is therefore /redeem?bundle=<bundleId>.
function RedeemInner() {
  const bundleId = useSearchParams().get('bundle') ?? ''
  if (!bundleId) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-4">
        <Card className="max-w-md p-6 text-center">
          <Search className="mx-auto mb-3 size-6 text-muted-foreground" />
          <p className="text-sm font-semibold text-foreground">Invitation link incomplete</p>
          <p className="mt-1 text-sm text-muted-foreground">
            This link is missing its invitation id. Use the full link from your email.
          </p>
        </Card>
      </main>
    )
  }
  return <RedeemPageClient bundleId={bundleId} />
}

export default function RedeemPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-background">
          <Loader2 className="size-5 animate-spin text-primary" />
        </main>
      }
    >
      <RedeemInner />
    </Suspense>
  )
}
