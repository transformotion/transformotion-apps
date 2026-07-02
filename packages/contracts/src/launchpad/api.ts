import type { ApiRoute, EmptyRequest } from '../_shared/api';
import { emptyRequest } from '../_shared/api';
import type { EntitledAppSlug } from '../_shared/auth';
import type {
  CreateInvitationBundleRequest,
  CreateInvitationBundleResponse,
  GetActiveAccountsResponse,
  InvitationBundle,
  InviteeSearchRequest,
  InviteeSearchResponse,
  ListAccountMembersResponse,
  ListMyInvitationsResponse,
  ListUserAccessResponse,
  PolicyRequirement,
  RedeemBundleRequest,
  RedeemBundleResponse,
  SetActiveAccountRequest,
  UpdateMemberRoleRequest,
} from './invitations';
import {
  exampleAccountMemberRow,
  exampleCreateBundleRequest,
  exampleCreateBundleResponse,
  exampleDiscoveredInvitee,
  exampleInvitationBundle,
  exampleInviteeSearchScope,
  exampleRedeemBundleResponse,
  exampleUserAccessSummary,
} from './invitations.examples';
import { exampleAiRuntimeConfigResponse, type AiRuntimeConfigRecord, type AiRuntimeConfigUpdate } from '../_shared/ai-runtime';
import {
  exampleAccount,
  exampleAccountMember,
  exampleInvitation,
  exampleUserPreferences,
  exampleUserProfile,
  type AccountMember,
  type AccountSetupRequest,
  type AccountSetupResponse,
  type AccountSummary,
  type Invitation,
  type LaunchpadAiConfigAppSlug,
  type LookupProviderRequest,
  type LookupProviderResponse,
} from './types';

export interface CreateAccountRequest {
  name: string;
  /**
   * Which app the user is creating their first account in. The launchpad is
   * multi-app and the auth token can't say which app the user clicked — that's
   * request data (the tile the user picked), so it travels in the body.
   *
   * AUTHORIZATION IS UNCHANGED. The handler still gates on the caller holding
   * the `{appSlug}-app-access` group: `appSlug` only specifies WHICH app, while
   * the caller's access GROUP is what authorizes the create. A caller cannot
   * create an account in an app whose access group they do not hold, regardless
   * of the `appSlug` sent (fail closed). This is the "create their own account"
   * path from auth-model.md — requires the app-access group and an active user,
   * does NOT require a pre-existing membership, and makes the creator the
   * `owner` of the new account.
   */
  appSlug: EntitledAppSlug;
}

export interface UpdateAccountRequest {
  name: string;
}

export interface CreateInvitationRequest {
  email: string;
}

export interface UpdateUserPreferencesRequest {
  /**
   * Human-friendly name shown across apps. Optional: sent only when the user
   * edits it on the profile surface. Persisted to `UserProfile.displayName`
   * (_shared/auth.ts) — the resolved value lives on the profile/session.
   * Some IdPs (e.g. personal Microsoft accounts) supply no name, so users set
   * their own here. Typed in m16.8.0; previously sent as an untyped field.
   */
  displayName?: string;
  notificationsEnabled?: boolean;
}

export interface GetAccountResponse {
  account: AccountSummary;
  members: AccountMember[];
}

export interface ListMembersResponse {
  members: AccountMember[];
}

export interface ListInvitationsResponse {
  invitations: Invitation[];
}

export interface CreateInvitationResponse {
  invitationId: string;
}

export interface UpdateAppAiOverrideResponse extends AiRuntimeConfigRecord {
  appSlug: LaunchpadAiConfigAppSlug;
}

/**
 * @deprecated M15.1 — app-specific AI override editing moved into each app's
 * own Settings tab (Budget Tracker / Stock Analyser). Launchpad now owns only
 * the platform default. These app-override write routes are retained
 * (not deleted) for a safe runtime transition and will be removed in a future
 * milestone. Launchpad may still GET the platform-wide config for a read-only
 * effective summary.
 */
export type LaunchpadDeprecatedAppOverrideRoute =
  | ApiRoute<AiRuntimeConfigUpdate, UpdateAppAiOverrideResponse>
  | ApiRoute<EmptyRequest, void>;

