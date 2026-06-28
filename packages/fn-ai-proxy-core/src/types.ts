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
}

export interface AiProviderRequest {
  prompt: string;
  system?: string;
  model?: string;
  maxTokens?: number;
  webSearch?: boolean;
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
