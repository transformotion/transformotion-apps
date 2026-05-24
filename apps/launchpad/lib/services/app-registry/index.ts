export interface AppDescriptor {
  slug:        string;
  displayName: string;
  description: string;
  urlPrefix:   string;
}

export interface AppRegistryResponse {
  apps: AppDescriptor[];
}

/**
 * Fetch the platform app registry from GET /api/platform/apps.
 * Used by Launchpad to discover which apps exist without importing
 * the compile-time APPS constant from packages/runtime-config.
 */
export async function fetchAppRegistry(apiBaseUrl: string, idToken: string): Promise<AppRegistryResponse> {
  const res = await fetch(`${apiBaseUrl}/api/platform/apps`, {
    headers: { Authorization: `Bearer ${idToken}` },
  });
  if (!res.ok) throw new Error(`GET /api/platform/apps failed: ${res.status}`);
  return res.json() as Promise<AppRegistryResponse>;
}
