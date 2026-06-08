import { createAiProxyHandler } from '@transformotion/fn-ai-proxy-core';

export const handler = createAiProxyHandler({
  appSlug: 'stock-analyser',
  anthropicSecretName: process.env.ANTHROPIC_SECRET_NAME!,
  openaiSecretName: process.env.OPENAI_SECRET_NAME,
  aiConfigTableName: process.env.AI_CONFIG_TABLE,
  appOverrideTableName: process.env.APP_AI_CONFIG_TABLE,
  appOverrideKey: (accountId) => ({
    pk: `ACCOUNT#${accountId}`,
    sk: 'APP#AI_RUNTIME',
  }),
  fallbackProvider: process.env.AI_FALLBACK_PROVIDER,
  fallbackModel: process.env.AI_FALLBACK_MODEL,
  permittedApps: ['stock-analyser'],
  jobResultsTable: process.env.JOB_RESULTS_TABLE,
  wsApiEndpoint: process.env.WS_API_ENDPOINT,
  lambdaFunctionName: process.env.AWS_LAMBDA_FUNCTION_NAME,
});
