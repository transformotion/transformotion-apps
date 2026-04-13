import { useEffect, useRef, useState } from 'react';
import { fetchAuthSession } from 'aws-amplify/auth';
import { useAuth } from '../contexts/AuthContext';

/**
 * Handles the first-login setup flow.
 *
 * When an authenticated user has no activeAccountId in their JWT claims, this
 * hook calls POST /auth/setup to create their personal account and set the
 * Cognito custom:active_account attribute. It then forces a session refresh so
 * the new claim is reflected in the next fetchAuthSession call.
 *
 * The hook is idempotent — repeated calls are safe because the Lambda returns
 * the existing accountId if custom:active_account is already set.
 *
 * Returns:
 *   setupDone  — true once setup has completed (or was already complete)
 *   setupError — error message if setup failed
 */
export function useFirstLogin(): { setupDone: boolean; setupError: string | null } {
  const { user, isLoading, refresh } = useAuth();
  const [setupDone,  setSetupDone]  = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);
  const calledRef = useRef(false);

  useEffect(() => {
    // Wait until auth has finished loading
    if (isLoading) return;

    // Not signed in — nothing to do
    if (!user) {
      setSetupDone(true);
      return;
    }

    // Account already present in JWT — no setup needed
    if (user.activeAccountId) {
      setSetupDone(true);
      return;
    }

    // Guard against React StrictMode double-invoke
    if (calledRef.current) return;
    calledRef.current = true;

    async function runSetup() {
      try {
        const session  = await fetchAuthSession();
        const token    = session.tokens?.accessToken?.toString();
        if (!token) throw new Error('No access token available');

        const baseUrl = import.meta.env.VITE_API_URL as string;
        const res     = await fetch(`${baseUrl}auth/setup`, {
          method:  'POST',
          headers: {
            'Content-Type':  'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({}),
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({})) as { message?: string };
          throw new Error(body.message ?? `Setup failed with status ${res.status}`);
        }

        // Force Amplify to fetch a fresh session — picks up the new JWT claims
        await fetchAuthSession({ forceRefresh: true });
        // Sync AuthContext with the fresh session
        await refresh();

        setSetupDone(true);
      } catch (err) {
        setSetupError(err instanceof Error ? err.message : 'First-login setup failed');
        setSetupDone(true); // don't block the UI forever on error
      }
    }

    void runSetup();
  }, [isLoading, user, refresh]);

  return { setupDone, setupError };
}
