import React, { Component, type ReactNode } from "react"

interface Props {
  children: ReactNode
  label?: string
}

interface State {
  error: Error | null
}

export class TabErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // TODO M13: replace with platform observability hook
    console.error("[TabErrorBoundary]", this.props.label ?? "tab", error, errorInfo)
  }

  render() {
    const { error } = this.state
    if (error) {
      return (
        <div className="p-6 max-w-lg mx-auto">
          <div className="rounded-lg border border-border bg-card p-4 space-y-2">
            <p className="text-sm font-semibold text-signal-red">
              Something went wrong rendering this tab
              {this.props.label ? ` (${this.props.label})` : ""}
            </p>
            <p className="text-xs font-mono text-muted-foreground break-words whitespace-pre-wrap">
              {error.message}
            </p>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
