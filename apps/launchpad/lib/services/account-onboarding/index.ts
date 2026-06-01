import { getConfig } from '@/lib/config';

export interface AccountSetupResponse {
  accountId: string;
  created: boolean;
}

function resolveControlPlaneBaseUrl(): string {
  const primaryBaseUrl = getConfig().controlPlane.apiUrl;
  const rollbackBaseUrl = process.env.NEXT_PUBLIC_PLATFORM_API_URL ?? '';
  return primaryBaseUrl || rollbackBaseUrl;
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
