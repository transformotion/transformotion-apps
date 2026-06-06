/**
 * Compatibility hook for Stock Analyser AI calls.
 *
 * React state lives here. AI execution, cache, transport, response parsing,
 * and mock behavior live under lib/services/ai.
 */

import { useCallback, useRef, useState } from 'react'
import { callClaudeAPI as callStockAnalyserAI } from '../services/ai'
import type { ClaudeRequest } from '../services/ai'

export type { ClaudeJobStatus, ClaudeRequest, ClaudeResponse } from '../services/ai'
export { callClaudeAPI } from '../services/ai'

export interface UseClaudeOptions {
  /** Cache key for storing result (optional) */
  cacheKey?: string
}

export interface UseClaudeReturn<T = unknown> {
  /** Call Claude with a prompt */
  callClaude: (request: ClaudeRequest) => Promise<T>
  /** Current loading state */
  isLoading: boolean
  /** Current error if any */
  error: Error | null
  /** Current job ID if polling */
  jobId: string | null
  /** Abort the current request */
  abort: () => void
}

export function useClaude<T = unknown>(): UseClaudeReturn<T> {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [jobId, setJobId] = useState<string | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  const abort = useCallback(() => {
    abortControllerRef.current?.abort()
    abortControllerRef.current = null
    setIsLoading(false)
    setJobId(null)
  }, [])

  const callClaude = useCallback(async (request: ClaudeRequest): Promise<T> => {
    abort()

    setIsLoading(true)
    setError(null)
    abortControllerRef.current = new AbortController()

    try {
      return await callStockAnalyserAI<T>(request, {
        signal: abortControllerRef.current.signal,
      })
    } catch (err) {
      if (err instanceof Error && (err.name === 'AbortError' || err.message === 'Request aborted')) {
        return undefined as unknown as T
      }
      const error = err instanceof Error ? err : new Error('Unknown error')
      setError(error)
      throw error
    } finally {
      setIsLoading(false)
      setJobId(null)
      abortControllerRef.current = null
    }
  }, [abort])

  return {
    callClaude,
    isLoading,
    error,
    jobId,
    abort,
  }
}
