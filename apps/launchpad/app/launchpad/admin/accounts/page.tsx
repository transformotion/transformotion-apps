'use client'

import { AdminShell } from '@/components/launchpad/admin/admin-shell'
import { AccountManagementView } from '@/components/launchpad/admin/account-management-view'
import { useAdminViewer } from '@/lib/admin/use-admin-viewer'

export default function AdminAccountsPage() {
  const viewer = useAdminViewer()
  return (
    <AdminShell
      title="Accounts"
      subtitle="Manage account members, roles and invitations for accounts you own or manage. Site-admins have supervisory visibility across all accounts."
    >
      {viewer ? <AccountManagementView viewer={viewer} /> : null}
    </AdminShell>
  )
}
