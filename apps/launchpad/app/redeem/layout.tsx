import type { ReactNode } from 'react'
import type { Metadata } from 'next'

// The bundleId travels in /redeem?bundle=<id> as the BEARER credential
// (Option D / link-as-bearer). Strip the Referer entirely on this route as
// defense-in-depth: the browser default already drops it cross-origin (so it's
// never sent to Cognito), and this also covers same-origin/subresource cases so
// the unguessable id is never leaked via Referer anywhere.
export const metadata: Metadata = {
  referrer: 'no-referrer',
}

export default function RedeemLayout({ children }: { children: ReactNode }) {
  return children
}
