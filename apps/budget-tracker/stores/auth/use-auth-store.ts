import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User, Account } from '@transformotion/auth-client'
import { authService } from '@/lib/services/auth'

interface AuthState {
  user:            User | null
  currentAccount:  Account | null
  accounts:        Account[]
  isAuthenticated: boolean
  isLoading:       boolean
  isInitialized:   boolean
  error:           string | null

  initialize:    () => Promise<void>
  signOut:       () => Promise<void>
  switchAccount: (accountId: string) => Promise<void>
  clearError:    () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user:            null,
      currentAccount:  null,
      accounts:        [],
      isAuthenticated: false,
      isLoading:       false,
      isInitialized:   false,
      error:           null,

      initialize: async () => {
        const state = get()
        if (state.isInitialized || state.isLoading) return
        set({ isLoading: true })
        try {
          const user = await authService.getCurrentUser()
          if (user) {
            const accounts = await authService.listAccounts()
            set({
              user,
              currentAccount:  accounts[0] ?? null,
              accounts,
              isAuthenticated: true,
              isLoading:       false,
              isInitialized:   true,
              error:           null,
            })
          } else {
            set({ user: null, isAuthenticated: false, isLoading: false, isInitialized: true })
          }
        } catch {
          set({ user: null, isAuthenticated: false, isLoading: false, isInitialized: true })
        }
      },

      signOut: async () => {
        set({ isLoading: true })
        try {
          await authService.signOut()
          set({
            user:            null,
            currentAccount:  null,
            accounts:        [],
            isAuthenticated: false,
            isLoading:       false,
            error:           null,
          })
        } catch (error) {
          set({
            isLoading: false,
            error: error instanceof Error ? error.message : 'Sign out failed',
          })
        }
      },

      switchAccount: async (accountId: string) => {
        set({ isLoading: true, error: null })
        try {
          const session = await authService.switchAccount(accountId)
          set({ currentAccount: session.currentAccount, isLoading: false })
        } catch (error) {
          set({
            isLoading: false,
            error: error instanceof Error ? error.message : 'Failed to switch account',
          })
          throw error
        }
      },

      clearError: () => set({ error: null }),
    }),
    {
      name:       'budget-tracker-auth',
      version:    1,
      partialize: (state) => ({
        user:            state.user,
        currentAccount:  state.currentAccount,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
)

export const selectUser            = (state: AuthState) => state.user
export const selectCurrentAccount  = (state: AuthState) => state.currentAccount
export const selectIsAuthenticated = (state: AuthState) => state.isAuthenticated
export const selectIsLoading       = (state: AuthState) => state.isLoading
export const selectIsInitialized   = (state: AuthState) => state.isInitialized
