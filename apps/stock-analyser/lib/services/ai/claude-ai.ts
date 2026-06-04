import { AIService, AIOptions, AIMessage, AIResponse, AIStreamChunk, JSONSchema } from './index'
import { callClaudeAPI } from '@/lib/hooks/use-claude'

export class ClaudeAIService implements AIService {
  async complete(prompt: string, options?: AIOptions): Promise<AIResponse> {
    const content = await callClaudeAPI<string>({
      prompt,
      systemPrompt: options?.systemPrompt,
      maxTokens: options?.maxTokens,
    })
    return {
      content: typeof content === 'string' ? content : JSON.stringify(content),
      model: options?.model || 'claude-sonnet-4-6',
      usage: { inputTokens: 0, outputTokens: 0 },
      stopReason: 'end_turn',
    }
  }

  async chat(messages: AIMessage[], options?: AIOptions): Promise<AIResponse> {
    const lastUserMessage = [...messages].reverse().find(m => m.role === 'user')
    return this.complete(lastUserMessage?.content || '', options)
  }

  async *streamComplete(prompt: string, options?: AIOptions): AsyncIterable<AIStreamChunk> {
    const response = await this.complete(prompt, options)
    yield { type: 'text', content: response.content }
    yield { type: 'done' }
  }

  async analyse<T>(prompt: string, schema: JSONSchema, options?: AIOptions): Promise<T> {
    return callClaudeAPI<T>({
      prompt,
      systemPrompt: options?.systemPrompt || `You are a helpful assistant that responds with valid JSON matching this schema: ${JSON.stringify(schema)}`,
      maxTokens: options?.maxTokens,
    })
  }

  async isAvailable(): Promise<boolean> {
    return true
  }
}

export function createClaudeAIService(): ClaudeAIService {
  return new ClaudeAIService()
}
