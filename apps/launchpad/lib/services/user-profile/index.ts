import { getConfig } from '@/lib/config';
import type { UserProfile, UserPreferences } from '@transformotion/contracts/_shared/auth';

// Canonical shapes (contract m16.1.0). UserProfile carries the M16 fields:
// userId, email, displayName, status, preferences, profileComplete, updatedAt.
export type { UserProfile, UserPreferences };

function resolveControlPlaneBaseUrl(): string {
  return getConfig().controlPlane.apiUrl;
}

export async function getUserProfile(idToken: string): Promise<UserProfile> {
  const baseUrl = resolveControlPlaneBaseUrl();
  if (!baseUrl) {
    throw new Error('Launchpad control-plane API URL is not configured');
  }

  const response = await fetch(new URL('/api/user/profile', baseUrl).toString(), {
    headers: {
      Authorization: `Bearer ${idToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(`GET /api/user/profile failed: ${response.status}`);
  }

  return response.json() as Promise<UserProfile>;
}

export async function updateUserPreferences(
  idToken: string,
  preferences: Partial<UserPreferences>,
): Promise<{ preferences: UserPreferences }> {
  const baseUrl = resolveControlPlaneBaseUrl();
  if (!baseUrl) {
    throw new Error('Launchpad control-plane API URL is not configured');
  }

  const response = await fetch(new URL('/api/user/preferences', baseUrl).toString(), {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(preferences),
  });

  if (!response.ok) {
    throw new Error(`PUT /api/user/preferences failed: ${response.status}`);
  }

  return response.json() as Promise<{ preferences: UserPreferences }>;
}
