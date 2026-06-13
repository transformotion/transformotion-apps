import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import type { AccountMembership, AccountRole as ContractAccountRole, EntitledAppSlug } from '@transformotion/contracts/_shared/auth';

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
  /** Cognito groups (from `cognito:groups`). Sole source of platform admin status (`site-admin`). */
  groups: string[];
  /** Apps the user has been granted access to, e.g. ['budget-tracker', 'stock-analyser']. */
  apps: EntitledAppSlug[];
  /**
   * Account memberships keyed by appSlug, value is an array of membership records.
   * e.g. { 'budget-tracker': [{ accountId: 'acc-uuid', role: 'member' }] }.
   * Empty until pre-token Lambda is live.
   */
  accounts: Partial<Record<EntitledAppSlug, AccountMembership[]>>;
  /** True when the user is in the `site-admin` Cognito group (derived from `groups`). */
  siteAdmin: boolean;
}

/** App identifiers used across all auth helpers. */
export type AppName = EntitledAppSlug;

/** Account role levels (ordered ascending by capability). */
export type AccountRole = ContractAccountRole;

/**
 * Resolved account context for the request.
 * The active account is determined from the `X-Account-Id` request header.
 * If the header is absent the middleware throws 400.
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
 * Auth-only context: JWT claims available but no account context resolved.
 * Used by first-login / setup routes where the user has no account yet.
 */
export interface AuthOnlyContext {
  auth: AuthClaims;
  event: APIGatewayProxyEvent;
}

export type AuthOnlyHandler = (ctx: AuthOnlyContext) => Promise<LambdaResponse>;

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
