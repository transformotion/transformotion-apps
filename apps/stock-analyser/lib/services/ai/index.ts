/**
 * AI Service Interface
 *
 * Abstraction for AI model interactions.
 * Provider selected at startup via runtime-config (NEXT_PUBLIC_AI_OVERRIDE / NEXT_PUBLIC_RUNTIME_PROFILE).
 */

export interface AIOptions {
  model?: string              // e.g., 'claude-3-opus', 'claude-3-sonnet'
  maxTokens?: number
  temperature?: number
  systemPrompt?: string
  stopSequences?: string[]
}

export interface AIMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export interface AIResponse {
  content: string
  model: string
  usage: {
    inputTokens: number
    outputTokens: number
  }
  stopReason: 'end_turn' | 'max_tokens' | 'stop_sequence'
}

export interface AIStreamChunk {
  type: 'text' | 'error' | 'done'
  content?: string
  error?: string
}

export interface JSONSchema {
  type: string
  properties?: Record<string, unknown>
  required?: string[]
  [key: string]: unknown
}

export interface AIService {
  /**
   * Single-turn completion.
   */
  complete(prompt: string, options?: AIOptions): Promise<AIResponse>

  /**
   * Multi-turn chat completion.
   */
  chat(messages: AIMessage[], options?: AIOptions): Promise<AIResponse>

  /**
   * Streaming completion (returns async iterator).
   */
  streamComplete(prompt: string, options?: AIOptions): AsyncIterable<AIStreamChunk>

  /**
   * Structured output with JSON schema validation.
   */
  analyse<T>(prompt: string, schema: JSONSchema, options?: AIOptions): Promise<T>

  /**
   * Check if service is available.
   */
  isAvailable(): Promise<boolean>
}

export { ClaudeAIService, createClaudeAIService } from './claude-ai'