/**
 * M16 — route with documented fine-grained policy. Route `auth` stays coarse;
 * `policy` documents the additional check the backend MUST enforce. See
 * behaviour.md ("Authorization policies") for each policy's semantics.
 *
 * Target-resolved policy: where a policy depends on a path-addressed resource
 * (e.g. cancel-bundle / cancel-grant / get-bundle), the backend MUST first
 * resolve the bundle/grant to determine its target app + account before
 * evaluating `account-owner-or-manager` vs `app-admin-for-app`. Policy
 * evaluation is target-resolved, not deducible from the route alone. A path
 * that does not resolve to an existing target MUST fail closed.
 */
export interface PolicyAnnotatedRoute<Request, Response> extends ApiRoute<Request, Response> {
  policy: readonly PolicyRequirement[];
}

export type LaunchpadApiRoute =
  // Directory / user access summaries
  | PolicyAnnotatedRoute<EmptyRequest, ListUserAccessResponse>
  // Account members
  | PolicyAnnotatedRoute<EmptyRequest, ListAccountMembersResponse>
  | PolicyAnnotatedRoute<UpdateMemberRoleRequest, ListAccountMembersResponse>
  | PolicyAnnotatedRoute<EmptyRequest, void>
  // Invitation bundles (create / list / get one / cancel bundle / cancel grant / redeem)
  | PolicyAnnotatedRoute<CreateInvitationBundleRequest, CreateInvitationBundleResponse>
  | PolicyAnnotatedRoute<EmptyRequest, { bundles: InvitationBundle[] }>
  | PolicyAnnotatedRoute<EmptyRequest, { bundle: InvitationBundle }>
  | PolicyAnnotatedRoute<RedeemBundleRequest, RedeemBundleResponse>
  // User self-service: my own pending invitations (invitee/self read)
  | PolicyAnnotatedRoute<EmptyRequest, ListMyInvitationsResponse>
  // Invitee discovery
  | PolicyAnnotatedRoute<InviteeSearchRequest, InviteeSearchResponse>
  // Active account
  | PolicyAnnotatedRoute<EmptyRequest, GetActiveAccountsResponse>
  | PolicyAnnotatedRoute<SetActiveAccountRequest, GetActiveAccountsResponse>;

export type LaunchpadRoute =
  | ApiRoute<EmptyRequest, { ok: true }>
  | ApiRoute<LookupProviderRequest, LookupProviderResponse>
  | ApiRoute<AccountSetupRequest, AccountSetupResponse>
  | ApiRoute<EmptyRequest, typeof exampleUserProfile>
  | ApiRoute<UpdateUserPreferencesRequest, { preferences: typeof exampleUserPreferences }>
  | ApiRoute<CreateAccountRequest, { account: AccountSummary }>
  | ApiRoute<EmptyRequest, GetAccountResponse>
  | ApiRoute<UpdateAccountRequest, { account: AccountSummary }>
  | ApiRoute<EmptyRequest, ListMembersResponse>
  | ApiRoute<CreateInvitationRequest, CreateInvitationResponse>
  | ApiRoute<EmptyRequest, ListInvitationsResponse>
  | ApiRoute<EmptyRequest, typeof exampleAiRuntimeConfigResponse>
  | ApiRoute<AiRuntimeConfigUpdate, AiRuntimeConfigRecord>
  | ApiRoute<AiRuntimeConfigUpdate, UpdateAppAiOverrideResponse>
  | ApiRoute<EmptyRequest, void>;

