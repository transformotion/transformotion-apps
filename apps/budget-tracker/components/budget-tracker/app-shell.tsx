"use client"

import { createContext, useContext, useState, useCallback, useRef, useEffect, type ReactNode } from "react"
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
import type { Transaction, CustomRule, BudgetSettings, BudgetTabId, TransactionFilters } from "./data/types"
import { DEFAULT_BUILTIN_RULES, type BuiltinRule } from "./data/builtin-rules"

// ============================================================================
// TYPES
// ============================================================================

export interface Account {
  id: string
  name: string
  type: "Personal" | "Household" | "Business"
}

export interface BudgetUser {
  name: string
  email: string
  avatar?: string
  accounts: Account[]
  activeAccountId: string
}

export interface BudgetNavigationState {
  activeTab: BudgetTabId
  // Transaction data
  transactions: Transaction[]
  // Rules
  customRules: CustomRule[]
  builtinRules: BuiltinRule[]
  // Settings
  settings: BudgetSettings
  // User state
  user: BudgetUser
  // UI state
  uncategorizedCount: number
  // Transaction filters (persisted across tab navigation)
  transactionFilters: TransactionFilters
}

export interface BudgetNavigationActions {
  navigateTo: (tab: BudgetTabId) => void
  setTransactions: (transactions: Transaction[]) => void
  addTransactions: (transactions: Transaction[]) => void
  updateTransaction: (id: string, updates: Partial<Transaction>) => void
  deleteTransaction: (id: string) => void
  setCustomRules: (rules: CustomRule[]) => void
  addCustomRule: (rule: CustomRule) => void
  updateCustomRule: (id: string, updates: Partial<CustomRule>) => void
  deleteCustomRule: (id: string) => void
  setBuiltinRules: (rules: BuiltinRule[]) => void
  updateBuiltinRule: (id: string, updates: Partial<BuiltinRule>) => void
  addBuiltinRule: (rule: BuiltinRule) => void
  updateSettings: (updates: Partial<BudgetSettings>) => void
  setTransactionFilters: (filtersOrUpdater: TransactionFilters | ((prev: TransactionFilters) => TransactionFilters)) => void
  switchAccount: (accountId: string) => void
  signOut: () => void
  goToLaunchpad: () => void
}

interface BudgetNavigationContextValue extends BudgetNavigationState, BudgetNavigationActions {
  customRulesRef: React.MutableRefObject<CustomRule[]>
}

// ============================================================================
// CONTEXT
// ============================================================================

const BudgetNavigationContext = createContext<BudgetNavigationContextValue | null>(null)

export function useBudgetNavigation() {
  const context = useContext(BudgetNavigationContext)
  if (!context) {
    throw new Error("useBudgetNavigation must be used within BudgetNavigationProvider")
  }
  return context
}

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
// LOCALSTORAGE KEYS
// ============================================================================

const STORAGE_KEYS = {
  transactions: "budget-tracker-transactions",
  customRules: "budget-tracker-custom-rules",
  builtinRules: "budget-tracker-builtin-rules",
  settings: "budget-tracker-settings",
  transactionFilters: "budget-tracker-transaction-filters",
} as const

const DEFAULT_TRANSACTION_FILTERS: TransactionFilters = {
  dateRange: null,
  category: null,
  subcategory: null,
  bankAccount: null,
  source: null,
  businessFilter: "all",
  uncategorizedOnly: false,
}

// ============================================================================
// NAVIGATION PROVIDER
// ============================================================================

const DEFAULT_USER: BudgetUser = {
  name: "Steve Moodie",
  email: "steve@example.com",
  accounts: [
    { id: "1", name: "Steve's Account", type: "Personal" },
    { id: "2", name: "Steve & Liz Household", type: "Household" },
  ],
  activeAccountId: "2",
}

const DEFAULT_SETTINGS: BudgetSettings = {
  budgetOverrides: {},
  budgetFreqs: {},
  customCategories: {},
  deletedCategories: [],
  customTopCategories: [],
  projectBudgets: {},
  projectTasks: {},
  customProjectCategories: [],
  deletedProjectCategories: [],
  disabledProjectCategories: [],
}

// Helper to load from localStorage
function loadFromStorage<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback
  try {
    const stored = localStorage.getItem(key)
    if (stored) {
      return JSON.parse(stored) as T
    }
  } catch (e) {
    console.error(`Failed to load ${key} from localStorage:`, e)
  }
  return fallback
}

// Helper to save to localStorage
function saveToStorage<T>(key: string, value: T): void {
  if (typeof window === "undefined") return
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch (e) {
    console.error(`Failed to save ${key} to localStorage:`, e)
  }
}

