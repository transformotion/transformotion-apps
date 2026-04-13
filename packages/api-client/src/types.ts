// ── Portfolio ─────────────────────────────────────────────────────────────────

/**
 * A single portfolio holding — matches the shape used in the existing
 * localStorage store so S2.7 migration is a straight copy.
 */
export interface PortfolioHolding {
  ticker:                   string;
  shares:                   number;
  purchasePrice:            number;
  /** Unix ms timestamp when the holding was added. */
  addedAt:                  number;
  /**
   * True when the user imported from CMC CSV but no purchase price was
   * available — the current price was used as a placeholder.
   */
  priceIsCurrentNotPurchase?: boolean;
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
  data:      unknown;
  /** ISO 8601 timestamp when the entry was stored. */
  cachedAt:  string;
  /** Unix epoch seconds — DynamoDB TTL attribute. */
  expiresAt: number;
}

export interface PutCacheRequest  { data: unknown; ttlSeconds: number }
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
  email:    string;
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

// ── Claude proxy ──────────────────────────────────────────────────────────────

export interface ClaudeProxyRequest {
  prompt:    string;
  system?:   string;
  model?:    string;
  maxTokens?: number;
}

export interface ClaudeProxyResponse {
  content: string;
  model:   string;
  usage: {
    inputTokens:  number;
    outputTokens: number;
  };
}
