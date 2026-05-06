import { HttpClient } from '@transformotion/api-client'
import { authService } from '../services/auth'
import { getConfig } from '../config'

const getToken = async () => (await authService.getIdToken()) ?? ''
const getAccountId = () => authService.getAccountIdForApp('budget-tracker')

let _http: HttpClient | null = null

export function getBudgetHttp(): HttpClient {
  if (!_http) {
    _http = new HttpClient({ baseUrl: getConfig().api.baseURL, getToken, getAccountId })
  }
  return _http
}