export const launchpadRoutes = [
  { method: 'GET', path: '/health', auth: 'public', request: emptyRequest, response: { ok: true } },
  {
    method: 'POST',
    path: '/auth/lookup-provider',
    auth: 'public',
    request: { email: 'user@example.com' },
    response: { message: 'If we found an account with that email, we sent a sign-in hint.' },
  },
  {
    method: 'POST',
    path: '/auth/setup',
    auth: 'auth-only',
    request: { kind: 'id-token-derived' },
    // Profile-only bootstrap: no account is created; `accountId` is omitted.
    response: { userCreated: true, profileComplete: false },
  },
  { method: 'GET', path: '/api/user/profile', auth: 'auth-only', request: emptyRequest, response: exampleUserProfile },
  {
    method: 'PUT',
    path: '/api/user/preferences',
    auth: 'auth-only',
    request: { notificationsEnabled: true },
    response: { preferences: exampleUserPreferences },
  },
  { method: 'POST', path: '/accounts', auth: 'account', request: { name: 'Household', appSlug: 'budget-tracker' }, response: { account: exampleAccount } },
  {
    method: 'GET',
    path: '/accounts/{accountId}',
    auth: 'account',
    request: emptyRequest,
    response: { account: exampleAccount, members: [exampleAccountMember] },
  },
  { method: 'PUT', path: '/accounts/{accountId}', auth: 'account', request: { name: 'Renamed household' }, response: { account: exampleAccount } },
  { method: 'DELETE', path: '/accounts/{accountId}', auth: 'account', request: emptyRequest, response: undefined },
  { method: 'GET', path: '/accounts/{accountId}/members', auth: 'account', request: emptyRequest, response: { members: [exampleAccountMember] } },
  { method: 'DELETE', path: '/accounts/{accountId}/members/{userId}', auth: 'account', request: emptyRequest, response: undefined },
  {
    // @legacy/transitional (pre-M16) — single-invitation create. M16's bundle
    // model (`POST /api/invitations/bundles`) is the canonical surface for new
    // work; it supports multi-grant, per-grant authorization, and redemption.
    // Runtime implementers should build the bundle routes first, not this one.
    method: 'POST',
    path: '/accounts/{accountId}/invitations',
    auth: 'account',
    request: { email: 'invitee@example.com' },
    response: { invitationId: exampleInvitation.invitationId },
  },
  {
    // @legacy/transitional (pre-M16) — single-invitation list. Prefer the M16
    // bundle surfaces (`GET /api/invitations/bundles` and the per-account
    // `pendingInvitations` on `/accounts/{accountId}/members/detail`).
    method: 'GET',
    path: '/accounts/{accountId}/invitations',
    auth: 'account',
    request: emptyRequest,
    response: { invitations: [exampleInvitation] },
  },
  {
    method: 'GET',
    path: '/api/admin/ai-runtime-config',
    auth: 'site-admin',
    request: emptyRequest,
    response: exampleAiRuntimeConfigResponse,
  },
  {
    method: 'PUT',
    path: '/api/admin/ai-runtime-config/platform-default',
    auth: 'site-admin',
    request: { provider: 'claude', model: 'claude-sonnet-4-6' },
    response: exampleAiRuntimeConfigResponse.platformDefault,
  },
  {
    // @deprecated M15.1 — app override editing moved into each app's Settings.
    // Retained for runtime transition; prefer the per-app override endpoints.
    method: 'PUT',
    path: '/api/admin/ai-runtime-config/apps/{appSlug}/override',
    auth: 'site-admin',
    request: { provider: 'openai', model: 'gpt-5.4-mini' },
    response: {
      appSlug: 'stock-analyser',
      pk: 'AI_CONFIG',
      sk: 'APP#stock-analyser',
      provider: 'openai',
      model: 'gpt-5.4-mini',
      updatedAt: '2026-06-07T00:00:00.000Z',
    },
  },
  {
    // @deprecated M15.1 — app override reset moved into each app's Settings.
    // Retained for runtime transition; prefer the per-app override endpoints.
    method: 'DELETE',
    path: '/api/admin/ai-runtime-config/apps/{appSlug}/override',
    auth: 'site-admin',
    request: emptyRequest,
    response: undefined,
  },
] as const satisfies readonly LaunchpadRoute[];

// ---------------------------------------------------------------------------
// Invitation / membership / discovery / active-account routes
// (policy-annotated; see PolicyAnnotatedRoute and behaviour.md)
// ---------------------------------------------------------------------------

