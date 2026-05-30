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
import { callClaude } from './anthropic';
import { executeAsyncJob } from './async-job';
import { writeJobResult } from './job-results';
import type {
  AsyncJobEvent,
  ClaudeProxyAsyncResponse,
  ClaudeProxyOptions,
  ClaudeProxySyncResponse,
  ClaudeRequest,
} from './types';

export function createClaudeProxyHandler(options: ClaudeProxyOptions) {
  const apiGatewayHandler = withAuth(async ({ auth, account, event }) => {
    if (options.permittedApps?.length) {
      requireAnyAppAccess(auth, [...options.permittedApps]);
    }

    const {
      prompt,
      system,
      model = options.anthropicModel ?? 'claude-sonnet-4-20250514',
      maxTokens = 4000,
      webSearch = false,
      asyncMode = false,
      connectionId,
      appName,
    } = parseBody<ClaudeRequest>(event);

    if (!prompt?.trim()) {
      throw badRequest('prompt is required');
    }
    if (maxTokens < 1 || maxTokens > 32000) {
      throw badRequest('maxTokens must be between 1 and 32000');
    }
    if (appName && options.permittedApps?.length && !options.permittedApps.includes(appName)) {
      throw forbidden(`App is not permitted to use this Claude proxy: ${appName}`);
    }

    if (asyncMode) {
      if (!options.jobResultsTable || !options.lambdaFunctionName) {
        throw badRequest('Async Claude mode is not configured for this proxy');
      }

      const jobId = randomUUID();
      await writeJobResult({
        tableName: options.jobResultsTable,
        accountId: account.accountId,
        jobId,
        payload: { status: 'pending' },
        ttlSeconds: options.jobTtlSeconds,
        client: options.dynamoClient,
      });

      const jobPayload: AsyncJobEvent = {
        __asyncJob: true,
        jobId,
        accountId: account.accountId,
        prompt,
        system,
        model,
        maxTokens,
        webSearch,
        ...(connectionId ? { connectionId } : {}),
      };

      const lambdaClient = options.lambdaClient ?? new LambdaClient({});
      await lambdaClient.send(new InvokeCommand({
        FunctionName: options.lambdaFunctionName,
        InvocationType: 'Event',
        Payload: Buffer.from(JSON.stringify(jobPayload)),
      }));

      return ok({ jobId, status: 'pending' } satisfies ClaudeProxyAsyncResponse);
    }

    const result = await callClaude({ prompt, system, model, maxTokens, webSearch }, options);
    return ok({
      content: result.content,
      model: result.model,
      usage: {
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
      },
    } satisfies ClaudeProxySyncResponse);
  });

  return async (event: AsyncJobEvent | APIGatewayProxyEvent): Promise<unknown> => {
    if ((event as AsyncJobEvent).__asyncJob === true) {
      await executeAsyncJob(event as AsyncJobEvent, options);
      return;
    }
    return apiGatewayHandler(event as APIGatewayProxyEvent);
  };
}
