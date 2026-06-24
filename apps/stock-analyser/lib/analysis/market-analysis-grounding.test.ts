import { describe, it, expect, vi, beforeEach } from 'vitest'

// Force the live OHLCV branch and control what getOhlcvData returns, so we can
// feed the null-laden `closes` arrays real feeds produce (Yahoo gaps).
vi.mock('@/lib/config', () => ({ getConfig: () => ({ ai: { provider: 'live' } }) }))
const getOhlcvData = vi.fn()
vi.mock('@/lib/api', () => ({ getStockAnalyserClient: () => ({ getOhlcvData }) }))
// Unused on the live branch, but mocked so vitest need not resolve the fixture module.
vi.mock('@/lib/services/ai/fixtures/ohlcv-data', () => ({ getMockOhlcvData: vi.fn() }))

import { buildSectorSuppliedData } from './market-analysis-grounding'

describe('market-analysis grounding — null-safety (#535 US-market crash regression)', () => {
  beforeEach(() => getOhlcvData.mockReset())

  it('does NOT throw when closes end in null (the crash) — omits the bad sector', async () => {
    // Pre-fix: `closes[len-1]` was null, the `=== undefined`-only guard let it
    // through, and `last.toFixed(2)` threw "Cannot read properties of null".
    getOhlcvData.mockResolvedValue({ closes: [10, 11, null] })
    const block = await buildSectorSuppliedData('us')
    expect(typeof block).toBe('string')
    expect(block).not.toMatch(/last (null|NaN|undefined)/)
  })

  it('keeps a sector when only an INTERIOR close is null (last is finite)', async () => {
    getOhlcvData.mockResolvedValue({ closes: [10, null, 12] })
    const block = await buildSectorSuppliedData('us')
    expect(block).toContain('SUPPLIED SECTOR DATA')
    expect(block).toMatch(/last 12\.00/)
  })

  it('formats finite closes into a supplied-data block', async () => {
    getOhlcvData.mockResolvedValue({ closes: [100, 102, 105] })
    const block = await buildSectorSuppliedData('us')
    expect(block).toContain('SUPPLIED SECTOR DATA')
    expect(block).toMatch(/last 105\.00/)
  })

  it('returns "" for an unmapped region and never fetches (global / uk)', async () => {
    expect(await buildSectorSuppliedData('global')).toBe('')
    expect(await buildSectorSuppliedData('uk')).toBe('')
    expect(getOhlcvData).not.toHaveBeenCalled()
  })

  it('is best-effort: a rejected fetch is omitted, not propagated', async () => {
    getOhlcvData.mockResolvedValueOnce({ closes: [100, 102, 105] })
    getOhlcvData.mockResolvedValue({ closes: [50, null, null] }) // others degrade to omitted
    const block = await buildSectorSuppliedData('us')
    expect(typeof block).toBe('string') // resolved, never threw
  })
})
