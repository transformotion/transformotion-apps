'use client'

import type { ReactNode } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import {
  Users,
  UserPlus,
  Building2,
  SlidersHorizontal,
  TicketCheck,
  ShieldCheck,
  ShieldAlert,
  Shield,
  ArrowLeft,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { BrandLogo } from '@/components/brand/brand-logo'
import { ThemeToggle } from '@/components/theme-toggle'
import { EmptyState } from '@/components/ui/design-system'
import { useAdminViewer } from '@/lib/admin/use-admin-viewer'
import {
  appLabel,
  appsAdministeredByUser,
  canEnterAdmin,
  canViewUsersAccess,
  grantableAppsFor,
  resolveUserLabel,
  userIsSiteAdmin,
  type AdminUser,
} from '@/lib/admin/view-model'
import { devToolsEnabled } from '@/lib/dev-tools'

/**
 * Account owners/managers (who are NOT site/app-admins) may still use the
 * invitation surfaces: anyone who can create at least one invitation grant
 * can open Invite User and the Accounts view for accounts they manage.
 *
 * LIVE NOTE: site-admin / app-admin capability is read from the token. The
 * pure account-owner/manager case (no admin role) additionally depends on the
 * viewer's managed accounts, which the composer engine endpoint supplies; until
 * that lands, owner-only invite access is gated on the engine, not the shell.
 */
function canUseInviteSurfaces(viewer: AdminUser): boolean {
  return grantableAppsFor(viewer).length > 0
}

/** Routes available to owner/manager-only viewers (no site/app-admin role). */
const INVITE_SURFACE_ROUTES = [
  '/launchpad/admin/invite',
  '/launchpad/admin/accounts',
  '/launchpad/admin/redemption',
]

interface AdminNavItem {
  label: string
  href: string
  icon: React.ComponentType<{ className?: string }>
  /** Whether this nav item has real content in Slice 1. */
  ready: boolean
  /** Whether the current viewer may see this item at all. */
  visible: (viewer: AdminUser) => boolean
}

const ADMIN_NAV: AdminNavItem[] = [
  {
    label: 'Users & Access',
    href: '/launchpad/admin/users',
    icon: Users,
    ready: true,
    visible: (v) => canViewUsersAccess(v),
  },
  {
    label: 'Invite User',
    href: '/launchpad/admin/invite',
    icon: UserPlus,
    ready: true,
    visible: (v) => canEnterAdmin(v) || canUseInviteSurfaces(v),
  },
  {
    label: 'Accounts',
    href: '/launchpad/admin/accounts',
    icon: Building2,
    ready: true,
    visible: (v) => canEnterAdmin(v) || canUseInviteSurfaces(v),
  },
  {
    label: 'Settings Permissions',
    href: '/launchpad/admin/settings-permissions',
    icon: SlidersHorizontal,
    ready: true,
    visible: (v) => canEnterAdmin(v),
  },
  {
    label: 'Redemption Demo',
    href: '/launchpad/admin/redemption',
    icon: TicketCheck,
    ready: true,
    // Test-harness surface — hidden when dev tools are disabled in production.
    visible: () => devToolsEnabled(),
  },
]

function preserveQuery(href: string): string {
  if (typeof window === 'undefined') return href
  const search = window.location.search
  return search ? `${href}${search}` : href
}

function RoleBadges({ viewer }: { viewer: AdminUser }) {
  const site = userIsSiteAdmin(viewer)
  const adminApps = appsAdministeredByUser(viewer)

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {site && (
        <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
          <ShieldCheck className="size-3" />
          Site admin
        </span>
      )}
      {adminApps.map((appSlug) => (
        <span
          key={appSlug}
          className="inline-flex items-center gap-1 rounded-full bg-signal-gold/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-signal-gold"
        >
          <Shield className="size-3" />
          {appLabel(appSlug)} admin
        </span>
      ))}
      {!site && adminApps.length === 0 && (
        <span className="inline-flex items-center gap-1 rounded-full bg-surface2 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Member
        </span>
      )}
    </div>
  )
}

