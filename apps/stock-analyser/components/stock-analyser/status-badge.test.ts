import { describe, expect, it } from "vitest"
import { stockSignalBadgeClassName } from "./status-badge"

describe("stockSignalBadgeClassName", () => {
  it("renders BUY and ENTER as green positive badges", () => {
    expect(stockSignalBadgeClassName("BUY")).toContain("bg-signal-green")
    expect(stockSignalBadgeClassName("ENTER")).toContain("bg-signal-green")
  })

  it("#593: maps the Market sector `enter` value (lower-case) to green", () => {
    // The contract value is lower-case `enter` (SectorSignalDirection = enter|HOLD|EXIT);
    // the CSS `uppercase` on the badge still renders it as ENTER.
    expect(stockSignalBadgeClassName("enter")).toContain("bg-signal-green")
  })

  it("preserves negative, hold, and neutral badge treatments", () => {
    expect(stockSignalBadgeClassName("SELL")).toContain("bg-signal-red")
    expect(stockSignalBadgeClassName("EXIT")).toContain("bg-signal-red")
    expect(stockSignalBadgeClassName("HOLD")).toContain("bg-signal-amber")
    expect(stockSignalBadgeClassName("NEUTRAL")).toContain("bg-muted")
  })

  it("maps the #592 recommendationSignal vocabulary (pick/watch/avoid)", () => {
    expect(stockSignalBadgeClassName("pick")).toContain("bg-signal-green")
    expect(stockSignalBadgeClassName("watch")).toContain("bg-signal-amber")
    expect(stockSignalBadgeClassName("avoid")).toContain("bg-signal-red")
  })
})
