// @transformotion/lambda-middleware
// Shared middleware for all Transformotion Lambda functions.
//
// Core wrappers:
//   withAuth(handler)      — protected routes (Cognito JWT + account context)
//   withAuthOnly(handler)  — auth but no account context (first-login / setup routes)
//   withPublic(handler)    — public routes (error handling + response serialisation only)
//
// Request helpers:
//   parseBody<T>(event)              — parse + type-assert JSON body, throws 400 on failure
//   getPathParam(event, name)        — required path parameter, throws 400 if absent
//   getQueryParam(event, name, req?) — optional or required query string parameter
//
// Response helpers:
//   ok(body, statusCode?)  — 200 JSON response with CORS headers
//   created(body)          — 201 JSON response
//   noContent()            — 204 no body
//   errorResponse(...)     — structured { error, message } JSON response
//
// Error helpers:
//   HttpError              — base class, throw from any handler
//   badRequest(msg)        — 400
//   unauthorised(msg?)     — 401
//   forbidden(msg?)        — 403
//   notFound(msg)          — 404
//   conflict(msg)          — 409
//
// Auth helpers:
//   userInGroup(claims, group)                          — boolean membership check
//   requireGroup(claims, ...groups)                     — throws 403 if user not in any group (legacy)
//   requireSiteAdmin(auth)                              — throws 403 unless site admin
//   requireAppAccess(auth, app)                         — throws 403 unless user has app access
//   requireAnyAppAccess(auth, apps)                     — throws 403 unless user has access to any of the apps
//   requireAccountWrite(auth, app, accountId, loader)   — D8 write-path: claims + live row (viewer/disabled/missing → 403)
//   (requireAccountAccess / requireAccountOwner were DELETED in M16 Phase 5 — use the policy layer below)

export { withAuth, withAuthOnly, withPublic }            from './middleware';
export { ok, created, noContent, errorResponse }        from './response';
export { HttpError, badRequest, unauthorised, forbidden, notFound, conflict } from './errors';
export { parseBody, getPathParam, getQueryParam }        from './body';
export {
  userInGroup,
  requireGroup,
  requireSiteAdmin,
  requireAppAccess,
  requireAnyAppAccess,
  requireAccountWrite,
}                                                       from './auth';
export type {
  AuthClaims,
  AccountContext,
  LambdaContext,
  AuthOnlyContext,
  LambdaResponse,
  ProtectedHandler,
  AuthOnlyHandler,
  APIGatewayProxyEvent,
  APIGatewayProxyResult,
  AppName,
  AccountRole,
} from './types';
export type { AccountMembershipRow, MembershipLoader } from './auth';

// M16 Phase 5 policy layer (ADR D9) — built additively in PR-A; routes migrate
// onto requireAccountData / requireAccountAdmin in PR-B (requireAccountAccess deleted then).
export {
  // D9 middlewares
  requireAccountData,
  requireAccountAdmin,
  // loader-resolved guards
  accountRole,
  requireAccountMember,
  requireAccountOwnerOrManager,
  requireAccountOwnerRole,
  requireAppAdminForApp,
  requireSupervisorySiteAdmin,
  // combinators
  anyOf,
  allOf,
  // pure decisions
  isKnownRole,
  roleAtLeast,
  decideMember,
  decideMinRole,
  decideOwnerOrManager,
  decideOwner,
  decideRoleChange,
  decideRemoval,
  decideLastOwnerGuard,
  discoveryScope,
  UNIFORM_DENY,
} from './policy';
export type {
  PolicyDecision,
  PolicyGuard,
  SiteAdminLoader,
  AccountMembersLoader,
  InviteeSearchScope,
  DiscoveryAuthority,
} from './policy';
