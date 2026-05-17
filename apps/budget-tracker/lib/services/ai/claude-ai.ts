import type { AiReviewResponse, AiCsvAnalysisResponse } from '@transformotion/budget-domain'
import type { AIService, ReviewTransactionsInput, AnalyseCsvFormatInput } from './index'
import { getBudgetHttp } from '@/lib/api'

const REVIEW_URL = '/api/budget/v1/ai/review'
const CSV_ANALYSIS_URL = '/api/budget/v1/ai/csv-analysis'

export class ClaudeAIService implements AIService {
  async reviewTransactions(input: ReviewTransactionsInput): Promise<AiReviewResponse> {
    const http = getBudgetHttp()
    const body = {
      transactions: input.transactions,
      categories: input.categories,
    }
    const result = await http.post<AiReviewResponse>(REVIEW_URL, body)
    if (input.onBatch) {
      input.onBatch(result.results)
    }
    return result
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
