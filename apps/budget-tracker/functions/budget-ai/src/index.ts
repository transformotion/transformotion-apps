import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { withAuth, requireAccountData } from '@transformotion/lambda-middleware';
import { dynamoMembershipLoader } from '@transformotion/fn-account-membership';
import { reviewStart } from './review-start';
import { runReviewWorker, type ReviewWorkerPayload } from './review-worker';
import { csvAnalysis } from './csv-analysis';

// D9 + ruling #1 (route-classification §5): the AI routes are member-tier ACTIONS
// (run AI over the caller's transactions, write a job row, consume provider cost),
// so they take the WRITE tier — claims + live membership row, viewer rejected.
const btData = requireAccountData('budget-tracker');
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const membershipLoader = dynamoMembershipLoader(ddb, process.env.ACCOUNT_MEMBERS_TABLE!);

// ── Handler ───────────────────────────────────────────────────────────────────
//
// Two entry modes:
//   1. HTTP via API Gateway — normal withAuth flow
//   2. Async worker — invoked directly by reviewStart with { __asyncJob: 'review-worker' }
//      The event is a ReviewWorkerPayload, not an API Gateway proxy event.

export const handler = async (event: unknown) => {
  // Detect async worker invocation
  const maybeWorker = event as Partial<ReviewWorkerPayload>;
  if (maybeWorker.__asyncJob === 'review-worker') {
    await runReviewWorker(maybeWorker as ReviewWorkerPayload);
    return;
  }

  // Normal HTTP path
  return withAuth(async ({ auth, account, event: apiEvent }) => {
    await btData.write(auth, account.accountId, membershipLoader);
    const resource = apiEvent.resource ?? '';

    if (resource === '/api/budget/v1/ai/review')       return reviewStart(auth, account.accountId, apiEvent);
    if (resource === '/api/budget/v1/ai/csv-analysis') return csvAnalysis(auth, account.accountId, apiEvent);

    throw { statusCode: 400, message: `Unrecognised route: ${apiEvent.httpMethod} ${resource}` };
  })(event as Parameters<ReturnType<typeof withAuth>>[0]);
};
