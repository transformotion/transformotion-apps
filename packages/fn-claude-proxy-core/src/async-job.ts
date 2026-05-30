import { HttpError } from '@transformotion/lambda-middleware';
import { callClaude } from './anthropic';
import { writeJobResult } from './job-results';
import { pushJobComplete } from './wss';
import type { AsyncJobEvent, ClaudeProxyOptions } from './types';

const RATE_LIMIT_RETRIES: Array<{ delayMs: number; label: string }> = [
  { delayMs: 20_000, label: '20s' },
  { delayMs: 45_000, label: '45s' },
  { delayMs: 90_000, label: '90s' },
];

export async function executeAsyncJob(job: AsyncJobEvent, options: ClaudeProxyOptions): Promise<void> {
  if (!options.jobResultsTable) {
    throw new HttpError(500, 'Async Claude jobs require a jobResultsTable option');
  }

  const writeStatus = (payload: Record<string, unknown>) => writeJobResult({
    tableName: options.jobResultsTable!,
    accountId: job.accountId,
    jobId: job.jobId,
    payload,
    ttlSeconds: options.jobTtlSeconds,
    client: options.dynamoClient,
  });

  for (let attempt = 0; attempt <= RATE_LIMIT_RETRIES.length; attempt++) {
    try {
      const result = await callClaude(job, options);
      await writeStatus({ status: 'complete', content: result.content });

      if (job.connectionId && options.wsApiEndpoint) {
        try {
          await pushJobComplete({
            endpoint: options.wsApiEndpoint,
            connectionId: job.connectionId,
            jobId: job.jobId,
            client: options.apiGatewayManagementClient,
          });
        } catch (err) {
          console.warn('[fn-claude-proxy-core] WSS push failed:', (err as Error).message);
        }
      }
      return;
    } catch (err) {
      const isRateLimit = err instanceof HttpError && err.statusCode === 429;

      if (isRateLimit && attempt < RATE_LIMIT_RETRIES.length) {
        const retry = RATE_LIMIT_RETRIES[attempt];
        await writeStatus({
          status: 'retrying',
          attempt: attempt + 1,
          retryDelay: retry.delayMs,
          retryLabel: retry.label,
        }).catch(() => undefined);
        await new Promise(resolve => setTimeout(resolve, retry.delayMs));
        continue;
      }

      const message = isRateLimit && attempt >= RATE_LIMIT_RETRIES.length
        ? 'Rate limit reached after multiple retries. Please wait and try again.'
        : (err instanceof Error ? err.message : 'Analysis failed');

      await writeStatus({ status: 'error', message }).catch(writeErr => {
        console.error('[fn-claude-proxy-core] Failed to write async error status:', writeErr);
      });
      return;
    }
  }
}
