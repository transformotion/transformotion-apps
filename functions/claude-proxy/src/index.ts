import { randomUUID } from 'crypto';
import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import {
  withAuth,
  parseBody,
  ok,
  badRequest,
  requireGroup,
  HttpError,
  type APIGatewayProxyEvent,
} from '@transformotion/lambda-middleware';

// ── Clients (one per Lambda container) ───────────────────────────────────────

const sm           = new SecretsManagerClient({});
const lambdaClient = new LambdaClient({});
const ddb          = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const CACHE_TABLE     = process.env.CACHE_TABLE ?? '';
const JOB_TTL_SECONDS = 2 * 60 * 60; // 2 hours

// ── Anthropic API key cache ───────────────────────────────────────────────────

let cachedApiKey: string | undefined;
let cacheExpiresAt = 0;

async function getAnthropicApiKey(): Promise<string> {
  const now = Date.now();
  if (cachedApiKey && now < cacheExpiresAt) {
    console.log('[claude-proxy] Using cached API key');
    return cachedApiKey;
  }

  console.log('[claude-proxy] Step 2: Fetching API key from Secrets Manager, secret:', process.env.ANTHROPIC_SECRET_NAME);
  const res = await sm.send(
    new GetSecretValueCommand({ SecretId: process.env.ANTHROPIC_SECRET_NAME! }),
  );

  if (!res.SecretString) throw new HttpError(500, 'Anthropic API key secret is empty');

  cachedApiKey   = res.SecretString.trim();
  cacheExpiresAt = now + 5 * 60 * 1000;
  console.log('[claude-proxy] Step 2: API key retrieved, length:', cachedApiKey.length);
  return cachedApiKey;
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface ClaudeRequest {
  prompt:     string;
  system?:    string;
  model?:     string;
  maxTokens?: number;
  webSearch?: boolean;
  asyncMode?: boolean;
}

interface AnthropicContentBlock {
  type: string;
  text?: string;
}

interface AnthropicResponse {
  content: AnthropicContentBlock[];
  model:   string;
  usage: { input_tokens: number; output_tokens: number };
  error?: { type: string; message: string };
}

/**
 * Payload sent to the async Lambda self-invocation.
 * Identified by `__asyncJob: true` so the handler can distinguish it from
 * an API Gateway event.
 */
interface AsyncJobEvent {
  __asyncJob: true;
  jobId:      string;
  accountId:  string;
  prompt:     string;
  system?:    string;
  model?:     string;
  maxTokens?: number;
  webSearch?: boolean;
}

// ── Core Anthropic call ───────────────────────────────────────────────────────

interface AnthropicResult {
  content:      string;
  model:        string;
  inputTokens:  number;
  outputTokens: number;
}

async function callAnthropicOnce(
  req: Omit<ClaudeRequest, 'asyncMode'>,
  startTime: number,
): Promise<AnthropicResult> {
  const {
    prompt,
    system,
    model     = 'claude-sonnet-4-20250514',
    maxTokens = 4000,
    webSearch = false,
  } = req;

  const apiKey = await getAnthropicApiKey();

  const requestBody: Record<string, unknown> = {
    model,
    max_tokens: maxTokens,
    messages: [{ role: 'user', content: prompt }],
  };

  if (system)    requestBody['system'] = system;
  if (webSearch) requestBody['tools']  = [{ type: 'web_search_20250305', name: 'web_search' }];

  // Rough token estimate: 1 token ≈ 4 chars
  const estimatedInputTokens = Math.ceil((prompt.length + (system?.length ?? 0)) / 4);
  console.log(
    '[claude-proxy] Step 3: Sending to Anthropic —',
    `model=${model}, webSearch=${webSearch}, maxTokens=${maxTokens},`,
    `estimatedInputTokens≈${estimatedInputTokens}, elapsed=${Date.now() - startTime}ms`,
  );

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type':      'application/json',
      'x-api-key':         apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(requestBody),
  });

  console.log(
    '[claude-proxy] Step 4: Anthropic responded —',
    `httpStatus=${res.status}, elapsed=${Date.now() - startTime}ms`,
  );

  const data = await res.json() as AnthropicResponse;

  if (!res.ok) {
    console.error('[claude-proxy] Anthropic error body:', JSON.stringify(data?.error));

    if (res.status === 429) throw new HttpError(429, 'RATE_LIMIT');
    if (res.status === 401) throw new HttpError(502, 'Upstream API authentication failed — check the API key secret.');
    throw new HttpError(502, `Upstream API error: ${data?.error?.message ?? res.status}`);
  }

  const textBlocks = data.content.filter(b => b.type === 'text' && b.text?.trim());
  if (!textBlocks.length) {
    console.error('[claude-proxy] No text blocks in response. content types:', data.content.map(b => b.type).join(','));
    throw new HttpError(502, 'No text content returned from the AI model');
  }

  // Strip <cite index="...">text</cite> tags that Anthropic web_search injects
  // into response text. Keep the inner text, remove only the tags.
  const rawText = textBlocks[textBlocks.length - 1].text!;
  const content = rawText.replace(/<cite[^>]*>([\s\S]*?)<\/cite>/g, '$1');
  console.log(
    '[claude-proxy] Step 4 OK: content length:', content.length,
    'inputTokens:', data.usage.input_tokens,
    'outputTokens:', data.usage.output_tokens,
  );
  return {
    content,
    model:        data.model,
    inputTokens:  data.usage.input_tokens,
    outputTokens: data.usage.output_tokens,
  };
}

