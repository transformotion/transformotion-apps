import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import React, { type ReactNode } from "react"
import { createRoot } from "react-dom/client"
import { act } from "react"
import { TabErrorBoundary } from "../error-boundaries/tab-error-boundary"

function Throws({ message }: { message: string }): React.ReactElement {
  throw new Error(message)
}

function Fine({ children }: { children: ReactNode }) {
  return <span data-testid="fine">{children}</span>
}

function render(ui: React.ReactElement) {
  const container = document.createElement("div")
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => { root.render(ui) })
  return { container, unmount: () => act(() => { root.unmount(); document.body.removeChild(container) }) }
}

describe("TabErrorBoundary", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let consoleError: any

  beforeEach(() => {
    consoleError = vi.spyOn(console, "error").mockImplementation(() => {})
  })

  afterEach(() => {
    consoleError.mockRestore()
  })

  it("renders children when there is no error", () => {
    const { container, unmount } = render(
      <TabErrorBoundary><Fine>hello</Fine></TabErrorBoundary>
    )
    expect(container.querySelector("[data-testid='fine']")?.textContent).toBe("hello")
    unmount()
  })

  it("shows fallback when child throws", () => {
    const { container, unmount } = render(
      <TabErrorBoundary><Throws message="boom" /></TabErrorBoundary>
    )
    expect(container.textContent).toContain("Something went wrong")
    expect(container.textContent).toContain("boom")
    unmount()
  })

  it("includes label in fallback when provided", () => {
    const { container, unmount } = render(
      <TabErrorBoundary label="Budget Tracker"><Throws message="fail" /></TabErrorBoundary>
    )
    expect(container.textContent).toContain("Budget Tracker")
    unmount()
  })

  it("fallback has no retry button", () => {
    const { container, unmount } = render(
      <TabErrorBoundary><Throws message="fail" /></TabErrorBoundary>
    )
    expect(container.querySelector("button")).toBeNull()
    unmount()
  })

  it("calls console.error with label and error on catch", () => {
    const { unmount } = render(
      <TabErrorBoundary label="MyTab"><Throws message="oops" /></TabErrorBoundary>
    )
    expect(consoleError).toHaveBeenCalledWith(
      "[TabErrorBoundary]",
      "MyTab",
      expect.any(Error),
      expect.anything()
    )
    unmount()
  })

  it("calls console.error with 'tab' fallback when no label", () => {
    const { unmount } = render(
      <TabErrorBoundary><Throws message="oops" /></TabErrorBoundary>
    )
    expect(consoleError).toHaveBeenCalledWith(
      "[TabErrorBoundary]",
      "tab",
      expect.any(Error),
      expect.anything()
    )
    unmount()
  })
})
