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

/**
 * Update the caller's own profile display name via the existing
 * PUT /api/user/preferences capability (the handler accepts a top-level
 * `displayName`). Runtime-only client call to an existing server route — no
 * contract change. Used by the dev persona switcher's inline name edit.
 */
export async function updateDisplayName(idToken: string, displayName: string): Promise<void> {
  const response = await fetch(controlPlaneUrl('/api/user/preferences'), {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ displayName }),
  });

  if (!response.ok) {
    throw new Error(`PUT /api/user/preferences (displayName) failed: ${response.status}`);
  }
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
