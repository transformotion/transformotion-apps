import { createAuthService } from '@transformotion/auth-client'
import { getConfig } from '@/lib/config'

export const authService = createAuthService('stock-signal', { provider: getConfig().auth.provider })
