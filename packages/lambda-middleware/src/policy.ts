// @transformotion/lambda-middleware — policy layer (M16 Phase 5 / ADR D9)
//
// Table-backed authorization policy for the M16 two-axis model (ADR D9):
//   - DATA authority  → membership in the account (NO site-admin branch).
//   - ADMIN authority → control-plane policy evaluated against table state.
//
// This module is ADDITIVE in PR-A: the two D9 middlewares (`requireAccountData`,
// `requireAccountAdmin`) and the policy primitives are built and unit-tested
// here but are NOT yet wired into any route. Route migration + deletion of the
// legacy `requireAccountAccess` happen in PR-B.
//
// Fail-closed mechanics (ADR D9 "Fail-closed mechanics for every policy helper"):
//   1. Resolve the target row(s) BEFORE evaluating policy — never trust
//      request-body claims about the target.
//   2. Uniform not-found semantics — a nonexistent target and a forbidden target
//      are indistinguishable to the caller (no 404-vs-403 probing oracle). Every
//      denial throws `forbidden(UNIFORM_DENY)`.
//   3. Deny is the default return path — unknown role, unresolvable target,
//      unrecognised operation → deny. Loader THROW (infra error) → 503 (fail
//      closed; never skip-and-proceed), matching `requireAccountWrite` (D8).
//
// Deferred to Phases 8/9 (invitation semantics; pending the C.2/m17 contract
// amendment): `canCreateInvitationGrant`, `invitee-only`, `invitee-token-bearer`.
// They are intentionally NOT implemented here — they slot in as additional
// guards of the same shape (loader-resolved target → PolicyDecision → uniform
// deny). The framework below is what they slot into.

import type { AuthClaims, AccountRole, AppName } from './types';
import { forbidden, HttpError } from './errors';
import { ROLE_HIERARCHY } from './auth';
import type { AccountMembershipRow, MembershipLoader } from './auth';
import { requireAccountWrite } from './auth';

/** Single uniform denial message — keeps nonexistent and forbidden indistinguishable. */
export const UNIFORM_DENY = 'Not found or access denied';

/** Result of a pure policy evaluation. `reason` is for logging/tests, never the HTTP body. */
export type PolicyDecision = { allow: true } | { allow: false; reason: string };

const ALLOW: PolicyDecision = { allow: true };
const deny = (reason: string): PolicyDecision => ({ allow: false, reason });

// ---------------------------------------------------------------------------
// Injected loaders — keep this package AWS-SDK-free and unit-testable. Each app
// supplies a function backed by a scoped DynamoDB read.
// ---------------------------------------------------------------------------

/** Reuse the D8 write-path membership loader (account-members table GetItem). */
export type { MembershipLoader } from './auth';

/** Whether `userId` holds an app-admin grant for `appSlug` (D5 grants table GetItem). */
export type AppAdminLoader = (appSlug: string, userId: string) => Promise<boolean>;

/**
 * Live site-admin status for `userId` — a TABLE/group check, NOT the token claim.
 * Supervisory operations must verify current status (a revoked admin's stale
 * token must not retain supervisory power; D8).
 */
export type SiteAdminLoader = (userId: string) => Promise<boolean>;

/** All membership rows for an account (`userId` + `role`), for the last-owner guard. */
export type AccountMembersLoader = (
  accountId: string,
) => Promise<ReadonlyArray<{ userId: string; role: string }>>;

// ---------------------------------------------------------------------------
// Pure helpers (no I/O — exhaustively unit-tested)
// ---------------------------------------------------------------------------

/** True only for a role string the hierarchy recognises (unknown → false, deny-by-default). */
export function isKnownRole(role: string | undefined): role is AccountRole {
  return typeof role === 'string' && ROLE_HIERARCHY.includes(role as AccountRole);
}

/** `role` ranks at or above `min`. Unknown/absent role → false. */
export function roleAtLeast(role: string | undefined, min: AccountRole): boolean {
  if (!isKnownRole(role)) return false;
  return ROLE_HIERARCHY.indexOf(role) >= ROLE_HIERARCHY.indexOf(min);
}

/** A row grants active membership: present, active status, recognised role. */
export function decideMember(row: AccountMembershipRow | undefined): PolicyDecision {
  if (!row) return deny('no membership row');
  if (row.status && row.status !== 'active') return deny('membership not active');
  if (!isKnownRole(row.role)) return deny('unknown role');
  return ALLOW;
}

/** Active member with role ≥ `min`. */
export function decideMinRole(
  row: AccountMembershipRow | undefined,
  min: AccountRole,
): PolicyDecision {
  const m = decideMember(row);
  if (!m.allow) return m;
  return roleAtLeast(row!.role, min) ? ALLOW : deny(`requires role >= ${min}`);
}

