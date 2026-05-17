import type {
  Category,
  AiReviewResponse,
  AiCsvAnalysisResponse,
} from '@transformotion/budget-domain'

export interface ReviewTransactionsInput {
  transactions: Array<{ index: number; description: string; amount: string }>
  categories: Category[]
  onBatch?: (batchResults: AiReviewResponse['results']) => void
}

export interface AnalyseCsvFormatInput {
  sampleRows: string[][]
  possibleHeaders?: string[]
}

export interface AIService {
  reviewTransactions(input: ReviewTransactionsInput): Promise<AiReviewResponse>
  analyseCsvFormat(input: AnalyseCsvFormatInput): Promise<AiCsvAnalysisResponse>
}

export { MockAIService, createMockAIService } from './mock-ai'
export { ClaudeAIService, createClaudeAIService } from './claude-ai'

import { MockAIService } from './mock-ai'
import { ClaudeAIService } from './claude-ai'
import { getConfig } from '@/lib/config'

let _aiService: AIService | null = null

export function getAIService(): AIService {
  if (!_aiService) {
    const config = getConfig()
    _aiService = config.ai.provider === 'mock' ? new MockAIService() : new ClaudeAIService()
  }
  return _aiService
}

export function resetAIService(): void {
  _aiService = null
}
