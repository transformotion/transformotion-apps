import { HttpClient } from '@transformotion/api-client'
import { authService } from '../services/auth'
import { getConfig } from '../config'
import { getActiveAccountId } from '@/stores/active-account/use-active-account-store'

const getToken = async () => (await authService.getIdToken()) ?? ''
// M16 D7: the active account is the control-plane selection (active-account
// store), not first-account-from-token. AccountGate guarantees the store is
// `ready` before any surface that issues data requests renders.
const getAccountId = () => getActiveAccountId()

let _http: HttpClient | null = null

export function getBudgetHttp(): HttpClient {
  if (!_http) {
    _http = new HttpClient({ baseUrl: getConfig().api.baseURL, getToken, getAccountId })
  }
  return _http
}