/** Active member who is owner or manager. */
export function decideOwnerOrManager(row: AccountMembershipRow | undefined): PolicyDecision {
  const m = decideMember(row);
  if (!m.allow) return m;
  return row!.role === 'owner' || row!.role === 'manager'
    ? ALLOW
    : deny('owner or manager required');
}

/** Active member who is owner. */
export function decideOwner(row: AccountMembershipRow | undefined): PolicyDecision {
  const m = decideMember(row);
  if (!m.allow) return m;
  return row!.role === 'owner' ? ALLOW : deny('owner required');
}

/**
 * Role-change legality matrix (permissions model §4.5 + ADR D9):
 *  - owner   → may set ANY role, including owner.
 *  - manager → may set member|viewer|manager; NEVER owner; and may not change a
 *              target who is currently an owner.
 *  - member/viewer → may not change roles at all.
 *  - unknown role on any side → deny.
 * The last-owner guard (demoting the sole owner) is enforced separately by
 * {@link decideLastOwnerGuard} — this matrix governs grant legality only.
 */
export function decideRoleChange(
  actorRole: string | undefined,
  currentTargetRole: string | undefined,
  newRole: string | undefined,
): PolicyDecision {
  if (!isKnownRole(actorRole) || !isKnownRole(currentTargetRole) || !isKnownRole(newRole)) {
    return deny('unknown role');
  }
  if (actorRole === 'owner') return ALLOW;
  if (actorRole === 'manager') {
    if (newRole === 'owner') return deny('managers cannot grant owner');
    if (currentTargetRole === 'owner') return deny('managers cannot change an owner');
    return ALLOW;
  }
  return deny('only owner or manager may change roles');
}

/**
 * Last-owner guard: the sole remaining owner cannot be removed or demoted
 * (permissions model §4.5; ADR D9 owner-model supersession). Applies only when
 * the target is currently an owner.
 */
export function decideLastOwnerGuard(
  members: ReadonlyArray<{ userId: string; role: string }>,
  targetUserId: string,
): PolicyDecision {
  const owners = members.filter((m) => m.role === 'owner');
  const targetIsOwner = owners.some((m) => m.userId === targetUserId);
  if (!targetIsOwner) return ALLOW;
  return owners.length <= 1 ? deny('cannot remove or demote the last owner') : ALLOW;
}

/** Invitee-discovery search scope (permissions model §8). Phase 7 consumes the scope. */
export type InviteeSearchScope = 'all' | 'app' | 'managed-accounts' | 'none';

export interface DiscoveryAuthority {
  siteAdmin: boolean;
  /** Holds an app-admin grant for the app in context. */
  appAdminForApp: boolean;
  /** Holds owner or manager in at least one account (the "managed accounts" basis). */
  ownerOrManagerSomewhere: boolean;
}

/**
 * `canSearchInvitees` — returns the SCOPE of the known-user picker, never a
 * boolean (permissions model §8 discovery scopes). Seeing someone in a picker
 * does not authorise inviting them; every grant is still authorized
 * independently (Phase 8). Phase 7 consumes this scope.
 */
export function discoveryScope(authority: DiscoveryAuthority): InviteeSearchScope {
  if (authority.siteAdmin) return 'all';
  if (authority.appAdminForApp) return 'app';
  if (authority.ownerOrManagerSomewhere) return 'managed-accounts';
  return 'none';
}

// ---------------------------------------------------------------------------
// Loader-resolved guards (async; fail closed). Each RESOLVES the target first,
// then applies a pure decision, then throws a UNIFORM forbidden on denial.
// ---------------------------------------------------------------------------

/** Wrap a loader call: any throw becomes 503 (fail closed — never skip the check). */
async function safeLoad<T>(label: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    console.error(`[policy] ${label} load failed:`, err);
    throw new HttpError(503, 'Could not verify authorization');
  }
}

/** Convert a pure decision into a uniform 403 (reason logged, never surfaced). */
function assertAllow(decision: PolicyDecision): void {
  if (decision.allow) return;
  console.warn('[policy] denied:', decision.reason);
  throw forbidden(UNIFORM_DENY);
}

/**
 * Resolve the caller's effective account role, or `null` when there is no active
 * membership / the role is unknown. Loader throw → 503. The canonical
 * "resolve the target before evaluating policy" primitive.
 */
export async function accountRole(
  load: MembershipLoader,
  accountId: string,
  userId: string,
): Promise<AccountRole | null> {
  const row = await safeLoad('membership', () => load(accountId, userId));
  if (!decideMember(row).allow) return null;
  return row!.role as AccountRole;
}

