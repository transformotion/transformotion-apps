import { createAuthService } from '@transformotion/auth-client'
import { getConfig } from '@/lib/config'

export const authService = createAuthService('budget-tracker', { provider: getConfig().auth.provider })
