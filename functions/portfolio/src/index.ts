// Lambda: portfolio  (S2.4)
// GET /portfolio  — return account's portfolio holdings from DynamoDB
// PUT /portfolio  — replace account's portfolio holdings in DynamoDB
// Full implementation in S2.4.
import { withAuth, ok } from '@transformotion/lambda-middleware';

export const handler = withAuth(async ({ auth, account }) => {
  // TODO S2.4: DynamoDB get/put on stock-analyser.portfolio-{stage}
  void auth; void account;
  return ok({ status: 'not_implemented', message: 'S2.4 portfolio — coming soon' });
});
