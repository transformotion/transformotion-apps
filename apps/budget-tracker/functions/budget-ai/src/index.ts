import { withAuth, requireAppAccess, requireAccountAccess } from '@transformotion/lambda-middleware';
import { reviewStart } from './review-start';
import { runReviewWorker, type ReviewWorkerPayload } from './review-worker';
import { csvAnalysis } from './csv-analysis';

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
    requireAppAccess(auth, 'budget-tracker');
    requireAccountAccess(auth, 'budget-tracker', account.accountId);
    const resource = apiEvent.resource ?? '';

    if (resource === '/api/budget/v1/ai/review')       return reviewStart(auth, account.accountId, apiEvent);
    if (resource === '/api/budget/v1/ai/csv-analysis') return csvAnalysis(auth, account.accountId, apiEvent);

    throw { statusCode: 400, message: `Unrecognised route: ${apiEvent.httpMethod} ${resource}` };
  })(event as Parameters<ReturnType<typeof withAuth>>[0]);
};
