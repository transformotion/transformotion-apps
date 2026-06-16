'use client'

import { UserPlus } from 'lucide-react'
import { AdminShell } from '@/components/launchpad/admin/admin-shell'
import { AdminPlaceholder } from '@/components/launchpad/admin/admin-placeholder'

// Placeholder until the Invite Composer is ported (needs the discovery-engine
// backend + v0-first contract). Keeps the nav coherent.
export default function AdminInvitePage() {
  return (
    <AdminShell
      title="Invite User"
      subtitle="Compose an invitation bundle — account invites and app-access grants."
    >
      <AdminPlaceholder
        icon={UserPlus}
        title="Invite User — porting in progress"
        description="This surface is being ported from v0 and wired to the live invitation engine."
      />
    </AdminShell>
  )
}
