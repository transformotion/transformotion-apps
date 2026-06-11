import { HttpClient } from './http';
import type { GetActiveAccountsResponse } from '@transformotion/contracts/launchpad/invitations';

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
}
