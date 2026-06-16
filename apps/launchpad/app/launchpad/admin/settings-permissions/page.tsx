'use client'

import { SlidersHorizontal } from 'lucide-react'
import { AdminShell } from '@/components/launchpad/admin/admin-shell'
import { AdminPlaceholder } from '@/components/launchpad/admin/admin-placeholder'

// Placeholder until the Settings Permissions demo view is ported.
export default function AdminSettingsPermissionsPage() {
  return (
    <AdminShell
      title="Settings Permissions"
      subtitle="How user, account, app and platform settings authorization changes with scope and role."
    >
      <AdminPlaceholder
        icon={SlidersHorizontal}
        title="Settings Permissions — porting in progress"
        description="This demonstration surface is being ported from v0."
      />
    </AdminShell>
  )
}
