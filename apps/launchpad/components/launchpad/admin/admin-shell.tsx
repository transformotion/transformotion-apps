'use client'

import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { useTheme } from 'next-themes'
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
    // Test-harness surface — hidden in production and site-admin only because
    // the backing redeem-as endpoint applies grants on behalf of invitees.
    visible: (v) => devToolsEnabled() && userIsSiteAdmin(v),
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
  const { resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  const isDark = mounted && resolvedTheme === 'dark'

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
  //
  // M11 dev-only: the Redemption Demo is a site-admin harness for applying an
  // invitation on behalf of its invitee. This widens nothing in prod —
  // devToolsEnabled() is false there (NEXT_PUBLIC_DEV_TOOLS=false) and the
  // route additionally notFound()s. The real redeem-as bypass remains
  // STAGE-guarded server-side regardless of this client gate.
  const allowed =
    canEnterAdmin(viewer) ||
    (canUseInviteSurfaces(viewer) &&
      INVITE_SURFACE_ROUTES.some((route) => pathname.startsWith(route))) ||
    (devToolsEnabled() && pathname.startsWith('/launchpad/admin/redemption') && userIsSiteAdmin(viewer))
  const navItems = ADMIN_NAV.filter((item) => item.visible(viewer))
  const railBg = isDark ? 'bg-card border-r border-border' : 'bg-brand-navy'
  const railMuted = isDark ? 'text-muted-foreground' : 'text-brand-navy-foreground/60'
  const railPanel = isDark ? 'bg-surface2 ring-border' : 'bg-white/5 ring-white/10'
  const railIdle = isDark
    ? 'text-muted-foreground hover:bg-surface2 hover:text-foreground'
    : 'text-brand-navy-foreground/80 hover:bg-white/10 hover:text-brand-navy-foreground'

  return (
    <div className="min-h-screen bg-background flex">
      {allowed && (
        <nav
          className={cn('hidden md:flex md:w-64 md:shrink-0 md:flex-col', railBg)}
          aria-label="Admin sections"
        >
          <div className="sticky top-0 flex max-h-screen flex-col gap-4 overflow-y-auto p-4">
            <div className="px-1 pt-1">
              <BrandLogo
                surface="navy"
                className="flex w-full"
                imgClassName="h-auto w-full max-w-none"
              />
            </div>

            <div className={cn('rounded-xl p-3 ring-1', railPanel)}>
              <p className={cn('mb-2 text-[10px] font-semibold uppercase tracking-wider', railMuted)}>
                Signed in as
              </p>
              <RoleBadges viewer={viewer} />
            </div>

            <ul className="flex flex-col gap-1">
              {navItems.map((item) => {
                const Icon = item.icon
                const active = pathname === item.href
                return (
                  <li key={item.href} className="min-w-0">
                    <button
                      onClick={() => router.push(preserveQuery(item.href))}
                      className={cn(
                        'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                        active ? 'bg-brand-teal text-brand-teal-foreground' : railIdle,
                      )}
                    >
                      <Icon className="size-4 shrink-0" />
                      <span className="truncate">{item.label}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        </nav>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
      <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur-sm">
        <div className="flex items-center justify-between gap-3 px-4 py-3 md:px-6">
          <div className="flex items-center gap-2 min-w-0 sm:gap-3">
            <button
              onClick={() => router.push(preserveQuery('/launchpad'))}
              className="flex items-center gap-1.5 rounded-lg bg-surface2 px-2.5 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
              aria-label="Back to Launchpad"
            >
              <ArrowLeft className="size-4 shrink-0" />
              <span>Launchpad</span>
            </button>
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
        <main className="flex-1 px-4 py-6 pb-24 md:px-6 md:pb-6">
          <div className="mb-6 flex flex-wrap items-center gap-2 md:hidden">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Signed in as
            </span>
            <RoleBadges viewer={viewer} />
          </div>

          <section className="min-w-0">
            <div className="mb-5">
              <h1 className="font-display text-xl font-semibold uppercase tracking-wide text-foreground">{title}</h1>
              <p className="text-xs text-muted-foreground">{subtitle}</p>
            </div>
            {children}
          </section>
        </main>
      )}
      {allowed && (
        <nav
          className={cn(
            'fixed inset-x-0 bottom-0 z-50 md:hidden',
            isDark
              ? 'bg-slate-50 text-brand-navy border-t border-border'
              : 'bg-brand-navy text-brand-navy-foreground',
          )}
          aria-label="Admin sections"
        >
          <div className="flex items-stretch justify-around">
            {navItems.map((item) => {
              const Icon = item.icon
              const active = pathname === item.href
              return (
                <button
                  key={item.href}
                  onClick={() => router.push(preserveQuery(item.href))}
                  className={cn(
                    'flex flex-1 flex-col items-center justify-center gap-0.5 py-2.5 transition-colors',
                    active
                      ? 'text-brand-teal'
                      : isDark
                        ? 'text-brand-navy/60'
                        : 'text-brand-navy-foreground/70',
                  )}
                >
                  <Icon className="size-5" />
                  <span className="text-[10px] font-medium leading-tight text-center">{item.label}</span>
                </button>
              )
            })}
          </div>
        </nav>
      )}
      </div>
    </div>
  )
}
