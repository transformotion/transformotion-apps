'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useTheme } from 'next-themes'
import { cn } from '@/lib/utils'
import { BrandLogo } from '@/components/brand/brand-logo'
import { ThemeToggle } from '@/components/theme-toggle'
import { AiEngineSettings } from '@/components/launchpad/ai-engine-settings'
import { TrendingUp, Wallet, Layers, LogOut, Settings, User as UserIcon, ShieldCheck, Inbox, Plus, Sparkles, X, ArrowRight } from 'lucide-react'
import type { User } from '@transformotion/auth-client'
import {
  LAUNCHPAD_APPS,
  deriveAppTiles,
  hasVisibleApps,
  resolveDisplayName,
  firstNameOf,
  type AppTile as AppTileModel,
  type ViewerEntitlement,
} from '@/lib/entitlement'
import { useLaunchpadData } from '@/hooks/use-launchpad-data'
import { useSelfAccess } from '@/hooks/use-self-access'
import { authService } from '@/lib/services/auth'
import { createAccount } from '@/lib/services/account-admin'
import { ProfileForm } from '@/components/launchpad/profile-form'
import { YourAccountsAccess } from '@/components/launchpad/your-accounts-access'

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
  const { resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  const isDark = mounted && resolvedTheme === 'dark'

  return (
    <header
      className={cn(
        'transition-colors',
        isDark ? 'bg-slate-50 text-brand-navy' : 'bg-brand-navy text-brand-navy-foreground',
      )}
    >
      <div className="max-w-5xl mx-auto px-4 pt-4 pb-10 md:px-6 md:pt-5 md:pb-14">
        <div className="flex items-center justify-end gap-2">
          <ThemeToggle />
          <button
            onClick={onOpenProfile}
            className={cn(
              'size-10 rounded-full flex items-center justify-center font-semibold text-sm transition-colors',
              isDark
                ? 'bg-brand-navy/10 text-brand-navy hover:bg-brand-navy/20'
                : 'bg-white/15 text-brand-navy-foreground hover:bg-white/25',
            )}
          >
            {initials(displayName)}
          </button>
        </div>
        <div className="mt-1 flex justify-center">
          <BrandLogo surface="contrast" priority imgClassName="h-16 w-auto sm:h-20" />
        </div>
        <Greeting name={firstNameOf(displayName)} dark={isDark} />
      </div>
    </header>
  )
}

function Greeting({ name, dark }: { name: string; dark: boolean }) {
  const [mounted, setMounted] = useState(false)
  const greeting = mounted ? getGreeting() : 'Welcome'

  useEffect(() => {
    setMounted(true)
  }, [])

  return (
    <div className="mt-7 text-center md:mt-9">
      <h1
        className={cn(
          'font-display text-3xl md:text-4xl font-semibold uppercase tracking-wide mb-1.5 text-balance',
          dark ? 'text-brand-navy' : 'text-brand-navy-foreground',
        )}
      >
        {greeting}, {name}
      </h1>
      <p className={cn('text-pretty', dark ? 'text-brand-navy/70' : 'text-brand-navy-foreground/70')}>
        Welcome to your Transformotion workspace
      </p>
    </div>
  )
}

