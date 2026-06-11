import type { AccountSetupResponse } from '@transformotion/contracts/launchpad/types';
import { controlPlaneUrl } from '@/lib/services/control-plane';

// Canonical shape lives in the contracts package (m16.1.0). /auth/setup is
// profile-bootstrap only (D11): `accountId` is omitted for a fresh user,
// `userCreated` reflects profile-record creation, `profileComplete` drives
// first-time setup. Re-exported so existing import sites keep resolving.
export type { AccountSetupResponse };

export async function setupAccount(idToken: string): Promise<AccountSetupResponse> {
  const response = await fetch(controlPlaneUrl('/auth/setup'), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`POST /auth/setup failed: ${response.status}`);
  }

  return response.json() as Promise<AccountSetupResponse>;
}
