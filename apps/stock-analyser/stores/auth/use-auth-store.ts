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
  signIn:      (email: string, password: string) => Promise<void>
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

      signIn: async (email: string, password: string) => {
        set({ isLoading: true, error: null })
        try {
          const session = await authService.signIn({ email, password })
          set({
            user:            session.user,
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
          await authService.signOut()
        } finally {
          set({ user: null, isAuthenticated: false, isLoading: false, error: null })
        }
      },

      clearError: () => set({ error: null }),
    }),
    {
      name:       'auth-store',
      version:    1,
      partialize: (state) => ({ user: state.user }),
    }
  )
)

export const selectUser            = (state: AuthState) => state.user
export const selectIsAuthenticated = (state: AuthState) => state.isAuthenticated
export const selectIsLoading       = (state: AuthState) => state.isLoading
export const selectIsInitialized   = (state: AuthState) => state.isInitialized
