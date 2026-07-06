"use client"

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react"
import { useTheme } from "next-themes"
import { watchlistService, type WatchlistItem } from "@/lib/services/watchlist/watchlist-service"
import { stockAnalyserSettingsService } from "@/lib/services/settings/settings-service"
import { cn } from "@/lib/utils"
import { BrandLogo } from "@/components/brand/brand-logo"
import { ThemeToggle } from "@/components/theme-toggle"
import {
  BarChart3,
  Star,
  Layers,
  Gem,
  Search,
  Briefcase,
  Eye,
  Clock,
  ChevronDown,
  User,
  Settings,
  LogOut,
  Check,
  Home,
  FileText,
  Moon,
  Sun,
} from "lucide-react"
import { ConfirmationModal } from "@transformotion/ui-primitives"
import { userFirstName, userInitials } from "@transformotion/auth-client"
import { useActiveAccountStore } from "@/stores/active-account/use-active-account-store"
import { useAuthStore, selectUser } from "@/stores/auth/use-auth-store"
import type {
  StockAnalyserSearchMode,
} from "@transformotion/contracts/stock-analyser/types"
import {
  createRecommendationsNavigationState,
  type RecommendationsNavigationContext,
} from "./recommendations-flow"

// ============================================================================
// TYPES
// ============================================================================

export type TabId = "home" | "market" | "recs" | "etfs" | "metals" | "analyser" | "portfolio" | "watchlist" | "settings"

export interface Account {
  id: string
  name: string
  type: "Personal" | "Household" | "Business"
}

export interface User {
  name: string
  email: string
  avatar?: string
  accounts: Account[]
  activeAccountId: string
}

export type WatchlistEntry = WatchlistItem
export type SearchMode = StockAnalyserSearchMode

export interface NavigationState {
  activeTab: TabId
  // Cross-screen navigation context
  sectorFilter: string | null
  recsUniverse: RecommendationsNavigationContext["recommendationUniverse"]
  recsSourceRegion: RecommendationsNavigationContext["sourceRegion"] | null
  recsSource: TabId | null
  analyserTicker: string | null
  analyserSource: TabId | null
  watchlist: WatchlistEntry[]
  portfolio: string[]
  // User state
  user: User
  // Explanatory text visibility settings
  showExplanatoryText: boolean // global user setting (default: true)
  tabTextOverrides: Partial<Record<TabId, boolean>> // per-tab manual overrides
  defaultSearchMode: SearchMode
  // Cached API results per tab (persists between tab switches)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tabCache: Partial<Record<TabId, any>>
}

export interface NavigationActions {
  navigateTo: (tab: TabId) => void
  navigateToRecsWithSector: (payload: RecommendationsNavigationContext) => void
  navigateToAnalyser: (ticker: string, source: TabId) => void
  clearSectorFilter: () => void
  clearAnalyserContext: () => void
  addToWatchlist: (ticker: string, name?: string) => void
  removeFromWatchlist: (ticker: string) => void
  isOnWatchlist: (ticker: string) => boolean
  watchlistEntries: WatchlistEntry[]
  isInPortfolio: (ticker: string) => boolean
  switchAccount: (accountId: string) => void
  signOut: () => void
  goToLaunchpad: () => void
  // Text visibility actions
  setShowExplanatoryText: (show: boolean) => void
  setTabTextOverride: (tab: TabId, show: boolean) => void
  getTabTextVisibility: (tab: TabId) => boolean
  setDefaultSearchMode: (mode: SearchMode) => void
  // Tab result cache
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setTabCache: (tab: TabId, data: any) => void
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getTabCache: (tab: TabId) => any
}

interface NavigationContextValue extends NavigationState, NavigationActions {}

// ============================================================================
// CONTEXT
// ============================================================================

const NavigationContext = createContext<NavigationContextValue | null>(null)

export function useNavigation() {
  const context = useContext(NavigationContext)
  if (!context) {
    throw new Error("useNavigation must be used within NavigationProvider")
  }
  return context
}

// ============================================================================
// NAV ITEMS CONFIG
// ============================================================================