function AppTile({
  app,
  index,
  onLaunch,
  onCreateAccount,
}: {
  app: AppTileModel
  index: number
  onLaunch?: () => void
  onCreateAccount?: () => void
}) {
  const Icon = APP_ICONS[app.slug] ?? Layers

  // DISTINCT STATE (M11): the viewer holds the access group but has no account
  // yet — render an actionable "create your first account" card (v0 #49 design),
  // set apart from the normal "open" tile with a primary-accent treatment.
  if (app.needsFirstAccount) {
    return (
      <div
        className={cn(
          'relative overflow-hidden p-6 rounded-2xl border text-left flex flex-col',
          'border-primary/40 bg-primary/5 ring-1 ring-primary/10',
          'animate-in fade-in slide-in-from-bottom-4',
        )}
        style={{ animationDelay: `${index * 100}ms` }}
      >
        <div className={cn('absolute inset-0 bg-gradient-to-br opacity-40', app.bgGradient)} />
        <div className="relative flex flex-col flex-1">
          <div className="flex items-start justify-between gap-2 mb-4">
            <div className="size-14 rounded-xl flex items-center justify-center bg-surface2">
              <Icon className={cn('size-7', app.color)} />
            </div>
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2.5 py-1 text-xs font-medium text-primary">
              <Sparkles className="size-3" aria-hidden="true" />
              Access granted
            </span>
          </div>
          <h3 className="font-display text-xl font-semibold uppercase tracking-wide text-foreground mb-1">{app.name}</h3>
          <p className="text-sm leading-relaxed text-muted-foreground">
            You have access — create your first account to get started.
          </p>
          <button
            onClick={onCreateAccount}
            className="mt-4 inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 active:scale-[0.98] self-start"
          >
            <Plus className="size-4" aria-hidden="true" />
            Create account
          </button>
        </div>
      </div>
    )
  }

  return (
    <button
      disabled={!app.launchable}
      onClick={onLaunch}
      className={cn(
        'relative overflow-hidden p-6 rounded-2xl border transition-all text-left',
        'animate-in fade-in slide-in-from-bottom-4',
        app.launchable
          ? 'group bg-card border-border shadow-sm hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5 active:scale-[0.98]'
          : 'bg-card/50 border-border/50 cursor-not-allowed opacity-60',
      )}
      style={{ animationDelay: `${index * 100}ms` }}
    >
      <div className={cn('absolute inset-0 bg-gradient-to-br opacity-20', app.bgGradient)} />
      <div className="relative flex flex-col flex-1">
        <div
          className={cn(
            'size-12 rounded-xl flex items-center justify-center mb-4 ring-1',
            app.launchable ? 'bg-surface2 ring-border' : 'bg-surface2/50 ring-border/50',
          )}
        >
          <Icon className={cn('size-6', app.launchable ? app.color : 'text-muted-foreground')} />
        </div>
        <h3
          className={cn(
            'font-display text-lg font-semibold mb-1.5 uppercase tracking-wide',
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
        {app.launchable && (
          <div className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary">
            Open
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
          </div>
        )}
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
  onCreateAccount,
}: {
  tiles: AppTileModel[]
  getLaunchHandler: (slug: string) => (() => void) | undefined
  onCreateAccount: (slug: string) => void
}) {
  const visible = tiles.filter((t) => t.visible)
  if (visible.length === 0) return <EmptyApps />

  return (
    <div className="grid gap-4 md:gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {visible.map((app, index) => (
        <AppTile
          key={app.slug}
          app={app}
          index={index}
          onLaunch={getLaunchHandler(app.slug)}
          onCreateAccount={() => onCreateAccount(app.slug)}
        />
      ))}
    </div>
  )
}

