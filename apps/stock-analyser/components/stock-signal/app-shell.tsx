"use client"

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react"
import { watchlistService, type WatchlistItem } from "@/lib/services/watchlist/watchlist-service"
import { cn } from "@/lib/utils"
import { Wordmark, BrandMark } from "@/components/brand/wordmark"
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
} from "lucide-react"
import { ConfirmationModal } from "@transformotion/ui-primitives"

// ============================================================================
// TYPES
// ============================================================================

export type TabId = "market" | "recs" | "etfs" | "metals" | "analyser" | "portfolio" | "watchlist"

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

export interface NavigationState {
  activeTab: TabId
  // Cross-screen navigation context
  sectorFilter: string | null
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
  // Cached API results per tab (persists between tab switches)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tabCache: Partial<Record<TabId, any>>
}

export interface NavigationActions {
  navigateTo: (tab: TabId) => void
  navigateToRecsWithSector: (sector: string) => void
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
  { id: "market", icon: BarChart3, label: "Market" },
  { id: "recs", icon: Star, label: "Recs" },
  { id: "etfs", icon: Layers, label: "ETFs" },
  { id: "metals", icon: Gem, label: "Metals" },
  { id: "analyser", icon: Search, label: "Analyser" },
  { id: "portfolio", icon: Briefcase, label: "Portfolio" },
  { id: "watchlist", icon: Eye, label: "Watchlist" },
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
    recsSource: null,
    analyserTicker: null,
    analyserSource: null,
    watchlist: [],
    portfolio: ["CBA.AX", "BHP.AX", "CSL.AX", "WDS.AX", "TLS.AX", "RIO.AX", "FMG.AX"],
    user: DEFAULT_USER,
    showExplanatoryText: true,
    tabTextOverrides: {},
    tabCache: {},
  })

  const navigateTo = useCallback((tab: TabId) => {
    setState(prev => ({ ...prev, activeTab: tab }))
  }, [])

  const navigateToRecsWithSector = useCallback((sector: string) => {
    setState(prev => ({
      ...prev,
      activeTab: "recs",
      sectorFilter: sector,
      recsSource: prev.activeTab,
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
    setState(prev => ({ ...prev, sectorFilter: null, recsSource: null }))
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

  const isOnWatchlist = useCallback((ticker: string) => {
    return state.watchlist.some(e => e.ticker === ticker)
  }, [state.watchlist])

  const isInPortfolio = useCallback((ticker: string) => {
    return state.portfolio.includes(ticker)
  }, [state.portfolio])

  const switchAccount = useCallback((accountId: string) => {
    setState(prev => ({
      ...prev,
      user: { ...prev.user, activeAccountId: accountId }
    }))
  }, [])

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

  const value: NavigationContextValue = {
    ...state,
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

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-card/95 backdrop-blur-sm border-t border-border md:hidden z-50 safe-area-inset-bottom">
      <div className="flex items-center justify-around h-16">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            onClick={() => navigateTo(item.id)}
            className={cn(
              "flex flex-col items-center justify-center gap-0.5 w-12 py-1 transition-colors",
              activeTab === item.id ? "text-primary" : "text-muted-foreground"
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
  const { user, switchAccount, signOut, goToLaunchpad, showExplanatoryText, setShowExplanatoryText } = useNavigation()
  const [accountMenuOpen, setAccountMenuOpen] = useState(false)
  const [profileMenuOpen, setProfileMenuOpen] = useState(false)
  const [signOutConfirm, setSignOutConfirm] = useState(false)
  
  const activeAccount = user.accounts.find(a => a.id === user.activeAccountId)
  const initials = user.name.split(' ').map(n => n[0]).join('')
  const firstName = user.name.split(' ')[0]

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
                onClick={() => { setProfileMenuOpen(false); goToLaunchpad() }}
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
  const [accountMenuOpen, setAccountMenuOpen] = useState(false)
  const [signOutConfirm, setSignOutConfirm] = useState(false)
  
  const activeAccount = user.accounts.find(a => a.id === user.activeAccountId)
  const initials = user.name.split(' ').map(n => n[0]).join('')
  const firstName = user.name.split(' ')[0]

  return (
    <aside className="hidden md:flex flex-col w-56 h-screen bg-card border-r border-border fixed left-0 top-0">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-border">
        <Wordmark size="md" />
      </div>

      {/* Back to Launchpad */}
      <button
        onClick={goToLaunchpad}
        className="mx-3 mt-3 flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-surface2 transition-colors"
      >
        <Home className="size-4" />
        <span>Launchpad</span>
      </button>

      {/* App Title */}
      <div className="px-5 py-3">
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Stock Signal</h2>
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
                ? "text-primary bg-primary/10 border-r-2 border-primary"
                : "text-muted-foreground hover:text-foreground hover:bg-surface2"
            )}
          >
            <item.icon className="size-5" />
            <span>{item.label}</span>
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
        
        {/* Analysis Text Toggle */}
        <button
          onClick={() => setShowExplanatoryText(!showExplanatoryText)}
          className="w-full flex items-center justify-between px-2 py-2 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-surface2 transition-colors"
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