export function AdminShell({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle: string
  children: ReactNode
}) {
  const router = useRouter()
  const pathname = usePathname()
  const viewer = useAdminViewer()

  // Pre-resolution / SSR: render a neutral frame, never privileged content.
  if (!viewer) {
    return (
      <div className="min-h-screen bg-background">
        <div className="mx-auto max-w-6xl px-4 py-10 md:px-6">
          <p className="text-sm text-muted-foreground">Loading admin…</p>
        </div>
      </div>
    )
  }

  // Site/app-admins see the full admin area. Account owners/managers (who can
  // create at least one invitation grant) may use the invite surfaces only.
  const allowed =
    canEnterAdmin(viewer) ||
    (canUseInviteSurfaces(viewer) &&
      INVITE_SURFACE_ROUTES.some((route) => pathname.startsWith(route)))
  const navItems = ADMIN_NAV.filter((item) => item.visible(viewer))

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 md:px-6">
          <div className="flex items-center gap-2 min-w-0 sm:gap-3">
            <button
              onClick={() => router.push(preserveQuery('/launchpad'))}
              className="flex items-center gap-1.5 rounded-lg bg-surface2 px-2.5 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
              aria-label="Back to Launchpad"
            >
              <ArrowLeft className="size-4 shrink-0" />
              <span>Launchpad</span>
            </button>
            <div className="hidden md:flex md:items-center">
              <BrandLogo surface="page" imgClassName="h-6 w-auto" />
            </div>
            <span className="rounded-md bg-surface2 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Admin
            </span>
          </div>
          <div className="flex items-center gap-2 min-w-0 sm:gap-3">
            <div className="hidden text-right sm:block">
              <p className="truncate text-sm font-medium text-foreground">
                {resolveUserLabel(viewer)}
              </p>
              <p className="truncate text-xs text-muted-foreground">{viewer.email}</p>
            </div>
            <div className="flex size-9 items-center justify-center rounded-full bg-primary/15 text-sm font-semibold text-primary">
              {resolveUserLabel(viewer)
                .split(' ')
                .map((part) => part[0])
                .join('')
                .slice(0, 2)
                .toUpperCase()}
            </div>
            <ThemeToggle className="hidden sm:inline-flex" />
            <button
              onClick={() => router.push(preserveQuery('/launchpad'))}
              className="flex size-9 items-center justify-center rounded-lg bg-surface2 text-muted-foreground transition-colors hover:bg-surface3 hover:text-foreground"
              aria-label="Close admin and return to Launchpad"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>
      </header>

      {!allowed ? (
        <main className="flex-1">
          <EmptyState
            icon={ShieldAlert}
            title="Admin access required"
            description="Your account does not have site-admin or app-admin authority, so the Launchpad admin area is unavailable."
          />
        </main>
      ) : (
        <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6 md:flex-row md:px-6">
          {/* Sidebar nav */}
          <nav className="md:w-56 md:shrink-0" aria-label="Admin sections">
            <div className="mb-4 rounded-xl border border-border bg-card p-3">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Signed in as
              </p>
              <RoleBadges viewer={viewer} />
            </div>
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:flex md:flex-col md:gap-0.5">
              {navItems.map((item) => {
                const Icon = item.icon
                const active = pathname === item.href
                return (
                  <li key={item.href} className="min-w-0">
                    <button
                      onClick={() => router.push(preserveQuery(item.href))}
                      className={cn(
                        'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                        active
                          ? 'bg-primary/10 text-primary'
                          : 'text-muted-foreground hover:bg-surface2 hover:text-foreground',
                      )}
                    >
                      <Icon className="size-4 shrink-0" />
                      <span className="truncate">{item.label}</span>
                      {!item.ready && (
                        <span className="ml-auto hidden rounded bg-surface2 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-muted-foreground md:inline">
                          Soon
                        </span>
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
          </nav>

          {/* Content */}
          <section className="min-w-0 flex-1">
            <div className="mb-5">
              <h1 className="font-display text-xl font-semibold uppercase tracking-wide text-foreground">{title}</h1>
              <p className="text-xs text-muted-foreground">{subtitle}</p>
            </div>
            {children}
          </section>
        </main>
      )}
    </div>
  )
}
