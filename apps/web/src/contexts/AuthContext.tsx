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
  /**
   * All account UUIDs the user belongs to (custom:accounts JWT claim, comma-separated).
   * Used by the account switcher to list available accounts.
   */
  accountIds: string[];
}

interface AuthState {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  /** Call after successful sign-in to refresh auth state. */
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
  /**
   * Switch the user's active account. Calls POST /auth/switch, then forces a
   * session refresh so the new custom:active_account claim flows into all
   * subsequent API requests.
   */
  switchAccount: (accountId: string) => Promise<void>;
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
      const accountsRaw     = (payload?.['custom:accounts']        as string | undefined)?.trim() || '';
      const accountIds      = accountsRaw ? accountsRaw.split(',').map(s => s.trim()).filter(Boolean) : [];

      setUser({
        userId,
        username,
        email:  (payload?.email as string | undefined) ?? undefined,
        groups,
        activeAccountId,
        accountIds,
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

  const switchAccount = useCallback(async (accountId: string) => {
    const session = await fetchAuthSession();
    const token   = session.tokens?.accessToken?.toString();
    if (!token) throw new Error('No access token');

    const baseUrl = import.meta.env.VITE_API_URL as string;
    const res = await fetch(`${baseUrl}auth/switch`, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ accountId }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as { message?: string };
      throw new Error(body.message ?? `Switch failed with status ${res.status}`);
    }

    // Force-refresh so the new custom:active_account claim is reflected in the JWT
    await fetchAuthSession({ forceRefresh: true });
    await loadUser();
  }, [loadUser]);

  return (
    <AuthContext.Provider value={{
      user,
      isAuthenticated: user !== null,
      isLoading,
      refresh: loadUser,
      signOut,
      switchAccount,
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
