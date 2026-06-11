import type { UserProfile, UserPreferences } from '@transformotion/contracts/_shared/auth';
import { controlPlaneUrl } from '@/lib/services/control-plane';

// Canonical shapes (contract m16.1.0). UserProfile carries the M16 fields:
// userId, email, displayName, status, preferences, profileComplete, updatedAt.
export type { UserProfile, UserPreferences };

export async function getUserProfile(idToken: string): Promise<UserProfile> {
  const response = await fetch(controlPlaneUrl('/api/user/profile'), {
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
  const response = await fetch(controlPlaneUrl('/api/user/preferences'), {
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
