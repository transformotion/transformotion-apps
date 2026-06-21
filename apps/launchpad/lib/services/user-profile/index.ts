import type { UserProfile, UserPreferences } from '@transformotion/contracts/_shared/auth';
import type { UpdateUserPreferencesRequest } from '@transformotion/contracts/launchpad/api';
import { controlPlaneUrl } from '@/lib/services/control-plane';

// Canonical shapes (contract m16.1.0). UserProfile carries the M16 fields:
// userId, email, displayName, status, preferences, profileComplete, updatedAt.
export type { UserProfile, UserPreferences, UpdateUserPreferencesRequest };

/**
 * Save the caller's own profile via the contracted `UpdateUserPreferencesRequest`
 * (m16.8.0 typed `displayName` + `notificationsEnabled`) → PUT /api/user/preferences.
 * The Profile surface saves display name and the notifications preference TOGETHER in
 * one request; the handler returns the updated `UserProfile`. `displayName` is now a
 * typed field on the request (previously sent untyped — see `updateDisplayName`).
 */
export async function saveUserProfile(
  idToken: string,
  req: UpdateUserPreferencesRequest,
): Promise<UserProfile> {
  const response = await fetch(controlPlaneUrl('/api/user/preferences'), {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(req),
  });

  if (!response.ok) {
    throw new Error(`PUT /api/user/preferences (profile) failed: ${response.status}`);
  }

  return response.json() as Promise<UserProfile>;
}

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
