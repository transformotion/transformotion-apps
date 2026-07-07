/**
 * Map a raw error (Error, string, or unknown) to a short, human-readable
 * title + description. The raw strings the app throws — "Failed to fetch",
 * "500 InternalServerErrorException", "429 Too Many Requests" — are meaningless
 * to a user; this turns them into something actionable.
 *
 * Intentionally message-pattern based (not status-code typed) because failures
 * arrive from several layers (fetch, API client, WSS, Lambda proxy) with
 * inconsistent shapes. Order matters: more specific patterns first.
 */

export interface FriendlyError {
  title: string
  description: string
}

function rawMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: unknown }).message ?? '')
  }
  return ''
}

export function describeError(error: unknown): FriendlyError {
  const msg = rawMessage(error).toLowerCase()

  if (
    msg.includes('failed to fetch') ||
    msg.includes('networkerror') ||
    msg.includes('load failed') ||
    msg.includes('err_internet_disconnected')
  ) {
    return {
      title: 'Connection problem',
      description: "Couldn't reach the server. Check your connection and try again.",
    }
  }

  if (
    msg.includes('429') ||
    msg.includes('throttl') ||
    msg.includes('too many requests') ||
    msg.includes('rate limit')
  ) {
    return {
      title: 'Service is busy',
      description: 'A lot is happening right now. Give it a moment, then try again.',
    }
  }

  if (
    msg.includes('timeout') ||
    msg.includes('timed out') ||
    msg.includes('etimedout')
  ) {
    return {
      title: 'Request timed out',
      description: 'That took too long to respond. Please try again.',
    }
  }

  if (
    msg.includes('401') ||
    msg.includes('403') ||
    msg.includes('unauthor') ||
    msg.includes('forbidden') ||
    msg.includes('token')
  ) {
    return {
      title: 'Session problem',
      description: 'Your session may have expired. Refresh the page or sign in again.',
    }
  }

  if (
    msg.includes('500') ||
    msg.includes('internalserver') ||
    msg.includes('internal server') ||
    msg.includes('502') ||
    msg.includes('503') ||
    msg.includes('504') ||
    msg.includes('bad gateway') ||
    msg.includes('unavailable')
  ) {
    return {
      title: 'Something went wrong',
      description: 'The server hit a temporary problem. Please try again in a moment.',
    }
  }

  return {
    title: 'Something went wrong',
    description: 'An unexpected error occurred. Please try again.',
  }
}

/** Single-line variant for inline banners / compact states. */
export function describeErrorText(error: unknown): string {
  const { title, description } = describeError(error)
  return `${title} — ${description}`
}
