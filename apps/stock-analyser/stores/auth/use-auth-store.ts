import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User } from '@transformotion/auth-client'
import { authService } from '@/lib/services/auth'

interface AuthState {
  user:            User | null
  isAuthenticated: boolean
  isLoading:       boolean
  isInitialized:   boolean
  error:           string | null

  initialize:  () => Promise<void>
  signOut:     () => Promise<void>
  clearError:  () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user:            null,
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
            set({ user, isAuthenticated: true, isLoading: false, isInitialized: true, error: null })
          } else {
            set({ user: null, isAuthenticated: false, isLoading: false, isInitialized: true })
          }
        } catch {
          set({ user: null, isAuthenticated: false, isLoading: false, isInitialized: true })
        }
      },

      signOut: async () => {
        try {
          await authService.signOut()
          // Success: Cognito navigates the browser to /signed-out/. Page unloads.
        } catch (error) {
          // signOut failed — user is stuck. Reset so the auth guard redirects.
          set({ user: null, isAuthenticated: false, error: error instanceof Error ? error.message : 'Sign out failed' })
        }
      },

      clearError: () => set({ error: null }),
    }),
    {
      name:       'stock-analyser-auth',
      version:    1,
      partialize: (state) => ({ user: state.user }),
    }
  )
)

export const selectUser            = (state: AuthState) => state.user
export const selectIsAuthenticated = (state: AuthState) => state.isAuthenticated
export const selectIsLoading       = (state: AuthState) => state.isLoading
export const selectIsInitialized   = (state: AuthState) => state.isInitialized