/** Active membership in the account. Uniform deny on absence/forbidden. */
export async function requireAccountMember(
  load: MembershipLoader,
  accountId: string,
  userId: string,
): Promise<void> {
  const row = await safeLoad('membership', () => load(accountId, userId));
  assertAllow(decideMember(row));
}

/** Active owner-or-manager of the account. */
export async function requireAccountOwnerOrManager(
  load: MembershipLoader,
  accountId: string,
  userId: string,
): Promise<void> {
  const row = await safeLoad('membership', () => load(accountId, userId));
  assertAllow(decideOwnerOrManager(row));
}

/** Active owner of the account. */
export async function requireAccountOwnerRole(
  load: MembershipLoader,
  accountId: string,
  userId: string,
): Promise<void> {
  const row = await safeLoad('membership', () => load(accountId, userId));
  assertAllow(decideOwner(row));
}

/** App-admin for `appSlug` per the D5 grants table. Uniform deny when not granted. */
export async function requireAppAdminForApp(
  loadAppAdmin: AppAdminLoader,
  appSlug: string,
  userId: string,
): Promise<void> {
  const granted = await safeLoad('app-admin', () => loadAppAdmin(appSlug, userId));
  if (!granted) throw forbidden(UNIFORM_DENY);
}

/**
 * Supervisory site-admin — verified LIVE (loader), not from the token claim, so
 * a revoked admin's stale token cannot drive supervisory ops (D8).
 */
export async function requireSupervisorySiteAdmin(
  loadSiteAdmin: SiteAdminLoader,
  userId: string,
): Promise<void> {
  const isAdmin = await safeLoad('site-admin', () => loadSiteAdmin(userId));
  if (!isAdmin) throw forbidden(UNIFORM_DENY);
}

// ---------------------------------------------------------------------------
// Combinators
// ---------------------------------------------------------------------------

/** A bound, target-resolved policy guard (loaders + ids already closed over). */
export type PolicyGuard = () => Promise<void>;

/**
 * Passes iff at least ONE guard passes. Fail-closed precedence: if any guard
 * raises a 503 (infra/loader error) and none passes, surface the 503 (we could
 * not verify); otherwise a uniform 403. Used for OR policies, e.g. "owner/manager
 * OR supervisory site-admin" on a remove-member route.
 */
export async function anyOf(...guards: PolicyGuard[]): Promise<void> {
  let infra: HttpError | undefined;
  for (const guard of guards) {
    try {
      await guard();
      return;
    } catch (err) {
      if (err instanceof HttpError && err.statusCode === 503) infra = err;
      // 403s are expected denials — keep trying other guards.
    }
  }
  if (infra) throw infra;
  throw forbidden(UNIFORM_DENY);
}

/** Passes iff EVERY guard passes (first failure propagates — 503 or uniform 403). */
export async function allOf(...guards: PolicyGuard[]): Promise<void> {
  for (const guard of guards) {
    await guard();
  }
}

// ---------------------------------------------------------------------------
// The two D9 middlewares (built here, UNUSED until PR-B wires routes)
// ---------------------------------------------------------------------------

/**
 * D9 DATA-authority middleware for every SA/BT app-data route. There is NO
 * site-admin branch in this code path — membership is the only grant of data
 * authority, so there is nothing to misconfigure.
 *
 *  - `read`  — claims-only membership check (D8 hot path; zero table reads).
 *  - `write` — claims + live membership-row read (folds in `requireAccountWrite`):
 *              viewer / disabled / missing row → 403; loader throw → 503.
 */
export function requireAccountData(appSlug: AppName) {
  return {
    read(auth: AuthClaims, accountId: string): void {
      const memberships = auth.accounts[appSlug] ?? [];
      if (!memberships.some((m) => m.accountId === accountId)) {
        throw forbidden(UNIFORM_DENY);
      }
    },
    async write(
      auth: AuthClaims,
      accountId: string,
      load: MembershipLoader,
    ): Promise<void> {
      await requireAccountWrite(auth, appSlug, accountId, load);
    },
  };
}

/**
 * D9 ADMIN-authority entry for Launchpad control-plane routes. Composes one or
 * more target-resolved policy guards with OR semantics (a route is permitted if
 * any of its accepted authorities is satisfied — e.g. owner/manager OR
 * supervisory site-admin). Each guard already resolves its own target row(s)
 * and fails closed; this is the named composition point PR-B wires per the
 * route-classification table.
 */
export async function requireAccountAdmin(...guards: PolicyGuard[]): Promise<void> {
  if (guards.length === 0) throw forbidden(UNIFORM_DENY); // deny-by-default: no policy = no access
  await anyOf(...guards);
}
