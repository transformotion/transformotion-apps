import { createAiProxyHandler } from '@transformotion/fn-ai-proxy-core';

export const handler = createAiProxyHandler({
  appSlug: 'budget-tracker',
  anthropicSecretName: process.env.ANTHROPIC_SECRET_NAME!,
  openaiSecretName: process.env.OPENAI_SECRET_NAME,
  aiConfigTableName: process.env.AI_CONFIG_TABLE,
  appOverrideTableName: process.env.APP_AI_CONFIG_TABLE,
  appOverrideKey: (accountId) => ({
    accountId,
    settingKey: 'AI_CONFIG#APP#budget-tracker',
  }),
  fallbackProvider: process.env.AI_FALLBACK_PROVIDER,
  fallbackModel: process.env.AI_FALLBACK_MODEL,
  permittedApps: ['budget-tracker'],
});
