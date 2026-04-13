// Lambda: accounts  (S2.11)
// POST   /accounts            — create a new account
// GET    /accounts/{id}       — get account details
// PUT    /accounts/{id}       — update account details
// DELETE /accounts/{id}       — delete account (owner only)
// GET    /accounts/{id}/members          — list members
// DELETE /accounts/{id}/members/{userId} — remove member
// Full implementation in S2.11.
import { withAuth, ok } from '@transformotion/lambda-middleware';

export const handler = withAuth(async ({ auth, account }) => {
  // TODO S2.11: DynamoDB CRUD on platform.accounts-{stage} and platform.account-members-{stage}
  void auth; void account;
  return ok({ status: 'not_implemented', message: 'S2.11 accounts — coming soon' });
});
