import { ControlPlaneClient } from '@transformotion/api-client'
import { authService } from '@/lib/services/auth'
import { getConfig } from '@/lib/config'

/**
 * Shared Launchpad ControlPlaneClient (M16 Phase 6 UI wiring). The single
 * transport for account/member management — the admin UI routes EVERYTHING
 * through this client (no mock store, no local-store authority). Token comes
 * from the auth provider; base URL from the launchpad control-plane config.
 */
let client: ControlPlaneClient | null = null

export function getControlPlaneClient(): ControlPlaneClient {
  if (!client) {
    client = new ControlPlaneClient({
      baseUrl: getConfig().controlPlane.apiUrl,
      getToken: async () => (await authService.getIdToken()) ?? '',
    })
  }
  return client
}
