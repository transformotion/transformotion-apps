import { HttpClient } from './http';
import type {
  GetActiveAccountsResponse,
  ListAccountMembersResponse,
  UserAccessSummary,
} from '@transformotion/contracts/launchpad/invitations';

export interface ControlPlaneClientOptions {
  /**
   * Launchpad control-plane API base URL, INCLUDING the API Gateway stage,
   * e.g. https://<api>.execute-api.<region>.amazonaws.com/dev/
   */
  baseUrl: string;
  /** Async function returning a valid Cognito ID token (Amplify handles refresh). */
  getToken: () => Promise<string>;
}

/**
 * Client for the Launchpad control-plane endpoints that other apps (Stock
 * Analyser / Budget Tracker) consume — currently the per-app active account
 * (M16 D7). It is the authoritative source for "which account is active for
 * this app"; apps must NOT fall back to first-account-from-token.
 *
 * Built on HttpClient, which normalises the base URL to end with `/` and strips
 * leading slashes from paths — so the API Gateway stage (`/dev`) is preserved
 * and the `new URL('/path', base)` stage-drop trap (#423) cannot be reintroduced.
 */
export class ControlPlaneClient {
  private readonly http: HttpClient;

  constructor(opts: ControlPlaneClientOptions) {
    this.http = new HttpClient({ baseUrl: opts.baseUrl, getToken: opts.getToken });
  }

  /** GET /api/user/active-accounts — the caller's active account per app. */
  getActiveAccounts(signal?: AbortSignal): Promise<GetActiveAccountsResponse> {
    return this.http.get('api/user/active-accounts', signal);
  }

  /**
   * PUT /api/user/active-accounts/{appSlug} — set the caller's active account
   * for an app. The server fails closed when the user is not a member of the
   * account for that app. Returns the updated selection set.
   */
  setActiveAccount(
    appSlug: string,
    accountId: string,
    signal?: AbortSignal,
  ): Promise<GetActiveAccountsResponse> {
    return this.http.put(
      `api/user/active-accounts/${encodeURIComponent(appSlug)}`,
      { accountId },
      signal,
    );
  }

  /**
   * GET /api/admin/users/access — cross-app/cross-account access summary for
   * EVERY user (M16 Phase 6 / M11 Users & Access). Site-admin only; the server
   * fails closed (403) for non-site-admins. Returns one `UserAccessSummary` per
   * user, matching the v0 `listUserAccess()` shape so the ported Users & Access
   * view wires with no adapter.
   */
  getUserAccess(signal?: AbortSignal): Promise<{ users: UserAccessSummary[] }> {
    return this.http.get('api/admin/users/access', signal);
  }

  /**
   * GET /accounts/{accountId} — account metadata (incl. display name) for an
   * account the caller is a member of. Used to label account selectors. The
   * X-Account-Id header is required by the account-context middleware; the
   * handler authorizes membership on the path id.
   */
  getAccount(accountId: string, signal?: AbortSignal): Promise<ControlPlaneAccount> {
    return this.http.get(
      `accounts/${encodeURIComponent(accountId)}`,
      signal,
      { 'X-Account-Id': accountId },
    );
  }

  /**
   * GET /accounts/{accountId}/members/detail — full member list for an account
   * the caller is a member of (M16 Phase 6 R2): each row carries `isLastOwner`;
   * `pendingInvitations` is present but empty until Phase 8. The `accounts`
   * handler is `withAuthOnly` (path-id authorized) — no X-Account-Id needed.
   */
  getMembersDetail(accountId: string, signal?: AbortSignal): Promise<ListAccountMembersResponse> {
    return this.http.get(`accounts/${encodeURIComponent(accountId)}/members/detail`, signal);
  }

  /**
   * PUT /accounts/{accountId} — rename an account (owner-or-manager; field-guard
   * limits writes to `name`). Returns the updated account summary.
   */
  updateAccount(
    accountId: string,
    body: { name: string },
    signal?: AbortSignal,
  ): Promise<{ account: { accountId: string; name: string; updatedAt: string } }> {
    return this.http.put(`accounts/${encodeURIComponent(accountId)}`, body, signal);
  }

  /**
   * DELETE /accounts/{accountId}/members/{userId} — remove a member (owner-or-
   * manager with role-scoped removal, or supervisory site-admin). 403/409 surface
   * as ApiError with the server message; the target is signed out on success.
   */
  removeMember(accountId: string, userId: string, signal?: AbortSignal): Promise<void> {
    return this.http.delete(
      `accounts/${encodeURIComponent(accountId)}/members/${encodeURIComponent(userId)}`,
      signal,
    );
  }

  /**
   * DELETE /accounts/{accountId} — owner-only; BLOCKS with 409 when other members
   * remain (the server message says to remove them first). Never cascades.
   */
  deleteAccount(accountId: string, signal?: AbortSignal): Promise<void> {
    return this.http.delete(`accounts/${encodeURIComponent(accountId)}`, signal);
  }

  /**
   * PUT /api/admin/users/{userId}/status — site-admin supervisory disable/enable
   * (M11 Users & Access). `disabled` blocks the user across all apps and signs
   * them out; `active` re-enables. The server is the authority (site-admin only,
   * cannot self-disable); 403 surfaces as ApiError with the server message.
   */
  setUserStatus(
    userId: string,
    status: 'active' | 'disabled',
    signal?: AbortSignal,
  ): Promise<{ userId: string; status: 'active' | 'disabled' }> {
    return this.http.put(`api/admin/users/${encodeURIComponent(userId)}/status`, { status }, signal);
  }
}

/** Minimal shape of GET /accounts/{accountId} needed for selector labels. */
export interface ControlPlaneAccount {
  account: { accountId: string; name?: string };
}
