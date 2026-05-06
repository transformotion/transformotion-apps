import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User, Account, AuthTokens } from '@transformotion/auth-client'
import { authService } from '@/lib/services/auth'

interface AuthState {
  user:           User | null
  currentAccount: Account | null
  accounts:       Account[]
  tokens:         AuthTokens | null
  isAuthenticated: boolean
  isLoading:      boolean
  error:          string | null

  initialize:     () => Promise<void>
  signIn:         (email: string, password: string) => Promise<void>
  signUp:         (email: string, password: string, name: string) => Promise<void>
  signOut:        () => Promise<void>
  switchAccount:  (accountId: string) => Promise<void>
  refreshTokens:  () => Promise<void>
  clearError:     () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user:            null,
      currentAccount:  null,
      accounts:        [],
      tokens:          null,
      isAuthenticated: false,
      isLoading:       true,
      error:           null,

      initialize: async () => {
        try {
          const session = await authService.getSession()
          if (session) {
            const accounts = await authService.listAccounts()
            set({
              user:            session.user,
              currentAccount:  session.currentAccount,
              accounts,
              tokens:          session.tokens,
              isAuthenticated: true,
              isLoading:       false,
              error:           null,
            })
          } else {
            set({ isLoading: false })
          }
        } catch (error) {
          set({
            isLoading: false,
            error: error instanceof Error ? error.message : 'Failed to initialize auth',
          })
        }
      },

      signIn: async (email: string, password: string) => {
        set({ isLoading: true, error: null })
        try {
          const session  = await authService.signIn({ email, password })
          const accounts = await authService.listAccounts()
          set({
            user:            session.user,
            currentAccount:  session.currentAccount,
            accounts,
            tokens:          session.tokens,
            isAuthenticated: true,
            isLoading:       false,
          })
        } catch (error) {
          set({
            isLoading: false,
            error: error instanceof Error ? error.message : 'Sign in failed',
          })
          throw error
        }
      },

      signUp: async (email: string, password: string, name: string) => {
        set({ isLoading: true, error: null })
        try {
          const session  = await authService.signUp({ email, password, name })
          const accounts = await authService.listAccounts()
          set({
            user:            session.user,
            currentAccount:  session.currentAccount,
            accounts,
            tokens:          session.tokens,
            isAuthenticated: true,
            isLoading:       false,
          })
        } catch (error) {
          set({
            isLoading: false,
            error: error instanceof Error ? error.message : 'Sign up failed',
          })
          throw error
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
            tokens:          null,
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
          set({ currentAccount: session.currentAccount, tokens: session.tokens, isLoading: false })
        } catch (error) {
          set({
            isLoading: false,
            error: error instanceof Error ? error.message : 'Failed to switch account',
          })
          throw error
        }
      },

      refreshTokens: async () => {
        try {
          const tokens = await authService.refreshTokens()
          set({ tokens })
        } catch {
          await get().signOut()
        }
      },

      clearError: () => set({ error: null }),
    }),
    {
      name:       'auth-store',
      partialize: (state) => ({
        user:            state.user,
        currentAccount:  state.currentAccount,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
)

export const selectUser             = (state: AuthState) => state.user
export const selectCurrentAccount   = (state: AuthState) => state.currentAccount
export const selectIsAuthenticated  = (state: AuthState) => state.isAuthenticated
export const selectIsLoading        = (state: AuthState) => state.isLoading
