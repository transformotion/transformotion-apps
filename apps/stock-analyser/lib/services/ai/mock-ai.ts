import { AIService, AIOptions, AIMessage, AIResponse, AIStreamChunk, JSONSchema } from './index'
import { getMockResponse } from './fixtures'

export class MockAIService implements AIService {
  async complete(prompt: string, options?: AIOptions): Promise<AIResponse> {
    await simulateDelay()
    const content = JSON.stringify(getMockResponse(prompt) ?? { message: 'Mock response', timestamp: new Date().toISOString() })
    return {
      content,
      model: options?.model || 'mock-model',
      usage: {
        inputTokens: Math.ceil(prompt.length / 4),
        outputTokens: Math.ceil(content.length / 4),
      },
      stopReason: 'end_turn',
    }
  }

  async chat(messages: AIMessage[], options?: AIOptions): Promise<AIResponse> {
    const lastUserMessage = [...messages].reverse().find(m => m.role === 'user')
    return this.complete(lastUserMessage?.content || '', options)
  }

  async *streamComplete(prompt: string, options?: AIOptions): AsyncIterable<AIStreamChunk> {
    const response = await this.complete(prompt, options)
    for (const word of response.content.split(' ')) {
      yield { type: 'text', content: word + ' ' }
    }
    yield { type: 'done' }
  }

  async analyse<T>(prompt: string, _schema: JSONSchema, _options?: AIOptions): Promise<T> {
    await simulateDelay()
    return (getMockResponse<T>(prompt) ?? { message: 'Mock response', timestamp: new Date().toISOString() }) as T
  }

  async isAvailable(): Promise<boolean> {
    return true
  }
}

export function createMockAIService(): MockAIService {
  return new MockAIService()
}

async function simulateDelay(): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, 800 + Math.random() * 700))
}
