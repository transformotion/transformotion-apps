import type { AiCsvAnalysisResponse, WsMessageBatchResult, WsMessageComplete, WsMessageError, WsMessageConnected } from '@transformotion/budget-domain'
import type { AIService, ReviewTransactionsInput, AnalyseCsvFormatInput, ReviewTransactionsResult } from './index'
import { getBudgetHttp } from '@/lib/api'
import { authService } from '@/lib/services/auth'
import { getConfig } from '@/lib/config'

const REVIEW_URL      = '/api/budget/v1/ai/review'
const CSV_ANALYSIS_URL = '/api/budget/v1/ai/csv-analysis'

type WsMessage = WsMessageConnected | WsMessageBatchResult | WsMessageComplete | WsMessageError

export class ClaudeAIService implements AIService {
  async reviewTransactions(input: ReviewTransactionsInput): Promise<ReviewTransactionsResult> {
    const wssUrl   = getConfig().ai.wssUrl
    const token    = await authService.getIdToken()
    const accountId = await authService.getAccountIdForApp('budget-tracker')

    if (!wssUrl)    throw new Error('WebSocket URL not configured (NEXT_PUBLIC_BUDGET_WSS_URL)')
    if (!token)     throw new Error('No auth token available')
    if (!accountId) throw new Error('No accountId available')

    // Connect to the WebSocket server
    const ws = new WebSocket(`${wssUrl}?token=${encodeURIComponent(token)}&accountId=${encodeURIComponent(accountId)}`)

    const connectionId = await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('WebSocket connect timeout')), 10_000)
      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data as string) as WsMessage
        if (msg.type === 'connected') {
          clearTimeout(timer)
          resolve(msg.connectionId)
        }
      }
      ws.onerror = () => { clearTimeout(timer); reject(new Error('WebSocket connection error')) }
      ws.onclose = (e) => { clearTimeout(timer); if (!e.wasClean) reject(new Error('WebSocket closed unexpectedly')) }
    })

    // Start streaming listener before calling HTTP so we don't miss early messages
    const http = getBudgetHttp()
    const { jobId } = await http.post<{ jobId: string }>(REVIEW_URL, {
      connectionId,
      transactions: input.transactions,
      categories:   input.categories,
      settings:     input.settings,
    })

    // Listen for WS messages until complete or error
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        ws.close()
        reject(new Error('AI review timed out after 5 minutes'))
      }, 5 * 60 * 1000)

      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data as string) as WsMessage
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
