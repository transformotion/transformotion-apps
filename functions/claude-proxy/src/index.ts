// Lambda: claude-proxy
// Retrieves Anthropic API key from Secrets Manager (/prod/anthropic/api-key) and
// proxies requests to the Anthropic API. Browser never calls Anthropic directly.
// Implemented in Phase 2 (S2.4) — see DEVELOPMENT_PLAN.md.
export const handler = async () => ({ statusCode: 200 });