export const NAV_ITEMS: { id: TabId; icon: typeof BarChart3; label: string }[] = [
  { id: "home", icon: Home, label: "Home" },
  { id: "market", icon: BarChart3, label: "Market" },
  { id: "recs", icon: Star, label: "Recs" },
  { id: "etfs", icon: Layers, label: "ETFs" },
  { id: "metals", icon: Gem, label: "Metals" },
  { id: "analyser", icon: Search, label: "Analyser" },
  { id: "portfolio", icon: Briefcase, label: "Portfolio" },
  { id: "watchlist", icon: Eye, label: "Watchlist" },
  { id: "settings", icon: Settings, label: "Settings" },
]

// ============================================================================
// NAVIGATION PROVIDER
// ============================================================================

const DEFAULT_USER: User = {
  name: "Steve Moodie",
  email: "steve@example.com",
  accounts: [
    { id: "1", name: "Steve's Account", type: "Personal" },
    { id: "2", name: "Steve's Household", type: "Household" },
  ],
  activeAccountId: "2",
}

export function NavigationProvider({ 
  children,
  initialTab = "market",
  onSignOut,
  onGoToLaunchpad,
}: { 
  children: ReactNode
  initialTab?: TabId
  onSignOut?: () => void
  onGoToLaunchpad?: () => void
}) {
  const [state, setState] = useState<NavigationState>({
    activeTab: initialTab,
    sectorFilter: null,
    recsUniverse: null,
    recsSourceRegion: null,
    recsSource: null,
    analyserTicker: null,
    analyserSource: null,
    watchlist: [],
    portfolio: ["CBA.AX", "BHP.AX", "CSL.AX", "WDS.AX", "TLS.AX", "RIO.AX", "FMG.AX"],
    user: DEFAULT_USER,
    showExplanatoryText: true,
    tabTextOverrides: {},
    defaultSearchMode: "live",
    tabCache: {},
  })

  // Reactive per-app active account (control-plane owned, D7). The account list
  // and active selection come from the store, not hard-coded placeholders.
  const storeAccounts = useActiveAccountStore(s => s.accounts)
  const storeActiveId = useActiveAccountStore(s => s.activeAccountId)
  // The authenticated identity — its `name` is the auth client's resolved display
  // name (control-plane displayName projected into the token, #501/#494), so the
  // sidebar shows the user's real/chosen name instead of the DEFAULT_USER placeholder.
  const authUser = useAuthStore(selectUser)
  const storeSwitchTo = useActiveAccountStore(s => s.switchTo)

  const navigateTo = useCallback((tab: TabId) => {
    setState(prev => ({ ...prev, activeTab: tab }))
  }, [])

  const navigateToRecsWithSector = useCallback((payload: RecommendationsNavigationContext) => {
    setState(prev => ({
      ...prev,
      ...createRecommendationsNavigationState(prev.activeTab, payload),
    }))
  }, [])

  const navigateToAnalyser = useCallback((ticker: string, source: TabId) => {
    setState(prev => ({ 
      ...prev, 
      activeTab: "analyser",
      analyserTicker: ticker,
      analyserSource: source,
    }))
  }, [])

  const clearSectorFilter = useCallback(() => {
    setState(prev => ({ ...prev, sectorFilter: null, recsUniverse: null, recsSourceRegion: null, recsSource: null }))
  }, [])

  const clearAnalyserContext = useCallback(() => {
    setState(prev => ({ 
      ...prev, 
      analyserTicker: null,
      analyserSource: null,
    }))
  }, [])

  const addToWatchlist = useCallback((ticker: string, name?: string) => {
    setState(prev => {
      if (prev.watchlist.some(e => e.ticker === ticker)) return prev
      const newItem: WatchlistItem = { ticker, name: name ?? ticker, addedAt: Date.now() }
      const updated = [...prev.watchlist, newItem]
      watchlistService.saveItems(updated).catch(err =>
        console.warn('[watchlist] save failed', err)
      )
      return { ...prev, watchlist: updated }
    })
  }, [])

  const removeFromWatchlist = useCallback((ticker: string) => {
    setState(prev => {
      const updated = prev.watchlist.filter(e => e.ticker !== ticker)
      watchlistService.saveItems(updated).catch(err =>
        console.warn('[watchlist] save failed', err)
      )
      return { ...prev, watchlist: updated }
    })
  }, [])

  // Load watchlist from DynamoDB on mount
  useEffect(() => {
    watchlistService.getItems()
      .then(items => setState(prev => ({ ...prev, watchlist: items })))
      .catch(err => console.warn('[watchlist] load failed', err))
  }, [])

  useEffect(() => {
    stockAnalyserSettingsService.getSettings()
      .then(settings => setState(prev => ({
        ...prev,
        showExplanatoryText: settings.explanatoryTextEnabled,
        defaultSearchMode: settings.defaultSearchMode,
        tabTextOverrides: {},
      })))
      .catch(err => console.warn('[stock-analyser-settings] load failed', err))
  }, [])

  const isOnWatchlist = useCallback((ticker: string) => {
    return state.watchlist.some(e => e.ticker === ticker)
  }, [state.watchlist])

  const isInPortfolio = useCallback((ticker: string) => {
    return state.portfolio.includes(ticker)
  }, [state.portfolio])

  // Active account is control-plane-owned (D7). Switching PUTs the selection;
  // a successful switch reloads so every account-scoped surface re-fetches with
  // the new X-Account-Id. On failure the store reverts and we stay put.
  const switchAccount = useCallback(async (accountId: string) => {
    if (accountId === storeActiveId) return
    try {
      await storeSwitchTo(accountId)
      if (typeof window !== 'undefined') window.location.reload()
    } catch {
      /* store reverted + logged; remain on the current account */
    }
  }, [storeSwitchTo, storeActiveId])

  const signOut = useCallback(() => {
    onSignOut?.()
  }, [onSignOut])

  const goToLaunchpad = useCallback(() => {
    onGoToLaunchpad?.()
  }, [onGoToLaunchpad])

  const setShowExplanatoryText = useCallback((show: boolean) => {
    setState(prev => ({
      ...prev,
      showExplanatoryText: show,
      tabTextOverrides: {}, // Clear all overrides when global setting changes
    }))
    stockAnalyserSettingsService.patchSettings({ explanatoryTextEnabled: show })
      .catch(err => console.warn('[stock-analyser-settings] save failed', err))
  }, [])

  const setDefaultSearchMode = useCallback((mode: SearchMode) => {
    setState(prev => ({ ...prev, defaultSearchMode: mode }))
    stockAnalyserSettingsService.patchSettings({ defaultSearchMode: mode })
      .catch(err => console.warn('[stock-analyser-settings] save failed', err))
  }, [])

  const setTabTextOverride = useCallback((tab: TabId, show: boolean) => {
    setState(prev => ({
      ...prev,
      tabTextOverrides: { ...prev.tabTextOverrides, [tab]: show },
    }))
  }, [])

  const getTabTextVisibility = useCallback((tab: TabId) => {
    return state.tabTextOverrides[tab] ?? state.showExplanatoryText
  }, [state.tabTextOverrides, state.showExplanatoryText])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const setTabCache = useCallback((tab: TabId, data: any) => {
    setState(prev => ({
      ...prev,
      tabCache: { ...prev.tabCache, [tab]: data },
    }))
  }, [])

  const getTabCache = useCallback((tab: TabId) => {
    return state.tabCache[tab] ?? null
  }, [state.tabCache])

  // Override the placeholder user with the live identity + control-plane account set.
  // name/email come from the authenticated user (auth client's resolved display name
  // — control-plane displayName via the token, #501); DEFAULT_USER is only a
  // pre-hydration fallback. accounts/activeAccountId come from the active-account store.
  const user: User = {
    ...state.user,
    name: authUser?.name ?? state.user.name,
    email: authUser?.email ?? state.user.email,
    accounts: storeAccounts.map(a => ({ id: a.accountId, name: a.name ?? a.accountId, type: 'Personal' as const })),
    activeAccountId: storeActiveId ?? '',
  }

  const value: NavigationContextValue = {
    ...state,
    user,
    navigateTo,
    navigateToRecsWithSector,
    navigateToAnalyser,
    clearSectorFilter,
    clearAnalyserContext,
    addToWatchlist,
    removeFromWatchlist,
    isOnWatchlist,
    watchlistEntries: state.watchlist,
    isInPortfolio,
    switchAccount,
    signOut,
    goToLaunchpad,
    setShowExplanatoryText,
    setTabTextOverride,
    getTabTextVisibility,
    setDefaultSearchMode,
    setTabCache,
    getTabCache,
  }

  return (
    <NavigationContext.Provider value={value}>
      {children}
    </NavigationContext.Provider>
  )
}

