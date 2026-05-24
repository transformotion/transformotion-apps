import { createAuthService } from '@transformotion/auth-client'
import { getConfig } from '@/lib/config'

export const authService = createAuthService('stock-analyser', { provider: getConfig().auth.provider })
