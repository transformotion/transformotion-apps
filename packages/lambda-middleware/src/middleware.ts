import type { APIGatewayProxyEvent, APIGatewayProxyResult, LambdaResponse } from './types';
import type { ProtectedHandler } from './types';
import { extractAuthClaims, resolveAccountContext } from './auth';
import { HttpError } from './errors';
import { errorResponse } from './response';

/**
 * Wrap a protected Lambda handler with standard middleware:
 *
 *   1. Extract and validate Cognito JWT claims from the API Gateway event
 *   2. Resolve the active account (X-Account-Id header → JWT custom attribute)
 *   3. Call the inner handler with the fully-typed LambdaContext
 *   4. Serialise LambdaResponse → APIGatewayProxyResult
 *   5. Catch HttpError throws → structured JSON error response
 *   6. Catch unexpected errors → 500 with sanitised message (no stack in prod)
 *
 * Usage:
 * ```ts
 * import { withAuth } from '@transformotion/lambda-middleware';
 *
 * export const handler = withAuth(async ({ auth, account, event }) => {
 *   // auth.userId, auth.email, auth.groups
 *   // account.accountId
 *   return { statusCode: 200, body: { ok: true } };
 * });
 * ```
 */
export function withAuth(inner: ProtectedHandler) {
  return async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    try {
      const auth    = extractAuthClaims(event);
      const claims  = event.requestContext?.authorizer?.claims as Record<string, string>;
      const account = resolveAccountContext(event, claims);

      const result = await inner({ auth, account, event });

      return {
        statusCode: result.statusCode,
        headers: {
          'Access-Control-Allow-Origin':  '*',
          'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Account-Id',
          'Content-Type':                 'application/json',
          ...result.headers,
        },
        body: result.body === null ? '' : JSON.stringify(result.body),
      };
    } catch (err) {
      if (err instanceof HttpError) {
        return errorResponse(err.statusCode, err.message, err.detail);
      }

      // Unexpected error — log the real message server-side, return generic 500
      console.error('[lambda-middleware] Unhandled error:', err);
      return errorResponse(500, 'An unexpected error occurred');
    }
  };
}

/**
 * Wrap a public (unauthenticated) Lambda handler with consistent error handling
 * and response serialisation. No auth or account context is extracted.
 *
 * Usage:
 * ```ts
 * import { withPublic } from '@transformotion/lambda-middleware';
 *
 * export const handler = withPublic(async (event) => {
 *   return { statusCode: 200, body: { status: 'ok' } };
 * });
 * ```
 */
export function withPublic(
  inner: (event: APIGatewayProxyEvent) => Promise<LambdaResponse>,
) {
  return async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    try {
      const result = await inner(event);
      return {
        statusCode: result.statusCode,
        headers: {
          'Access-Control-Allow-Origin':  '*',
          'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Account-Id',
          'Content-Type':                 'application/json',
          ...result.headers,
        },
        body: result.body === null ? '' : JSON.stringify(result.body),
      };
    } catch (err) {
      if (err instanceof HttpError) {
        return errorResponse(err.statusCode, err.message, err.detail);
      }
      console.error('[lambda-middleware] Unhandled error:', err);
      return errorResponse(500, 'An unexpected error occurred');
    }
  };
}
