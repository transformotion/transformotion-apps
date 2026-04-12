import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { getCurrentUser, fetchAuthSession, signOut as amplifySignOut } from 'aws-amplify/auth';

interface AuthUser {
  userId: string;
  username: string;
  email?: string;
}

interface AuthState {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  /** Call after successful sign-in to refresh auth state. */
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadUser = useCallback(async () => {
    try {
      const { userId, username } = await getCurrentUser();
      // fetchAuthSession auto-refreshes the access token if it has expired
      const session = await fetchAuthSession();
      const payload = session.tokens?.idToken?.payload;
      setUser({
        userId,
        username,
        email: (payload?.email as string | undefined) ?? undefined,
      });
    } catch {
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial session check on mount
  useEffect(() => {
    loadUser();
  }, [loadUser]);

  // Silently refresh the Cognito session when the tab regains focus.
  // Amplify handles the actual token rotation; this just keeps our React
  // state in sync (e.g. if the user signed out in another tab).
  useEffect(() => {
    async function handleFocus() {
      try {
        await fetchAuthSession({ forceRefresh: false });
        // If we get here the session is still valid — re-check user in case
        // Cognito attributes changed (e.g. account switcher in another tab)
        await loadUser();
      } catch {
        // Session expired or revoked — clear user
        setUser(null);
      }
    }

    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [loadUser]);

  const signOut = useCallback(async () => {
    await amplifySignOut();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{
      user,
      isAuthenticated: user !== null,
      isLoading,
      refresh: loadUser,
      signOut,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
