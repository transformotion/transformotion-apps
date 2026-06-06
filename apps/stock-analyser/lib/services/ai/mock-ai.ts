import { callWithAIResponseCache } from './cache'
import { getMockResponse } from './fixtures'
import type { AIServiceCallOptions, ClaudeRequest, StockAnalyserAIService } from './index'

export class MockAIService implements StockAnalyserAIService {
  async call<T>(request: ClaudeRequest, options: AIServiceCallOptions = {}): Promise<T> {
    const signal = options.signal ?? new AbortController().signal

    return callWithAIResponseCache(request, async () => {
      await simulateDelay(signal)
      if (signal.aborted) throw new Error('Request aborted')

      return getMockResponse<T>(request.prompt)
        ?? ({ message: 'Mock response', timestamp: new Date().toISOString() } as unknown as T)
    })
  }
}

async function simulateDelay(signal: AbortSignal): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(resolve, 800 + Math.random() * 700)
    signal.addEventListener('abort', () => {
      clearTimeout(timeout)
      reject(new Error('Request aborted'))
    }, { once: true })
  })
}