export function BudgetNavigationProvider({ 
  children,
  initialTab = "transactions",
  onSignOut,
  onGoToLaunchpad,
}: { 
  children: ReactNode
  initialTab?: BudgetTabId
  onSignOut?: () => void
  onGoToLaunchpad?: () => void
}) {
  // Initialize with empty state for SSR, then hydrate from localStorage
  const [state, setState] = useState<BudgetNavigationState>({
    activeTab: initialTab,
    transactions: [],
    customRules: [],
    builtinRules: DEFAULT_BUILTIN_RULES,
    settings: DEFAULT_SETTINGS,
    transactionFilters: DEFAULT_TRANSACTION_FILTERS,
    user: DEFAULT_USER,
    uncategorizedCount: 0,
  })

  // Hydrate from localStorage on client mount
  const [isHydrated, setIsHydrated] = useState(false)
  useEffect(() => {
    const transactions = loadFromStorage<Transaction[]>(STORAGE_KEYS.transactions, [])
    const customRules = loadFromStorage<CustomRule[]>(STORAGE_KEYS.customRules, [])
    const storedBuiltinRules = loadFromStorage<BuiltinRule[] | null>(STORAGE_KEYS.builtinRules, null)
    const builtinRules = storedBuiltinRules ?? DEFAULT_BUILTIN_RULES
    const settings = loadFromStorage<BudgetSettings>(STORAGE_KEYS.settings, DEFAULT_SETTINGS)
    const transactionFilters = loadFromStorage<TransactionFilters>(STORAGE_KEYS.transactionFilters, DEFAULT_TRANSACTION_FILTERS)
    const uncategorizedCount = transactions.filter(t => !t.category).length
    
    setState({
      activeTab: initialTab,
      transactions,
      customRules,
      builtinRules,
      settings,
      transactionFilters,
      user: DEFAULT_USER,
      uncategorizedCount,
    })
    setIsHydrated(true)
  }, [initialTab])

  // Persist transactions to localStorage when they change (only after hydration)
  useEffect(() => {
    if (isHydrated) saveToStorage(STORAGE_KEYS.transactions, state.transactions)
  }, [isHydrated, state.transactions])

  // Persist custom rules to localStorage when they change
  useEffect(() => {
    if (isHydrated) saveToStorage(STORAGE_KEYS.customRules, state.customRules)
  }, [isHydrated, state.customRules])

  // Persist built-in rules to localStorage when they change
  useEffect(() => {
    if (isHydrated) saveToStorage(STORAGE_KEYS.builtinRules, state.builtinRules)
  }, [isHydrated, state.builtinRules])

  // Persist settings to localStorage when they change
  useEffect(() => {
    if (isHydrated) saveToStorage(STORAGE_KEYS.settings, state.settings)
  }, [isHydrated, state.settings])

  // Persist transaction filters to localStorage when they change
  useEffect(() => {
    if (isHydrated) saveToStorage(STORAGE_KEYS.transactionFilters, state.transactionFilters)
  }, [isHydrated, state.transactionFilters])

  // Ref to avoid stale closure issues with custom rules
  const customRulesRef = useRef<CustomRule[]>([])
  // Keep ref in sync with state (outside useEffect to avoid timing issues)
  customRulesRef.current = state.customRules

  const navigateTo = useCallback((tab: BudgetTabId) => {
    setState(prev => ({ ...prev, activeTab: tab }))
  }, [])

  const setTransactions = useCallback((transactions: Transaction[]) => {
    const uncategorizedCount = transactions.filter(t => !t.category).length
    setState(prev => ({ ...prev, transactions, uncategorizedCount }))
  }, [])

  const addTransactions = useCallback((newTransactions: Transaction[]) => {
    setState(prev => {
      const updated = [...prev.transactions, ...newTransactions]
      const uncategorizedCount = updated.filter(t => !t.category).length
      return { ...prev, transactions: updated, uncategorizedCount }
    })
  }, [])

  const updateTransaction = useCallback((id: string, updates: Partial<Transaction>) => {
    setState(prev => {
      const updated = prev.transactions.map(t => 
        t.transactionId === id ? { ...t, ...updates } : t
      )
      const uncategorizedCount = updated.filter(t => !t.category).length
      return { ...prev, transactions: updated, uncategorizedCount }
    })
  }, [])

  const deleteTransaction = useCallback((id: string) => {
    setState(prev => {
      const updated = prev.transactions.filter(t => t.transactionId !== id)
      const uncategorizedCount = updated.filter(t => !t.category).length
      return { ...prev, transactions: updated, uncategorizedCount }
    })
  }, [])

  const setCustomRules = useCallback((rules: CustomRule[]) => {
    setState(prev => ({ ...prev, customRules: rules }))
  }, [])

  const addCustomRule = useCallback((rule: CustomRule) => {
    setState(prev => ({ ...prev, customRules: [...prev.customRules, rule] }))
  }, [])

  const updateCustomRule = useCallback((id: string, updates: Partial<CustomRule>) => {
    setState(prev => ({
      ...prev,
      customRules: prev.customRules.map(r => r.ruleId === id ? { ...r, ...updates } : r)
    }))
  }, [])

  const deleteCustomRule = useCallback((id: string) => {
    setState(prev => ({
      ...prev,
      customRules: prev.customRules.filter(r => r.ruleId !== id)
    }))
  }, [])

  const setBuiltinRules = useCallback((rules: BuiltinRule[]) => {
    setState(prev => ({ ...prev, builtinRules: rules }))
  }, [])

  const updateBuiltinRule = useCallback((id: string, updates: Partial<BuiltinRule>) => {
    setState(prev => ({
      ...prev,
      builtinRules: prev.builtinRules.map(r => r.id === id ? { ...r, ...updates } : r)
    }))
  }, [])

  const addBuiltinRule = useCallback((rule: BuiltinRule) => {
    setState(prev => ({ ...prev, builtinRules: [...prev.builtinRules, rule] }))
  }, [])

  const updateSettings = useCallback((updates: Partial<BudgetSettings>) => {
    setState(prev => ({
      ...prev,
      settings: { ...prev.settings, ...updates }
    }))
  }, [])

  const setTransactionFilters = useCallback((filtersOrUpdater: TransactionFilters | ((prev: TransactionFilters) => TransactionFilters)) => {
    setState(prev => ({
      ...prev,
      transactionFilters: typeof filtersOrUpdater === 'function' 
        ? filtersOrUpdater(prev.transactionFilters)
        : filtersOrUpdater
    }))
  }, [])

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

  const value: BudgetNavigationContextValue = {
    ...state,
    customRulesRef,
    navigateTo,
    setTransactions,
    addTransactions,
    updateTransaction,
    deleteTransaction,
    setCustomRules,
    addCustomRule,
    updateCustomRule,
    deleteCustomRule,
    setBuiltinRules,
    updateBuiltinRule,
    addBuiltinRule,
    updateSettings,
    setTransactionFilters,
    switchAccount,
    signOut,
    goToLaunchpad,
  }

  return (
    <BudgetNavigationContext.Provider value={value}>
      {children}
    </BudgetNavigationContext.Provider>
  )
}

