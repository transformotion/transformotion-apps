/** Matches WatchlistItem in @transformotion/api-client — kept in sync manually. */
export interface WatchlistItem {
  ticker:     string;
  name:       string;
  addedAt:    number;
  /** Numeric price at the time of first enrichment — used to compute P&L since added. */
  addedPrice?: number;
}
