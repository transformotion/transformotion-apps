import { describe, expect, it } from 'vitest'
import {
  createStockAnalysisPrompt,
  normaliseStockAnalysisSignals,
} from './stock-analysis-signals'

describe('stock analysis signal normalisation', () => {
  it('replaces unavailable placeholders with qualitative signal cards', () => {
    const result = normaliseStockAnalysisSignals({
      verdict: 'BUY',
      cyclePosition: 72,
      cycleStage: 'late',
      rsiDivergence: 'none',
      macdMomentum: 'strengthening',
      volumeTrend: 'confirming',
      signals: [
        {
          name: 'Trend',
          value: 'Long-term uptrend, but may be extended',
          signal: 'Bull',
          label: 'Primary trend remains positive',
        },
        {
          name: 'RSI',
          value: 'Unavailable',
          signal: 'Neutral',
          label: 'Requires live price data for momentum assessment',
        },
        {
          name: 'MACD',
          value: 'Unavailable',
          signal: 'Neutral',
          label: 'Requires live price data for trend acceleration',
        },
        {
          name: 'Volume',
          value: 'Unavailable',
          signal: 'Neutral',
          label: 'Requires live volume data to confirm trend strength',
        },
        {
          name: 'Support/Resistance',
          value: 'Major levels not calculated',
          signal: 'Neutral',
          label: 'Insufficient live chart data',
        },
      ],
    })

    expect(result.signals.map((signal) => signal.name)).toEqual([
      'Trend',
      'RSI',
      'MACD',
      'Volume',
      'Support/Resistance',
      'Relative Strength',
    ])
    expect(result.signals.map((signal) => `${signal.value} ${signal.label}`).join(' '))
      .not.toMatch(/unavailable|requires live|not calculated|insufficient/i)
    expect(result.signals.find((signal) => signal.name === 'Trend')?.value)
      .toBe('Long-term uptrend, but may be extended')
    expect(result.signals.find((signal) => signal.name === 'MACD')).toMatchObject({
      value: 'Momentum signal strengthening',
      signal: 'Bull',
    })
  })

  it('maps moving-average signals to Trend and omits unrelated legacy metrics', () => {
    const result = normaliseStockAnalysisSignals({
      verdict: 'HOLD',
      cyclePosition: 50,
      cycleStage: 'mid',
      signals: [
        {
          name: 'Moving averages',
          value: 'Above 200-day MA',
          signal: 'Bull',
          label: 'Long-term uptrend intact',
        },
        {
          name: 'P/E ratio',
          value: '18.5',
          signal: 'Neutral',
          label: 'Fair valuation',
        },
      ],
    })

    expect(result.signals).toHaveLength(6)
    expect(result.signals[0]).toMatchObject({
      name: 'Trend',
      value: 'Above 200-day MA',
      signal: 'Bull',
    })
    expect(result.signals.map((signal) => signal.name)).not.toContain('P/E ratio')
  })

  it('instructs Claude not to return live-data placeholder text', () => {
    const prompt = createStockAnalysisPrompt('CBA.AX')

    expect(prompt).toContain('exactly these six metrics')
    expect(prompt).toContain('Do not return "Unavailable"')
    expect(prompt).toContain('qualitative fast-mode interpretations')
  })
})
