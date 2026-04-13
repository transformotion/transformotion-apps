/** Matches PortfolioHolding in @transformotion/api-client — kept in sync manually. */
export interface PortfolioHolding {
  ticker:                   string;
  shares:                   number;
  purchasePrice:            number;
  addedAt:                  number;
  priceIsCurrentNotPurchase?: boolean;
}
