import type { ApiGatewayManagementApiClient } from '@aws-sdk/client-apigatewaymanagementapi';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type { LambdaClient } from '@aws-sdk/client-lambda';
import type { SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import type { AuthClaims, AccountContext } from '@transformotion/lambda-middleware';

export interface ClaudeProxyOptions {
  anthropicSecretName: string;
  anthropicModel?: string;
  permittedApps?: readonly string[];
  jobResultsTable?: string;
  wsApiEndpoint?: string;
  lambdaFunctionName?: string;
  jobTtlSeconds?: number;
  apiKeyCacheTtlMs?: number;
  secretsManagerClient?: SecretsManagerClient;
  lambdaClient?: LambdaClient;
  dynamoClient?: DynamoDBDocumentClient;
  apiGatewayManagementClient?: ApiGatewayManagementApiClient;
  fetchImpl?: typeof fetch;
}

export interface ClaudeRequest {
  prompt: string;
  system?: string;
  model?: string;
  maxTokens?: number;
  webSearch?: boolean;
  asyncMode?: boolean;
  connectionId?: string;
  appName?: string;
}

export interface ClaudeInvocationRequest {
  prompt: string;
  system?: string;
  model?: string;
  maxTokens?: number;
  webSearch?: boolean;
}

export interface ClaudeInvocationResult {
  content: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

export interface ClaudeProxySyncResponse {
  content: string;
  model: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
}

export interface ClaudeProxyAsyncResponse {
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

export interface AsyncJobEvent extends ClaudeInvocationRequest {
  __asyncJob: true;
  jobId: string;
  accountId: string;
  connectionId?: string;
}

export interface ClaudeProxyAuthContext {
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
