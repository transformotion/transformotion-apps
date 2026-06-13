'use client'

import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { Wordmark } from '@/components/brand/wordmark'
import { AiEngineSettings } from '@/components/launchpad/ai-engine-settings'
import { AccountMembersModal, useCanManageMembers } from '@/components/launchpad/account-members'
import { TrendingUp, Wallet, Layers, LogOut, Settings, User as UserIcon, Users, Inbox } from 'lucide-react'
import type { User } from '@transformotion/auth-client'
import {
  LAUNCHPAD_APPS,
  deriveAppTiles,
  hasVisibleApps,
  resolveDisplayName,
  firstNameOf,
  type AppTile as AppTileModel,
} from '@/lib/entitlement'
import { useLaunchpadData } from '@/hooks/use-launchpad-data'

const APP_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  'stock-analyser': TrendingUp,
  'budget-tracker': Wallet,
  'transformation-framework': Layers,
}

/** One account row in the profile menu (read-only in Phase 3; switching is Phase 4). */
interface AccountRow {
  appSlug: string
  accountId: string
  /** The app's display name (e.g. "Budget Tracker"). */
  appLabel: string
  /** The account's real name when known (e.g. "Steve's Budget"); undefined while/if unresolved. */
  accountName?: string
}

const getGreeting = () => {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

function initials(name: string): string {
  return (
    name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .slice(0, 2) || '?'
  )
}

function Header({
  displayName,
  onOpenProfile,
}: {
  displayName: string
  onOpenProfile: () => void
}) {
  return (
    <header className="sticky top-0 z-50 bg-background/95 backdrop-blur-sm border-b border-border overflow-hidden">
      <div className="max-w-5xl mx-auto px-4 py-4 md:px-6">
        <div className="flex items-center justify-between gap-3">
          <div className="shrink-0 min-w-0">
            <div className="hidden sm:block">
              <Wordmark size="lg" />
            </div>
            <div className="sm:hidden">
              <Wordmark size="sm" />
            </div>
          </div>
          <button
            onClick={onOpenProfile}
            className="size-10 rounded-full bg-primary/15 flex items-center justify-center text-primary font-semibold text-sm hover:bg-primary/25 transition-colors"
          >
            {initials(displayName)}
          </button>
        </div>
      </div>
    </header>
  )
}

function Greeting({ name }: { name: string }) {
  const [mounted, setMounted] = useState(false)
  const greeting = mounted ? getGreeting() : 'Welcome'

  useEffect(() => {
    setMounted(true)
  }, [])

  return (
    <div className="mb-8">
      <h1 className="text-2xl md:text-3xl font-bold text-foreground mb-1">
        {greeting}, {name}
      </h1>
      <p className="text-muted-foreground">Welcome to your Transformotion workspace</p>
    </div>
  )
}

function AppTile({
  app,
  index,
  onLaunch,
}: {
  app: AppTileModel
  index: number
  onLaunch?: () => void
}) {
  const Icon = APP_ICONS[app.slug] ?? Layers

  return (
    <button
      disabled={!app.launchable}
      onClick={onLaunch}
      className={cn(
        'relative overflow-hidden p-6 rounded-2xl border transition-all text-left',
        'animate-in fade-in slide-in-from-bottom-4',
        app.launchable
          ? 'bg-card border-border hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5 active:scale-[0.98]'
          : 'bg-card/50 border-border/50 cursor-not-allowed opacity-60',
      )}
      style={{ animationDelay: `${index * 100}ms` }}
    >
      <div className={cn('absolute inset-0 bg-gradient-to-br opacity-60', app.bgGradient)} />
      <div className="relative">
        <div
          className={cn(
            'size-14 rounded-xl flex items-center justify-center mb-4',
            app.launchable ? 'bg-surface2' : 'bg-surface2/50',
          )}
        >
          <Icon className={cn('size-7', app.launchable ? app.color : 'text-muted-foreground')} />
        </div>
        <h3
          className={cn(
            'text-lg font-semibold mb-1',
            app.launchable ? 'text-foreground' : 'text-muted-foreground',
          )}
        >
          {app.name}
        </h3>
        <p
          className={cn(
            'text-sm leading-relaxed',
            app.launchable ? 'text-muted-foreground' : 'text-muted-foreground/70',
          )}
        >
          {app.description}
        </p>
        {!app.launchable && (
          <div className="mt-4 inline-flex items-center px-3 py-1 bg-surface2 rounded-full text-xs font-medium text-muted-foreground">
            Coming Soon
          </div>
        )}
      </div>
    </button>
  )
}

/** Shown when the user holds no app memberships — a real first-login state by design. */
function EmptyApps() {
  return (
    <div className="rounded-2xl border border-border bg-card/50 p-10 text-center">
      <div className="size-14 rounded-xl bg-surface2 flex items-center justify-center mx-auto mb-4">
        <Inbox className="size-7 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-semibold text-foreground mb-1">No apps yet</h3>
      <p className="text-sm text-muted-foreground max-w-md mx-auto">
        You don&apos;t have access to any apps yet. Access arrives by invitation — once
        you&apos;re added to an account, the app will appear here.
      </p>
    </div>
  )
}

function AppGridSkeleton() {
  return (
    <div className="grid gap-4 md:gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {[0, 1].map((i) => (
        <div key={i} className="h-44 rounded-2xl border border-border bg-card/50 animate-pulse" />
      ))}
    </div>
  )
}

