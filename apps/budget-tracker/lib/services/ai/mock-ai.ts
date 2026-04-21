/**
 * Mock AI Service
 * 
 * Uses the same async polling pattern as the real Claude API.
 * Replace with ClaudeAIService for production (via Lambda/Claude API).
 */

import { AIService, AIOptions, AIMessage, AIResponse, AIStreamChunk, JSONSchema } from './index'
import { callClaudeAPI } from '@/lib/hooks/use-claude'

export class MockAIService implements AIService {
  async complete(prompt: string, options?: AIOptions): Promise<AIResponse> {
    // In mock mode, simulate the async polling pattern but with instant results
    const result = await callClaudeAPI<string>(
      {
        prompt,
        systemPrompt: options?.systemPrompt,
        maxTokens: options?.maxTokens,
      },
      {}
    )

    return {
      content: result as string,
      model: options?.model || 'mock-model',
      usage: {
        inputTokens: Math.ceil(prompt.length / 4),
        outputTokens: Math.ceil((result as string).length / 4),
      },
      stopReason: 'end_turn',
    }
  }

  async chat(messages: AIMessage[], options?: AIOptions): Promise<AIResponse> {
    // Use last user message as prompt
    const lastUserMessage = [...messages].reverse().find(m => m.role === 'user')
    const prompt = lastUserMessage?.content || ''
    
    return this.complete(prompt, options)
  }

  async *streamComplete(prompt: string, options?: AIOptions): AsyncIterable<AIStreamChunk> {
    // For mock streaming, we just return the complete result in chunks
    const response = await this.complete(prompt, options)
    const words = response.content.split(' ')
    
    for (const word of words) {
      yield { type: 'text', content: word + ' ' }
    }
    
    yield { type: 'done' }
  }

  async analyse<T>(prompt: string, schema: JSONSchema, options?: AIOptions): Promise<T> {
    // Call Claude with schema for structured output
    const result = await callClaudeAPI<T>(
      {
        prompt,
        systemPrompt: options?.systemPrompt || `You are a helpful assistant that responds with valid JSON matching this schema: ${JSON.stringify(schema)}`,
        maxTokens: options?.maxTokens,
      },
      {}
    )

    return result as T
  }

  async isAvailable(): Promise<boolean> {
    return true
  }
}

export function createMockAIService(): MockAIService {
  return new MockAIService()
}
