'use client'

import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { Wordmark } from '@/components/brand/wordmark'
import { TrendingUp, Wallet, Layers, LogOut, Settings, User as UserIcon, Check } from 'lucide-react'
import type { User } from '@transformotion/auth-client'

interface App {
  id: string
  name: string
  description: string
  icon: React.ComponentType<{ className?: string }>
  available: boolean
  color: string
  bgGradient: string
}

interface Account {
  id: string
  name: string
  type: 'Personal' | 'Household' | 'Business'
}

interface UserProfile {
  name: string
  email: string
  avatar?: string
  accounts: Account[]
  activeAccount: string
}

const PLACEHOLDER_ACCOUNTS: Account[] = [
  { id: '1', name: 'Personal', type: 'Personal' },
]

const APPS: App[] = [
  {
    id: 'stock-signal',
    name: 'Stock Signal Analyser',
    description: 'Cycle position analysis across ASX, NASDAQ, Dow Jones, FTSE',
    icon: TrendingUp,
    available: true,
    color: 'text-primary',
    bgGradient: 'from-primary/20 via-primary/5 to-transparent',
  },
  {
    id: 'budget-tracker',
    name: 'Budget Tracker',
    description: 'Track income, expenses and savings across accounts',
    icon: Wallet,
    available: true,
    color: 'text-signal-green',
    bgGradient: 'from-signal-green/20 via-signal-green/5 to-transparent',
  },
  {
    id: 'transformation-framework',
    name: 'Transformotion Framework',
    description: 'Business transformation tools and methodologies',
    icon: Layers,
    available: false,
    color: 'text-signal-gold',
    bgGradient: 'from-signal-gold/20 via-signal-gold/5 to-transparent',
  },
]

const getGreeting = () => {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

function Header({
  user,
  onOpenProfile,
}: {
  user: UserProfile
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
            {user?.name
              ?.split(' ')
              .map((n) => n[0])
              .join('') || '?'}
          </button>
        </div>
      </div>
    </header>
  )
}

function Greeting({ name }: { name: string }) {
  const [mounted, setMounted] = useState(false)
  const greeting = mounted ? getGreeting() : 'Welcome'
  const firstName = name.split(' ')[0]

  useEffect(() => {
    setMounted(true)
  }, [])

  return (
    <div className="mb-8">
      <h1 className="text-2xl md:text-3xl font-bold text-foreground mb-1">
        {greeting}, {firstName}
      </h1>
      <p className="text-muted-foreground">Welcome to your Transformotion dashboard</p>
    </div>
  )
}

function AppTile({
  app,
  index,
  onLaunch,
}: {
  app: App
  index: number
  onLaunch?: () => void
}) {
  const Icon = app.icon

  return (
    <button
      disabled={!app.available}
      onClick={onLaunch}
      className={cn(
        'relative overflow-hidden p-6 rounded-2xl border transition-all text-left',
        'animate-in fade-in slide-in-from-bottom-4',
        app.available
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
            app.available ? 'bg-surface2' : 'bg-surface2/50',
          )}
        >
          <Icon className={cn('size-7', app.available ? app.color : 'text-muted-foreground')} />
        </div>
        <h3
          className={cn(
            'text-lg font-semibold mb-1',
            app.available ? 'text-foreground' : 'text-muted-foreground',
          )}
        >
          {app.name}
        </h3>
        <p
          className={cn(
            'text-sm leading-relaxed',
            app.available ? 'text-muted-foreground' : 'text-muted-foreground/70',
          )}
        >
          {app.description}
        </p>
        {!app.available && (
          <div className="mt-4 inline-flex items-center px-3 py-1 bg-surface2 rounded-full text-xs font-medium text-muted-foreground">
            Coming Soon
          </div>
        )}
      </div>
    </button>
  )
}

function AppGrid({
  apps,
  userCanAccessFramework,
  onLaunchApp,
  onLaunchBudgetTracker,
}: {
  apps: App[]
  userCanAccessFramework: boolean
  onLaunchApp?: () => void
  onLaunchBudgetTracker?: () => void
}) {
  const visibleApps = apps.filter((app) => {
    if (app.id === 'transformation-framework' && !userCanAccessFramework) return false
    return true
  })

  const getLaunchHandler = (appId: string) => {
    if (appId === 'stock-signal') return onLaunchApp
    if (appId === 'budget-tracker') return onLaunchBudgetTracker
    return undefined
  }

  return (
    <div className="grid gap-4 md:gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {visibleApps.map((app, index) => (
        <AppTile key={app.id} app={app} index={index} onLaunch={getLaunchHandler(app.id)} />
      ))}
    </div>
  )
}

