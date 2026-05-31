import { createClaudeProxyHandler } from '@transformotion/fn-claude-proxy-core';

export const handler = createClaudeProxyHandler({
  anthropicSecretName: process.env.ANTHROPIC_SECRET_NAME!,
  permittedApps: ['stock-analyser'],
  jobResultsTable: process.env.JOB_RESULTS_TABLE,
  wsApiEndpoint: process.env.WS_API_ENDPOINT,
  lambdaFunctionName: process.env.AWS_LAMBDA_FUNCTION_NAME,
});
