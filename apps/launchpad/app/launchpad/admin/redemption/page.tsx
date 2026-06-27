'use client'

import { notFound } from 'next/navigation'
import { AdminShell } from '@/components/launchpad/admin/admin-shell'
import { RedemptionDemoView } from '@/components/launchpad/admin/redemption-demo-view'
import { devToolsEnabled } from '@/lib/dev-tools'

// Dev-only test harness. notFound() when dev tools are disabled (prod) — the nav
// also hides it, but the route guards itself too. Opening an invitation launches
// the real /redeem?bundle=<id> invitee flow.
export default function AdminRedemptionPage() {
  if (!devToolsEnabled()) notFound()
  return (
    <AdminShell
      title="Redemption Demo"
      subtitle="Open an invitation and walk the invitee's accept experience (dev tool). Accepting drives the real redemption handler."
    >
      <RedemptionDemoView />
    </AdminShell>
  )
}
