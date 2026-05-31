import { getConfig } from '@/lib/config';

export interface AuthLookupResult {
  message: string;
}

export async function lookupAuthProvider(email: string): Promise<AuthLookupResult> {
  const primaryBaseUrl = getConfig().controlPlane.apiUrl;
  const rollbackBaseUrl = process.env.NEXT_PUBLIC_PLATFORM_AUTH_API_URL ?? '';
  const baseUrl = primaryBaseUrl || rollbackBaseUrl;

  if (!baseUrl) {
    throw new Error('Launchpad control-plane API URL is not configured');
  }

  const response = await fetch(new URL('/auth/lookup-provider', baseUrl).toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });

  if (!response.ok) {
    throw new Error('Unable to look up sign-in method');
  }

  return response.json() as Promise<AuthLookupResult>;
}
