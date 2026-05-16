import { createAuthService } from '@transformotion/auth-client'
import { getConfig } from '@/lib/config'

export const authService = createAuthService('launchpad', { provider: getConfig().auth.provider })
