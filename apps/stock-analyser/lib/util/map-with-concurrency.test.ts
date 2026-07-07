import { describe, it, expect } from 'vitest'
import { mapWithConcurrency, resolveConcurrencyLimit } from './map-with-concurrency'

describe('resolveConcurrencyLimit', () => {
  it('uses the fallback when the env value is absent or blank', () => {
    expect(resolveConcurrencyLimit(undefined, 4)).toBe(4)
    expect(resolveConcurrencyLimit('', 4)).toBe(4)
    expect(resolveConcurrencyLimit('   ', 4)).toBe(4)
  })

  it('parses a valid integer string', () => {
    expect(resolveConcurrencyLimit('10', 4)).toBe(10)
    expect(resolveConcurrencyLimit('1', 4)).toBe(1)
  })

  it('floors fractional values', () => {
    expect(resolveConcurrencyLimit('4.9', 4)).toBe(4)
  })

  it('clamps to the [1, 32] range', () => {
    expect(resolveConcurrencyLimit('0', 4)).toBe(4) // < min → fallback
    expect(resolveConcurrencyLimit('-5', 4)).toBe(4) // < min → fallback
    expect(resolveConcurrencyLimit('999', 4)).toBe(32) // > max → ceiling
  })

  it('falls back on non-numeric input', () => {
    expect(resolveConcurrencyLimit('abc', 4)).toBe(4)
    expect(resolveConcurrencyLimit('NaN', 4)).toBe(4)
  })

  it('sanitises an unsafe fallback', () => {
    expect(resolveConcurrencyLimit(undefined, 0)).toBe(1)
    expect(resolveConcurrencyLimit(undefined, 99)).toBe(32)
  })
})

describe('mapWithConcurrency', () => {
  it('returns an empty array for empty input without calling fn', async () => {
    let called = false
    const out = await mapWithConcurrency([], 4, async () => {
      called = true
      return 1
    })
    expect(out).toEqual([])
    expect(called).toBe(false)
  })

  it('preserves input order regardless of completion order', async () => {
    const delays = [30, 5, 20, 1, 15]
    const out = await mapWithConcurrency(delays, 2, async (d, i) => {
      await new Promise((r) => setTimeout(r, d))
      return i
    })
    expect(out).toEqual([0, 1, 2, 3, 4])
  })

  it('never exceeds the concurrency limit', async () => {
    let inFlight = 0
    let peak = 0
    const items = Array.from({ length: 12 }, (_, i) => i)
    await mapWithConcurrency(items, 3, async (x) => {
      inFlight += 1
      peak = Math.max(peak, inFlight)
      await new Promise((r) => setTimeout(r, 5))
      inFlight -= 1
      return x
    })
    expect(peak).toBeLessThanOrEqual(3)
    expect(peak).toBe(3) // pool stays full with 12 items / limit 3
  })

  it('processes every item', async () => {
    const items = Array.from({ length: 7 }, (_, i) => i)
    const out = await mapWithConcurrency(items, 4, async (x) => x * 2)
    expect(out).toEqual([0, 2, 4, 6, 8, 10, 12])
  })

  it('treats a limit below 1 as a single worker', async () => {
    let inFlight = 0
    let peak = 0
    await mapWithConcurrency([1, 2, 3], 0, async (x) => {
      inFlight += 1
      peak = Math.max(peak, inFlight)
      await new Promise((r) => setTimeout(r, 2))
      inFlight -= 1
      return x
    })
    expect(peak).toBe(1)
  })
})
