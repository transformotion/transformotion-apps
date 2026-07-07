'use client'

import { useEffect } from 'react'
import { notifyError } from '@/lib/util/notify-error'

/**
 * App-wide safety net: converts otherwise-silent async failures (unhandled
 * promise rejections and uncaught runtime errors) into a friendly toast, so a
 * failure surfaces to the user *regardless of which tab/screen they are on* —
 * even for the many call sites that today swallow errors into `console.warn`.
 *
 * Deliberate cancellations (AbortError) and known browser noise (ResizeObserver
 * loop warnings) are ignored so we don't cry wolf. Render-phase errors are
 * handled separately by the route error boundaries (`error.tsx` /
 * `global-error.tsx`) and the per-tab `TabErrorBoundary`; this covers the async
 * gap those boundaries can't see.
 */
function isIgnorable(reason: unknown): boolean {
  if (reason == null) return true
  const name = reason instanceof Error ? reason.name : ''
  if (name === 'AbortError') return true
  const msg = (reason instanceof Error ? reason.message : String(reason)).toLowerCase()
  if (!msg) return true
  if (msg.includes('aborted')) return true
  if (msg.includes('resizeobserver')) return true
  return false
}

export function GlobalErrorListener() {
  useEffect(() => {
    const onRejection = (event: PromiseRejectionEvent) => {
      if (isIgnorable(event.reason)) return
      notifyError(event.reason)
    }
    const onError = (event: ErrorEvent) => {
      if (isIgnorable(event.error ?? event.message)) return
      notifyError(event.error ?? event.message)
    }
    window.addEventListener('unhandledrejection', onRejection)
    window.addEventListener('error', onError)
    return () => {
      window.removeEventListener('unhandledrejection', onRejection)
      window.removeEventListener('error', onError)
    }
  }, [])

  return null
}
