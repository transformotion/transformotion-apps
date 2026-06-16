'use client'

import { Suspense } from 'react'
import { AdminShell } from '@/components/launchpad/admin/admin-shell'
import { InviteComposerView } from '@/components/launchpad/admin/invite-composer-view'
import { useAdminViewer } from '@/lib/admin/use-admin-viewer'

export default function AdminInvitePage() {
  const viewer = useAdminViewer()
  return (
    <AdminShell
      title="Invite User"
      subtitle="Compose an invitation bundle — account invites and app-access grants. One email, one redemption link."
    >
      {/* Suspense: InviteComposerView reads search params (account handoff). */}
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading composer…</p>}>
        {viewer ? <InviteComposerView viewer={viewer} /> : null}
      </Suspense>
    </AdminShell>
  )
}
