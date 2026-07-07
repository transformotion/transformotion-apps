'use client'

import { toast } from '@transformotion/ui-primitives'
import { describeError, type FriendlyError } from './describe-error'

/**
 * Surface a failure to the user as a destructive toast, de-duplicated so a burst
 * of related failures (e.g. every ticker in a refresh throttling at once) shows
 * ONE toast, not twenty. The toast store keeps a single slot (TOAST_LIMIT = 1),
 * so we also throttle by time to avoid flicker.
 */
const DEDUPE_WINDOW_MS = 4000
let lastKey = ''
let lastAt = 0

export function notifyError(error: unknown, override?: Partial<FriendlyError>): void {
  const friendly = describeError(error)
  const title = override?.title ?? friendly.title
  const description = override?.description ?? friendly.description
  const key = `${title}::${description}`
  const now = Date.now()
  if (key === lastKey && now - lastAt < DEDUPE_WINDOW_MS) return
  lastKey = key
  lastAt = now
  toast({ variant: 'destructive', title, description })
}
