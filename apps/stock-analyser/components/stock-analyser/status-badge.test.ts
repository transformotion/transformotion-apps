import { describe, expect, it } from "vitest"
import { stockSignalBadgeClassName } from "./status-badge"

describe("stockSignalBadgeClassName", () => {
  it("renders BUY and ENTER as green positive badges", () => {
    expect(stockSignalBadgeClassName("BUY")).toContain("bg-signal-green")
    expect(stockSignalBadgeClassName("ENTER")).toContain("bg-signal-green")
  })

  it("preserves negative, hold, and neutral badge treatments", () => {
    expect(stockSignalBadgeClassName("SELL")).toContain("bg-signal-red")
    expect(stockSignalBadgeClassName("EXIT")).toContain("bg-signal-red")
    expect(stockSignalBadgeClassName("HOLD")).toContain("bg-signal-amber")
    expect(stockSignalBadgeClassName("NEUTRAL")).toContain("bg-muted")
  })
})
