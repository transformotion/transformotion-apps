import type { APIGatewayProxyEvent } from './types';
import type { AuthClaims, AccountContext } from './types';
import { unauthorised, badRequest, HttpError } from './errors';

/**
 * Extract and validate the Cognito JWT claims that API Gateway injects into
 * `requestContext.authorizer.claims` after a successful authoriser check.
 *
 * Throws HttpError(401) if the claims map is missing or incomplete — this
 * should never happen on a properly-configured protected route, but guards
 * against mis-wired integrations during development.
 */
export function extractAuthClaims(event: APIGatewayProxyEvent): AuthClaims {
  const claims = event.requestContext?.authorizer?.claims as Record<string, string> | undefined;

  if (!claims) {
    throw unauthorised('No authorizer claims on request context — route may not be protected');
  }

  const userId = claims['sub'];
  const email  = claims['email'];

  if (!userId) throw unauthorised('JWT claim `sub` missing');
  if (!email)  throw unauthorised('JWT claim `email` missing');

  // `cognito:groups` is a space-separated string or absent for users in no groups
  const groupsRaw = claims['cognito:groups'] ?? '';
  const groups = groupsRaw ? groupsRaw.split(' ').filter(Boolean) : [];

  return { userId, email, groups };
}

/**
 * Resolve the active account for this request.
 *
 * Precedence:
 *   1. `X-Account-Id` header — explicit override (e.g. admin switching accounts)
 *   2. `custom:active_account` JWT claim — the user's last-selected account
 *
 * Throws HttpError(400) if no account context can be resolved.
 * The frontend must ensure `custom:active_account` is set after first login
 * (handled in S2.8 first-login migration flow).
 */
export function resolveAccountContext(
  event: APIGatewayProxyEvent,
  claims: Record<string, string>,
): AccountContext {
  // Header override takes precedence (trimmed, lowercased for safety)
  const headerAccountId = event.headers?.['x-account-id']?.trim();
  if (headerAccountId) {
    return { accountId: headerAccountId };
  }

  // Fall back to the active account stored in the JWT custom attribute
  const jwtAccountId = claims['custom:active_account']?.trim();
  if (jwtAccountId) {
    return { accountId: jwtAccountId };
  }

  throw badRequest(
    'No active account context. Set X-Account-Id header or update custom:active_account on the user.',
  );
}

/**
 * Returns true if the authenticated user belongs to the given Cognito group.
 */
export function userInGroup(claims: AuthClaims, group: string): boolean {
  return claims.groups.includes(group);
}

/**
 * Throws HttpError(403) if the user is not in at least one of the required groups.
 */
export function requireGroup(claims: AuthClaims, ...groups: string[]): void {
  const hasGroup = groups.some(g => claims.groups.includes(g));
  if (!hasGroup) {
    throw new HttpError(403, `Access requires one of: ${groups.join(', ')}`);
  }
}
