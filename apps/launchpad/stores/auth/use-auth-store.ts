import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User } from '@transformotion/auth-client'
import { authService } from '@/lib/services/auth'
import { setupAccount } from '@/lib/services/account-onboarding'
import { getConfig } from '@/lib/config'

/**
 * Ensure the caller's `launchpad-users` row exists on first authenticated load
 * (#496). `/auth/setup` is the canonical user-row writer; its client wrapper was
 * never wired, so federated redeemers (and anyone who joined without later editing
 * a preference) had no row and were invisible in the admin Users & Access list.
 *
 * Fire-and-forget so it never blocks or breaks sign-in, and idempotent
 * server-side (attribute_not_exists) — a cheap no-op once the row exists. Gated on
 * a configured control plane so mock/dev doesn't fetch a dead URL. The `.catch`
 * LOGS rather than silently swallows: a PERSISTENT failure would keep users
 * invisible in the directory, which must be diagnosable (self-healing on the next
 * load is fine; a silent permanent failure is not).
 */
function bootstrapUserRow(): void {
  if (!getConfig().controlPlane.apiUrl) return
  authService
    .getIdToken()
    .then((idToken) => (idToken ? setupAccount(idToken) : null))
    .catch((err) =>
      console.warn(
        '[launchpad] /auth/setup bootstrap failed — this user may be missing from the admin Users & Access list until the next load (#496):',
        err,
      ),
    )
}

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
            bootstrapUserRow() // #496 — ensure the launchpad-users row exists (non-blocking)
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
      name:       'launchpad-auth',
      version:    1,
      partialize: (state) => ({ user: state.user }),
    }
  )
)

export const selectUser            = (state: AuthState) => state.user
export const selectIsAuthenticated = (state: AuthState) => state.isAuthenticated
export const selectIsLoading       = (state: AuthState) => state.isLoading
export const selectIsInitialized   = (state: AuthState) => state.isInitialized
