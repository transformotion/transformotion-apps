'use client'

import { notFound } from 'next/navigation'
import { AdminShell } from '@/components/launchpad/admin/admin-shell'
import { RedemptionDemoView } from '@/components/launchpad/admin/redemption-demo-view'
import { devToolsEnabled } from '@/lib/dev-tools'

// Dev-only test harness. notFound() when dev tools are disabled (prod) — the nav
// also hides it, but the route guards itself too. Accepting an invitation drives
// the REAL redeem-as dev bypass (server-side STAGE-guarded against prod) and
// applies the bundle to the resolved invitee, not to the admin session.
export default function AdminRedemptionPage() {
  if (!devToolsEnabled()) notFound()
  return (
    <AdminShell
      title="Redemption Demo"
      subtitle="Open an invitation and apply it on behalf of the resolved invitee (dev tool)."
    >
      <RedemptionDemoView />
    </AdminShell>
  )
}
