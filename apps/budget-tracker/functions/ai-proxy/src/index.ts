import { createClaudeProxyHandler } from '@transformotion/fn-claude-proxy-core';

export const handler = createClaudeProxyHandler({
  anthropicSecretName: process.env.ANTHROPIC_SECRET_NAME!,
  permittedApps: ['budget-tracker'],
});
