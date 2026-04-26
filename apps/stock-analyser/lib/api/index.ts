import { ApiClient } from '@transformotion/api-client'
import { cognitoAuth } from '../services/auth/cognito-auth'
import { getConfig } from '../config'

let _client: ApiClient | null = null

export function getStockSignalClient(): ApiClient {
  if (!_client) {
    const config = getConfig()
    _client = new ApiClient({
      baseUrl:      config.api.baseURL,
      getToken:     async () => (await cognitoAuth.getIdToken()) ?? '',
      getAccountId: () => cognitoAuth.getAccountIdForApp('stock-signal'),
    })
  }
  return _client
}
