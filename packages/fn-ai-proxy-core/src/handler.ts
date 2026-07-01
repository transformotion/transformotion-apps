import { randomUUID } from 'crypto';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import {
  badRequest,
  forbidden,
  ok,
  parseBody,
  requireAnyAppAccess,
  withAuth,
  type APIGatewayProxyEvent,
} from '@transformotion/lambda-middleware';
import { createAiProvider } from './provider';
import { executeAsyncJob } from './async-job';
import { writeJobResult } from './job-results';
import { resolveAiRuntimeConfig } from './config';
import {
  classifyAiError,
  emitAiProxyTelemetry,
  httpStatusCode,
  providerErrorCode,
  retryableAiError,
} from './telemetry';
import type {
  AsyncJobEvent,
  AiProxyAsyncResponse,
  AiProxyOptions,
  AiProxySyncResponse,
  AiProxyRequest,
} from './types';
import type { AiConfigSource, ResolvedAiRuntimeConfig } from './config';

function fallbackRuntimeConfig(
  model: string | undefined,
  options: AiProxyOptions,
): ResolvedAiRuntimeConfig {
  return {
    provider: options.provider ?? 'claude',
    model: model ?? options.model ?? options.anthropicModel ?? 'claude-sonnet-4-6',
    source: 'environment_fallback' satisfies AiConfigSource,
  };
}

async function resolveRuntimeConfig(
  model: string | undefined,
  options: AiProxyOptions,
  accountId: string,
): Promise<ResolvedAiRuntimeConfig> {
  if (!options.appSlug) {
    return fallbackRuntimeConfig(model, options);
  }

  return resolveAiRuntimeConfig({
    appSlug: options.appSlug,
    tableName: options.aiConfigTableName,
    appOverrideTableName: options.appOverrideTableName,
    appOverrideKey: options.appOverrideKey?.(accountId),
    fallbackProvider: options.fallbackProvider,
    fallbackModel: options.fallbackModel ?? model ?? options.model ?? options.anthropicModel,
    client: options.aiConfigClient ?? options.dynamoClient,
  });
}

export function createAiProxyHandler(options: AiProxyOptions) {
  const apiGatewayHandler = withAuth(async ({ auth, account, event }) => {
    const requestId = event.requestContext?.requestId;

    if (options.permittedApps?.length) {
      requireAnyAppAccess(auth, [...options.permittedApps]);
    }

    const {
      prompt,
      system,
      model: requestedModel,
      maxTokens = 4000,
      webSearch = false,
      asyncMode = false,
      connectionId,
      appName,
      surface,
    } = parseBody<AiProxyRequest>(event);

    // Resolve the structured-output schema for the named surface (server-side, so
    // the schema never crosses the wire). Absent surface/registry → free-text.
    const responseSchema = surface && options.structuredOutputSchemas
      ? options.structuredOutputSchemas[surface]
      : undefined;
    // #601/market: the Live grounding rubric for this surface — e.g. 'market' for Market
    // Analysis (region macro + per-sector, not ticker technicals). Absent → 'security'.
    const groundingKind = surface && options.structuredOutputGroundingKinds
      ? options.structuredOutputGroundingKinds[surface]
      : undefined;

    if (!prompt?.trim()) {
      throw badRequest('prompt is required');
    }
    if (maxTokens < 1 || maxTokens > 32000) {
      throw badRequest('maxTokens must be between 1 and 32000');
    }
    if (appName && options.permittedApps?.length && !options.permittedApps.includes(appName)) {
      throw forbidden(`App is not permitted to use this Claude proxy: ${appName}`);
    }

    const runtimeConfig = await resolveRuntimeConfig(requestedModel, options, account.accountId);

    if (asyncMode) {
      if (!options.jobResultsTable || !options.lambdaFunctionName) {
        throw badRequest('Async Claude mode is not configured for this proxy');
      }

      const jobId = randomUUID();
      await writeJobResult({
        tableName: options.jobResultsTable,
        accountId: account.accountId,
        jobId,
        payload: {
          status: 'pending',
          provider: runtimeConfig.provider,
          model: runtimeConfig.model,
          configurationSource: runtimeConfig.source,
        },
        ttlSeconds: options.jobTtlSeconds,
        client: options.dynamoClient,
      });

      const jobPayload: AsyncJobEvent = {
        __asyncJob: true,
        jobId,
        accountId: account.accountId,
        prompt,
        system,
        requestId,
        provider: runtimeConfig.provider,
        model: runtimeConfig.model,
        configurationSource: runtimeConfig.source,
        maxTokens,
        webSearch,
        ...(responseSchema !== undefined ? { responseSchema } : {}),
        ...(groundingKind ? { groundingKind } : {}),
        ...(connectionId ? { connectionId } : {}),
      };

      const lambdaClient = options.lambdaClient ?? new LambdaClient({});
      await lambdaClient.send(new InvokeCommand({
        FunctionName: options.lambdaFunctionName,
        InvocationType: 'Event',
        Payload: Buffer.from(JSON.stringify(jobPayload)),
      }));

      return ok({ jobId, status: 'pending' } satisfies AiProxyAsyncResponse);
    }

    const startedAt = Date.now();
    try {
      const provider = createAiProvider(runtimeConfig.provider, options);
      const result = await provider.generate({
        prompt,
        system,
        model: runtimeConfig.model,
        maxTokens,
        webSearch,
        responseSchema,
        groundingKind,
      });
      emitAiProxyTelemetry({
        eventName: 'ai_runtime_execution',
        appSlug: options.appSlug,
        requestId,
        asyncMode: false,
        provider: runtimeConfig.provider,
        model: runtimeConfig.model,
        configurationSource: runtimeConfig.source,
        latencyMs: Date.now() - startedAt,
        success: true,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        ...(result.totalTokens !== undefined ? { totalTokens: result.totalTokens } : {}),
      });
      return ok({
        content: result.content,
        provider: result.provider,
        model: result.model,
        configurationSource: runtimeConfig.source,
        usage: {
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          ...(result.totalTokens !== undefined ? { totalTokens: result.totalTokens } : {}),
        },
      } satisfies AiProxySyncResponse);
    } catch (err) {
      emitAiProxyTelemetry({
        eventName: 'ai_runtime_execution',
        appSlug: options.appSlug,
        requestId,
        asyncMode: false,
        provider: runtimeConfig.provider,
        model: runtimeConfig.model,
        configurationSource: runtimeConfig.source,
        latencyMs: Date.now() - startedAt,
        success: false,
        errorClass: classifyAiError(err),
        errorRetryable: retryableAiError(err),
        providerErrorCode: providerErrorCode(err),
        httpStatusCode: httpStatusCode(err),
      });
      throw err;
    }
  });

  return async (event: AsyncJobEvent | APIGatewayProxyEvent): Promise<unknown> => {
    if ((event as AsyncJobEvent).__asyncJob === true) {
      await executeAsyncJob(event as AsyncJobEvent, options);
      return;
    }
    return apiGatewayHandler(event as APIGatewayProxyEvent);
  };
}