// Simple passthrough — retry logic lives in executeAsyncJob where we have
// DDB context to write status updates between attempts.
async function callAnthropic(
  req: Omit<ClaudeRequest, 'asyncMode'>,
  startTime: number,
): Promise<AnthropicResult> {
  return callAnthropicOnce(req, startTime);
}

// ── Async job execution (Lambda-to-Lambda, no API Gateway) ────────────────────

// Retry schedule: three retries after the initial attempt
const RATE_LIMIT_RETRIES: Array<{ delayMs: number; label: string }> = [
  { delayMs:  20_000, label: '20s' },
  { delayMs:  45_000, label: '45s' },
  { delayMs:  90_000, label: '90s' },
];

async function executeAsyncJob(job: AsyncJobEvent): Promise<void> {
  const startTime = Date.now();
  const ttlEpoch  = Math.floor(startTime / 1000) + JOB_TTL_SECONDS;

  const writeJob = async (payload: Record<string, unknown>) => {
    const now = new Date().toISOString();
    await ddb.send(new PutCommand({
      TableName: CACHE_TABLE,
      Item: {
        accountId: job.accountId,
        cacheKey:  `job-${job.jobId}`,
        data:      { data: payload, cachedAt: now, mode: 'live', type: 'job' },
        cachedAt:  now,
        expiresAt: ttlEpoch,
      },
    }));
  };

  console.log(
    '[claude-proxy] Step 1 (async job): jobId:', job.jobId,
    'accountId:', job.accountId,
    'webSearch:', job.webSearch,
    'CACHE_TABLE:', CACHE_TABLE,
    'promptLength:', job.prompt.length,
  );

  // Up to 3 attempts (initial + 2 retries on 429)
  for (let attempt = 0; attempt <= RATE_LIMIT_RETRIES.length; attempt++) {
    try {
      const result = await callAnthropic(job, startTime);

      console.log(
        '[claude-proxy] Step 5: Writing complete result to DynamoDB —',
        'cacheKey:', `job-${job.jobId}`,
        'elapsed:', Date.now() - startTime, 'ms',
      );
      await writeJob({ status: 'complete', content: result.content });
      console.log('[claude-proxy] Step 6: Complete — jobId:', job.jobId, 'duration:', Date.now() - startTime, 'ms');
      return;

    } catch (err) {
      const isRateLimit = err instanceof HttpError && err.statusCode === 429;

      if (isRateLimit && attempt < RATE_LIMIT_RETRIES.length) {
        const { delayMs, label } = RATE_LIMIT_RETRIES[attempt];
        console.log(
          `[claude-proxy] Rate limit on attempt ${attempt + 1}, retrying after ${label}`,
          'elapsed:', Date.now() - startTime, 'ms',
        );
        // Tell the frontend we hit a rate limit and are retrying
        await writeJob({ status: 'retrying', attempt: attempt + 1, retryDelay: delayMs }).catch(() => {/* non-fatal */});
        await new Promise(r => setTimeout(r, delayMs));
        continue;
      }

      // Final failure (non-rate-limit error, or rate limit exhausted)
      const isExhausted = isRateLimit && attempt >= RATE_LIMIT_RETRIES.length;
      const message = isExhausted
        ? 'Rate limit reached after multiple retries. Please wait and try again.'
        : (err instanceof Error ? err.message : 'Analysis failed');

      console.error('[claude-proxy] async job FAILED:', message, 'elapsed:', Date.now() - startTime, 'ms');
      try {
        await writeJob({ status: 'error', message });
      } catch (ddbErr) {
        console.error('[claude-proxy] CRITICAL: Failed to write error status to DynamoDB:', ddbErr);
      }
      return;
    }
  }
}

