'use client'

import { AdminShell } from '@/components/launchpad/admin/admin-shell'
import { UsersAccessView } from '@/components/launchpad/admin/users-access-view'
import { useAdminViewer } from '@/lib/admin/use-admin-viewer'

export default function AdminUsersPage() {
  const viewer = useAdminViewer()
  return (
    <AdminShell
      title="Users & Access"
      subtitle="Cross-app, cross-account directory. Site-admin visibility shows access mappings only — it does not grant access to private account data."
    >
      {viewer ? <UsersAccessView viewer={viewer} /> : null}
    </AdminShell>
  )
}
