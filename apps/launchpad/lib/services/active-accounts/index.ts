import type {
  GetActiveAccountsResponse,
  ActiveAccountSelection,
} from '@transformotion/contracts/launchpad/invitations';
import { controlPlaneUrl } from '@/lib/services/control-plane';

export type { GetActiveAccountsResponse, ActiveAccountSelection };

/**
 * Read the caller's active account per app (M16 D7, Phase 2 read API).
 * Read-only — active-account SET is a mutation deferred to a later phase.
 * The set of appSlugs present is the user's app entitlement (a selection exists
 * for every app they hold a membership in).
 */
export async function getActiveAccounts(idToken: string): Promise<GetActiveAccountsResponse> {
  const response = await fetch(controlPlaneUrl('/api/user/active-accounts'), {
    headers: {
      Authorization: `Bearer ${idToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(`GET /api/user/active-accounts failed: ${response.status}`);
  }

  return response.json() as Promise<GetActiveAccountsResponse>;
}
