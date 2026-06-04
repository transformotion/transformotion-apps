import { HttpError } from '@transformotion/lambda-middleware';
import { createAiProvider } from './provider';
import { writeJobResult } from './job-results';
import { pushJobComplete } from './wss';
import {
  classifyAiError,
  emitAiProxyTelemetry,
  httpStatusCode,
  providerErrorCode,
  retryableAiError,
} from './telemetry';
import { AiProviderError, type AsyncJobEvent, type AiProxyOptions } from './types';

const RATE_LIMIT_RETRIES: Array<{ delayMs: number; label: string }> = [
  { delayMs: 20_000, label: '20s' },
  { delayMs: 45_000, label: '45s' },
  { delayMs: 90_000, label: '90s' },
];

export async function executeAsyncJob(job: AsyncJobEvent, options: AiProxyOptions): Promise<void> {
  if (!options.jobResultsTable) {
    throw new HttpError(500, 'Async AI jobs require a jobResultsTable option');
  }

  const startedAt = Date.now();
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
      const provider = createAiProvider(job.provider, options);
      const result = await provider.generate(job);
      await writeStatus({
        status: 'complete',
        content: result.content,
        provider: job.provider,
        model: job.model,
        configurationSource: job.configurationSource,
        usage: {
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          ...(result.totalTokens !== undefined ? { totalTokens: result.totalTokens } : {}),
        },
      });

      emitAiProxyTelemetry({
        eventName: 'ai_runtime_execution',
        appSlug: options.appSlug,
        requestId: job.requestId,
        asyncMode: true,
        provider: job.provider,
        model: job.model,
        configurationSource: job.configurationSource,
        latencyMs: Date.now() - startedAt,
        success: true,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        ...(result.totalTokens !== undefined ? { totalTokens: result.totalTokens } : {}),
      });

      if (job.connectionId && options.wsApiEndpoint) {
        try {
          await pushJobComplete({
            endpoint: options.wsApiEndpoint,
            connectionId: job.connectionId,
            jobId: job.jobId,
            client: options.apiGatewayManagementClient,
          });
        } catch (err) {
          console.warn('[fn-ai-proxy-core] WSS push failed:', (err as Error).message);
        }
      }
      return;
    } catch (err) {
      const isRateLimit =
        (err instanceof HttpError && err.statusCode === 429) ||
        (err instanceof AiProviderError && err.statusCode === 429);

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

      await writeStatus({
        status: 'error',
        message,
        provider: job.provider,
        model: job.model,
        configurationSource: job.configurationSource,
        errorClass: classifyAiError(err),
      }).catch(writeErr => {
        console.error('[fn-ai-proxy-core] Failed to write async error status:', writeErr);
      });
      emitAiProxyTelemetry({
        eventName: 'ai_runtime_execution',
        appSlug: options.appSlug,
        requestId: job.requestId,
        asyncMode: true,
        provider: job.provider,
        model: job.model,
        configurationSource: job.configurationSource,
        latencyMs: Date.now() - startedAt,
        success: false,
        errorClass: classifyAiError(err),
        errorRetryable: retryableAiError(err),
        providerErrorCode: providerErrorCode(err),
        httpStatusCode: httpStatusCode(err),
      });
      return;
    }
  }
}
