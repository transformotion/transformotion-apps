import { HttpClient, type ApiClientOptions } from './http';
import type {
  GetPortfolioResponse,
  PutPortfolioRequest,
  PutPortfolioResponse,
  GetWatchlistResponse,
  PutWatchlistRequest,
  PutWatchlistResponse,
  CacheEntry,
  PutCacheRequest,
  PutCacheResponse,
  CreateAccountRequest,
  CreateAccountResponse,
  GetAccountResponse,
  UpdateAccountRequest,
  UpdateAccountResponse,
  ListMembersResponse,
  CreateInvitationRequest,
  CreateInvitationResponse,
  ClaudeProxyRequest,
  ClaudeProxyResponse,
  GetUserProfileResponse,
  PutUserPreferencesRequest,
  PutUserPreferencesResponse,
  CycleDataResponse,
  OhlcvDataResponse,
  OhlcvRange,
  OhlcvInterval,
  CachedQuotesResponse,
} from './types';

/**
 * Typed API client for all Transformotion backend endpoints.
 *
 * Instantiate once per session (e.g. in a React hook) and pass:
 *   - baseUrl     — VITE_API_URL from env
 *   - getToken    — Amplify fetchAuthSession → access token string
 *   - getAccountId — active account from auth context (set after first login)
 *
 * @example
 * ```ts
 * const client = new ApiClient({
 *   baseUrl:      import.meta.env.VITE_API_URL,
 *   getToken:     () => fetchAuthSession().then(s => s.tokens?.accessToken?.toString() ?? ''),
 *   getAccountId: () => user?.activeAccountId,
 * });
 * ```
 */
export class ApiClient {
  private readonly http: HttpClient;

  constructor(opts: ApiClientOptions) {
    this.http = new HttpClient(opts);
  }

  // ── User profile + preferences ────────────────────────────────────────────

  /** GET /api/user/profile — fetch the user's profile including preferences. */
  async getUserProfile(): Promise<GetUserProfileResponse> {
    return this.http.get<GetUserProfileResponse>('api/user/profile');
  }

  /** PUT /api/user/preferences — merge partial preferences for the current user. */
  async putUserPreferences(req: PutUserPreferencesRequest): Promise<PutUserPreferencesResponse> {
    return this.http.put<PutUserPreferencesResponse>('api/user/preferences', req);
  }

  // ── Claude proxy (S2.3) ────────────────────────────────────────────────────

  /** POST /api/claude — proxy a prompt to the Anthropic API server-side. */
  async claude(req: ClaudeProxyRequest): Promise<ClaudeProxyResponse> {
    return this.http.post<ClaudeProxyResponse>('api/claude', req);
  }

  // ── Portfolio (S2.4) ───────────────────────────────────────────────────────

  /** GET /portfolio — fetch the account's portfolio holdings. */
  async getPortfolio(): Promise<GetPortfolioResponse> {
    return this.http.get<GetPortfolioResponse>('portfolio');
  }

  /** PUT /portfolio — replace the account's portfolio holdings. */
  async putPortfolio(req: PutPortfolioRequest): Promise<PutPortfolioResponse> {
    return this.http.put<PutPortfolioResponse>('portfolio', req);
  }

  // ── Watchlist (S2.5) ───────────────────────────────────────────────────────

  /** GET /watchlist — fetch the account's watchlist. */
  async getWatchlist(): Promise<GetWatchlistResponse> {
    return this.http.get<GetWatchlistResponse>('watchlist');
  }

  /** PUT /watchlist — replace the account's watchlist. */
  async putWatchlist(req: PutWatchlistRequest): Promise<PutWatchlistResponse> {
    return this.http.put<PutWatchlistResponse>('watchlist', req);
  }

  /** GET /market/cached-quotes — read-only enumeration of the latest cached
   * quote per ticker (SHARED partition). Never triggers a fetch; empty cache
   * yields an empty array. (M21) */
  async getCachedQuotes(): Promise<CachedQuotesResponse> {
    return this.http.get<CachedQuotesResponse>('market/cached-quotes');
  }

  // ── Analysis cache (S2.6) ─────────────────────────────────────────────────

  /** GET /analysis-cache/{key} — fetch a cached analysis entry. */
  async getCache(key: string): Promise<CacheEntry> {
    return this.http.get<CacheEntry>(`analysis-cache/${encodeURIComponent(key)}`);
  }

  /** PUT /analysis-cache/{key} — store a cached analysis entry with TTL. */
  async putCache(key: string, req: PutCacheRequest): Promise<PutCacheResponse> {
    return this.http.put<PutCacheResponse>(`analysis-cache/${encodeURIComponent(key)}`, req);
  }

  /** DELETE /analysis-cache/{key} — remove a cached analysis entry. */
  async deleteCache(key: string): Promise<void> {
    return this.http.delete(`analysis-cache/${encodeURIComponent(key)}`);
  }

  // ── Accounts (S2.11) ──────────────────────────────────────────────────────

  /** POST /accounts — create a new account. */
  async createAccount(req: CreateAccountRequest): Promise<CreateAccountResponse> {
    return this.http.post<CreateAccountResponse>('accounts', req);
  }

  /** GET /accounts/{accountId} — get account details and members. */
  async getAccount(accountId: string): Promise<GetAccountResponse> {
    return this.http.get<GetAccountResponse>(`accounts/${accountId}`);
  }

  /** PUT /accounts/{accountId} — update account details. */
  async updateAccount(accountId: string, req: UpdateAccountRequest): Promise<UpdateAccountResponse> {
    return this.http.put<UpdateAccountResponse>(`accounts/${accountId}`, req);
  }

  /** DELETE /accounts/{accountId} — delete an account (owner only). */
  async deleteAccount(accountId: string): Promise<void> {
    return this.http.delete(`accounts/${accountId}`);
  }

  // ── Members (S2.12) ───────────────────────────────────────────────────────

  /** GET /accounts/{accountId}/members — list account members. */
  async listMembers(accountId: string): Promise<ListMembersResponse> {
    return this.http.get<ListMembersResponse>(`accounts/${accountId}/members`);
  }

  /** DELETE /accounts/{accountId}/members/{userId} — remove a member. */
  async removeMember(accountId: string, userId: string): Promise<void> {
    return this.http.delete(`accounts/${accountId}/members/${userId}`);
  }

  // ── Invitations (S2.12) ───────────────────────────────────────────────────

  /** POST /accounts/{accountId}/invitations — send an invitation email. */
  async createInvitation(accountId: string, req: CreateInvitationRequest): Promise<CreateInvitationResponse> {
    return this.http.post<CreateInvitationResponse>(`accounts/${accountId}/invitations`, req);
  }

  // ── Cycle data ─────────────────────────────────────────────────────────────

  /** GET /cycle/ohlcv?ticker={ticker} — fetch OHLCV-computed cycle position for a ticker. */
  async getCycleData(ticker: string): Promise<CycleDataResponse> {
    return this.http.get<CycleDataResponse>(`cycle/ohlcv?ticker=${encodeURIComponent(ticker)}`);
  }

  /** GET /price/ohlcv?ticker={ticker}&range={range}&interval={interval} — fetch raw OHLCV bars. */
  async getOhlcvData(ticker: string, range: OhlcvRange = '1y', interval: OhlcvInterval = '1d'): Promise<OhlcvDataResponse> {
    return this.http.get<OhlcvDataResponse>(
      `price/ohlcv?ticker=${encodeURIComponent(ticker)}&range=${range}&interval=${interval}`
    );
  }
}
