import { getConfig } from '@/lib/config';
import type {
  GetActiveAccountsResponse,
  ActiveAccountSelection,
} from '@transformotion/contracts/launchpad/invitations';

export type { GetActiveAccountsResponse, ActiveAccountSelection };

function resolveControlPlaneBaseUrl(): string {
  return getConfig().controlPlane.apiUrl;
}

/**
 * Read the caller's active account per app (M16 D7, Phase 2 read API).
 * Read-only — active-account SET is a mutation deferred to a later phase.
 * The set of appSlugs present is the user's app entitlement (a selection exists
 * for every app they hold a membership in).
 */
export async function getActiveAccounts(idToken: string): Promise<GetActiveAccountsResponse> {
  const baseUrl = resolveControlPlaneBaseUrl();
  if (!baseUrl) {
    throw new Error('Launchpad control-plane API URL is not configured');
  }

  const response = await fetch(new URL('/api/user/active-accounts', baseUrl).toString(), {
    headers: {
      Authorization: `Bearer ${idToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(`GET /api/user/active-accounts failed: ${response.status}`);
  }

  return response.json() as Promise<GetActiveAccountsResponse>;
}