// ============================================================================
// MOBILE NAV
// ============================================================================

export function BudgetMobileNav() {
  const { activeTab, navigateTo, uncategorizedCount } = useBudgetNavigation()

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-card/95 backdrop-blur-sm border-t border-border md:hidden z-50 safe-area-inset-bottom">
      <div className="flex items-center justify-around h-16">
        {BUDGET_NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            onClick={() => navigateTo(item.id)}
            className={cn(
              "relative flex flex-col items-center justify-center gap-0.5 w-12 py-1 transition-colors",
              activeTab === item.id ? "text-primary" : "text-muted-foreground"
            )}
          >
            <item.icon className="size-5" />
            <span className="text-[10px] font-medium">{item.label}</span>
            {/* Badge for Review tab showing uncategorized count */}
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

export function BudgetUserHeader() {
  const { user, switchAccount, signOut, goToLaunchpad } = useBudgetNavigation()
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

export function BudgetDesktopSidebar() {
  const { activeTab, navigateTo, user, switchAccount, signOut, goToLaunchpad, uncategorizedCount } = useBudgetNavigation()
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
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Budget Tracker</h2>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-1">
        {BUDGET_NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            onClick={() => navigateTo(item.id)}
            className={cn(
              "relative w-full flex items-center gap-3 px-5 py-2.5 text-sm font-medium transition-colors",
              activeTab === item.id
                ? "text-primary bg-primary/10 border-r-2 border-primary"
                : "text-muted-foreground hover:text-foreground hover:bg-surface2"
            )}
          >
            <item.icon className="size-5" />
            <span>{item.label}</span>
            {/* Badge for Review tab */}
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

export function BudgetAppShell({ 
  children 
}: { 
  children: ReactNode 
}) {
  return (
    <div className="min-h-screen bg-background">
      <BudgetDesktopSidebar />
      {/* Mobile User Header */}
      <BudgetUserHeader />
      <main className="md:ml-56 pb-20 md:pb-8 overflow-x-hidden">
        <div className="w-full px-4 md:px-6 lg:px-8">
          {children}
        </div>
      </main>
      <BudgetMobileNav />
    </div>
  )
}
