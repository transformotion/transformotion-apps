'use client'

import { AdminShell } from '@/components/launchpad/admin/admin-shell'
import { SettingsPermissionsView } from '@/components/launchpad/admin/settings-permissions-view'
import { useAdminViewer } from '@/lib/admin/use-admin-viewer'

export default function AdminSettingsPermissionsPage() {
  const viewer = useAdminViewer()
  return (
    <AdminShell
      title="Settings Permissions"
      subtitle="How user, account, app and platform settings authorization changes with scope and role. A read-only demonstration — edits are mock-only."
    >
      {viewer ? <SettingsPermissionsView viewer={viewer} /> : null}
    </AdminShell>
  )
}
