import { describe, it, expect, vi } from 'vitest'
import { buildSectorSuppliedData, type SectorOhlcvFetcher } from './market-analysis-grounding'

// The OHLCV source is now INJECTED (#584), so we feed the null-laden `closes`
// arrays real feeds produce (Yahoo gaps) directly — no module mocks needed.
const closes = (arr: readonly (number | null)[]): SectorOhlcvFetcher =>
  vi.fn(async () => arr as unknown as readonly number[])

describe('market-analysis grounding — null-safety (#535 US-market crash regression)', () => {
  it('does NOT throw when closes end in null (the crash) — omits the bad sector', async () => {
    // Pre-fix: `closes[len-1]` was null, the `=== undefined`-only guard let it
    // through, and `last.toFixed(2)` threw "Cannot read properties of null".
    const block = await buildSectorSuppliedData('us', closes([10, 11, null]))
    expect(typeof block).toBe('string')
    expect(block).not.toMatch(/last (null|NaN|undefined)/)
  })

  it('keeps a sector when only an INTERIOR close is null (last is finite)', async () => {
    const block = await buildSectorSuppliedData('us', closes([10, null, 12]))
    expect(block).toContain('SUPPLIED SECTOR DATA')
    expect(block).toMatch(/last 12\.00/)
  })

  it('formats finite closes into a supplied-data block', async () => {
    const block = await buildSectorSuppliedData('us', closes([100, 102, 105]))
    expect(block).toContain('SUPPLIED SECTOR DATA')
    expect(block).toMatch(/last 105\.00/)
  })

  it('returns "" for an unmapped region and never fetches (global / uk)', async () => {
    const fetch = vi.fn(async () => [100, 102, 105] as readonly number[])
    expect(await buildSectorSuppliedData('global', fetch)).toBe('')
    expect(await buildSectorSuppliedData('uk', fetch)).toBe('')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('is best-effort: a thrown fetch is omitted, not propagated', async () => {
    const fetch: SectorOhlcvFetcher = vi.fn(async () => {
      throw new Error('feed down')
    })
    const block = await buildSectorSuppliedData('us', fetch)
    expect(typeof block).toBe('string') // resolved, never threw
  })
})
