'use client'

import { useEffect } from 'react'

/**
 * Catastrophic fallback (App Router). Replaces the root layout when an error is
 * thrown in the layout/provider tree itself — so it must render its own <html>
 * and <body>. Deliberately dependency-free and inline-styled: at this level the
 * app shell (fonts, Tailwind base, primitives) may not be mounted, so we can't
 * rely on it. The common path is the route-level `error.tsx`; this is the last
 * resort that still gives the user a way out instead of a blank page.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[stock-analyser] global error', error)
  }, [error])

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '16px',
          padding: '24px',
          textAlign: 'center',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          background: '#0b1220',
          color: '#e5e7eb',
        }}
      >
        <h2 style={{ fontSize: '18px', fontWeight: 600, margin: 0 }}>Something went wrong</h2>
        <p style={{ fontSize: '14px', color: '#9ca3af', maxWidth: '24rem', margin: 0 }}>
          The app hit an unexpected problem. Reloading usually fixes it.
        </p>
        <button
          type="button"
          onClick={reset}
          style={{
            border: 'none',
            borderRadius: '6px',
            background: '#2563eb',
            color: '#fff',
            padding: '8px 16px',
            fontSize: '14px',
            fontWeight: 500,
            cursor: 'pointer',
          }}
        >
          Try again
        </button>
      </body>
    </html>
  )
}
