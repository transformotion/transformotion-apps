import type { APIGatewayProxyEvent } from './types';
import type { AuthClaims, AccountContext, AppName, AccountRole } from './types';
import type { AccountMembership, EntitledAppSlug } from '@transformotion/contracts/_shared/auth';
import { unauthorised, badRequest, forbidden, HttpError } from './errors';

/**
 * Extract and validate the Cognito JWT claims that API Gateway injects into
 * `requestContext.authorizer.claims` after a successful authoriser check.
 *
 * Parses both legacy `cognito:groups` and the new `apps`, `accounts`, and
 * `site_admin` claims injected by the pre-token generation Lambda. Falls back
 * gracefully when the new claims are absent (transition period).
 *
 * Throws HttpError(401) if the claims map is missing or incomplete.
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

  const groupsRaw = claims['cognito:groups'] ?? '';
  const groups = groupsRaw ? groupsRaw.split(' ').filter(Boolean) : [];

  // New claims injected by pre-token Lambda — parse with fallbacks for transition period
  let apps: EntitledAppSlug[] = [];
  try {
    const raw = claims['apps'];
    if (raw) apps = JSON.parse(raw) as EntitledAppSlug[];
  } catch { /* absent or malformed — fall back to groups */ }

  let accounts: Partial<Record<EntitledAppSlug, AccountMembership[]>> = {};
  try {
    const raw = claims['accounts'];
    if (raw) accounts = JSON.parse(raw) as Partial<Record<EntitledAppSlug, AccountMembership[]>>;
  } catch { /* absent or malformed — fall back to groups */ }

  const siteAdmin = claims['site_admin'] === 'true';

  return { userId, email, groups, apps, accounts, siteAdmin };
}

/**
 * Resolve the active account for this request from the `X-Account-Id` header.
 * Header name matching is case-insensitive (RFC 7230). API Gateway v1 preserves
 * the original casing sent by the client, so a literal key lookup would silently
 * reject requests that use conventional HTTP capitalisation (X-Account-Id).
 * Throws HttpError(400) if the header is absent or blank.
 */
export function resolveAccountContext(event: APIGatewayProxyEvent): AccountContext {
  const headers = event.headers ?? {};
  const entry = Object.entries(headers).find(([k]) => k.toLowerCase() === 'x-account-id');
  const headerAccountId = entry?.[1]?.trim();
  if (headerAccountId) {
    return { accountId: headerAccountId };
  }
  throw badRequest('No active account context. Set X-Account-Id header.');
}

/**
 * Returns true if the authenticated user belongs to the given Cognito group.
 */
export function userInGroup(claims: AuthClaims, group: string): boolean {
  return claims.groups.includes(group);
}

/**
 * Throws HttpError(403) if the user is not in at least one of the required groups.
 * @deprecated Prefer requireAppAccess / requireAccountAccess for new code.
 */
export function requireGroup(claims: AuthClaims, ...groups: string[]): void {
  const hasGroup = groups.some(g => claims.groups.includes(g));
  if (!hasGroup) {
    throw new HttpError(403, `Access requires one of: ${groups.join(', ')}`);
  }
}

const ROLE_HIERARCHY: AccountRole[] = ['viewer', 'member', 'manager', 'owner'];

function isSuperUser(auth: AuthClaims): boolean {
  return auth.siteAdmin;
}

function hasRequiredRole(roles: string[], minRole: AccountRole): boolean {
  const minIdx = ROLE_HIERARCHY.indexOf(minRole);
  return roles.some(r => ROLE_HIERARCHY.indexOf(r as AccountRole) >= minIdx);
}

/**
 * Throws HttpError(403) unless the user has the site_admin claim or is in the
 * legacy 'admin' / 'site-admin' Cognito group.
 */
export function requireSiteAdmin(auth: AuthClaims): void {
  if (!isSuperUser(auth)) throw forbidden('Site admin access required');
}

/**
 * Throws HttpError(403) unless the user has been granted access to `app`.
 * Passes if `auth.siteAdmin === true` or `auth.apps` includes `app`.
 */
export function requireAppAccess(auth: AuthClaims, app: AppName): void {
  if (isSuperUser(auth)) return;
  if (auth.apps.includes(app)) return;
  throw forbidden(`Access to app '${app}' required`);
}

/**
 * Like requireAppAccess but accepts multiple apps — passes if the user has
 * access to ANY of them. Used by platform handlers that serve multiple apps
 * (currently only claude-proxy).
 *
 * `apps` is `string[]` rather than `AppName[]` because the permitted-app list
 * is loaded from an env var at Lambda cold-start, giving `string[]`. Narrowing
 * to `AppName[]` would require a cast at every call site with no safety benefit
 * (auth.apps is already `string[]` internally).
 */
