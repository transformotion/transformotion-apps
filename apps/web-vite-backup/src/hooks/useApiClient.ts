import { useMemo } from 'react';
import { fetchAuthSession } from 'aws-amplify/auth';
import { ApiClient } from '@transformotion/api-client';
import { useAuth } from '../contexts/AuthContext';

/**
 * Returns a memoised ApiClient instance wired to Amplify auth.
 *
 * - `getToken`     — calls Amplify fetchAuthSession on every request;
 *                    Amplify auto-refreshes the access token if expired.
 * - `getAccountId` — reads activeAccountId from AuthContext (set by first-login setup).
 *                    Returns undefined until setup completes, causing protected Lambda
 *                    calls to fall back to the custom:active_account JWT claim.
 */
export function useApiClient(): ApiClient {
  const { user } = useAuth();

  return useMemo(
    () =>
      new ApiClient({
        baseUrl:  import.meta.env.VITE_API_URL as string,
        getToken: async () => {
          const session = await fetchAuthSession();
          // REST API Cognito User Pool Authorizer requires the ID token (not the
          // access token). ID tokens contain aud = client ID which the authorizer
          // validates; access tokens have client_id instead and are rejected.
          return session.tokens?.idToken?.toString() ?? '';
        },
        getAccountId: () => user?.activeAccountId,
      }),
    // Re-create client when the active account changes (first-login, account switch)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user?.activeAccountId],
  );
}
