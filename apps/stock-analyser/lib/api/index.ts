import { ApiClient, HttpClient } from '@transformotion/api-client'
import type { PutCacheRequest, ClaudeProxyRequest } from '@transformotion/api-client'
import type { BudgetSettings } from '../repositories/budget-tracker/settings-repository'
import type { Transaction } from '../repositories/budget-tracker/transaction-repository'
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

// ── HTTP transport for budget API ──────────────────────────────────────────────
let _budgetHttp: HttpClient | null = null
function budgetHttp(): HttpClient {
  if (!_budgetHttp) {
    _budgetHttp = new HttpClient({
      baseUrl:      getConfig().budget.apiUrl,
      getToken,
      getAccountId,
    })
  }
  return _budgetHttp
}

// ── Types ──────────────────────────────────────────────────────────────────────

interface TransactionPatch {
  category:    string
  subcategory: string
  _manual:     boolean
  _business:   boolean
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

// ── Budget local client ────────────────────────────────────────────────────────
// Hits config.budget.apiUrl. When budget-tracker becomes its own app this
// moves with it; for now it lives here alongside the stock-analyser callers.
export const budgetClient = {
  getSettings(): Promise<{ settings: BudgetSettings }> {
    return budgetHttp().get('settings')
  },
  patchSettings(updates: Partial<BudgetSettings>): Promise<{ settings: BudgetSettings }> {
    return budgetHttp().patch('settings', updates)
  },
  listTransactions(): Promise<{ transactions: Transaction[] }> {
    return budgetHttp().get('transactions')
  },
  patchTransaction(id: string, body: TransactionPatch): Promise<void> {
    return budgetHttp().patch(`transactions/${id}`, body)
  },
  deleteTransaction(id: string): Promise<void> {
    return budgetHttp().delete(`transactions/${id}`)
  },
  bulkImportTransactions(body: { transactions: Omit<Transaction, '_id'>[] }): Promise<{ transactions: Transaction[] }> {
    return budgetHttp().post('transactions/bulk', body)
  },
}