export const launchpadApiRoutes = [
  // --- Directory / user access ---
  {
    method: 'GET',
    path: '/api/admin/users/access',
    auth: 'auth-only',
    policy: ['site-admin'],
    request: emptyRequest,
    response: { users: [exampleUserAccessSummary] },
  },
  // --- Account members ---
  {
    method: 'GET',
    path: '/accounts/{accountId}/members/detail',
    auth: 'account',
    policy: ['account-member', 'supervisory-site-admin'],
    request: emptyRequest,
    response: {
      accountId: 'acct-bt-household',
      members: [exampleAccountMemberRow],
      pendingInvitations: [exampleInvitationBundle],
    },
  },
  {
    method: 'PUT',
    path: '/accounts/{accountId}/members/{userId}/role',
    auth: 'account',
    policy: ['account-owner-or-manager'],
    request: { role: 'manager' },
    response: {
      accountId: 'acct-bt-household',
      members: [exampleAccountMemberRow],
      pendingInvitations: [],
    },
  },
  {
    method: 'DELETE',
    path: '/accounts/{accountId}/members/{userId}',
    auth: 'account',
    policy: ['account-owner-or-manager'],
    request: emptyRequest,
    response: undefined,
  },
  // --- Invitation bundles ---
  {
    method: 'POST',
    path: '/api/invitations/bundles',
    auth: 'auth-only',
    policy: ['canCreateInvitationGrant'],
    request: exampleCreateBundleRequest,
    response: exampleCreateBundleResponse,
  },
  {
    method: 'GET',
    path: '/api/invitations/bundles',
    auth: 'auth-only',
    policy: ['canCreateInvitationGrant', 'supervisory-site-admin'],
    request: emptyRequest,
    response: { bundles: [exampleInvitationBundle] },
  },
  {
    // Single-bundle fetch — used for redemption, admin review, pending
    // invitation detail, and direct invitation links. Target-resolved policy:
    // the sender path requires owner/manager of a targeted account OR
    // app-admin of a targeted app; the invitee path is covered at redeem time.
    method: 'GET',
    path: '/api/invitations/bundles/{bundleId}',
    auth: 'auth-only',
    policy: ['account-owner-or-manager', 'app-admin-for-app', 'invitee-only'],
    request: emptyRequest,
    response: { bundle: exampleInvitationBundle },
  },
  {
    method: 'DELETE',
    path: '/api/invitations/bundles/{bundleId}',
    auth: 'auth-only',
    policy: ['account-owner-or-manager', 'app-admin-for-app'],
    request: emptyRequest,
    response: { bundle: exampleInvitationBundle },
  },
  {
    method: 'DELETE',
    path: '/api/invitations/bundles/{bundleId}/grants/{grantId}',
    auth: 'auth-only',
    policy: ['account-owner-or-manager', 'app-admin-for-app'],
    request: emptyRequest,
    response: { bundle: exampleInvitationBundle },
  },
  {
    method: 'POST',
    path: '/api/invitations/bundles/{bundleId}/redeem',
    auth: 'auth-only',
    policy: ['invitee-only'],
    request: emptyRequest,
    response: exampleRedeemBundleResponse,
  },
  // --- User self-service: my own pending invitations ---
  {
    // The authenticated caller's OWN pending invitation bundles, resolved from
    // their token identity. policy `invitee-only`: results are limited to
    // bundles where the CALLER is the invitee — never the sender/admin scope
    // (contrast `GET /api/invitations/bundles`, the sender read). One read,
    // two consumers: the Profile pending sub-list (now) and #482's on-sign-in
    // reconciliation (later). Accept reuses `.../bundles/{bundleId}/redeem`.
    method: 'GET',
    path: '/api/user/invitations',
    auth: 'auth-only',
    policy: ['invitee-only'],
    request: emptyRequest,
    response: { bundles: [exampleInvitationBundle] },
  },
  // --- Invitee discovery ---
  {
    method: 'POST',
    path: '/api/invitations/invitee-search',
    auth: 'auth-only',
    policy: ['canSearchInvitees'],
    request: { query: 'ava' },
    response: { scope: exampleInviteeSearchScope, results: [exampleDiscoveredInvitee] },
  },
  // --- Active account ---
  {
    method: 'GET',
    path: '/api/user/active-accounts',
    auth: 'auth-only',
    policy: ['account-member'],
    request: emptyRequest,
    response: { selections: [{ appSlug: 'budget-tracker', accountId: 'acct-bt-household' }] },
  },
  {
    method: 'PUT',
    path: '/api/user/active-accounts/{appSlug}',
    auth: 'auth-only',
    policy: ['account-member'],
    request: { accountId: 'acct-bt-household' },
    response: { selections: [{ appSlug: 'budget-tracker', accountId: 'acct-bt-household' }] },
  },
] as const satisfies readonly LaunchpadApiRoute[];