// ── API Gateway handler (Cognito-authenticated) ───────────────────────────────

const apiGatewayHandler = withAuth(async ({ auth, account, event }) => {
  requireGroup(auth, 'stock-app', 'stock-app-access', 'budget-app', 'budget-app-access', 'admin', 'site-admin');
  const {
    prompt,
    system,
    model     = 'claude-sonnet-4-20250514',
    maxTokens = 4000,
    webSearch = false,
    asyncMode = false,
  } = parseBody<ClaudeRequest>(event);

  if (!prompt?.trim()) throw badRequest('prompt is required');
  if (maxTokens < 1 || maxTokens > 32000) throw badRequest('maxTokens must be between 1 and 32000');

  // ── Async mode: fire-and-forget, return job ID immediately ────────────────
  if (asyncMode) {
    const jobId    = randomUUID();
    const ttlEpoch = Math.floor(Date.now() / 1000) + JOB_TTL_SECONDS;
    const now      = new Date().toISOString();

    console.log(
      '[claude-proxy] Step 1 (trigger): asyncMode=true, jobId:', jobId,
      'accountId:', account.accountId,
      'webSearch:', webSearch,
      'CACHE_TABLE:', CACHE_TABLE,
      'fnName:', process.env.AWS_LAMBDA_FUNCTION_NAME,
    );

    // Write pending state so the frontend knows the job started
    await ddb.send(new PutCommand({
      TableName: CACHE_TABLE,
      Item: {
        accountId: account.accountId,
        cacheKey:  `job-${jobId}`,
        data: {
          data:     { status: 'pending' },
          cachedAt: now,
          mode:     'live',
          type:     'job',
        },
        cachedAt:  now,
        expiresAt: ttlEpoch,
      },
    }));

    console.log('[claude-proxy] Step 1 (trigger): Pending record written. Invoking async job…');

    // Invoke this Lambda asynchronously (Event type = no response, no timeout)
    const jobPayload: AsyncJobEvent = {
      __asyncJob: true,
      jobId,
      accountId: account.accountId,
      prompt, system, model, maxTokens, webSearch,
    };

    await lambdaClient.send(new InvokeCommand({
      FunctionName:   process.env.AWS_LAMBDA_FUNCTION_NAME!,
      InvocationType: 'Event',
      Payload:        Buffer.from(JSON.stringify(jobPayload)),
    }));

    console.log('[claude-proxy] Step 1 (trigger): Async job invoked. Returning jobId:', jobId);
    return ok({ jobId, status: 'pending' });
  }

  // ── Sync mode ─────────────────────────────────────────────────────────────
  const startTime = Date.now();
  console.log('[claude-proxy] Sync mode (no asyncMode): calling Anthropic directly');
  const result = await callAnthropic({ prompt, system, model, maxTokens, webSearch }, startTime);
  console.log('[claude-proxy] Sync mode complete, duration:', Date.now() - startTime, 'ms');
  return ok({
    content: result.content,
    model:   result.model,
    usage: {
      inputTokens:  result.inputTokens,
      outputTokens: result.outputTokens,
    },
  });
});

// ── Lambda entry point ────────────────────────────────────────────────────────

export const handler = async (
  event: AsyncJobEvent | APIGatewayProxyEvent,
): Promise<unknown> => {
  // Async job execution — invoked directly by this Lambda (no API Gateway)
  if ((event as AsyncJobEvent).__asyncJob === true) {
    await executeAsyncJob(event as AsyncJobEvent);
    return;
  }
  // API Gateway proxy event — go through auth middleware
  return apiGatewayHandler(event as APIGatewayProxyEvent);
};
