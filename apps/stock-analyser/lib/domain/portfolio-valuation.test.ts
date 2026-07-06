import { describe, it, expect } from "vitest"
import { valuePortfolio, watchlistPnl, pickFeatured } from "./portfolio-valuation"

describe("valuePortfolio", () => {
  it("computes value, cost, total return and day gain", () => {
    const v = valuePortfolio([
      { shares: 10, avgCost: 100, price: 120, dayChangePct: 2 },
      { shares: 5, avgCost: 50, price: 60, dayChangePct: -1 },
    ])
    expect(v.value).toBeCloseTo(10 * 120 + 5 * 60) // 1500
    expect(v.cost).toBeCloseTo(10 * 100 + 5 * 50) // 1250
    expect(v.totalReturn).toBeCloseTo(250)
    expect(v.totalReturnPct).toBeCloseTo(20)
    // day gain: holding1 up 2% (prevClose 120/1.02), holding2 down 1%
    const prev1 = 120 / 1.02, prev2 = 60 / 0.99
    expect(v.dayGain).toBeCloseTo(1500 - (10 * prev1 + 5 * prev2))
    expect(v.pricedCount).toBe(2)
  })

  it("excludes gifted holdings from cost basis", () => {
    const v = valuePortfolio([{ shares: 10, avgCost: 100, price: 120, isGifted: true }])
    expect(v.cost).toBe(0)
    expect(v.totalReturn).toBe(v.value)
  })

  it("treats unpriced holdings as 0 value and skips them from day gain", () => {
    const v = valuePortfolio([{ shares: 10, avgCost: 100, price: null, dayChangePct: null }])
    expect(v.value).toBe(0)
    expect(v.pricedCount).toBe(0)
    expect(v.dayGain).toBe(0)
  })
})

describe("watchlistPnl", () => {
  it("averages day change across quotes with a known change", () => {
    const r = watchlistPnl([{ dayChangePct: 2 }, { dayChangePct: -1 }, { dayChangePct: null }])
    expect(r.count).toBe(2)
    expect(r.pct).toBeCloseTo(0.5)
  })

  it("is 0 for an empty watchlist", () => {
    expect(watchlistPnl([]).pct).toBe(0)
  })
})

describe("pickFeatured", () => {
  it("returns the largest day-change mover", () => {
    const f = pickFeatured([
      { ticker: "AAPL", dayChangePct: 1.8 },
      { ticker: "TSLA", dayChangePct: 6.1 },
      { ticker: "AMZN", dayChangePct: -0.6 },
    ])
    expect(f?.ticker).toBe("TSLA")
  })

  it("returns null for no quotes", () => {
    expect(pickFeatured([])).toBeNull()
  })
})
