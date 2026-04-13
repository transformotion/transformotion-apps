// Lambda: invitations  (S2.12)
// POST /accounts/{id}/invitations — send invitation email and store token in DynamoDB
// Full implementation in S2.12.
import { withAuth, ok } from '@transformotion/lambda-middleware';

export const handler = withAuth(async ({ auth, account }) => {
  // TODO S2.12: store invitation in platform.invitations-{stage}, send SES email
  void auth; void account;
  return ok({ status: 'not_implemented', message: 'S2.12 invitations — coming soon' });
});
