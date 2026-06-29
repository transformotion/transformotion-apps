import { describe, it, expect } from 'vitest'
import {
  buildTickerSuppliedData,
  suppliedTechnicalsFromOhlcv,
  suppliedTechnicalsFromCyclePosition,
  type SuppliedTechnicals,
} from './stock-analysis-grounding'
import { computeCyclePosition, type CycleInputs } from '../cycle'

// A deterministic ≥30-bar OHLCV series so computeCyclePosition returns a result.
function syntheticOhlcv(bars = 60): CycleInputs {
  const closes: number[] = []
  const highs: number[] = []
  const volumes: number[] = []
  for (let i = 0; i < bars; i++) {
    const c = 100 + i // steady uptrend → overbought, near 52w high
    closes.push(c)
    highs.push(c + 1)
    volumes.push(1_000_000 + i * 10_000)
  }
  return { closes, highs, volumes }
}

const technicals: SuppliedTechnicals = {
  cyclePosition: 51,
  cycleStage: 'mid',
  rsiDivergence: 'none',
  macdMomentum: 'strengthening',
  volumeTrend: 'confirming',
  weekHigh52Pct: 98,
  signals: [{ type: 'danger', text: 'RSI at 90.7 — significantly overbought.' }],
  cycleSummary: 'Mid-trend — solid momentum but watch for signs of fatigue.',
}

describe('buildTickerSuppliedData', () => {
  it('honest degradation: null technicals → empty string (no fabrication)', () => {
    expect(buildTickerSuppliedData(null)).toBe('')
  })

  it('formats the real computed technicals as a supplied-data block', () => {
    const block = buildTickerSuppliedData(technicals)
    expect(block).toContain('SUPPLIED TECHNICAL DATA')
    expect(block).toContain('computed, NOT searched')
    expect(block).toContain('Cycle position: 51 / 100 (stage: mid)')
    expect(block).toContain('RSI divergence: none')
    expect(block).toContain('MACD momentum: strengthening')
    expect(block).toContain('Volume trend: confirming')
    expect(block).toContain('52-week-high proximity: 98%')
    // The RSI number rides in the signal text — the model must see "90.7".
    expect(block).toContain('RSI at 90.7')
    // Starts with the leading separator so it appends cleanly onto the prompt.
    expect(block.startsWith('\n\n')).toBe(true)
  })
})

describe('suppliedTechnicalsFromOhlcv', () => {
  it('null OHLCV → null (caller supplies nothing)', () => {
    expect(suppliedTechnicalsFromOhlcv(null)).toBeNull()
  })

  it('insufficient data (<30 bars) → null (honest degradation, no fabrication)', () => {
    expect(suppliedTechnicalsFromOhlcv(syntheticOhlcv(20))).toBeNull()
  })

  it('valid OHLCV → real computed technicals matching computeCyclePosition', () => {
    const ohlcv = syntheticOhlcv(60)
    const position = computeCyclePosition(ohlcv)
    expect(position).not.toBeNull()

    const technicalsFromOhlcv = suppliedTechnicalsFromOhlcv(ohlcv)
    expect(technicalsFromOhlcv).toEqual(suppliedTechnicalsFromCyclePosition(position!))
    // Same values the gauge overlay uses — the source of truth is computeCyclePosition.
    expect(technicalsFromOhlcv!.cyclePosition).toBe(position!.score)
    expect(technicalsFromOhlcv!.cycleStage).toBe(position!.stage)
    expect(technicalsFromOhlcv!.weekHigh52Pct).toBe(position!.weekHigh52Pct)

    const block = buildTickerSuppliedData(technicalsFromOhlcv)
    expect(block).toContain(`Cycle position: ${position!.score} / 100`)
  })
})