function AppGrid({
  tiles,
  getLaunchHandler,
}: {
  tiles: AppTileModel[]
  getLaunchHandler: (slug: string) => (() => void) | undefined
}) {
  const visible = tiles.filter((t) => t.visible)
  if (visible.length === 0) return <EmptyApps />

  return (
    <div className="grid gap-4 md:gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {visible.map((app, index) => (
        <AppTile key={app.slug} app={app} index={index} onLaunch={getLaunchHandler(app.slug)} />
      ))}
    </div>
  )
}

function ProfileMenu({
  displayName,
  email,
  accounts,
  isOpen,
  onClose,
  onLogout,
  onOpenSettings,
  onOpenMembers,
}: {
  displayName: string
  email: string
  accounts: AccountRow[]
  isOpen: boolean
  onClose: () => void
  onLogout: () => void
  onOpenSettings?: () => void
  onOpenMembers?: () => void
}) {
  if (!isOpen) return null

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-50" onClick={onClose} />
      <div className="fixed right-4 top-20 w-72 bg-card border border-border rounded-xl shadow-2xl z-50 overflow-hidden">
        <div className="p-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="size-12 rounded-full bg-primary/15 flex items-center justify-center text-primary font-semibold">
              {initials(displayName)}
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-foreground truncate">{displayName}</p>
              <p className="text-sm text-muted-foreground truncate">{email}</p>
            </div>
          </div>
        </div>

        {accounts.length > 0 && (
          <div className="border-b border-border py-2">
            <p className="px-4 py-1 text-xs text-muted-foreground">Your accounts</p>
            {accounts.map((account) => (
              <div
                key={`${account.appSlug}:${account.accountId}`}
                className="w-full flex items-center justify-between px-4 py-2.5 text-sm"
              >
                <div className="text-left min-w-0">
                  <p className="font-medium text-foreground truncate">{account.accountName ?? account.appLabel}</p>
                  {account.accountName ? (
                    <p className="text-xs text-muted-foreground truncate">{account.appLabel}</p>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="py-2">
          <button className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-foreground hover:bg-surface2 transition-colors">
            <UserIcon className="size-4 text-muted-foreground" />
            Profile
          </button>
          {onOpenMembers ? (
            <button
              onClick={() => {
                onClose()
                onOpenMembers()
              }}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-foreground hover:bg-surface2 transition-colors"
            >
              <Users className="size-4 text-muted-foreground" />
              Account members
            </button>
          ) : null}
          {onOpenSettings ? (
            <button
              onClick={() => {
                onClose()
                onOpenSettings()
              }}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-foreground hover:bg-surface2 transition-colors"
            >
              <Settings className="size-4 text-muted-foreground" />
              Settings
            </button>
          ) : null}
        </div>

        <div className="border-t border-border py-2">
          <button
            onClick={onLogout}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-signal-red hover:bg-signal-red/10 transition-colors"
          >
            <LogOut className="size-4" />
            Sign out
          </button>
        </div>
      </div>
    </>
  )
}

function Footer() {
  return (
    <footer className="mt-auto py-6 border-t border-border">
      <div className="max-w-5xl mx-auto px-4 md:px-6">
        <p className="text-xs text-muted-foreground text-center">
          Putting your business transformation into motion
        </p>
      </div>
    </footer>
  )
}

function appLabel(slug: string): string {
  return LAUNCHPAD_APPS.find((a) => a.slug === slug)?.name ?? slug
}

export function Launchpad({
  user: authUser,
  onLaunchApp,
  onLaunchBudgetTracker,
  onSignOut,
}: {
  user: User | null
  onLaunchApp?: () => void
  onLaunchBudgetTracker?: () => void
  onSignOut?: () => void
}) {
  const [profileMenuOpen, setProfileMenuOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [membersOpen, setMembersOpen] = useState(false)

  // Admin/control-plane surfaces gate on the site-admin Cognito group (via
  // metadata.siteAdmin), NOT app membership (D11; no site_admin claim).
  const isSiteAdmin = authUser?.metadata?.siteAdmin === true

  // "Account members" is shown to a site-admin OR an owner/manager of ≥1 account.
  const canManageMembers = useCanManageMembers(isSiteAdmin, authUser?.id)

  const data = useLaunchpadData(authUser)

  const email = authUser?.email ?? ''
  // Canonical chain (#423): profile displayName → Cognito name → email local part.
  // authUser.name can be the raw email (no given/family name) — passed as cognitoName
  // so resolveDisplayName skips it rather than rendering the full address.
  const displayName = resolveDisplayName({
    displayName: data.profile?.displayName,
    cognitoName: authUser?.name,
    email,
  })

  // Tiles derive from entitlement (memberships per app), not a hard-coded list.
  const tiles = deriveAppTiles(LAUNCHPAD_APPS, data.entitledSlugs)

  const accounts: AccountRow[] = data.selections.map((s) => ({
    appSlug: s.appSlug,
    accountId: s.accountId,
    appLabel: appLabel(s.appSlug),
    accountName: data.accountNames[s.accountId],
  }))

  const getLaunchHandler = (slug: string): (() => void) | undefined => {
    if (slug === 'stock-analyser') return onLaunchApp
    if (slug === 'budget-tracker') return onLaunchBudgetTracker
    return undefined
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header displayName={displayName} onOpenProfile={() => setProfileMenuOpen(true)} />

      <main className="flex-1 py-8 md:py-12">
        <div className="max-w-5xl mx-auto px-4 md:px-6">
          <Greeting name={firstNameOf(displayName)} />
          {data.loading ? (
            <AppGridSkeleton />
          ) : hasVisibleApps(tiles) ? (
            <AppGrid tiles={tiles} getLaunchHandler={getLaunchHandler} />
          ) : (
            <EmptyApps />
          )}
        </div>
      </main>

      <ProfileMenu
        displayName={displayName}
        email={email}
        accounts={accounts}
        isOpen={profileMenuOpen}
        onClose={() => setProfileMenuOpen(false)}
        onLogout={onSignOut || (() => {})}
        onOpenSettings={isSiteAdmin ? () => setSettingsOpen(true) : undefined}
        onOpenMembers={canManageMembers ? () => setMembersOpen(true) : undefined}
      />

      <AiEngineSettings isOpen={settingsOpen && isSiteAdmin} onClose={() => setSettingsOpen(false)} />

      {canManageMembers && (
        <AccountMembersModal
          isOpen={membersOpen}
          onClose={() => setMembersOpen(false)}
          viewerUserId={authUser?.id ?? ''}
        />
      )}

      <Footer />
    </div>
  )
}
