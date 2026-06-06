import { getConfig } from '@/lib/config'
import { callWithAIResponseCache } from './cache'
import { subscribeViaWss } from './wss-transport'
import type { AIServiceCallOptions, ClaudeRequest, StockAnalyserAIService } from './index'

export class ClaudeAIService implements StockAnalyserAIService {
  async call<T>(request: ClaudeRequest, options: AIServiceCallOptions = {}): Promise<T> {
    const signal = options.signal ?? new AbortController().signal
    const { cacheKey: _cacheKey, forceRefresh: _forceRefresh, ...executionRequest } = request

    return callWithAIResponseCache(request, () =>
      subscribeViaWss<T>(executionRequest, getConfig().ai.wssUrl, signal),
    )
  }
}
