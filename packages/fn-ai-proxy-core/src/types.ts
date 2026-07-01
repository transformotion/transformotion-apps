import type { ApiGatewayManagementApiClient } from '@aws-sdk/client-apigatewaymanagementapi';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type { LambdaClient } from '@aws-sdk/client-lambda';
import type { SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { HttpError } from '@transformotion/lambda-middleware';
import type { AuthClaims, AccountContext } from '@transformotion/lambda-middleware';
import type { AiConfigAppSlug, AiConfigSource } from './config';
import type { AiProviderId } from '@transformotion/contracts/_shared/ai-runtime';

export type { AiProviderId } from '@transformotion/contracts/_shared/ai-runtime';

export type AiErrorClass =
  | 'configuration'
  | 'authentication'
  | 'rate_limit'
  | 'timeout'
  | 'provider_unavailable'
  | 'provider_bad_response'
  | 'validation'
  | 'unknown';

export class AiProviderError extends HttpError {
  constructor(
    public readonly errorClass: AiErrorClass,
    public readonly statusCode: number,
    public readonly retryable: boolean,
    message: string,
    public readonly providerErrorCode?: string,
  ) {
    super(statusCode, message, providerErrorCode);
    this.name = 'AiProviderError';
  }
}

export interface AiProviderResponseDiagnostics {
  provider: AiProviderId;
  model: string;
  phase: 'provider_http_json_parse' | 'model_output_json_parse';
  httpStatus?: number;
  responseHeaders?: Record<string, string>;
  responseBodyPrefix?: string;
  modelOutputPrefix?: string;
}

export class AiProviderNonJsonError extends AiProviderError {
  constructor(
    message: string,
    public readonly diagnostics: AiProviderResponseDiagnostics,
  ) {
    super('provider_bad_response', 502, false, message);
    this.name = 'AiProviderNonJsonError';
  }
}

export interface AiProxyOptions {
  anthropicSecretName?: string;
  openaiSecretName?: string;
  /**
   * Temporary #377 bridge. Runtime provider/model resolution lands in
   * #378/#379/#380; app-owned branching must not grow around this field.
   */
  provider?: AiProviderId;
  model?: string;
  anthropicModel?: string;
  appSlug?: AiConfigAppSlug;
  appOverrideTableName?: string;
  appOverrideKey?: (accountId: string) => Record<string, string>;
  aiConfigTableName?: string;
  fallbackProvider?: string;
  fallbackModel?: string;
  permittedApps?: readonly string[];
  jobResultsTable?: string;
  wsApiEndpoint?: string;
  lambdaFunctionName?: string;
  jobTtlSeconds?: number;
  apiKeyCacheTtlMs?: number;
  secretsManagerClient?: SecretsManagerClient;
  lambdaClient?: LambdaClient;
  dynamoClient?: DynamoDBDocumentClient;
  aiConfigClient?: DynamoDBDocumentClient;
  apiGatewayManagementClient?: ApiGatewayManagementApiClient;
  fetchImpl?: typeof fetch;
  /**
   * App-owned structured-output schema registry, keyed by `surface`. When a
   * request names a `surface` present here, the resolved schema is passed to the
   * provider as `responseSchema` (provider-agnostic at the call site; the app
   * supplies its own canonical schemas). Decouples the generic proxy from any
   * one app's surfaces.
   */
  structuredOutputSchemas?: Record<string, unknown>;
  /**
   * #601/market: per-surface Live grounding rubric, keyed by `surface`. Surfaces
   * analysing a REGION (e.g. `market`) set `'market'` so the research pass assesses
   * macro + per-sector availability instead of the default ticker/instrument rubric.
   * Absent surface → `'security'`.
   */
  structuredOutputGroundingKinds?: Record<string, import('./structured-output').GroundingKind>;
}

export interface AiProxyRequest {
  prompt: string;
  system?: string;
  model?: string;
  maxTokens?: number;
  webSearch?: boolean;
  asyncMode?: boolean;
  connectionId?: string;
  appName?: string;
  /**
   * Structured-output surface (e.g. 'analyser', 'market'). Resolved server-side
   * to a `responseSchema` via `AiProxyOptions.structuredOutputSchemas` so the big
   * schema never crosses the wire from the client.
   */
  surface?: string;
}

export interface AiProviderRequest {
  prompt: string;
  system?: string;
  model?: string;
  maxTokens?: number;
  webSearch?: boolean;
  /**
   * Structured-output JSON Schema (the v0 canonical schema for the surface). When
   * present, the provider CONSTRAINS output to it via its native structured-output
   * mechanism (OpenAI response_format json_schema / Anthropic forced tool-use)
   * instead of free-text prompt-and-parse. Provider-agnostic at the call site;
   * provider-specific shaping (e.g. OpenAI strict-mode) is applied inside each
   * provider. See contracts/stock-analyser/structured-output.behaviour.md.
   */
  responseSchema?: unknown;
  /**
   * #601/market: which DATA_STATUS availability rubric the Live grounding (research)
   * pass uses — `security` (default, ticker/instrument) or `market` (region: macro +
   * per-sector, not tradable-instrument/RSI). Only affects the structured + webSearch
   * two-pass. See `buildGroundedResearchPrompt`.
   */
  groundingKind?: import('./structured-output').GroundingKind;
}

export interface AiProviderResult {
  content: string;
  provider: AiProviderId;
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens?: number;
}

export interface AiProvider {
  generate(request: AiProviderRequest): Promise<AiProviderResult>;
}

export interface AiProxySyncResponse {
  content: string;
  provider?: AiProviderId;
  model: string;
  configurationSource?: AiConfigSource;
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens?: number;
  };
}

export interface AiProxyAsyncResponse {
  jobId: string;
  status: 'pending';
}

export interface JobResultsRecord {
  accountId: string;
  cacheKey: string;
  data: {
    data: Record<string, unknown>;
    cachedAt: string;
    mode: 'live';
    type: 'job';
  };
  cachedAt: string;
  expiresAt: number;
}

export interface AsyncJobEvent extends AiProviderRequest {
  __asyncJob: true;
  jobId: string;
  accountId: string;
  connectionId?: string;
  requestId?: string;
  provider: AiProviderId;
  model: string;
  configurationSource: AiConfigSource;
}

export interface AiProxyAuthContext {
  auth: AuthClaims;
  account: AccountContext;
}

export interface AnthropicContentBlock {
  type: string;
  text?: string;
  /** Present on `tool_use` blocks (forced-tool structured output). */
  name?: string;
  input?: unknown;
}

export interface AnthropicResponse {
  content: AnthropicContentBlock[];
  model: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
  error?: {
    type: string;
    message: string;
  };
}

export interface OpenAIResponse {
  output_text?: string;
  output?: Array<{
    type?: string;
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  }>;
  model?: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
  };
  error?: {
    code?: string;
    message?: string;
    type?: string;
  };
}

export type ClaudeProxyOptions = AiProxyOptions;
export type ClaudeRequest = AiProxyRequest;
export type ClaudeInvocationRequest = AiProviderRequest;
export type ClaudeInvocationResult = AiProviderResult;
export type ClaudeProxySyncResponse = AiProxySyncResponse;
export type ClaudeProxyAsyncResponse = AiProxyAsyncResponse;
export type ClaudeProxyAuthContext = AiProxyAuthContext;
