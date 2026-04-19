/**
 * Auth Store
 * 
 * Manages user authentication state.
 * Zustand store that wraps AuthService.
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User, Account, AuthSession, AuthTokens } from '@/lib/services/auth'
import { createMockAuthService } from '@/lib/services/auth/mock-auth'

interface AuthState {
  // State
  user: User | null
  currentAccount: Account | null
  accounts: Account[]
  tokens: AuthTokens | null
  isAuthenticated: boolean
  isLoading: boolean
  error: string | null

  // Actions
  initialize: () => Promise<void>
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string, name: string) => Promise<void>
  signOut: () => Promise<void>
  switchAccount: (accountId: string) => Promise<void>
  refreshTokens: () => Promise<void>
  clearError: () => void
}

// Auth service instance
const authService = createMockAuthService()

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      // Initial state
      user: null,
      currentAccount: null,
      accounts: [],
      tokens: null,
      isAuthenticated: false,
      isLoading: true,
      error: null,

      // Initialize from persisted session
      initialize: async () => {
        try {
          const session = await authService.getSession()
          if (session) {
            const accounts = await authService.listAccounts()
            set({
              user: session.user,
              currentAccount: session.currentAccount,
              accounts,
              tokens: session.tokens,
              isAuthenticated: true,
              isLoading: false,
              error: null,
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

      // Sign in
      signIn: async (email: string, password: string) => {
        set({ isLoading: true, error: null })
        try {
          const session = await authService.signIn({ email, password })
          const accounts = await authService.listAccounts()
          set({
            user: session.user,
            currentAccount: session.currentAccount,
            accounts,
            tokens: session.tokens,
            isAuthenticated: true,
            isLoading: false,
          })
        } catch (error) {
          set({
            isLoading: false,
            error: error instanceof Error ? error.message : 'Sign in failed',
          })
          throw error
        }
      },

      // Sign up
      signUp: async (email: string, password: string, name: string) => {
        set({ isLoading: true, error: null })
        try {
          const session = await authService.signUp({ email, password, name })
          const accounts = await authService.listAccounts()
          set({
            user: session.user,
            currentAccount: session.currentAccount,
            accounts,
            tokens: session.tokens,
            isAuthenticated: true,
            isLoading: false,
          })
        } catch (error) {
          set({
            isLoading: false,
            error: error instanceof Error ? error.message : 'Sign up failed',
          })
          throw error
        }
      },

      // Sign out
      signOut: async () => {
        set({ isLoading: true })
        try {
          await authService.signOut()
          set({
            user: null,
            currentAccount: null,
            accounts: [],
            tokens: null,
            isAuthenticated: false,
            isLoading: false,
            error: null,
          })
        } catch (error) {
          set({
            isLoading: false,
            error: error instanceof Error ? error.message : 'Sign out failed',
          })
        }
      },

      // Switch account
      switchAccount: async (accountId: string) => {
        set({ isLoading: true, error: null })
        try {
          const session = await authService.switchAccount(accountId)
          set({
            currentAccount: session.currentAccount,
            tokens: session.tokens,
            isLoading: false,
          })
        } catch (error) {
          set({
            isLoading: false,
            error: error instanceof Error ? error.message : 'Failed to switch account',
          })
          throw error
        }
      },

      // Refresh tokens
      refreshTokens: async () => {
        try {
          const tokens = await authService.refreshTokens()
          set({ tokens })
        } catch (error) {
          // Token refresh failed, sign out
          await get().signOut()
        }
      },

      // Clear error
      clearError: () => set({ error: null }),
    }),
    {
      name: 'auth-store',
      partialize: (state) => ({
        // Only persist essential session data
        user: state.user,
        currentAccount: state.currentAccount,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
)

// Selectors
export const selectUser = (state: AuthState) => state.user
export const selectCurrentAccount = (state: AuthState) => state.currentAccount
export const selectIsAuthenticated = (state: AuthState) => state.isAuthenticated
export const selectIsLoading = (state: AuthState) => state.isLoading
