"use client"

import { useState, type ReactNode } from "react"
import { cn } from "@/lib/utils"
import { Wordmark } from "@/components/brand/wordmark"
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
} from "lucide-react"
import { ConfirmationModal } from "@/components/ui/design-system"
import type { BudgetTabId } from "./data/types"
import { useBudgetStore } from "@/stores/budget-tracker/use-budget-store"
import { useAuthStore } from "@/stores/auth/use-auth-store"

// ============================================================================
// NAV ITEMS CONFIG
// ============================================================================

export const BUDGET_NAV_ITEMS: { id: BudgetTabId; icon: typeof Receipt; label: string }[] = [
  { id: "transactions", icon: Receipt, label: "Transactions" },
  { id: "summary", icon: PieChart, label: "Summary" },
  { id: "budget", icon: Target, label: "Budget" },
  { id: "cashflow", icon: TrendingUp, label: "Cashflow" },
  { id: "rules", icon: Wand2, label: "Rules" },
  { id: "review", icon: Sparkles, label: "Review" },
]

// ============================================================================
// MOBILE NAV
// ============================================================================

export function BudgetMobileNav() {
  const activeTab = useBudgetStore((s) => s.activeTab)
  const setActiveTab = useBudgetStore((s) => s.setActiveTab)
  const uncategorizedCount = useBudgetStore((s) => s.uncategorizedCount)

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-card/95 backdrop-blur-sm border-t border-border md:hidden z-50 safe-area-inset-bottom">
      <div className="flex items-center justify-around h-16">
        {BUDGET_NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            onClick={() => setActiveTab(item.id)}
            className={cn(
              "relative flex flex-col items-center justify-center gap-0.5 w-12 py-1 transition-colors",
              activeTab === item.id ? "text-primary" : "text-muted-foreground"
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
  const accounts = useAuthStore((s) => s.accounts)
  const currentAccount = useAuthStore((s) => s.currentAccount)
  const switchAccount = useAuthStore((s) => s.switchAccount)
  const [accountMenuOpen, setAccountMenuOpen] = useState(false)
  const [profileMenuOpen, setProfileMenuOpen] = useState(false)
  const [signOutConfirm, setSignOutConfirm] = useState(false)

  const initials = (user?.name ?? '').split(' ').map(n => n[0]).join('')
  const firstName = (user?.name ?? '').split(' ')[0]

  function handleSignOut() {
    onSignOut?.()
  }

  return (
    <div className="flex items-center justify-between py-3 px-4 bg-card border-b border-border md:hidden">
      {/* User Info */}
      <div className="flex items-center gap-3">
        <div className="size-10 rounded-full bg-primary/15 flex items-center justify-center text-primary font-semibold text-sm">
          {initials}
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">{firstName}</p>
          {/* Account Switcher */}
          <div className="relative">
            <button
              onClick={() => setAccountMenuOpen(!accountMenuOpen)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
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

      {/* Profile Menu */}
      <div className="relative">
        <button
          onClick={() => setProfileMenuOpen(!profileMenuOpen)}
          className="size-9 rounded-lg bg-surface2 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
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
  const accounts = useAuthStore((s) => s.accounts)
  const currentAccount = useAuthStore((s) => s.currentAccount)
  const switchAccount = useAuthStore((s) => s.switchAccount)
  const [accountMenuOpen, setAccountMenuOpen] = useState(false)
  const [signOutConfirm, setSignOutConfirm] = useState(false)

  const initials = (user?.name ?? '').split(' ').map(n => n[0]).join('')
  const firstName = (user?.name ?? '').split(' ')[0]

  function handleSignOut() {
    onSignOut?.()
  }

  return (
    <aside className="hidden md:flex flex-col w-56 h-screen bg-card border-r border-border fixed left-0 top-0">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-border">
        <Wordmark size="md" />
      </div>

      {/* Back to Launchpad */}
      <button
        onClick={onGoToLaunchpad}
        className="mx-3 mt-3 flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-surface2 transition-colors"
      >
        <Home className="size-4" />
        <span>Launchpad</span>
      </button>

      {/* App Title */}
      <div className="px-5 py-3">
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Budget Tracker</h2>
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
                ? "text-primary bg-primary/10 border-r-2 border-primary"
                : "text-muted-foreground hover:text-foreground hover:bg-surface2"
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
      <div className="p-4 border-t border-border">
        <div className="flex items-center gap-3 mb-3">
          <div className="size-9 rounded-full bg-primary/15 flex items-center justify-center text-primary font-semibold text-xs">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground truncate">{firstName}</p>
            {/* Account Switcher */}
            <div className="relative">
              <button
                onClick={() => setAccountMenuOpen(!accountMenuOpen)}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
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

        {/* Sign Out */}
        <button
          onClick={() => setSignOutConfirm(true)}
          className="w-full flex items-center gap-2 px-2 py-2 rounded-lg text-xs text-muted-foreground hover:text-signal-red hover:bg-signal-red/10 transition-colors"
        >
          <LogOut className="size-4" />
          Sign out
        </button>

        <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-3 pt-3 border-t border-border">
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
