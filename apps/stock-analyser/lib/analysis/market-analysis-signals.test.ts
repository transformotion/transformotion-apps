import { describe, it, expect } from 'vitest'
import {
  REGION_LABELS,
  MARKET_ANALYSIS_SYSTEM_PROMPT,
  createMarketAnalysisPrompt,
} from './market-analysis-signals'
import { REGION_TO_RECOMMENDATION_UNIVERSES } from '@transformotion/contracts/stock-analyser/types'

// #584: this module is the SINGLE source of the market-analysis prompt, imported
// by BOTH the live Market tab and the daily cache-warming job. These tests pin
// the prompt so the warm-write stays identical-to-live by construction.

describe('shared market-analysis prompt (#584)', () => {
  it('embeds the region label and the region-correct bestExchange universes', () => {
    const us = createMarketAnalysisPrompt('us', '')
    expect(us).toContain(`for the ${REGION_LABELS.us} region`)
    expect(us).toContain(`MUST be one of: ${REGION_TO_RECOMMENDATION_UNIVERSES.us.join(', ')}`)

    const au = createMarketAnalysisPrompt('australia', '')
    expect(au).toContain('for the Australia region')
    expect(au).toContain(`MUST be one of: ${REGION_TO_RECOMMENDATION_UNIVERSES.australia.join(', ')}`)
  })

  it('carries the #535 source-attribution + the full 8-sector contract', () => {
    const p = createMarketAnalysisPrompt('global', '')
    expect(p).toContain('SOURCE ATTRIBUTION (required, per card)')
    for (const sector of [
      'Financials', 'Materials', 'Energy', 'Healthcare',
      'Technology', 'Industrials', 'Consumer Discretionary', 'Real Estate & REITs',
    ]) {
      expect(p).toContain(sector)
    }
  })

  it('splices the supplied-sector-data block immediately after the attribution sentence', () => {
    const supplied = '\n\nSUPPLIED SECTOR DATA (real market prices ...):\n- Financials (proxy XLF): last 1.00, 1m +1.0%, 3m +1.0%'
    const grounded = createMarketAnalysisPrompt('us', supplied)
    const ungrounded = createMarketAnalysisPrompt('us', '')
    expect(grounded).toContain(supplied)
    // The grounded prompt is exactly the ungrounded one with the block spliced in
    // (only difference) — proves grounding is additive, nothing else shifts.
    expect(grounded).toBe(ungrounded.replace('.\n\nReturn a JSON object', `.${supplied}\n\nReturn a JSON object`))
    expect(grounded.length).toBe(ungrounded.length + supplied.length)
  })

  it('exposes the system prompt as a stable constant', () => {
    expect(MARKET_ANALYSIS_SYSTEM_PROMPT).toMatch(/senior market strategist/)
    expect(MARKET_ANALYSIS_SYSTEM_PROMPT).toMatch(/raw JSON only/)
  })
})
