export type { PortfolioHolding } from '@transformotion/contracts/stock-analyser/types'
import type { PortfolioHolding } from '@transformotion/contracts/stock-analyser/types'

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
