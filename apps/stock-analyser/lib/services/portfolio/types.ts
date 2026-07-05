export type { PortfolioHolding } from '@transformotion/contracts/stock-analyser/types'
import type { PortfolioHolding } from '@transformotion/contracts/stock-analyser/types'
import type { StockAnalysisDataStatus } from '@transformotion/contracts/stock-analyser/structured-output'

/**
 * Shape returned by the Claude stock analysis prompt (shared with Analyser tab).
 * `price`/`change` are NULLABLE: they are sourced from real market data (OHLCV),
 * not the AI — and may be null when a live quote is unavailable. The AI's own
 * price/change (it has no real-time data) are NOT trusted.
 */
export interface StockAnalysisResult {
  ticker:        string
  company:       string
  sector:        string
  price:         number | null
  change:        number | null
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
  // #603: newly-listed / thin-data degrade (absent ⇒ complete).
  dataStatus?:     StockAnalysisDataStatus
}

/** A raw holding merged with its (optional) Claude analysis for display. */
export interface EnrichedHolding extends PortfolioHolding {
  analysis: StockAnalysisResult | null
}
