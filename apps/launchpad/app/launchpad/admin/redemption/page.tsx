'use client'

import { notFound } from 'next/navigation'
import { TicketCheck } from 'lucide-react'
import { AdminShell } from '@/components/launchpad/admin/admin-shell'
import { AdminPlaceholder } from '@/components/launchpad/admin/admin-placeholder'
import { devToolsEnabled } from '@/lib/dev-tools'

// Dev-only test harness. notFound() when dev tools are disabled (prod) — the
// nav also hides it, but the route guards itself too. Placeholder until the
// Redemption Demo "mock inbox" is ported.
export default function AdminRedemptionPage() {
  if (!devToolsEnabled()) notFound()
  return (
    <AdminShell
      title="Redemption Demo"
      subtitle="Open a sample invitation and walk the invitee's accept experience (dev tool)."
    >
      <AdminPlaceholder
        icon={TicketCheck}
        title="Redemption Demo — porting in progress"
        description="This dev harness is being ported from v0; accepting will drive the real redemption handler."
      />
    </AdminShell>
  )
}
