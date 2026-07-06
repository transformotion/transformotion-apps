"use client"

import { useEffect, useState, type ReactNode } from "react"
import { useTheme } from "next-themes"
import { cn } from "@/lib/utils"
import { BrandLogo } from "@/components/brand/brand-logo"
import { ThemeToggle } from "@/components/theme-toggle"
import {
  Receipt,
  PieChart,
  Target,
  TrendingUp,
  Wand2,
  Sparkles,
  Clock,
  ChevronDown,
  User,
  Settings,
  LogOut,
  Check,
  Home,
  Moon,
  Sun,
} from "lucide-react"
import { ConfirmationModal } from "@transformotion/ui-primitives"
import { useBudgetStore, type BudgetTabId } from "@/stores/budget-tracker/use-budget-store"
import { useAuthStore } from "@/stores/auth/use-auth-store"
import { userFirstName, userInitials } from "@transformotion/auth-client"
import { useActiveAccountStore } from "@/stores/active-account/use-active-account-store"

// Account switcher backed by the control-plane active-account store (D7).
// Switching PUTs the selection then reloads so every account-scoped surface
// re-fetches with the new X-Account-Id.
function useAccountSwitcher() {
  const storeAccounts = useActiveAccountStore((s) => s.accounts)
  const activeId = useActiveAccountStore((s) => s.activeAccountId)
  const switchTo = useActiveAccountStore((s) => s.switchTo)

  const accounts = storeAccounts.map((a) => ({ id: a.accountId, name: a.name ?? a.accountId }))
  const currentAccount = accounts.find((a) => a.id === activeId) ?? null
  const switchAccount = async (id: string) => {
    if (id === activeId) return
    try {
      await switchTo(id)
      if (typeof window !== "undefined") window.location.reload()
    } catch {
      /* store reverted + logged; stay on current account */
    }
  }
  return { accounts, currentAccount, switchAccount }
}

// ============================================================================
// NAV ITEMS CONFIG
// ============================================================================

export const BUDGET_NAV_ITEMS: { id: BudgetTabId; icon: typeof Receipt; label: string }[] = [
  { id: "home", icon: Home, label: "Home" },
  { id: "transactions", icon: Receipt, label: "Transactions" },
  { id: "summary", icon: PieChart, label: "Summary" },
  { id: "budget", icon: Target, label: "Budget" },
  { id: "cashflow", icon: TrendingUp, label: "Cashflow" },
  { id: "rules", icon: Wand2, label: "Rules" },
  { id: "review", icon: Sparkles, label: "Review" },
  { id: "settings", icon: Settings, label: "Settings" },
]

// ============================================================================
// MOBILE NAV
// ============================================================================

export function BudgetMobileNav() {
  const activeTab = useBudgetStore((s) => s.activeTab)
  const setActiveTab = useBudgetStore((s) => s.setActiveTab)
  const uncategorizedCount = useBudgetStore((s) => s.uncategorizedCount)
  const { resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const isDark = mounted && resolvedTheme === "dark"

  return (
    <nav
      className={cn(
        "fixed bottom-0 left-0 right-0 md:hidden z-50 safe-area-inset-bottom",
        isDark ? "bg-slate-50 border-t border-border" : "bg-brand-navy",
      )}
    >
      <div className="flex items-center justify-around h-16">
        {BUDGET_NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            onClick={() => setActiveTab(item.id)}
            className={cn(
              "relative flex flex-col items-center justify-center gap-0.5 w-12 py-1 transition-colors",
              activeTab === item.id
                ? "text-brand-teal"
                : isDark
                  ? "text-brand-navy/60"
                  : "text-brand-navy-foreground/70",
            )}
          >
            <item.icon className="size-5" />
            <span className="text-[10px] font-medium">{item.label}</span>
            {item.id === "review" && uncategorizedCount > 0 && (
              <span className="absolute -top-0.5 right-0.5 size-4 rounded-full bg-signal-amber text-[9px] font-bold text-background flex items-center justify-center">
                {uncategorizedCount > 99 ? "99+" : uncategorizedCount}
              </span>
            )}
          </button>
        ))}
      </div>
    </nav>
  )
}