export function requireAnyAppAccess(auth: AuthClaims, apps: string[]): void {
  if (isSuperUser(auth)) return;
  if (apps.some(app => auth.apps.includes(app as EntitledAppSlug))) return;
  throw forbidden(`Access to one of [${apps.join(', ')}] required`);
}

/**
 * Throws HttpError(403) unless the user has at least `minRole` access to
 * `accountId` within `app`.
 * Passes if `auth.siteAdmin === true`, or `auth.accounts[app]` contains a
 * membership for `accountId` with role ≥ minRole.
 * Role hierarchy (ascending): viewer < member < manager < owner.
 */
export function requireAccountAccess(
  auth: AuthClaims,
  app: AppName,
  accountId: string,
  minRole: AccountRole = 'member',
): void {
  if (isSuperUser(auth)) return;
  const appAccounts = auth.accounts[app] ?? [];
  const membership = appAccounts.find(m => m.accountId === accountId);
  if (membership && hasRequiredRole([membership.role], minRole)) return;
  throw forbidden(`Account access required (accountId: ${accountId}, minRole: ${minRole})`);
}

/** A live membership row, loaded from the account-members table by the caller. */
export interface AccountMembershipRow {
  role: AccountRole;
  /** 'active' | 'disabled' | undefined. Absent means active (backwards compat). */
  status?: string;
}

/**
 * Loads the caller's live membership row for an account, or undefined when no
 * row exists. Injected by the handler so this package stays AWS-SDK-free and
 * unit-testable; each app provides a GetItem against its account-members table.
 */
export type MembershipLoader = (
  accountId: string,
  userId: string,
) => Promise<AccountMembershipRow | undefined>;

/**
 * D8 WRITE-path authorization for app-data mutations (SA/BT). Claims gate PLUS
 * a live membership-row read — the row is the authority, because claims can be
 * stale (a user demoted to `viewer` or removed after token issuance still
 * carries the old claim for up to the token lifetime).
 *
 * Rejects (403) when:
 *  - the caller shows no membership claim for the account (cheap reject; the
 *    same surface reads gate on — a caller who cannot read cannot write), or
 *  - the live row is missing — removed since token issuance → **fail closed**, or
 *  - the live row's status is not `active` (disabled), or
 *  - the live row's role is `viewer` (read-only).
 *
 * No site-admin bypass: membership is the only grant of data authority (D9); a
 * site-admin without a row is rejected like anyone else. Reads stay claims-only
 * — do NOT call this on read paths (D8: no table reads on the hot path).
 *
 * Phase 4 layering: this composes on top of the existing claims helpers; it will
 * be folded into the Phase 5 `requireAccountData`/`requireAccountAdmin` split.
 */
export async function requireAccountWrite(
  auth: AuthClaims,
  app: AppName,
  accountId: string,
  loadMembership: MembershipLoader,
): Promise<void> {
  const appAccounts = auth.accounts[app] ?? [];
  const hasClaim = appAccounts.some(m => m.accountId === accountId);
  if (!hasClaim) {
    throw forbidden(`Account membership required (accountId: ${accountId})`);
  }

  let row: AccountMembershipRow | undefined;
  try {
    row = await loadMembership(accountId, auth.userId);
  } catch (err) {
    // D8 deny-by-default: an infrastructure error while verifying membership
    // (throttle, IAM misconfig, table issue) must REJECT the write — never skip
    // the check and proceed. "DynamoDB hiccuped so we allowed the write" is the
    // exact quiet failure this rule exists to kill.
    console.error('[lambda-middleware] membership verification failed:', err);
    throw new HttpError(503, 'Could not verify account membership');
  }
  if (!row) {
    throw forbidden(`Account membership required (accountId: ${accountId})`);
  }
  if (row.status && row.status !== 'active') {
    throw forbidden('Account membership is not active');
  }
  if (row.role === 'viewer') {
    throw forbidden('Viewer role is read-only');
  }
}

/**
 * Throws HttpError(403) unless the user is the owner of `accountId` within `app`.
 *
 * Checks (in order):
 *   1. site_admin / admin group → always passes
 *   2. `auth.accounts[app]` has a membership for `accountId` with role 'owner'
 */
export function requireAccountOwner(
  auth: AuthClaims,
  app: AppName,
  accountId: string,
): void {
  if (isSuperUser(auth)) return;
  const appAccounts = auth.accounts[app] ?? [];
  const membership = appAccounts.find(m => m.accountId === accountId);
  if (membership?.role === 'owner') return;
  throw forbidden(`Account ownership required (accountId: ${accountId})`);
}
