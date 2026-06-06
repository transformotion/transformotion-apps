import { getConfig } from '@/lib/config'
import { ClaudeAIService } from './claude-ai'
import { MockAIService } from './mock-ai'

export interface ClaudeRequest {
  prompt: string
  webSearch?: boolean
  systemPrompt?: string
  maxTokens?: number
  /**
   * DynamoDB cache key, e.g. MARKET#ASX or ANALYSIS#CBA.AX.
   * When provided, the service checks cache before AI execution and writes
   * successful responses back after execution.
   */
  cacheKey?: string
  /**
   * Skip the cache read and call the selected service directly.
   * Successful responses are still written back to cache.
   */
  forceRefresh?: boolean
}

export interface ClaudeResponse<T = unknown> {
  content: T
  usage?: {
    inputTokens: number
    outputTokens: number
  }
}

export interface ClaudeJobStatus<T = unknown> {
  status: 'pending' | 'processing' | 'complete' | 'error'
  content?: T
  error?: string
  createdAt?: string
  completedAt?: string
}

export interface AIServiceCallOptions {
  signal?: AbortSignal
}

export interface StockAnalyserAIService {
  call<T>(request: ClaudeRequest, options?: AIServiceCallOptions): Promise<T>
}

let aiService: StockAnalyserAIService | null = null

export function getAIService(): StockAnalyserAIService {
  if (!aiService) {
    aiService = getConfig().ai.provider === 'mock'
      ? new MockAIService()
      : new ClaudeAIService()
  }
  return aiService
}

export function resetAIService(): void {
  aiService = null
}

export async function callClaudeAPI<T = unknown>(
  request: ClaudeRequest,
  options: AIServiceCallOptions = {},
): Promise<T> {
  return getAIService().call<T>(request, options)
}

export { ClaudeAIService } from './claude-ai'
export { MockAIService } from './mock-ai'
