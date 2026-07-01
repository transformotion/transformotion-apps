import { createAiProxyHandler, AI_CONFIG_PK, appOverrideSk } from '@transformotion/fn-ai-proxy-core';
import { stockAnalyserStructuredOutputSchemas } from '@transformotion/contracts/stock-analyser/structured-output';

export const handler = createAiProxyHandler({
  appSlug: 'stock-analyser',
  // #structured-output: the proxy resolves a request's `surface` to its canonical
  // schema here (server-side) and passes it to the provider as responseSchema, so
  // interactive tab calls (analyser/market) are schema-constrained like the engine.
  structuredOutputSchemas: stockAnalyserStructuredOutputSchemas,
  // #601/market: the `market` surface analyses a REGION — its Live grounding pass uses
  // the region rubric (macro + per-sector), not the ticker/instrument rubric, so
  // interactive Market Live no longer wrongly declares UNAVAILABLE and hard-fails.
  structuredOutputGroundingKinds: { market: 'market' },
  anthropicSecretName: process.env.ANTHROPIC_SECRET_NAME!,
  openaiSecretName: process.env.OPENAI_SECRET_NAME,
  aiConfigTableName: process.env.AI_CONFIG_TABLE,
  appOverrideTableName: process.env.APP_AI_CONFIG_TABLE,
  // #586: the AI Engine override is APP-LEVEL — read the same {AI_CONFIG,
  // APP#stock-analyser} record the batch engine reads (was per-account
  // {ACCOUNT#…, APP#AI_RUNTIME}, which only the live app honoured).
  appOverrideKey: () => ({
    pk: AI_CONFIG_PK,
    sk: appOverrideSk('stock-analyser'),
  }),
  fallbackProvider: process.env.AI_FALLBACK_PROVIDER,
  fallbackModel: process.env.AI_FALLBACK_MODEL,
  permittedApps: ['stock-analyser'],
  jobResultsTable: process.env.JOB_RESULTS_TABLE,
  wsApiEndpoint: process.env.WS_API_ENDPOINT,
  lambdaFunctionName: process.env.AWS_LAMBDA_FUNCTION_NAME,
});
