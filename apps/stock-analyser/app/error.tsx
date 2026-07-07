'use client'

import { useEffect } from 'react'
import { AlertTriangle, RotateCw } from 'lucide-react'
import { describeError } from '@/lib/util/describe-error'

/**
 * Route-level error boundary (App Router). Catches render-phase errors anywhere
 * in the page subtree that the per-tab `TabErrorBoundary` doesn't already isolate
 * (shell, providers, layout descendants), showing a friendly recover-able screen
 * instead of a white page. `reset()` re-renders the segment without a full reload.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Keep the raw error in the console for debugging; the user sees friendly copy.
    console.error('[stock-analyser] route error', error)
  }, [error])

  const { title, description } = describeError(error)

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-6 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-signal-red/10">
        <AlertTriangle className="size-6 text-signal-red" />
      </div>
      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
        <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
      </div>
      <button
        type="button"
        onClick={reset}
        className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
      >
        <RotateCw className="size-4" />
        Try again
      </button>
    </div>
  )
}
