// Lambda: claude-proxy  (S2.3)
// Retrieves Anthropic API key from Secrets Manager and proxies POST /api/claude
// to the Anthropic Messages API. The browser never calls Anthropic directly.
// Full implementation in S2.3 — this file establishes the withAuth wrapper now
// so the import chain typechecks before the business logic is wired.
import { withAuth, ok } from '@transformotion/lambda-middleware';

export const handler = withAuth(async ({ auth, account }) => {
  // TODO S2.3: read Secrets Manager /dev|prod/anthropic/api-key, proxy to Anthropic
  void auth; void account;
  return ok({ status: 'not_implemented', message: 'S2.3 claude-proxy — coming soon' });
});