// ============================================================================
// MOBILE NAV
// ============================================================================

export function MobileNav() {
  const { activeTab, navigateTo } = useNavigation()
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
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            onClick={() => navigateTo(item.id)}
            className={cn(
              "flex flex-col items-center justify-center gap-0.5 w-12 py-1 transition-colors",
              activeTab === item.id
                ? "text-brand-teal"
                : isDark
                  ? "text-brand-navy/60"
                  : "text-brand-navy-foreground/70",
            )}
          >
            <item.icon className="size-5" />
            <span className="text-[10px] font-medium">{item.label}</span>
          </button>
        ))}
      </div>
    </nav>
  )
}

// ============================================================================
// USER HEADER (Mobile)
// ============================================================================

export function UserHeader() {
  const { user, switchAccount, signOut, goToLaunchpad, navigateTo, showExplanatoryText, setShowExplanatoryText } = useNavigation()
  const { resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const isDark = mounted && resolvedTheme === "dark"
  const [accountMenuOpen, setAccountMenuOpen] = useState(false)
  const [profileMenuOpen, setProfileMenuOpen] = useState(false)
  const [signOutConfirm, setSignOutConfirm] = useState(false)
  
  const activeAccount = user.accounts.find(a => a.id === user.activeAccountId)
  const initials = userInitials(user)   // first name from given_name, never the email (#494)
  const firstName = userFirstName(user)
  const barText = isDark ? "text-brand-navy" : "text-brand-navy-foreground"
  const barMuted = isDark ? "text-brand-navy/60" : "text-brand-navy-foreground/60"
  const barButton = isDark
    ? "bg-brand-navy/10 text-brand-navy hover:bg-brand-navy/20"
    : "bg-white/10 text-brand-navy-foreground hover:bg-white/20"

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
              {activeAccount?.name}
              <ChevronDown className={cn("size-3 transition-transform", accountMenuOpen && "rotate-180")} />
            </button>
            
            {accountMenuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setAccountMenuOpen(false)} />
                <div className="absolute left-0 top-full mt-1 w-48 bg-card border border-border rounded-lg shadow-xl z-50 overflow-hidden">
                  {user.accounts.map((account) => (
                    <button
                      key={account.id}
                      onClick={() => { switchAccount(account.id); setAccountMenuOpen(false) }}
                      className={cn(
                        "w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-surface2 transition-colors",
                        account.id === user.activeAccountId && "bg-primary/5"
                      )}
                    >
                      <span className="text-foreground">{account.name}</span>
                      {account.id === user.activeAccountId && <Check className="size-4 text-primary" />}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
      
      {/* Profile Menu */}
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
                onClick={() => { setProfileMenuOpen(false); goToLaunchpad() }}
                className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-foreground hover:bg-surface2 transition-colors"
              >
                <Home className="size-4 text-muted-foreground" />
                Back to Launchpad
              </button>
              <button
                onClick={() => { setProfileMenuOpen(false); navigateTo("settings") }}
                className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-foreground hover:bg-surface2 transition-colors"
              >
                <Settings className="size-4 text-muted-foreground" />
                Settings
              </button>
              <button 
                onClick={() => setShowExplanatoryText(!showExplanatoryText)}
                className="w-full flex items-center justify-between px-3 py-2.5 text-sm text-foreground hover:bg-surface2 transition-colors"
              >
                <span className="flex items-center gap-2">
                  <FileText className="size-4 text-muted-foreground" />
                  Analysis text
                </span>
                <span className={cn(
                  "text-[10px] font-medium px-1.5 py-0.5 rounded",
                  showExplanatoryText ? "bg-signal-green/15 text-signal-green" : "bg-muted/30 text-muted-foreground"
                )}>
                  {showExplanatoryText ? "On" : "Off"}
                </span>
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
        onConfirm={() => { setSignOutConfirm(false); signOut() }}
        onCancel={() => setSignOutConfirm(false)}
      />
    </div>
  )
}

// ============================================================================
// DESKTOP SIDEBAR
// ============================================================================

export function DesktopSidebar() {
  const { activeTab, navigateTo, user, switchAccount, signOut, goToLaunchpad, showExplanatoryText, setShowExplanatoryText } = useNavigation()
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const isDark = mounted && resolvedTheme === "dark"
  const [accountMenuOpen, setAccountMenuOpen] = useState(false)
  const [signOutConfirm, setSignOutConfirm] = useState(false)
  
  const activeAccount = user.accounts.find(a => a.id === user.activeAccountId)
  const initials = userInitials(user)   // first name from given_name, never the email (#494)
  const firstName = userFirstName(user)
  const railBg = isDark ? "bg-card border-r border-border" : "bg-brand-navy"
  const railText = isDark ? "text-foreground" : "text-brand-navy-foreground"
  const railMuted = isDark ? "text-muted-foreground" : "text-brand-navy-foreground/60"
  const railBorder = isDark ? "border-border" : "border-white/10"
  const railIdle = isDark
    ? "text-muted-foreground hover:bg-surface2 hover:text-foreground"
    : "text-brand-navy-foreground/80 hover:bg-white/10 hover:text-brand-navy-foreground"

  return (
    <aside className={cn("hidden md:flex flex-col w-56 h-screen fixed left-0 top-0", railBg)}>
      {/* Logo */}
      <div className={cn("px-4 py-5 border-b", railBorder)}>
        <BrandLogo surface="navy" priority className="flex w-full" imgClassName="h-auto w-full max-w-none" />
      </div>

      {/* Back to Launchpad */}
      <button
        onClick={goToLaunchpad}
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
        <h2 className={cn("font-display text-xs font-semibold uppercase tracking-wider", railMuted)}>
          Stock Analyser
        </h2>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-1">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            onClick={() => navigateTo(item.id)}
            className={cn(
              "w-full flex items-center gap-3 px-5 py-2.5 text-sm font-medium transition-colors",
              activeTab === item.id
                ? "text-brand-teal bg-brand-teal/10 border-r-2 border-brand-teal"
                : railIdle,
            )}
          >
            <item.icon className="size-5" />
            <span>{item.label}</span>
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
                <span className="truncate">{activeAccount?.name}</span>
                <ChevronDown className={cn("size-3 shrink-0 transition-transform", accountMenuOpen && "rotate-180")} />
              </button>
              
              {accountMenuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setAccountMenuOpen(false)} />
                  <div className="absolute left-0 bottom-full mb-1 w-48 bg-card border border-border rounded-lg shadow-xl z-50 overflow-hidden">
                    <div className="px-3 py-2 border-b border-border">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Switch account</p>
                    </div>
                    {user.accounts.map((account) => (
                      <button
                        key={account.id}
                        onClick={() => { switchAccount(account.id); setAccountMenuOpen(false) }}
                        className={cn(
                          "w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-surface2 transition-colors",
                          account.id === user.activeAccountId && "bg-primary/5"
                        )}
                      >
                        <span className="text-foreground">{account.name}</span>
                        {account.id === user.activeAccountId && <Check className="size-4 text-primary" />}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
        
        {/* Theme Toggle */}
        <button
          onClick={() => setTheme(isDark ? "light" : "dark")}
          aria-label={mounted ? `Switch to ${isDark ? "light" : "dark"} theme` : "Toggle theme"}
          className={cn("w-full flex items-center justify-between px-2 py-2 rounded-lg text-xs transition-colors", railIdle)}
        >
          <span className="flex items-center gap-2">
            {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
            Theme
          </span>
          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-brand-teal/15 text-brand-teal">
            {mounted ? (isDark ? "Dark" : "Light") : "Theme"}
          </span>
        </button>

        {/* Analysis Text Toggle */}
        <button
          onClick={() => setShowExplanatoryText(!showExplanatoryText)}
          className={cn("w-full flex items-center justify-between px-2 py-2 rounded-lg text-xs transition-colors", railIdle)}
        >
          <span className="flex items-center gap-2">
            <FileText className="size-4" />
            Analysis text
          </span>
          <span className={cn(
            "text-[10px] font-medium px-1.5 py-0.5 rounded",
            showExplanatoryText ? "bg-signal-green/15 text-signal-green" : "bg-muted/30 text-muted-foreground"
          )}>
            {showExplanatoryText ? "On" : "Off"}
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
        onConfirm={() => { setSignOutConfirm(false); signOut() }}
        onCancel={() => setSignOutConfirm(false)}
      />
    </aside>
  )
}

// ============================================================================
// APP SHELL
// ============================================================================

export function AppShell({ 
  children 
}: { 
  children: ReactNode 
}) {
  return (
    <div className="min-h-screen bg-background">
      <DesktopSidebar />
      {/* Mobile User Header */}
      <UserHeader />
      <main className="md:ml-56 pb-20 md:pb-8">
        <div className="w-full px-4 md:px-6 lg:px-8">
          {children}
        </div>
      </main>
      <MobileNav />
    </div>
  )
}
