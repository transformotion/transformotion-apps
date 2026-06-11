import { getConfig } from '@/lib/config';
import type { AccountSetupResponse } from '@transformotion/contracts/launchpad/types';

// Canonical shape lives in the contracts package (m16.1.0). /auth/setup is
// profile-bootstrap only (D11): `accountId` is omitted for a fresh user,
// `userCreated` reflects profile-record creation, `profileComplete` drives
// first-time setup. Re-exported so existing import sites keep resolving.
export type { AccountSetupResponse };

function resolveControlPlaneBaseUrl(): string {
  return getConfig().controlPlane.apiUrl;
}

export async function setupAccount(idToken: string): Promise<AccountSetupResponse> {
  const baseUrl = resolveControlPlaneBaseUrl();
  if (!baseUrl) {
    throw new Error('Launchpad control-plane API URL is not configured');
  }

  const response = await fetch(new URL('/auth/setup', baseUrl).toString(), {
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
