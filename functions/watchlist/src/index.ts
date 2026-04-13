// Lambda: watchlist  (S2.5)
// GET /watchlist  — return account's watchlist from DynamoDB
// PUT /watchlist  — replace account's watchlist in DynamoDB
// Full implementation in S2.5.
import { withAuth, ok } from '@transformotion/lambda-middleware';

export const handler = withAuth(async ({ auth, account }) => {
  // TODO S2.5: DynamoDB get/put on stock-analyser.watchlist-{stage}
  void auth; void account;
  return ok({ status: 'not_implemented', message: 'S2.5 watchlist — coming soon' });
});
