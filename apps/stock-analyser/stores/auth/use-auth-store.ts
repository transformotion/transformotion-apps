/**
 * Auth Store
 *
 * Manages user authentication state using real Cognito auth.
 * Data adaptors (cache, portfolio, watchlist) are separate from auth and
 * are controlled by NEXT_PUBLIC_USE_MOCK_DATA.
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { cognitoAuth } from '@/lib/services/auth/cognito-auth'

export interface AuthUser {
  id:        string
  email:     string
  name:      string
  avatarUrl?: string
}

interface AuthState {
  // State
  user:            AuthUser | null
  isAuthenticated: boolean
  isLoading:       boolean
  isInitialized:   boolean
  error:           string | null

  // Actions
  initialize:  () => Promise<void>
  signIn:      (email: string, password: string) => Promise<void>
  signOut:     () => Promise<void>
  clearError:  () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      // Initial state
      user:            null,
      isAuthenticated: false,
      isLoading:       false,
      isInitialized:   false,
      error:           null,

      // Check existing Cognito session on app load
      initialize: async () => {
        set({ isLoading: true })
        try {
          const cognitoUser = await cognitoAuth.getCurrentUser()
          if (cognitoUser) {
            set({
              user: {
                id:    cognitoUser.id,
                email: cognitoUser.email,
                name:  [cognitoUser.givenName, cognitoUser.familyName].filter(Boolean).join(' ') || cognitoUser.email,
              },
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

      signIn: async (email: string, password: string) => {
        set({ isLoading: true, error: null })
        try {
          const { isSignedIn, nextStep } = await cognitoAuth.signIn(email, password)
          if (!isSignedIn) {
            throw new Error(`Additional step required: ${nextStep.signInStep}`)
          }
          const cognitoUser = await cognitoAuth.getCurrentUser()
          if (!cognitoUser) throw new Error('Could not retrieve user after sign in')
          set({
            user: {
              id:    cognitoUser.id,
              email: cognitoUser.email,
              name:  [cognitoUser.givenName, cognitoUser.familyName].filter(Boolean).join(' ') || cognitoUser.email,
            },
            isAuthenticated: true,
            isLoading:       false,
            isInitialized:   true,
            error:           null,
          })
        } catch (error) {
          set({
            isLoading: false,
            error: error instanceof Error ? error.message : 'Sign in failed',
          })
          throw error
        }
      },

      signOut: async () => {
        set({ isLoading: true })
        try {
          await cognitoAuth.signOut()
        } finally {
          set({
            user:            null,
            isAuthenticated: false,
            isLoading:       false,
            error:           null,
          })
        }
      },

      clearError: () => set({ error: null }),
    }),
    {
      name: 'auth-store',
      partialize: (state) => ({
        // Only persist the user display info — Amplify manages the real session
        user:            state.user,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
)

// Selectors
export const selectUser            = (state: AuthState) => state.user
export const selectIsAuthenticated = (state: AuthState) => state.isAuthenticated
export const selectIsLoading       = (state: AuthState) => state.isLoading
export const selectIsInitialized   = (state: AuthState) => state.isInitialized
