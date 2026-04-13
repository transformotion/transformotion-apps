// Lambda: analysis-cache  (S2.6)
// GET    /analysis-cache/{key}  — return cached analysis item
// PUT    /analysis-cache/{key}  — store cached analysis item with TTL
// DELETE /analysis-cache/{key}  — remove cached analysis item
// Full implementation in S2.6.
import { withAuth, ok } from '@transformotion/lambda-middleware';

export const handler = withAuth(async ({ auth, account }) => {
  // TODO S2.6: DynamoDB get/put/delete on stock-analyser.cache-{stage}
  void auth; void account;
  return ok({ status: 'not_implemented', message: 'S2.6 analysis-cache — coming soon' });
});