function ProfileMenu({
  user,
  isOpen,
  onClose,
  onLogout,
  onAccountChange,
}: {
  user: UserProfile
  isOpen: boolean
  onClose: () => void
  onLogout: () => void
  onAccountChange: (accountId: string) => void
}) {
  if (!isOpen) return null

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-50" onClick={onClose} />
      <div className="fixed right-4 top-20 w-72 bg-card border border-border rounded-xl shadow-2xl z-50 overflow-hidden">
        <div className="p-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="size-12 rounded-full bg-primary/15 flex items-center justify-center text-primary font-semibold">
              {user.name
                .split(' ')
                .map((n) => n[0])
                .join('')}
            </div>
            <div>
              <p className="font-semibold text-foreground">{user.name}</p>
              <p className="text-sm text-muted-foreground">{user.email}</p>
            </div>
          </div>
        </div>

        <div className="border-b border-border py-2">
          <p className="px-4 py-1 text-xs text-muted-foreground">Account</p>
          {user.accounts.map((account) => (
            <button
              key={account.id}
              onClick={() => {
                onAccountChange(account.id)
                onClose()
              }}
              className={cn(
                'w-full flex items-center justify-between px-4 py-2.5 text-sm transition-colors hover:bg-surface2',
                account.id === user.activeAccount && 'bg-primary/5',
              )}
            >
              <div className="text-left">
                <p className="font-medium text-foreground">{account.name}</p>
                <p className="text-xs text-muted-foreground">{account.type}</p>
              </div>
              {account.id === user.activeAccount && <Check className="size-4 text-primary" />}
            </button>
          ))}
        </div>

        <div className="py-2">
          <button className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-foreground hover:bg-surface2 transition-colors">
            <UserIcon className="size-4 text-muted-foreground" />
            Profile
          </button>
          <button className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-foreground hover:bg-surface2 transition-colors">
            <Settings className="size-4 text-muted-foreground" />
            Settings
          </button>
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
  const [activeAccount, setActiveAccount] = useState(PLACEHOLDER_ACCOUNTS[0].id)

  const user: UserProfile = {
    name:          authUser?.name  ?? 'User',
    email:         authUser?.email ?? '',
    accounts:      PLACEHOLDER_ACCOUNTS,
    activeAccount,
  }

  const handleAccountChange = (accountId: string) => {
    setActiveAccount(accountId)
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header user={user} onOpenProfile={() => setProfileMenuOpen(true)} />

      <main className="flex-1 py-8 md:py-12">
        <div className="max-w-5xl mx-auto px-4 md:px-6">
          <Greeting name={user.name} />
          <AppGrid
            apps={APPS}
            userCanAccessFramework={false}
            onLaunchApp={onLaunchApp}
            onLaunchBudgetTracker={onLaunchBudgetTracker}
          />
        </div>
      </main>

      <ProfileMenu
        user={user}
        isOpen={profileMenuOpen}
        onClose={() => setProfileMenuOpen(false)}
        onLogout={onSignOut || (() => {})}
        onAccountChange={handleAccountChange}
      />

      <Footer />
    </div>
  )
}
