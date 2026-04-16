/** Matches PortfolioHolding in @transformotion/api-client — kept in sync manually. */
export interface PortfolioHolding {
  ticker:   string;
  shares:   number;
  /** Average purchase cost per share. 0 for gifted holdings. */
  avgCost:  number;
  /** True when the holding was received as a gift (avgCost is 0 and P&L is not meaningful). */
  isGifted: boolean;
  addedAt:  number;
}
