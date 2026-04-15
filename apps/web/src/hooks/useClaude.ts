import { useCallback, useEffect, useRef, useState } from 'react';
import { useApiClient } from './useApiClient';
import { useMode } from '../contexts/ModeContext';
import { parseJSON } from '../lib/parseJSON';
import { enqueueClaudeCall } from '../lib/claudeQueue';
import type { ClaudeProxyRequest } from '@transformotion/api-client';

interface UseClaudeResult {
  callClaude:    <T = unknown>(req: ClaudeProxyRequest) => Promise<T>;
  loading:       boolean;
  error:         string | null;
  statusMessage: string | null;
  clearError:    () => void;
}

// Poll every 2.5 s, up to ~500 s (200 × 2.5 s) — accommodates 3 retries with
// delays of 20 s + 45 s + 90 s plus multiple Anthropic call durations.
const POLL_INTERVAL_MS  = 2_500;
const POLL_MAX_ATTEMPTS = 200;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

interface JobStatus {
  status:      'pending' | 'retrying' | 'complete' | 'error';
  content?:    string;
  message?:    string;
  attempt?:    number;
  retryDelay?: number;
}

interface AsyncJobResponse { jobId: string; status: 'pending' }

/**
 * React hook that wraps the Claude proxy endpoint.
 *
 * - All calls go through an async job pattern (trigger Lambda → poll DynamoDB)
 *   to bypass API Gateway's 29-second integration timeout.
 * - A module-level queue serialises calls so at most one Anthropic request
 *   is in-flight at a time, reducing 429 rate-limit errors.
 * - Shows real countdown when the Lambda is waiting to retry.
 * - Error messages are mode-aware: only suggests "switch to Fast mode"
 *   when the user is currently in Live mode.
 */
export function useClaude(): UseClaudeResult {
  const api          = useApiClient();
  const { isLive }   = useMode();

  const [loading,       setLoading]       = useState(false);
  const [error,         setError]         = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Refs for managing the retry countdown interval
  const countdownRef        = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeRetryDelayRef = useRef<number | null>(null);

  // Clear countdown on unmount
  useEffect(() => () => {
    if (countdownRef.current) clearInterval(countdownRef.current);
  }, []);

  const stopCountdown = () => {
    if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null; }
    activeRetryDelayRef.current = null;
  };

  const callClaude = useCallback(async <T = unknown>(req: ClaudeProxyRequest): Promise<T> => {
    setLoading(true);
    setError(null);
    setStatusMessage(null);

    try {
      return await enqueueClaudeCall(
        async () => {
          // Trigger the async Lambda job
          console.log('[useClaude] Sending request, webSearch:', req.webSearch);
          const jobRes = await api.claude({ ...req, asyncMode: true }) as unknown as AsyncJobResponse;
          const jobId  = jobRes.jobId;
          console.log('[useClaude] Got jobId:', jobId, '— starting poll');

          for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt++) {
            await sleep(POLL_INTERVAL_MS);

            try {
              console.log(`[useClaude] Poll ${attempt + 1}/${POLL_MAX_ATTEMPTS} for jobId:`, jobId);
              const entry = await api.getCache(`job-${jobId}`);
              // The analysis-cache Lambda normalises the job record: the inner payload
              // is JSON.stringify'd so entry.data is a string. Parse it to get JobStatus.
              let jobData: JobStatus | undefined;
              if (typeof entry?.data === 'string') {
                jobData = JSON.parse(entry.data) as JobStatus;
              } else if (entry?.data && typeof entry.data === 'object') {
                // Legacy object format — unwrap .data if present
                const d = entry.data as { data?: JobStatus };
                jobData = d.data ?? (entry.data as unknown as JobStatus);
              }
              console.log(`[useClaude] Poll ${attempt + 1} status:`, jobData?.status ?? '(no data)');

              if (jobData?.status === 'complete') {
                stopCountdown();
                setStatusMessage(null);
                console.log('[useClaude] Job complete, content length:', jobData.content?.length);
                return parseJSON<T>(jobData.content!);
              }

              if (jobData?.status === 'error') {
                stopCountdown();
                console.error('[useClaude] Job error:', jobData.message);
                throw new Error(jobData.message ?? 'Analysis failed');
              }

              if (jobData?.status === 'retrying') {
                const delay = jobData.retryDelay ?? 20_000;

                // Start a fresh countdown only when a new retry delay appears
                if (delay !== activeRetryDelayRef.current) {
                  activeRetryDelayRef.current = delay;
                  if (countdownRef.current) clearInterval(countdownRef.current);

                  let secs = Math.ceil(delay / 1000);
                  setStatusMessage(`Rate limit — retrying in ${secs}s…`);

                  countdownRef.current = setInterval(() => {
                    secs--;
                    if (secs <= 0) {
                      clearInterval(countdownRef.current!);
                      countdownRef.current = null;
                      setStatusMessage('Rate limit — retrying now…');
                    } else {
                      setStatusMessage(`Rate limit — retrying in ${secs}s…`);
                    }
                  }, 1_000);
                }
              }
              // 'pending' or not yet written: keep polling

            } catch (e) {
              if (e instanceof Error && (e.message.includes('404') || e.message.includes('not found'))) {
                console.log(`[useClaude] Poll ${attempt + 1}: 404 — not yet written, continuing`);
                continue;
              }
              throw e;
            }
          }

          console.error('[useClaude] Timed out after', POLL_MAX_ATTEMPTS, 'attempts for jobId:', jobId);
          throw new Error('Analysis timed out — the request took too long. Please try again.');
        },
        // Queue position callback — updates statusMessage before job starts
        (msg) => setStatusMessage(msg),
      );

    } catch (err: unknown) {
      const rawMsg = err instanceof Error ? err.message : 'Unexpected error';
      const isRateLimit = /rate limit/i.test(rawMsg);

      // Mode-aware error: only suggest Fast mode when currently in Live mode
      const displayMsg = isRateLimit
        ? isLive
          ? 'The Anthropic API quota was temporarily exceeded. Please wait, then retry — or switch to Fast mode to skip web search.'
          : 'The Anthropic API quota was temporarily exceeded. Please wait a moment and try again.'
        : rawMsg;

      setError(displayMsg);
      throw err;
    } finally {
      stopCountdown();
      setLoading(false);
      setStatusMessage(null);
    }
  }, [api, isLive]);

  const clearError = useCallback(() => setError(null), []);

  return { callClaude, loading, error, statusMessage, clearError };
}
