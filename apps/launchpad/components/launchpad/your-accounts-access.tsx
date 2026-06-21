'use client'

import { Info, LayoutGrid, Shield, ShieldCheck } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { UserAccessSummary } from '@transformotion/contracts/launchpad/invitations'
import type { AccountRole } from '@transformotion/contracts/_shared/auth'
import { LAUNCHPAD_APPS } from '@/lib/entitlement'

/**
 * Read-only, self-service view of the SIGNED-IN user's own platform access:
 * which apps they can enter, which accounts they belong to, and their role in
 * each. This is the self version of the admin user-detail access panel — same
 * canonical read model (`UserAccessSummary`), same visual language, but with NO
 * supervisory actions.
 *
 * Ported verbatim from the v0 prototype (`components/launchpad/your-accounts-access.tsx`),
 * with two data-layer changes only: the summary is derived from the live token
 * (`useSelfAccess`) instead of the mock store, and the "Pending invitations" sub-list
 * is OMITTED — its self-pending-bundle read has no contract yet and is the same
 * capability as #482 (see the PR disposition list). Everything else is unchanged.
 */

function appLabel(slug: string): string {
  return LAUNCHPAD_APPS.find((a) => a.slug === slug)?.name ?? slug
}

const ROLE_STYLES: Record<AccountRole, string> = {
  owner: 'bg-primary/15 text-primary',
  manager: 'bg-signal-green/15 text-signal-green',
  member: 'bg-surface2 text-foreground',
  viewer: 'bg-surface2 text-muted-foreground',
}

function RoleChip({ role }: { role: AccountRole }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
        ROLE_STYLES[role],
      )}
    >
      {role}
    </span>
  )
}

export function YourAccountsAccess({
  summary,
  loading,
}: {
  summary: UserAccessSummary | null
  loading: boolean
}) {
  const siteAdmin = summary?.siteAdmin ?? false

  return (
    <section
      aria-label="Your apps and accounts"
      className="rounded-lg border border-border bg-surface/40 p-4"
    >
      <div className="flex items-start gap-3">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/15">
          <LayoutGrid className="size-4 text-primary" />
        </div>
        <div className="min-w-0">
          <h4 className="text-sm font-semibold text-foreground">Your apps &amp; accounts</h4>
          <p className="mt-0.5 text-sm text-pretty text-muted-foreground">
            The apps you can access and the accounts you belong to, with your role in each.
          </p>
        </div>
      </div>

      {siteAdmin && (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2">
          <ShieldCheck className="size-4 shrink-0 text-primary" />
          <p className="text-xs text-foreground">
            You&apos;re a <span className="font-medium">site admin</span> with platform-wide
            supervisory access.
          </p>
        </div>
      )}

      <div className="mt-4 flex flex-col gap-3">
        {loading ? (
          <div className="rounded-lg border border-dashed border-border bg-background/40 px-3 py-6 text-center">
            <p className="text-sm text-muted-foreground">Loading your access…</p>
          </div>
        ) : !summary || summary.appAccess.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-background/40 px-3 py-6 text-center">
            <p className="text-sm font-medium text-foreground">No app access yet</p>
            <p className="mt-1 text-xs text-muted-foreground">
              When you&apos;re invited to an app or account, it will appear here.
            </p>
          </div>
        ) : (
          summary.appAccess.map((app) => (
            <div key={app.appSlug} className="rounded-lg border border-border bg-background/50 p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-foreground">{appLabel(app.appSlug)}</span>
                {app.appAdmin && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-signal-gold/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-signal-gold">
                    <Shield className="size-3" />
                    app-admin
                  </span>
                )}
              </div>
              {app.accounts.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  {app.appAdmin
                    ? 'App-level administration only (no account membership).'
                    : 'Access granted — create your first account to get started.'}
                </p>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {app.accounts.map((account) => (
                    <li key={account.accountId} className="flex items-center gap-2">
                      <span className="truncate text-sm text-foreground">{account.accountName}</span>
                      <span className="ml-auto">
                        <RoleChip role={account.role} />
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))
        )}
      </div>

      <div className="mt-4 flex items-start gap-2 rounded-lg border border-border bg-background/40 p-3">
        <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <p className="text-xs text-muted-foreground">
          This is a read-only summary of your access. To invite people or manage members, open the
          relevant app or ask a site admin.
        </p>
      </div>
    </section>
  )
}
