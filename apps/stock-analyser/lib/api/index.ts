import { ApiClient, HttpClient } from '@transformotion/api-client'
import type { PutCacheRequest, ClaudeProxyRequest } from '@transformotion/api-client'
import type { AiRuntimeConfigUpdate, AppAiRuntimeConfigResponse } from '@transformotion/contracts/_shared/ai-runtime'
import type { StockAnalyserSettings } from '@transformotion/contracts/stock-analyser/types'
import type { PatchSettingsRequest } from '@transformotion/contracts/stock-analyser/api'
import { authService } from '../services/auth'
import { getConfig } from '../config'
import { getActiveAccountId } from '@/stores/active-account/use-active-account-store'

// ── Auth callbacks (shared across all clients) ─────────────────────────────────
const getToken     = async () => (await authService.getIdToken()) ?? ''
// M16 D7: the active account is the control-plane selection (the active-account
// store), NOT first-account-from-token. The AccountGate guarantees the store is
// `ready` (account set) before any app surface that issues data requests renders.
const getAccountId = () => getActiveAccountId()

// ── Platform-typed client (package typed methods: getPortfolio, getCache, etc.) ─
let _apiClient: ApiClient | null = null
export function getStockAnalyserClient(): ApiClient {
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
  getSettings(): Promise<{ settings: StockAnalyserSettings }> {
    return http().get('settings')
  },
  patchSettings(body: PatchSettingsRequest): Promise<{ settings: StockAnalyserSettings }> {
    return http().patch('settings', body)
  },
  getAiConfig(): Promise<AppAiRuntimeConfigResponse> {
    return http().get('ai-config')
  },
  updateAiOverride(body: AiRuntimeConfigUpdate): Promise<AppAiRuntimeConfigResponse> {
    return http().put('ai-config/override', body)
  },
  resetAiOverride(): Promise<void> {
    return http().delete('ai-config/override')
  },
  putCacheEntry(key: string, body: PutCacheRequest): Promise<void> {
    return http().put(`analysis-cache/${encodeURIComponent(key)}`, body)
  },
  deleteCacheEntry(key: string): Promise<void> {
    return http().delete(`analysis-cache/${encodeURIComponent(key)}`)
  },
  claudeAsyncStart(req: Omit<ClaudeProxyRequest, 'asyncMode'>, connectionId?: string, signal?: AbortSignal): Promise<{ jobId: string }> {
    return http().post('api/claude', { ...req, asyncMode: true, ...(connectionId ? { connectionId, appName: 'stock-analyser' } : {}) }, signal)
  },
}
