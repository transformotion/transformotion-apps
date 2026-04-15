// ── Portfolio ─────────────────────────────────────────────────────────────────

/** A single portfolio holding. */
export interface PortfolioHolding {
  ticker:   string;
  shares:   number;
  /** Average purchase cost per share. 0 for gifted holdings. */
  avgCost:  number;
  /** True when the holding was received as a gift (avgCost is 0 and P&L is not meaningful). */
  isGifted: boolean;
  /** Unix ms timestamp when the holding was added. */
  addedAt:  number;
}

export interface GetPortfolioResponse  { holdings: PortfolioHolding[] }
export interface PutPortfolioRequest   { holdings: PortfolioHolding[] }
export interface PutPortfolioResponse  { ok: true }

// ── Watchlist ─────────────────────────────────────────────────────────────────

/** A single watchlist entry — matches the existing localStorage shape. */
export interface WatchlistItem {
  ticker:  string;
  name:    string;
  /** Unix ms timestamp when the item was added. */
  addedAt: number;
}

export interface GetWatchlistResponse  { items: WatchlistItem[] }
export interface PutWatchlistRequest   { items: WatchlistItem[] }
export interface PutWatchlistResponse  { ok: true }

// ── Analysis cache ────────────────────────────────────────────────────────────

export interface CacheEntry {
  data:       unknown;
  /** Unix epoch seconds when the entry was stored (normalised from both old ISO and new epoch formats). */
  cachedAt:   number;
  /** Unix epoch seconds — DynamoDB TTL attribute. */
  expiresAt:  number;
  /** Cache type, e.g. 'markets', 'recommendations', 'analyser'. */
  dataType?:  string;
  /** 'fast' or 'live'. */
  mode?:      string;
}

export interface PutCacheRequest {
  data:       unknown;
  ttlSeconds: number;
  /** 'fast' or 'live' — stored as top-level attribute. Default 'live'. */
  mode?:      string;
  /** Cache type e.g. 'markets', 'analyser'. Stored as top-level dataType attribute. */
  type?:      string;
  /** When true, write under accountId='SHARED' so all users share this entry. Default true. */
  shared?:    boolean;
}
export interface PutCacheResponse { ok: true }

// ── Accounts ──────────────────────────────────────────────────────────────────

export interface Account {
  accountId: string;
  name:      string;
  ownerId:   string;
  createdAt: string;
}

export interface AccountMember {
  userId:   string;
  email?:   string;   // stored on write; absent for records created before S2.11
  role:     'owner' | 'member';
  joinedAt: string;
}

export interface CreateAccountRequest  { name: string }
export interface CreateAccountResponse { account: Account }
export interface GetAccountResponse    { account: Account; members: AccountMember[] }
export interface UpdateAccountRequest  { name?: string }
export interface UpdateAccountResponse { account: Account }
export interface ListMembersResponse   { members: AccountMember[] }

export interface CreateInvitationRequest  { email: string }
export interface CreateInvitationResponse { invitationId: string }

// ── User preferences ──────────────────────────────────────────────────────────

export interface UserPreferences {
  defaultMode:            'fast' | 'live';
  notificationsEnabled:   boolean;
  cycleAlertThreshold:    number;
  lastAnalysedTicker?:    string;
}

export interface GetUserProfileResponse {
  userId:      string;
  email:       string;
  preferences: UserPreferences;
}

/** Body is the partial preferences object directly (not wrapped). */
export interface PutUserPreferencesRequest  extends Partial<UserPreferences> {}
export interface PutUserPreferencesResponse { preferences: UserPreferences }

// ── Claude proxy ──────────────────────────────────────────────────────────────

export interface ClaudeProxyRequest {
  prompt:     string;
  system?:    string;
  model?:     string;
  maxTokens?: number;
  /** When true, enables the web_search tool so Claude can use live data. */
  webSearch?: boolean;
  /**
   * When true, the Lambda starts the job asynchronously and returns {jobId}
   * immediately — bypassing API Gateway's 29-second integration timeout.
   * The frontend polls /analysis-cache/job:{jobId} for the result.
   */
  asyncMode?: boolean;
}

export interface ClaudeProxyResponse {
  content: string;
  model:   string;
  usage: {
    inputTokens:  number;
    outputTokens: number;
  };
}
