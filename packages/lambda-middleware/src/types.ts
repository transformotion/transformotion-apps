import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

/**
 * Claims extracted from the Cognito JWT that API Gateway validates.
 * These come from the `requestContext.authorizer.claims` map that REST API
 * Gateway populates after a successful CognitoUserPoolsAuthorizer check.
 */
export interface AuthClaims {
  /** Cognito sub — stable UUID for the user, never changes. */
  userId: string;
  /** Email address (from the `email` claim). */
  email: string;
  /** Space-separated list of Cognito groups the user belongs to. */
  groups: string[];
}

/**
 * Resolved account context for the request.
 * The active account is determined by (in order of precedence):
 *   1. `X-Account-Id` request header (explicit override, e.g. admin impersonation)
 *   2. The `custom:active_account` Cognito attribute on the JWT
 *
 * If neither is present the Lambda should return 400.
 */
export interface AccountContext {
  accountId: string;
}

/**
 * Full request context passed to every protected Lambda handler.
 */
export interface LambdaContext {
  auth: AuthClaims;
  account: AccountContext;
  /** The raw API Gateway event, for route-specific query params / body access. */
  event: APIGatewayProxyEvent;
}

/**
 * Typed Lambda handler signature used by all protected Lambdas.
 * Return a LambdaResponse or throw — the middleware wrapper catches throws
 * and converts them to appropriate HTTP responses.
 */
export type ProtectedHandler = (ctx: LambdaContext) => Promise<LambdaResponse>;

/**
 * Simplified response type. Middleware serialises `body` to JSON automatically.
 */
export interface LambdaResponse {
  statusCode: number;
  body: unknown;
  headers?: Record<string, string>;
}

/** Raw API Gateway event type re-exported for convenience. */
export type { APIGatewayProxyEvent, APIGatewayProxyResult };
