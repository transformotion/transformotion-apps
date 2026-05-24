/**
 * Zustand Stores
 * 
 * Central state management for all apps.
 * Stores call repositories for persistence.
 */

// Auth store (shared across all apps)
export { useAuthStore, selectUser, selectIsAuthenticated, selectIsLoading, selectIsInitialized } from './auth/use-auth-store'

// Stock Analyser store (to be created)
// export { useSignalStore } from './stock-analyser/use-signal-store'
