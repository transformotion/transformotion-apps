import { ApiClient, HttpClient } from '@transformotion/api-client'
import type { PutCacheRequest, ClaudeProxyRequest } from '@transformotion/api-client'
import { authService } from '../services/auth'
import { getConfig } from '../config'

// ── Auth callbacks (shared across all clients) ─────────────────────────────────
const getToken     = async () => (await authService.getIdToken()) ?? ''
const getAccountId = () => authService.getAccountIdForApp('stock-signal')

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
export const stockAnalyserClient = {
  putCacheEntry(key: string, body: PutCacheRequest): Promise<void> {
    return http().put(`analysis-cache/${encodeURIComponent(key)}`, body)
  },
  deleteCacheEntry(key: string): Promise<void> {
    return http().delete(`analysis-cache/${encodeURIComponent(key)}`)
  },
  claudeAsyncStart(req: Omit<ClaudeProxyRequest, 'asyncMode'>, signal?: AbortSignal): Promise<{ jobId: string }> {
    return http().post('api/claude', { ...req, asyncMode: true }, signal)
  },
}
