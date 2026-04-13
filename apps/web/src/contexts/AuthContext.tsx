import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { getCurrentUser, fetchAuthSession, signOut as amplifySignOut } from 'aws-amplify/auth';
import { Hub } from 'aws-amplify/utils';

interface AuthUser {
  userId: string;
  username: string;
  email?: string;
  /** cognito:groups claim from the ID token — controls Launchpad and Lambda authoriser. */
  groups: string[];
  /**
   * The user's currently active account UUID (custom:active_account JWT claim).
   * Undefined for brand-new users who haven't completed first-login setup yet.
   */
  activeAccountId?: string;
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
  const [user, setUser]         = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadUser = useCallback(async () => {
    try {
      const { userId, username } = await getCurrentUser();
      // fetchAuthSession auto-refreshes the access token if it has expired
      const session = await fetchAuthSession();
      const payload = session.tokens?.idToken?.payload;

      // cognito:groups is a string array in the JWT payload
      const rawGroups = payload?.['cognito:groups'];
      const groups: string[] = Array.isArray(rawGroups) ? rawGroups as string[] : [];

      const activeAccountId = (payload?.['custom:active_account'] as string | undefined)?.trim() || undefined;

      setUser({
        userId,
        username,
        email:  (payload?.email as string | undefined) ?? undefined,
        groups,
        activeAccountId,
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
  // Keeps React state in sync if the user signed out in another tab or
  // if their group membership changed.
  useEffect(() => {
    async function handleFocus() {
      try {
        await fetchAuthSession({ forceRefresh: false });
        await loadUser();
      } catch {
        setUser(null);
      }
    }
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [loadUser]);

  // Hub listener — picks up social IDP sign-in after OAuth callback redirect.
  // Amplify fires 'signedIn' once the authorization code has been exchanged.
  useEffect(() => {
    const cancel = Hub.listen('auth', ({ payload }) => {
      if (payload.event === 'signedIn') {
        loadUser();
      } else if (payload.event === 'signedOut') {
        setUser(null);
        setIsLoading(false);
      }
    });
    return cancel;
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