// ============================================================================
// USER HEADER (Mobile)
// ============================================================================

export function BudgetUserHeader({
  onGoToLaunchpad,
  onSignOut,
}: {
  onGoToLaunchpad?: () => void
  onSignOut?: () => void
}) {
  const user = useAuthStore((s) => s.user)
  const { accounts, currentAccount, switchAccount } = useAccountSwitcher()
  const { resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const isDark = mounted && resolvedTheme === "dark"
  const [accountMenuOpen, setAccountMenuOpen] = useState(false)
  const [profileMenuOpen, setProfileMenuOpen] = useState(false)
  const [signOutConfirm, setSignOutConfirm] = useState(false)

  const initials = userInitials(user)   // first name from given_name, never the email (#494)
  const firstName = userFirstName(user)
  const barText = isDark ? "text-brand-navy" : "text-brand-navy-foreground"
  const barMuted = isDark ? "text-brand-navy/60" : "text-brand-navy-foreground/60"
  const barButton = isDark
    ? "bg-brand-navy/10 text-brand-navy hover:bg-brand-navy/20"
    : "bg-white/10 text-brand-navy-foreground hover:bg-white/20"

  function handleSignOut() {
    onSignOut?.()
  }

  return (
    <div
      className={cn(
        "flex items-center justify-between py-3 px-4 md:hidden",
        isDark ? "bg-slate-50 border-b border-border" : "bg-brand-navy",
      )}
    >
      {/* User Info */}
      <div className="flex items-center gap-3">
        <div className="size-10 rounded-full bg-brand-teal/20 flex items-center justify-center text-brand-teal font-semibold text-sm">
          {initials}
        </div>
        <div>
          <p className={cn("text-sm font-medium", barText)}>{firstName}</p>
          {/* Account Switcher */}
          <div className="relative">
            <button
              onClick={() => setAccountMenuOpen(!accountMenuOpen)}
              className={cn("flex items-center gap-1 text-xs transition-colors hover:text-brand-teal", barMuted)}
            >
              {currentAccount?.name}
              <ChevronDown className={cn("size-3 transition-transform", accountMenuOpen && "rotate-180")} />
            </button>

            {accountMenuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setAccountMenuOpen(false)} />
                <div className="absolute left-0 top-full mt-1 w-48 bg-card border border-border rounded-lg shadow-xl z-50 overflow-hidden">
                  {accounts.map((account) => (
                    <button
                      key={account.id}
                      onClick={() => { switchAccount(account.id); setAccountMenuOpen(false) }}
                      className={cn(
                        "w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-surface2 transition-colors",
                        account.id === currentAccount?.id && "bg-primary/5"
                      )}
                    >
                      <span className="text-foreground">{account.name}</span>
                      {account.id === currentAccount?.id && <Check className="size-4 text-primary" />}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <ThemeToggle />
        <div className="relative">
        <button
          onClick={() => setProfileMenuOpen(!profileMenuOpen)}
          className={cn("size-9 rounded-lg flex items-center justify-center transition-colors", barButton)}
        >
          <User className="size-5" />
        </button>

        {profileMenuOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setProfileMenuOpen(false)} />
            <div className="absolute right-0 top-full mt-2 w-48 bg-card border border-border rounded-lg shadow-xl z-50 overflow-hidden">
              <button
                onClick={() => { setProfileMenuOpen(false); onGoToLaunchpad?.() }}
                className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-foreground hover:bg-surface2 transition-colors"
              >
                <Home className="size-4 text-muted-foreground" />
                Back to Launchpad
              </button>
              <button className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-foreground hover:bg-surface2 transition-colors">
                <Settings className="size-4 text-muted-foreground" />
                Settings
              </button>
              <button
                onClick={() => { setProfileMenuOpen(false); setSignOutConfirm(true) }}
                className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-signal-red hover:bg-signal-red/10 transition-colors"
              >
                <LogOut className="size-4" />
                Sign out
              </button>
            </div>
          </>
        )}
        </div>
      </div>

      {/* Sign Out Confirmation */}
      <ConfirmationModal
        isOpen={signOutConfirm}
        title="Sign out"
        message="Are you sure you want to sign out?"
        confirmLabel="Sign out"
        cancelLabel="Cancel"
        variant="destructive"
        onConfirm={() => { setSignOutConfirm(false); handleSignOut() }}
        onCancel={() => setSignOutConfirm(false)}
      />
    </div>
  )
}

// ============================================================================
// DESKTOP SIDEBAR
// ============================================================================

export function BudgetDesktopSidebar({
  onGoToLaunchpad,
  onSignOut,
}: {
  onGoToLaunchpad?: () => void
  onSignOut?: () => void
}) {
  const activeTab = useBudgetStore((s) => s.activeTab)
  const setActiveTab = useBudgetStore((s) => s.setActiveTab)
  const uncategorizedCount = useBudgetStore((s) => s.uncategorizedCount)
  const user = useAuthStore((s) => s.user)
  const { accounts, currentAccount, switchAccount } = useAccountSwitcher()
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const isDark = mounted && resolvedTheme === "dark"
  const [accountMenuOpen, setAccountMenuOpen] = useState(false)
  const [signOutConfirm, setSignOutConfirm] = useState(false)

  const initials = userInitials(user)   // first name from given_name, never the email (#494)
  const firstName = userFirstName(user)
  const railBg = isDark ? "bg-card border-r border-border" : "bg-brand-navy"
  const railText = isDark ? "text-foreground" : "text-brand-navy-foreground"
  const railMuted = isDark ? "text-muted-foreground" : "text-brand-navy-foreground/60"
  const railBorder = isDark ? "border-border" : "border-white/10"
  const railIdle = isDark
    ? "text-muted-foreground hover:bg-surface2 hover:text-foreground"
    : "text-brand-navy-foreground/80 hover:bg-white/10 hover:text-brand-navy-foreground"

  function handleSignOut() {
    onSignOut?.()
  }

  return (
    <aside className={cn("hidden md:flex flex-col w-56 h-screen fixed left-0 top-0", railBg)}>
      {/* Logo */}
      <div className={cn("px-4 py-5 border-b", railBorder)}>
        <BrandLogo surface="navy" priority className="flex w-full" imgClassName="h-auto w-full max-w-none" />
      </div>

      {/* Back to Launchpad */}
      <button
        onClick={onGoToLaunchpad}
        className={cn(
          "mx-3 mt-3 flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors",
          railIdle,
        )}
      >
        <Home className="size-4" />
        <span>Launchpad</span>
      </button>

      {/* App Title */}
      <div className="px-5 py-3">
        <h2 className={cn("font-display text-xs font-semibold uppercase tracking-wider", railMuted)}>Budget Tracker</h2>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-1">
        {BUDGET_NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            onClick={() => setActiveTab(item.id)}
            className={cn(
              "relative w-full flex items-center gap-3 px-5 py-2.5 text-sm font-medium transition-colors",
              activeTab === item.id
                ? "text-brand-teal bg-brand-teal/10 border-r-2 border-brand-teal"
                : railIdle,
            )}
          >
            <item.icon className="size-5" />
            <span>{item.label}</span>
            {item.id === "review" && uncategorizedCount > 0 && (
              <span className="ml-auto px-1.5 py-0.5 rounded-full bg-signal-amber text-[10px] font-bold text-background">
                {uncategorizedCount > 99 ? "99+" : uncategorizedCount}
              </span>
            )}
          </button>
        ))}
      </nav>

      {/* User Footer */}
      <div className={cn("p-4 border-t", railBorder)}>
        <div className="flex items-center gap-3 mb-3">
          <div className="size-9 rounded-full bg-brand-teal/20 flex items-center justify-center text-brand-teal font-semibold text-xs">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <p className={cn("text-sm font-medium truncate", railText)}>{firstName}</p>
            {/* Account Switcher */}
            <div className="relative">
              <button
                onClick={() => setAccountMenuOpen(!accountMenuOpen)}
                className={cn("flex items-center gap-1 text-xs transition-colors hover:text-brand-teal", railMuted)}
              >
                <span className="truncate">{currentAccount?.name}</span>
                <ChevronDown className={cn("size-3 shrink-0 transition-transform", accountMenuOpen && "rotate-180")} />
              </button>

              {accountMenuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setAccountMenuOpen(false)} />
                  <div className="absolute left-0 bottom-full mb-1 w-48 bg-card border border-border rounded-lg shadow-xl z-50 overflow-hidden">
                    <div className="px-3 py-2 border-b border-border">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Switch account</p>
                    </div>
                    {accounts.map((account) => (
                      <button
                        key={account.id}
                        onClick={() => { switchAccount(account.id); setAccountMenuOpen(false) }}
                        className={cn(
                          "w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-surface2 transition-colors",
                          account.id === currentAccount?.id && "bg-primary/5"
                        )}
                      >
                        <span className="text-foreground">{account.name}</span>
                        {account.id === currentAccount?.id && <Check className="size-4 text-primary" />}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        <button
          onClick={() => setTheme(isDark ? "light" : "dark")}
          aria-label={mounted ? `Switch to ${isDark ? "light" : "dark"} theme` : "Toggle theme"}
          className={cn("w-full flex items-center justify-between px-2 py-2 mb-1 rounded-lg text-xs transition-colors", railIdle)}
        >
          <span className="flex items-center gap-2">
            {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
            Theme
          </span>
          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-brand-teal/15 text-brand-teal">
            {mounted ? (isDark ? "Dark" : "Light") : "Theme"}
          </span>
        </button>

        {/* Sign Out */}
        <button
          onClick={() => setSignOutConfirm(true)}
          className={cn("w-full flex items-center gap-2 px-2 py-2 rounded-lg text-xs transition-colors hover:text-signal-red hover:bg-signal-red/10", railMuted)}
        >
          <LogOut className="size-4" />
          Sign out
        </button>

        <div className={cn("flex items-center gap-2 text-[10px] mt-3 pt-3 border-t", railMuted, railBorder)}>
          <Clock className="size-3" />
          <span>Last sync: 2 min ago</span>
        </div>
      </div>

      {/* Sign Out Confirmation */}
      <ConfirmationModal
        isOpen={signOutConfirm}
        title="Sign out"
        message="Are you sure you want to sign out?"
        confirmLabel="Sign out"
        cancelLabel="Cancel"
        variant="destructive"
        onConfirm={() => { setSignOutConfirm(false); handleSignOut() }}
        onCancel={() => setSignOutConfirm(false)}
      />
    </aside>
  )
}

// ============================================================================
// APP SHELL
// ============================================================================

export function BudgetAppShell({
  children,
  onGoToLaunchpad,
  onSignOut,
}: {
  children: ReactNode
  onGoToLaunchpad?: () => void
  onSignOut?: () => void
}) {
  return (
    <div className="min-h-screen bg-background">
      <BudgetDesktopSidebar onGoToLaunchpad={onGoToLaunchpad} onSignOut={onSignOut} />
      <BudgetUserHeader onGoToLaunchpad={onGoToLaunchpad} onSignOut={onSignOut} />
      <main className="md:ml-56 pb-20 md:pb-8 overflow-x-hidden">
        <div className="w-full px-4 md:px-6 lg:px-8">
          {children}
        </div>
      </main>
      <BudgetMobileNav />
    </div>
  )
}
