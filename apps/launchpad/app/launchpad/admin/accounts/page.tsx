'use client'

import { Building2 } from 'lucide-react'
import { AdminShell } from '@/components/launchpad/admin/admin-shell'
import { AdminPlaceholder } from '@/components/launchpad/admin/admin-placeholder'

// Placeholder until the Account Management view is ported (getMembersDetail /
// removeMember / updateAccount exist; updateMemberRole route to be added).
export default function AdminAccountsPage() {
  return (
    <AdminShell
      title="Accounts"
      subtitle="Manage account members, roles and invitations for accounts you own or manage."
    >
      <AdminPlaceholder
        icon={Building2}
        title="Accounts — porting in progress"
        description="This surface is being ported from v0 and wired to the live account/member endpoints."
      />
    </AdminShell>
  )
}
