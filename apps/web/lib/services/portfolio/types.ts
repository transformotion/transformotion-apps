/** Raw holding as stored in DynamoDB via the portfolio Lambda. */
export interface PortfolioHolding {
  ticker:   string
  shares:   number
  /** Average purchase cost per share. 0 for gifted holdings. */
  avgCost:  number
  isGifted: boolean
  addedAt:  number
}

/** Shape returned by the Claude stock analysis prompt (shared with Analyser tab). */
export interface StockAnalysisResult {
  ticker:        string
  company:       string
  sector:        string
  price:         number
  change:        number
  verdict:       'BUY' | 'SELL' | 'HOLD' | 'NEUTRAL'
  cyclePosition: number
  cycleStage:    'early' | 'mid' | 'late' | 'peak'
  summary?:      string
  cycleSummary?: string
  signals?:      Array<{ name: string; value: string; signal: string; label: string }>
  risks?:        string[]
  rsiDivergence?:  string
  macdMomentum?:   string
  volumeTrend?:    string
}

/** A raw holding merged with its (optional) Claude analysis for display. */
export interface EnrichedHolding extends PortfolioHolding {
  analysis: StockAnalysisResult | null
}