/** Create-first-account modal (v0 #49). Owner-on-create; calls the real POST /accounts. */
function CreateAccountModal({
  app,
  busy,
  error,
  onSubmit,
  onClose,
}: {
  app: AppTileModel
  busy: boolean
  error: string | null
  onSubmit: (name: string) => void
  onClose: () => void
}) {
  const [name, setName] = useState('')
  const Icon = APP_ICONS[app.slug] ?? Layers
  const canSubmit = name.trim().length > 0 && !busy
  const submit = () => { if (canSubmit) onSubmit(name.trim()) }

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-50" onClick={busy ? undefined : onClose} />
      <div className="fixed left-1/2 top-1/2 z-50 w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-card shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-lg flex items-center justify-center bg-surface2">
              <Icon className={cn('size-5', app.color)} />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-foreground">Create your {app.name} account</h2>
              <p className="text-xs text-muted-foreground">You&apos;ll be the owner of this account</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={busy}
            className="size-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-surface2 disabled:opacity-50"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="p-4">
          <label htmlFor="new-account-name" className="block text-xs font-medium text-muted-foreground mb-1.5">
            Account name
          </label>
          <input
            id="new-account-name"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
            placeholder={`e.g. ${app.name} workspace`}
            className="w-full h-10 rounded-lg border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
          <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
            This creates your first {app.name} account and makes you its owner. You can rename or add more later.
          </p>
          {error ? <p className="mt-2 text-xs text-signal-red">{error}</p> : null}

          <div className="mt-4 flex items-center justify-end gap-2">
            <button
              onClick={onClose}
              disabled={busy}
              className="rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-surface2 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={submit}
              disabled={!canSubmit}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Plus className="size-4" aria-hidden="true" />
              {busy ? 'Creating…' : 'Create account'}
            </button>
          </div>
        </div>
      </div>
    </>
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
  onOpenAdmin,
  onOpenUserProfile,
}: {
  displayName: string
  email: string
  accounts: AccountRow[]
  isOpen: boolean
  onClose: () => void
  onLogout: () => void
  onOpenSettings?: () => void
  onOpenAdmin?: () => void
  onOpenUserProfile: () => void
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
          <button
            onClick={() => {
              onClose()
              onOpenUserProfile()
            }}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-foreground hover:bg-surface2 transition-colors"
          >
            <UserIcon className="size-4 text-muted-foreground" />
            Profile
          </button>
          {onOpenAdmin ? (
            <button
              onClick={() => {
                onClose()
                onOpenAdmin()
              }}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-foreground hover:bg-surface2 transition-colors"
            >
              <ShieldCheck className="size-4 text-muted-foreground" />
              Admin
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
  const router = useRouter()
  const [profileMenuOpen, setProfileMenuOpen] = useState(false)
  const [userProfileOpen, setUserProfileOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  // Optimistic display-name after a profile save, so the greeting/menu update WITHOUT a
  // reload (the live profile read is keyed on identity and won't refetch on a mutation).
  const [displayNameOverride, setDisplayNameOverride] = useState<string | null>(null)
  // Create-first-account flow: the app whose modal is open, plus an OPTIMISTIC set
  // of slugs just created (so the tile flips to normal-open immediately — the next
  // token refresh confirms it via the accounts claim).
  const [createAccountSlug, setCreateAccountSlug] = useState<string | null>(null)
  const [createdSlugs, setCreatedSlugs] = useState<ReadonlySet<string>>(new Set())
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  // Admin/control-plane surfaces gate on the site-admin Cognito group (via
  // metadata.siteAdmin), NOT app membership (D11; no site_admin claim).
  const isSiteAdmin = authUser?.metadata?.siteAdmin === true

  const data = useLaunchpadData(authUser)
  const selfAccess = useSelfAccess(authUser)

  const email = authUser?.email ?? ''
  // Canonical chain (#423/#494): EXPLICIT profile displayName → Cognito name → email
  // local part. The user Lambda now omits displayName unless the user explicitly set
  // one (#494), so a federated user with no stored name falls through to the token
  // name (`authUser.name`), which the auth client guarantees is a real name or the
  // email local part — never the full address.
  const displayName = resolveDisplayName({
    displayName: displayNameOverride ?? data.profile?.displayName,
    cognitoName: authUser?.name,
    email,
  })

  // Tile visibility is GROUPS-AUTHORITATIVE (M11): the access/admin GROUPS from the
  // token (metadata.appAccess / appAdmin / siteAdmin) decide what's visible — NOT
  // membership. `accounted` (apps with >=1 account, from active-accounts) only
  // distinguishes the create-first-account state from the normal-open state.
  const meta = authUser?.metadata as { appAccess?: string[]; appAdmin?: string[] } | undefined
  const viewer: ViewerEntitlement = {
    siteAdmin: isSiteAdmin,
    appAdmin: new Set(meta?.appAdmin ?? []),
    appAccess: new Set(meta?.appAccess ?? []),
    accounted: new Set([...data.entitledSlugs, ...createdSlugs]),
  }
  const tiles = deriveAppTiles(LAUNCHPAD_APPS, viewer)
  const createAccountTile = createAccountSlug ? tiles.find((t) => t.slug === createAccountSlug) ?? null : null

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

  // Create the viewer's FIRST account in an app they already hold access to. Calls
  // the real POST /accounts (A4) with { name, appSlug }; authorization is the
  // caller's {appSlug}-app-access group. On success: optimistically mark the app
  // accounted (tile flips to normal-open) and refresh the token so the new account
  // + membership land in the next token's claims.
  const handleCreateAccount = async (name: string) => {
    if (!createAccountSlug) return
    setCreating(true)
    setCreateError(null)
    try {
      const idToken = await authService.getIdToken()
      if (!idToken) throw new Error('Not signed in')
      await createAccount(idToken, createAccountSlug, name)
      setCreatedSlugs((prev) => new Set(prev).add(createAccountSlug))
      setCreateAccountSlug(null)
      authService.refreshTokens().catch(() => { /* next natural load reconciles */ })
    } catch (err) {
      console.error('[launchpad] create account failed:', err)
      setCreateError('Could not create the account. Please try again.')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header displayName={displayName} onOpenProfile={() => setProfileMenuOpen(true)} />

      <main className="flex-1 pt-8 pb-10 md:pt-10 md:pb-14">
        <div className="max-w-5xl mx-auto px-4 md:px-6">
          <h2 className="mb-4 font-display text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Your apps
          </h2>
          {data.loading ? (
            <AppGridSkeleton />
          ) : hasVisibleApps(tiles) ? (
            <AppGrid
              tiles={tiles}
              getLaunchHandler={getLaunchHandler}
              onCreateAccount={(slug) => { setCreateError(null); setCreateAccountSlug(slug) }}
            />
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
        onOpenAdmin={isSiteAdmin ? () => router.push('/launchpad/admin/users') : undefined}
        onOpenUserProfile={() => setUserProfileOpen(true)}
      />

      {userProfileOpen && authUser && (
        <>
          <div className="fixed inset-0 bg-black/50 z-50" onClick={() => setUserProfileOpen(false)} />
          <div className="fixed left-1/2 top-1/2 z-50 flex max-h-[calc(100vh-2rem)] w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl">
            <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
              <div>
                <h2 className="text-sm font-semibold text-foreground">Your profile</h2>
                <p className="text-xs text-muted-foreground">Shown across all Transformotion apps</p>
              </div>
              <button
                onClick={() => setUserProfileOpen(false)}
                className="size-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-surface2"
                aria-label="Close profile"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="scrollbar-subtle flex flex-col gap-4 overflow-y-auto p-4">
              <ProfileForm
                email={email}
                initialDisplayName={displayName}
                initialNotificationsEnabled={data.profile?.preferences?.notificationsEnabled ?? false}
                heading={displayName}
                description="Update how your name appears and whether we send you notifications."
                onSaved={(profile) => {
                  // Instant: the greeting/menu reflect the new name immediately.
                  setDisplayNameOverride(profile.displayName ?? null)
                  // Reconcile: re-read the live profile so state matches the server.
                  data.refresh()
                }}
              />
              <YourAccountsAccess summary={selfAccess.summary} loading={selfAccess.loading} />
            </div>
          </div>
        </>
      )}

      {createAccountTile && (
        <CreateAccountModal
          app={createAccountTile}
          busy={creating}
          error={createError}
          onSubmit={handleCreateAccount}
          onClose={() => { if (!creating) { setCreateAccountSlug(null); setCreateError(null) } }}
        />
      )}

      <AiEngineSettings isOpen={settingsOpen && isSiteAdmin} onClose={() => setSettingsOpen(false)} />

      <Footer />
    </div>
  )
}
