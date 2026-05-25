import type { CycleDataResponse } from '@transformotion/api-client';

const CYCLE_FIXTURES: Record<string, Omit<CycleDataResponse, 'source'>> = {
  'CBA.AX': {
    cyclePosition: 35, cycleStage: 'early',
    rsiDivergence: 'bullish', macdMomentum: 'strengthening', volumeTrend: 'confirming',
    weekHigh52Pct: 72, signals: [{ type: 'ok', text: 'RSI recovering from oversold' }, { type: 'ok', text: 'MACD positive crossover' }],
    cycleSummary: 'Early cycle momentum with strong institutional accumulation patterns.',
    computedAt: new Date().toISOString(),
  },
  'BHP.AX': {
    cyclePosition: 55, cycleStage: 'mid',
    rsiDivergence: 'none', macdMomentum: 'flat', volumeTrend: 'neutral',
    weekHigh52Pct: 61, signals: [{ type: 'ok', text: 'Mid-cycle consolidation' }, { type: 'warn', text: 'Volume declining on advances' }],
    cycleSummary: 'Mid-cycle consolidation. Commodity cycle headwinds from China demand uncertainty.',
    computedAt: new Date().toISOString(),
  },
  'FMG.AX': {
    cyclePosition: 68, cycleStage: 'late',
    rsiDivergence: 'bearish', macdMomentum: 'weakening', volumeTrend: 'diverging',
    weekHigh52Pct: 84, signals: [{ type: 'warn', text: 'RSI bearish divergence forming' }, { type: 'warn', text: 'MACD weakening above signal' }],
    cycleSummary: 'Late cycle warning signals. Iron ore price sensitivity creates near-term risk.',
    computedAt: new Date().toISOString(),
  },
  'CSL.AX': {
    cyclePosition: 42, cycleStage: 'early',
    rsiDivergence: 'bullish', macdMomentum: 'strengthening', volumeTrend: 'confirming',
    weekHigh52Pct: 58, signals: [{ type: 'ok', text: 'Strong accumulation phase' }, { type: 'ok', text: 'Volume supporting price advance' }],
    cycleSummary: 'Early cycle recovery with improving plasma collection volumes driving earnings recovery.',
    computedAt: new Date().toISOString(),
  },
  'AAPL': {
    cyclePosition: 72, cycleStage: 'late',
    rsiDivergence: 'none', macdMomentum: 'flat', volumeTrend: 'neutral',
    weekHigh52Pct: 91, signals: [{ type: 'warn', text: 'Near 52-week high resistance' }, { type: 'ok', text: 'Services revenue diversification' }],
    cycleSummary: 'Late cycle positioning near highs. AI hardware cycle exposure adds volatility.',
    computedAt: new Date().toISOString(),
  },
  'NVDA': {
    cyclePosition: 88, cycleStage: 'peak',
    rsiDivergence: 'bearish', macdMomentum: 'weakening', volumeTrend: 'diverging',
    weekHigh52Pct: 97, signals: [{ type: 'danger', text: 'Extreme overbought conditions' }, { type: 'warn', text: 'Insider selling patterns emerging' }],
    cycleSummary: 'Peak cycle territory. AI chip demand remains strong but valuation stretched.',
    computedAt: new Date().toISOString(),
  },
  'MSFT': {
    cyclePosition: 61, cycleStage: 'mid',
    rsiDivergence: 'none', macdMomentum: 'strengthening', volumeTrend: 'confirming',
    weekHigh52Pct: 78, signals: [{ type: 'ok', text: 'Cloud growth re-accelerating' }, { type: 'ok', text: 'AI Copilot monetisation underway' }],
    cycleSummary: 'Mid cycle with AI tailwinds. Azure growth rate recovery supports multiple expansion.',
    computedAt: new Date().toISOString(),
  },
};

const DEFAULT_CYCLE: Omit<CycleDataResponse, 'source'> = {
  cyclePosition: 50, cycleStage: 'mid',
  rsiDivergence: 'none', macdMomentum: 'flat', volumeTrend: 'neutral',
  weekHigh52Pct: 60, signals: [{ type: 'ok', text: 'No strong directional signals' }],
  cycleSummary: 'Mid-cycle positioning with neutral signals.',
  computedAt: new Date().toISOString(),
};

export function getMockCycleData(ticker: string): CycleDataResponse {
  const base = CYCLE_FIXTURES[ticker.toUpperCase()] ?? DEFAULT_CYCLE;
  return { ...base, source: 'cache' };
}
