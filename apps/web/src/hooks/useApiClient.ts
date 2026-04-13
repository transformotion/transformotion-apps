import { useMemo } from 'react';
import { fetchAuthSession } from 'aws-amplify/auth';
import { ApiClient } from '@transformotion/api-client';

/**
 * Returns a memoised ApiClient instance wired to Amplify auth.
 *
 * - `getToken`     — calls Amplify fetchAuthSession on every request;
 *                    Amplify auto-refreshes the access token if expired.
 * - `getAccountId` — reads VITE_API_ACCOUNT_ID from env for now;
 *                    replaced in S2.13 with the active account from auth context.
 *
 * The client is stable as long as the env vars don't change (i.e. for the
 * entire session), so re-renders don't recreate it unnecessarily.
 */
export function useApiClient(): ApiClient {
  return useMemo(
    () =>
      new ApiClient({
        baseUrl:  import.meta.env.VITE_API_URL as string,
        getToken: async () => {
          const session = await fetchAuthSession();
          return session.tokens?.accessToken?.toString() ?? '';
        },
        // TODO S2.13: replace with active account from auth context / account switcher
        getAccountId: () => undefined,
      }),
    [],
  );
}
