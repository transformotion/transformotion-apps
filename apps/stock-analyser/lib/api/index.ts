import { ApiClient, HttpClient } from '@transformotion/api-client'
import type { PutCacheRequest, ClaudeProxyRequest } from '@transformotion/api-client'
import { cognitoAuth } from '../services/auth/cognito-auth'
import { getConfig } from '../config'

// ── Auth callbacks (shared across all clients) ─────────────────────────────────
const getToken     = async () => (await cognitoAuth.getIdToken()) ?? ''
const getAccountId = () => cognitoAuth.getAccountIdForApp('stock-signal')

// ── Platform-typed client (package typed methods: getPortfolio, getCache, etc.) ─
let _apiClient: ApiClient | null = null
export function getStockSignalClient(): ApiClient {
  if (!_apiClient) {
    _apiClient = new ApiClient({
      baseUrl:      getConfig().api.baseURL,
      getToken,
      getAccountId,
    })
  }
  return _apiClient
}

// ── HTTP transport for stock-analyser main API ─────────────────────────────────
let _stockHttp: HttpClient | null = null
function http(): HttpClient {
  if (!_stockHttp) {
    _stockHttp = new HttpClient({
      baseUrl:      getConfig().api.baseURL,
      getToken,
      getAccountId,
    })
  }
  return _stockHttp
}

// ── Stock-analyser local client ────────────────────────────────────────────────
// Typed surface for main-API endpoints not covered by the package's ApiClient.
export const stockAnalyserClient = {
  // Analysis cache — PUT/DELETE (GET is covered by ApiClient.getCache)
  putCacheEntry(key: string, body: PutCacheRequest): Promise<void> {
    return http().put(`analysis-cache/${encodeURIComponent(key)}`, body)
  },
  deleteCacheEntry(key: string): Promise<void> {
    return http().delete(`analysis-cache/${encodeURIComponent(key)}`)
  },
  // Claude async — app-layer method; asyncMode is NOT on the package's ApiClient
  claudeAsyncStart(req: Omit<ClaudeProxyRequest, 'asyncMode'>, signal?: AbortSignal): Promise<{ jobId: string }> {
    return http().post('api/claude', { ...req, asyncMode: true }, signal)
  },
}

