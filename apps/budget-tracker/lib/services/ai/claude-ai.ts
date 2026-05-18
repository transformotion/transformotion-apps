import type { AiCsvAnalysisResponse, WsMessageBatchResult, WsMessageComplete, WsMessageError } from '@transformotion/budget-domain'
import type { AIService, ReviewTransactionsInput, AnalyseCsvFormatInput, ReviewTransactionsResult } from './index'
import { getBudgetHttp } from '@/lib/api'
import { authService } from '@/lib/services/auth'
import { getConfig } from '@/lib/config'

const REVIEW_URL       = '/api/budget/v1/ai/review'
const CSV_ANALYSIS_URL = '/api/budget/v1/ai/csv-analysis'

type WsInboundMessage = WsMessageBatchResult | WsMessageComplete | WsMessageError

export class ClaudeAIService implements AIService {
  async reviewTransactions(input: ReviewTransactionsInput): Promise<ReviewTransactionsResult> {
    const wssUrl    = getConfig().ai.wssUrl
    const token     = await authService.getIdToken()
    const accountId = await authService.getAccountIdForApp('budget-tracker')

    if (!wssUrl)    throw new Error('WebSocket URL not configured (NEXT_PUBLIC_BUDGET_WSS_URL)')
    if (!token)     throw new Error('No auth token available')
    if (!accountId) throw new Error('No accountId available')

    const ws = new WebSocket(`${wssUrl}?token=${encodeURIComponent(token)}&accountId=${encodeURIComponent(accountId)}`)

    // Step 1: wait for connection to open
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('WebSocket connect timeout')), 10_000)
      ws.onopen  = () => { clearTimeout(timer); resolve() }
      ws.onerror = () => { clearTimeout(timer); reject(new Error('WebSocket connection error')) }
      ws.onclose = (e) => { clearTimeout(timer); if (!e.wasClean) reject(new Error('WebSocket closed before open')) }
    })

    // Step 2: set up streaming handlers before calling HTTP — avoids any missed messages
    const streamPromise = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        ws.close()
        reject(new Error('AI review timed out after 5 minutes'))
      }, 5 * 60 * 1000)

      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data as string) as WsInboundMessage
        if (msg.type === 'batch_result') {
          input.onBatch?.(msg.results, msg.pass)
        } else if (msg.type === 'complete') {
          clearTimeout(timer)
          ws.close()
          resolve()
        } else if (msg.type === 'error') {
          clearTimeout(timer)
          ws.close()
          reject(new Error(msg.message))
        }
      }
      ws.onerror = () => { clearTimeout(timer); reject(new Error('WebSocket error during review')) }
      ws.onclose = (e) => {
        clearTimeout(timer)
        if (!e.wasClean) reject(new Error('WebSocket closed unexpectedly during review'))
      }
    })

    // Step 3: start job — server resolves connectionId from userId via connections table
    const http = getBudgetHttp()
    const { jobId } = await http.post<{ jobId: string }>(REVIEW_URL, {
      transactions: input.transactions,
      categories:   input.categories,
      settings:     input.settings,
    })

    // Step 4: wait for streaming to complete
    await streamPromise

    return { jobId }
  }

  async analyseCsvFormat(input: AnalyseCsvFormatInput): Promise<AiCsvAnalysisResponse> {
    const http = getBudgetHttp()
    return http.post<AiCsvAnalysisResponse>(CSV_ANALYSIS_URL, {
      sampleRows: input.sampleRows,
    })
  }
}

export function createClaudeAIService(): ClaudeAIService {
  return new ClaudeAIService()
}
