import { getConfig } from '@/lib/config';

/**
 * Join the control-plane base URL — which includes the API Gateway STAGE path
 * (e.g. `https://<api>.execute-api.<region>.amazonaws.com/dev/`) — with a route
 * path, preserving the stage.
 *
 * Deliberately a pure string join, NOT `new URL(path, base)`: a leading-slash
 * path is absolute, so `new URL('/api/user/profile', '.../dev/')` discards the
 * base path and resolves to `.../api/user/profile`, dropping the `/dev` stage
 * and hitting a non-existent route (issue #423). Stripping a leading slash and
 * appending keeps the stage intact regardless of slashes on either side.
 */
export function joinControlPlaneUrl(base: string, path: string): string {
  const b = base.replace(/\/+$/, '');
  const p = path.replace(/^\/+/, '');
  return `${b}/${p}`;
}

/**
 * Build a control-plane request URL for `path`, throwing if the API URL is not
 * configured. All Launchpad control-plane service clients must route through
 * this so the stage is never dropped.
 */
export function controlPlaneUrl(path: string): string {
  const base = getConfig().controlPlane.apiUrl;
  if (!base) {
    throw new Error('Launchpad control-plane API URL is not configured');
  }
  return joinControlPlaneUrl(base, path);
}
