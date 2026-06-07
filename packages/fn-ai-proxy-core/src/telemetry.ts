import { HttpError } from '@transformotion/lambda-middleware';
import { AiProviderError, type AiErrorClass, type AiProviderId } from './types';
import type { AiConfigAppSlug, AiConfigSource } from './config';

export interface AiProxyTelemetryEvent {
  eventName: 'ai_runtime_execution';
  appSlug?: AiConfigAppSlug;
  requestId?: string;
  asyncMode: boolean;
  provider: AiProviderId;
  model: string;
  configurationSource: AiConfigSource;
  latencyMs: number;
  success: boolean;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  errorClass?: AiErrorClass;
  errorRetryable?: boolean;
  providerErrorCode?: string;
  httpStatusCode?: number;
}

export function classifyAiError(err: unknown): AiErrorClass {
  if (err instanceof AiProviderError) {
    return err.errorClass;
  }
  if (err instanceof HttpError && err.statusCode === 429) {
    return 'rate_limit';
  }
  if (err instanceof HttpError && (err.statusCode === 401 || err.statusCode === 403)) {
    return 'authentication';
  }
  if (err instanceof HttpError && err.statusCode >= 500) {
    return 'provider_unavailable';
  }
  return 'unknown';
}

export function retryableAiError(err: unknown): boolean | undefined {
  if (err instanceof AiProviderError) {
    return err.retryable;
  }
  return undefined;
}

export function providerErrorCode(err: unknown): string | undefined {
  if (err instanceof AiProviderError) {
    return err.providerErrorCode;
  }
  return undefined;
}

export function httpStatusCode(err: unknown): number | undefined {
  if (err instanceof HttpError) {
    return err.statusCode;
  }
  return undefined;
}

export function emitAiProxyTelemetry(event: AiProxyTelemetryEvent): void {
  const log = event.success ? console.info : console.warn;
  log(JSON.stringify(event));
}
