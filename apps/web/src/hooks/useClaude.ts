import { useCallback, useState } from 'react';
import { useApiClient } from './useApiClient';
import { parseJSON } from '../lib/parseJSON';
import type { ClaudeProxyRequest } from '@transformotion/api-client';

interface UseClaudeResult {
  /**
   * Call Claude via the server-side proxy.
   *
   * @param req  - prompt, optional system, model, maxTokens, webSearch flag
   * @returns    parsed JSON value of type T
   * @throws     on API error or JSON parse failure
   */
  callClaude: <T = unknown>(req: ClaudeProxyRequest) => Promise<T>;
  loading: boolean;
  error: string | null;
  clearError: () => void;
}

/**
 * React hook that wraps the Claude proxy endpoint.
 *
 * - Manages loading and error state.
 * - Parses the response content string as JSON automatically.
 * - Forwards the webSearch flag so callers can toggle Fast/Live mode.
 *
 * @example
 * ```tsx
 * const { callClaude, loading, error } = useClaude();
 * const result = await callClaude<MyType>({ prompt: '...', webSearch: isLive });
 * ```
 */
export function useClaude(): UseClaudeResult {
  const api = useApiClient();
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  const callClaude = useCallback(async <T = unknown>(req: ClaudeProxyRequest): Promise<T> => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.claude(req);
      return parseJSON<T>(res.content);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unexpected error';
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [api]);

  const clearError = useCallback(() => setError(null), []);

  return { callClaude, loading, error, clearError };
}
